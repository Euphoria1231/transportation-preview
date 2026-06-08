from __future__ import annotations

from pathlib import Path
import json
import threading
import time
from typing import Any, Callable, Dict, Generator, List, Optional
import xml.etree.ElementTree as ET

import traci

from .logic import apply_lane_change_logic, color_for_type
from .network import parse_network
from .scenario_config import (
    derive_flow_plan,
    get_default_scenario_config,
    validate_scenario_config,
)
from .scenario_writer import write_scenario_files


class SimulationRunner:
    """Owns a single SUMO instance and exposes thread-safe simulation state."""

    def __init__(self, scenario_dir: Path, sumocfg_name: str = "post_control.sumocfg") -> None:
        self.scenario_dir = scenario_dir
        self.sumocfg_path = scenario_dir / sumocfg_name
        self.net_file_path = scenario_dir / "test.net.xml"
        self.step_length = self._read_step_length(self.sumocfg_path)
        self.network_config = parse_network(self.net_file_path)
        self.current_scenario_config = get_default_scenario_config()
        self.current_flow_plan = derive_flow_plan(self.current_scenario_config)
        self.enable_cav_lane_change_control = bool(
            self.current_scenario_config["enableCavLaneChangeControl"]
        )

        self._lock = threading.RLock()
        self._condition = threading.Condition(self._lock)
        self._connection = None
        self._running = False
        self._alive = True
        self._state_version = 0
        self._step = 0
        self._error: Optional[str] = None
        self._last_lane_change_event: Optional[Dict[str, object]] = None
        self._latest_state = self._empty_state()

        self._thread = threading.Thread(target=self._loop, name="sumo-runner", daemon=True)
        self._thread.start()

    def get_config(self) -> Dict[str, object]:
        return {
            **self.network_config,
            "stepLength": self.step_length,
        }

    def get_default_scenario_config(self) -> Dict[str, object]:
        return get_default_scenario_config()

    def get_current_scenario(self) -> Dict[str, object]:
        with self._lock:
            return {
                "config": dict(self.current_scenario_config),
                "flowPlan": dict(self.current_flow_plan),
            }

    def get_state(self) -> Dict[str, object]:
        with self._lock:
            return dict(self._latest_state)

    def start(self) -> Dict[str, object]:
        with self._lock:
            self._ensure_connection()
            self._running = True
            self._error = None
            self._latest_state["running"] = True
            self._bump_state_version()
            self._condition.notify_all()
            return dict(self._latest_state)

    def pause(self) -> Dict[str, object]:
        with self._lock:
            self._ensure_connection()
            self._running = False
            self._latest_state["running"] = False
            self._bump_state_version()
            return dict(self._latest_state)

    def reset(self) -> Dict[str, object]:
        with self._lock:
            self._running = False
            self._close_connection()
            self._step = 0
            self._last_lane_change_event = None
            self._error = None
            self._ensure_connection()
            self._latest_state = self._snapshot_state()
            self._bump_state_version()
            self._condition.notify_all()
            return dict(self._latest_state)

    def apply_scenario(self, raw_config: Dict[str, object]) -> Dict[str, object]:
        next_config = validate_scenario_config(raw_config)
        generated_files = write_scenario_files(self.scenario_dir, next_config)
        next_flow_plan = derive_flow_plan(next_config)

        with self._lock:
            self._running = False
            self._close_connection()
            self.sumocfg_path = generated_files["sumocfgPath"]
            self.step_length = float(next_config["stepLength"])
            self.current_scenario_config = next_config
            self.current_flow_plan = next_flow_plan
            self.enable_cav_lane_change_control = bool(
                next_config["enableCavLaneChangeControl"]
            )
            self._step = 0
            self._last_lane_change_event = None
            self._error = None
            self._ensure_connection()
            self._running = True
            self._latest_state["running"] = True
            self._bump_state_version()
            self._condition.notify_all()
            return {
                "config": dict(self.current_scenario_config),
                "flowPlan": dict(self.current_flow_plan),
                "state": dict(self._latest_state),
            }

    def step_once(self) -> Dict[str, object]:
        with self._lock:
            self._ensure_connection()
            self._running = False
            self._advance_one_step()
            return dict(self._latest_state)

    def event_stream(self) -> Generator[str, None, None]:
        last_seen = -1
        heartbeat_interval = 10.0
        last_heartbeat = time.time()

        while True:
            with self._condition:
                self._condition.wait(timeout=0.5)
                current_version = self._state_version
                payload = dict(self._latest_state)

            now = time.time()
            if current_version != last_seen:
                yield self._format_sse("state", payload)
                last_seen = current_version
                last_heartbeat = now
            elif now - last_heartbeat >= heartbeat_interval:
                yield ": keep-alive\n\n"
                last_heartbeat = now

    def shutdown(self) -> None:
        with self._lock:
            self._alive = False
            self._running = False
            self._close_connection()
            self._condition.notify_all()

    def _loop(self) -> None:
        while True:
            with self._condition:
                if not self._alive:
                    return

                if not self._running:
                    self._condition.wait(timeout=0.1)
                    continue

            start_time = time.perf_counter()
            with self._lock:
                try:
                    self._advance_one_step()
                except Exception as exc:  # pragma: no cover
                    self._running = False
                    self._error = str(exc)
                    self._latest_state = self._snapshot_state()
                    self._bump_state_version()

            elapsed = time.perf_counter() - start_time
            time.sleep(max(self.step_length - elapsed, 0.01))

    def _advance_one_step(self) -> None:
        if self._connection is None:
            raise RuntimeError("Simulation is not initialized.")

        current_step = self._step
        self._connection.simulationStep()
        events = (
            apply_lane_change_logic(self._connection, current_step)
            if self.enable_cav_lane_change_control
            else []
        )
        if events:
            self._last_lane_change_event = events[-1]

        self._latest_state = self._snapshot_state()
        self._step += 1
        self._bump_state_version()

    def _ensure_connection(self) -> None:
        if self._connection is not None:
            return

        cmd = [
            "sumo",
            "-c",
            str(self.sumocfg_path),
            "--quit-on-end",
            "--seed",
            str(self.current_scenario_config["randomSeed"]),
        ]
        traci.start(cmd, label="browser")
        self._connection = traci.getConnection("browser")
        self._latest_state = self._snapshot_state()

    def _close_connection(self) -> None:
        if self._connection is None:
            self._latest_state = self._empty_state()
            return

        try:
            self._connection.close()
        except Exception:
            pass
        finally:
            self._connection = None
            self._latest_state = self._empty_state()

    def _snapshot_state(self) -> Dict[str, object]:
        vehicles = self._collect_vehicle_states()
        sim_time = self._connection.simulation.getTime() if self._connection is not None else 0.0
        connected_count = sum(1 for vehicle in vehicles if vehicle["type"] == "Connected")

        return {
            "simTime": round(sim_time, 2),
            "step": self._step,
            "running": self._running,
            "vehicleCount": len(vehicles),
            "connectedCount": connected_count,
            "lastLaneChangeEvent": self._last_lane_change_event,
            "vehicles": vehicles,
            "error": self._error,
        }

    def _collect_vehicle_states(self) -> List[Dict[str, object]]:
        if self._connection is None:
            return []

        vehicle_ids = self._connection.vehicle.getIDList()
        vehicles: List[Dict[str, object]] = []
        for vehicle_id in vehicle_ids:
            vehicle_type = self._connection.vehicle.getTypeID(vehicle_id)
            x_coord, y_coord = self._connection.vehicle.getPosition(vehicle_id)
            leader = self._safe_value(
                lambda vehicle_id=vehicle_id: self._connection.vehicle.getLeader(vehicle_id, 250),
                None,
            )
            leader_id: Optional[str] = None
            leader_gap: Optional[float] = None
            if leader:
                leader_id = str(leader[0])
                leader_gap = float(leader[1])

            lateral_speed = self._safe_value(
                lambda vehicle_id=vehicle_id: self._connection.vehicle.getLateralSpeed(vehicle_id),
                0.0,
            )
            is_connected = vehicle_type == "Connected"
            vehicles.append(
                {
                    "id": vehicle_id,
                    "type": vehicle_type,
                    "x": x_coord,
                    "y": y_coord,
                    "angle": self._connection.vehicle.getAngle(vehicle_id),
                    "speed": self._connection.vehicle.getSpeed(vehicle_id),
                    "acceleration": self._safe_value(
                        lambda vehicle_id=vehicle_id: self._connection.vehicle.getAcceleration(vehicle_id),
                        0.0,
                    ),
                    "edgeId": self._connection.vehicle.getRoadID(vehicle_id),
                    "laneId": self._connection.vehicle.getLaneID(vehicle_id),
                    "laneIndex": self._connection.vehicle.getLaneIndex(vehicle_id),
                    "lanePosition": self._safe_value(
                        lambda vehicle_id=vehicle_id: self._connection.vehicle.getLanePosition(vehicle_id),
                        0.0,
                    ),
                    "length": self._connection.vehicle.getLength(vehicle_id),
                    "width": self._connection.vehicle.getWidth(vehicle_id),
                    "route": list(self._safe_value(
                        lambda vehicle_id=vehicle_id: self._connection.vehicle.getRoute(vehicle_id),
                        [],
                    )),
                    "leaderId": leader_id,
                    "leaderGap": leader_gap,
                    "isChangingLane": abs(float(lateral_speed)) > 0.05,
                    "desiredSpeed": self._safe_value(
                        lambda vehicle_id=vehicle_id: self._connection.vehicle.getMaxSpeed(vehicle_id),
                        None,
                    ) if is_connected else None,
                    "desiredHeadway": self._safe_value(
                        lambda vehicle_id=vehicle_id: self._connection.vehicle.getTau(vehicle_id),
                        None,
                    ) if is_connected else None,
                    "desiredAcceleration": self._safe_value(
                        lambda vehicle_id=vehicle_id: self._connection.vehicle.getAccel(vehicle_id),
                        None,
                    ) if is_connected else None,
                    "color": color_for_type(vehicle_type),
                }
            )
        return vehicles

    def _empty_state(self) -> Dict[str, object]:
        return {
            "simTime": 0.0,
            "step": self._step,
            "running": False,
            "vehicleCount": 0,
            "connectedCount": 0,
            "lastLaneChangeEvent": None,
            "vehicles": [],
            "error": self._error,
        }

    def _bump_state_version(self) -> None:
        self._state_version += 1
        self._condition.notify_all()

    @staticmethod
    def _format_sse(event_name: str, payload: Dict[str, object]) -> str:
        return f"event: {event_name}\ndata: {json.dumps(payload)}\n\n"

    @staticmethod
    def _read_step_length(sumocfg_path: Path) -> float:
        tree = ET.parse(sumocfg_path)
        root = tree.getroot()
        time_node = root.find("time")
        if time_node is None:
            return 0.1

        for child in time_node:
            if child.tag == "step-length" and "value" in child.attrib:
                return float(child.attrib["value"])

        return float(time_node.attrib.get("step-length", "0.1"))

    @staticmethod
    def _safe_value(operation: Callable[[], Any], default: Any) -> Any:
        try:
            return operation()
        except Exception:
            return default
