from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Dict, Iterable, List


VehicleState = Dict[str, Any]


@dataclass(frozen=True)
class PresequencingZoneConfig:
    id: str
    edge_id: str
    source_lane: int
    target_lane: int
    destination: str
    target_flow: str
    intent: str


PRESEQUENCING_ZONES = [
    PresequencingZoneConfig(
        id="L1",
        edge_id="L1",
        source_lane=2,
        target_lane=1,
        destination="E4",
        target_flow="exit flow, lane 2 to lane 1",
        intent="exit",
    ),
    PresequencingZoneConfig(
        id="L2",
        edge_id="L2",
        source_lane=1,
        target_lane=0,
        destination="E4",
        target_flow="exit flow, lane 1 to lane 0",
        intent="exit",
    ),
    PresequencingZoneConfig(
        id="L3",
        edge_id="L3",
        source_lane=1,
        target_lane=2,
        destination="E2",
        target_flow="through flow, lane 1 to lane 2",
        intent="through",
    ),
    PresequencingZoneConfig(
        id="L4",
        edge_id="L4",
        source_lane=0,
        target_lane=1,
        destination="E2",
        target_flow="through flow, lane 0 to lane 1",
        intent="through",
    ),
]


def build_presequencing_state(
    vehicles: List[VehicleState],
    network_config: Dict[str, Any],
    control_enabled: bool,
) -> List[Dict[str, Any]]:
    """Build simulated dynamic presequencing signals from the current snapshot."""
    lane_by_id = {str(lane["id"]): lane for lane in network_config.get("lanes", [])}
    lanes_by_edge = _group_lanes_by_edge(network_config.get("lanes", []))
    vehicles_by_edge = _group_vehicles_by_edge(vehicles)

    zones: List[Dict[str, Any]] = []
    for zone in PRESEQUENCING_ZONES:
        edge_lanes = lanes_by_edge.get(zone.edge_id, [])
        edge_vehicles = vehicles_by_edge.get(zone.edge_id, [])
        source_vehicles = [
            vehicle
            for vehicle in edge_vehicles
            if int(vehicle.get("laneIndex", -1)) == zone.source_lane
        ]
        target_vehicles = [
            vehicle
            for vehicle in edge_vehicles
            if int(vehicle.get("laneIndex", -1)) == zone.target_lane
        ]
        candidates = [
            vehicle
            for vehicle in source_vehicles
            if _vehicle_destination(vehicle) == zone.destination
        ]
        cav_candidates = [
            vehicle for vehicle in candidates if _is_connected(vehicle)
        ]
        human_candidates = [
            vehicle for vehicle in candidates if not _is_connected(vehicle)
        ]

        source_capacity = _estimate_lane_capacity(
            lane_by_id.get(f"{zone.edge_id}_{zone.source_lane}")
        )
        target_capacity = _estimate_lane_capacity(
            lane_by_id.get(f"{zone.edge_id}_{zone.target_lane}")
        )
        source_load = _clamp(len(source_vehicles) / source_capacity)
        target_load = _clamp(len(target_vehicles) / target_capacity)
        demand_pressure = _clamp(len(candidates) / max(len(source_vehicles), 1))
        imbalance_pressure = _clamp((source_load - target_load + 0.2) / 0.9)
        speed_pressure = _speed_pressure(edge_vehicles, edge_lanes)
        human_uncertainty = _clamp(len(human_candidates) / max(len(candidates), 1))

        intensity = _clamp(
            0.42 * demand_pressure
            + 0.26 * imbalance_pressure
            + 0.2 * speed_pressure
            + 0.12 * human_uncertainty
        )
        if candidates and intensity < 0.35:
            intensity = 0.35

        active = bool(control_enabled and candidates and intensity >= 0.3)
        active_length_fraction = round(
            _clamp(0.45 + intensity * 0.5 if active else 0.25 + intensity * 0.25),
            4,
        )

        zones.append(
            {
                "id": zone.id,
                "edgeId": zone.edge_id,
                "sourceLane": zone.source_lane,
                "targetLane": zone.target_lane,
                "destination": zone.destination,
                "targetFlow": zone.target_flow,
                "intent": zone.intent,
                "active": active,
                "controlEnabled": control_enabled,
                "intensity": round(intensity, 4),
                "riskScore": round(
                    _clamp(0.45 * speed_pressure + 0.35 * demand_pressure + 0.2 * source_load),
                    4,
                ),
                "vehicleCount": len(edge_vehicles),
                "candidateCount": len(candidates),
                "cavCandidateCount": len(cav_candidates),
                "humanCandidateCount": len(human_candidates),
                "sourceLaneLoad": round(source_load, 4),
                "targetLaneLoad": round(target_load, 4),
                "activeLengthFraction": active_length_fraction,
                "laneIds": [str(lane["id"]) for lane in edge_lanes],
                "signalSource": "simulated-from-live-vehicle-state",
                "simulated": True,
                "reason": _build_reason(
                    active=active,
                    candidate_count=len(candidates),
                    intensity=intensity,
                    source_load=source_load,
                    target_load=target_load,
                    control_enabled=control_enabled,
                ),
            }
        )

    return zones


