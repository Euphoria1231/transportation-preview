from __future__ import annotations

from collections import deque
from pathlib import Path
import json
import threading
import time
from typing import Any, Callable, Deque, Dict, Generator, List, Optional
import xml.etree.ElementTree as ET

import traci

TRACI_LABEL = "browser"

from .logic import apply_lane_change_logic, color_for_type
from .metrics import create_metric_sample, summarize_metric_history
from .network import parse_network
from .presequencing import build_presequencing_state
from .reporting import build_comparison_report, build_simulation_report
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
        self.disable_sumo_lane_change_control = bool(
            self.current_scenario_config["disableSumoLaneChangeControl"]
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
        self._metric_history: Deque[Dict[str, object]] = deque(maxlen=1000)
        self._latest_metrics: Optional[Dict[str, object]] = None
        self._baseline_summary: Optional[Dict[str, object]] = None
        self._vehicle_ids_seen: set[str] = set()
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

    def get_latest_metrics(self) -> Dict[str, object]:
        with self._lock:
            return dict(self._latest_metrics) if self._latest_metrics else self._empty_metrics()

    def get_metric_history(self, window: int = 100) -> List[Dict[str, object]]:
        safe_window = max(1, min(int(window), 1000))
        with self._lock:
            return [dict(sample) for sample in list(self._metric_history)[-safe_window:]]

    def get_latest_lane_metrics(self) -> List[Dict[str, object]]:
        with self._lock:
            if not self._latest_metrics:
                return []
            return [dict(lane) for lane in self._latest_metrics.get("laneMetrics", [])]

    def get_analysis_summary(self) -> Dict[str, object]:
        with self._lock:
            return summarize_metric_history(
                self._metric_history,
                scenario_config=dict(self.current_scenario_config),
                total_vehicles_seen=len(self._vehicle_ids_seen),
            )

    def save_baseline_summary(self) -> Dict[str, object]:
        with self._lock:
            self._baseline_summary = self.get_analysis_summary()
            return dict(self._baseline_summary)

    def get_baseline_summary(self) -> Dict[str, object]:
        with self._lock:
            if self._baseline_summary is None:
                return {"baseline": None}
            return {"baseline": dict(self._baseline_summary)}

    def generate_current_report(self) -> Dict[str, object]:
        with self._lock:
            return build_simulation_report(self.get_analysis_summary())

    def generate_comparison_report(self) -> Dict[str, object]:
        with self._lock:
            if self._baseline_summary is None:
                raise ValueError("Baseline summary is not available.")
            return build_comparison_report(self._baseline_summary, self.get_analysis_summary())

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
            self._clear_metrics()
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
            self.disable_sumo_lane_change_control = bool(
                next_config["disableSumoLaneChangeControl"]
            )
            self._step = 0
            self._last_lane_change_event = None
            self._clear_metrics()
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
        self._apply_sumo_lane_change_permissions()
        self._connection.simulationStep()
        self._apply_sumo_lane_change_permissions()
        events = (
            apply_lane_change_logic(self._connection, current_step)
            if self.enable_cav_lane_change_control
            else []
        )
        if events:
            self._last_lane_change_event = events[-1]

        self._latest_state = self._snapshot_state()
        self._append_metric_sample(events)
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
        try:
            traci.start(cmd, label=TRACI_LABEL)
            self._connection = traci.getConnection(TRACI_LABEL)
            self._latest_state = self._snapshot_state()
        except Exception:
            self._connection = None
            self._close_traci_label()
            self._latest_state = self._empty_state()
            raise

    def _append_metric_sample(self, lane_change_events: List[Dict[str, object]]) -> None:
        vehicles = list(self._latest_state.get("vehicles", []))
        for vehicle in vehicles:
            vehicle_id = vehicle.get("id")
            if vehicle_id is not None:
                self._vehicle_ids_seen.add(str(vehicle_id))
        sample = create_metric_sample(
            sim_time=float(self._latest_state.get("simTime", 0.0)),
            step=int(self._latest_state.get("step", self._step)),
            vehicles=vehicles,
            network_config=self.network_config,
            lane_change_events=lane_change_events,
        )
        self._latest_metrics = sample
        self._metric_history.append(sample)

    def _apply_sumo_lane_change_permissions(self) -> None:
        if not self.disable_sumo_lane_change_control or self._connection is None:
            return

        for vehicle_id in self._connection.vehicle.getIDList():
            self._safe_value(
                lambda vehicle_id=vehicle_id: self._connection.vehicle.setLaneChangeMode(vehicle_id, 0),
                None,
            )

    def _close_connection(self) -> None:
        connection = self._connection
        self._connection = None

        if connection is not None:
            try:
                connection.close()
            except Exception:
                pass

        self._close_traci_label()

        self._latest_state = self._empty_state()

    @staticmethod
    def _close_traci_label() -> None:
        try:
            traci.switch(TRACI_LABEL)
            traci.close(False)
        except Exception:
            pass

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
            "presequencingZones": build_presequencing_state(
                vehicles,
                self.network_config,
                self.enable_cav_lane_change_control,
            ),
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
            "presequencingZones": [],
            "vehicles": [],
            "error": self._error,
        }

    def _empty_metrics(self) -> Dict[str, object]:
        return {
            "simTime": 0.0,
            "step": self._step,
            "averageSpeed": 0.0,
            "averageSpeedKmh": 0.0,
            "vehicleCount": 0,
            "connectedCount": 0,
            "cavPenetrationRate": 0.0,
            "densityPerKm": 0.0,
            "averageDelay": 0.0,
            "queueLength": 0.0,
            "laneChangeCount": 0,
            "minTtc": None,
            "hardBrakeCount": 0,
            "highRiskEventCount": 0,
            "laneMetrics": [],
            "riskEvents": [],
            "emission": {
                "isProxy": True,
                "description": "Speed and acceleration based proxy, not measured CO2/NOx/fuel.",
                "networkProxy": 0.0,
            },
        }

    def _clear_metrics(self) -> None:
        self._metric_history.clear()
        self._latest_metrics = None
        self._vehicle_ids_seen.clear()

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