def _group_lanes_by_edge(lanes: Iterable[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    grouped: Dict[str, List[Dict[str, Any]]] = {}
    for lane in lanes:
        grouped.setdefault(str(lane.get("edgeId", "")), []).append(lane)
    for edge_lanes in grouped.values():
        edge_lanes.sort(key=lambda lane: int(lane.get("index", 0)))
    return grouped


def _group_vehicles_by_edge(vehicles: Iterable[VehicleState]) -> Dict[str, List[VehicleState]]:
    grouped: Dict[str, List[VehicleState]] = {}
    for vehicle in vehicles:
        grouped.setdefault(str(vehicle.get("edgeId", "")), []).append(vehicle)
    return grouped


def _estimate_lane_capacity(lane: Dict[str, Any] | None) -> float:
    if lane is None:
        return 1.0
    length = _lane_length_meters(lane)
    return max(length / 9.0, 1.0)


def _speed_pressure(
    vehicles: List[VehicleState],
    lanes: List[Dict[str, Any]],
) -> float:
    if not vehicles:
        return 0.0
    average_speed = sum(float(vehicle.get("speed", 0.0)) for vehicle in vehicles) / len(vehicles)
    lane_speed_limit = (
        sum(float(lane.get("speed", 0.0)) for lane in lanes) / len(lanes)
        if lanes
        else 25.0
    )
    return _clamp((max(lane_speed_limit, 0.1) - average_speed) / max(lane_speed_limit, 0.1))


def _vehicle_destination(vehicle: VehicleState) -> str | None:
    route = vehicle.get("route", [])
    if isinstance(route, list) and route:
        return str(route[-1])
    return None


def _is_connected(vehicle: VehicleState) -> bool:
    return str(vehicle.get("type", "")).lower() in {"connected", "cav"}


def _lane_length_meters(lane: Dict[str, Any]) -> float:
    shape = lane.get("shape", [])
    if len(shape) < 2:
        return 0.0
    length = 0.0
    for index in range(1, len(shape)):
        prev_x, prev_y = shape[index - 1]
        next_x, next_y = shape[index]
        length += math.hypot(float(next_x) - float(prev_x), float(next_y) - float(prev_y))
    return length


def _build_reason(
    *,
    active: bool,
    candidate_count: int,
    intensity: float,
    source_load: float,
    target_load: float,
    control_enabled: bool,
) -> str:
    if not control_enabled:
        return "lane-change control disabled"
    if candidate_count == 0:
        return "no target-flow vehicle in source lane"
    if active:
        return (
            f"{candidate_count} candidate(s), intensity {intensity:.2f}, "
            f"source load {source_load:.2f} vs target {target_load:.2f}"
        )
    return "candidate demand below activation threshold"


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))
