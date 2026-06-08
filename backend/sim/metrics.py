from __future__ import annotations

from collections import defaultdict
import math
from typing import Any, Dict, Iterable, List, Optional


VehicleState = Dict[str, Any]
MetricSample = Dict[str, Any]
LaneMetric = Dict[str, Any]
RiskEvent = Dict[str, Any]

MIN_GAP_APPROX_METERS = 2.0
QUEUE_SPEED_THRESHOLD = 1.5
HARD_BRAKE_THRESHOLD = -3.0
HIGH_HARD_BRAKE_THRESHOLD = -4.5


def create_metric_sample(
    sim_time: float,
    step: int,
    vehicles: List[VehicleState],
    network_config: Dict[str, Any],
    lane_change_events: Iterable[Dict[str, Any]] | None = None,
) -> MetricSample:
    lane_change_list = list(lane_change_events or [])
    lane_metrics = compute_lane_metrics(vehicles, network_config, lane_change_list, step, sim_time)
    risk_events = compute_risk_metrics(vehicles, lane_metrics, step, sim_time)
    network_metrics = compute_network_metrics(vehicles, network_config, lane_metrics)
    emission_metrics = compute_emission_metrics_placeholder(lane_metrics)

    hard_brake_count = sum(1 for event in risk_events if event["type"] == "hard_brake")
    high_risk_event_count = sum(1 for event in risk_events if event["severity"] == "high")

    return {
        "simTime": round(sim_time, 2),
        "step": step,
        "averageSpeed": network_metrics["averageSpeed"],
        "averageSpeedKmh": round(network_metrics["averageSpeed"] * 3.6, 2),
        "vehicleCount": network_metrics["vehicleCount"],
        "connectedCount": network_metrics["connectedCount"],
        "cavPenetrationRate": network_metrics["cavPenetrationRate"],
        "densityPerKm": network_metrics["densityPerKm"],
        "averageDelay": network_metrics["averageDelay"],
        "queueLength": round(sum(float(lane["queueLength"]) for lane in lane_metrics), 2),
        "laneChangeCount": len(lane_change_list),
        "minTtc": network_metrics["minTtc"],
        "hardBrakeCount": hard_brake_count,
        "highRiskEventCount": high_risk_event_count,
        "laneMetrics": lane_metrics,
        "riskEvents": risk_events,
        "emission": emission_metrics,
        "metricNotes": {
            "delay": "average current delay rate proxy in seconds per step when TraCI timeLoss is unavailable",
            "emission": "speed and acceleration based proxy, not measured CO2/NOx/fuel",
        },
    }


def compute_network_metrics(
    vehicles: List[VehicleState],
    network_config: Dict[str, Any],
    lane_metrics: List[LaneMetric],
) -> Dict[str, Any]:
    vehicle_count = len(vehicles)
    connected_count = sum(1 for vehicle in vehicles if _is_connected(vehicle))
    total_speed = sum(float(vehicle.get("speed", 0.0)) for vehicle in vehicles)
    total_lane_length_km = sum(
        _lane_length_meters(lane) for lane in network_config.get("lanes", [])
    ) / 1000
    min_ttc_values = [
        float(lane["minTtc"]) for lane in lane_metrics if lane.get("minTtc") is not None
    ]

    return {
        "averageSpeed": round(total_speed / vehicle_count, 4) if vehicle_count else 0.0,
        "vehicleCount": vehicle_count,
        "connectedCount": connected_count,
        "cavPenetrationRate": round(connected_count / vehicle_count, 4) if vehicle_count else 0.0,
        "densityPerKm": round(vehicle_count / total_lane_length_km, 4)
        if total_lane_length_km > 0
        else 0.0,
        "averageDelay": round(_average_delay_proxy(vehicles, network_config), 4),
        "minTtc": round(min(min_ttc_values), 4) if min_ttc_values else None,
    }


def compute_lane_metrics(
    vehicles: List[VehicleState],
    network_config: Dict[str, Any],
    lane_change_events: Iterable[Dict[str, Any]] | None = None,
    step: int = 0,
    sim_time: float = 0.0,
) -> List[LaneMetric]:
    vehicles_by_lane: Dict[str, List[VehicleState]] = defaultdict(list)
    for vehicle in vehicles:
        vehicles_by_lane[str(vehicle.get("laneId", ""))].append(vehicle)

    lane_change_counts = _count_lane_changes_by_lane(lane_change_events or [])
    metrics: List[LaneMetric] = []

    for lane in network_config.get("lanes", []):
        lane_id = str(lane["id"])
        lane_vehicles = vehicles_by_lane.get(lane_id, [])
        lane_length_meters = _lane_length_meters(lane)
        vehicle_count = len(lane_vehicles)
        total_speed = sum(float(vehicle.get("speed", 0.0)) for vehicle in lane_vehicles)
        average_speed = total_speed / vehicle_count if vehicle_count else 0.0
        density_per_km = (
            vehicle_count / (lane_length_meters / 1000)
            if lane_length_meters > 0
            else 0.0
        )
        occupied_length = sum(
            float(vehicle.get("length", 0.0)) + MIN_GAP_APPROX_METERS
            for vehicle in lane_vehicles
        )
        occupancy = min(occupied_length / lane_length_meters, 1.0) if lane_length_meters > 0 else 0.0
        queue_length = _estimate_queue_length(lane_vehicles)
        min_ttc = _calculate_lane_min_ttc(lane_vehicles)
        lane_change_count = lane_change_counts.get(lane_id, 0)
        risk_level = _classify_lane_risk(
            vehicle_count=vehicle_count,
            average_speed=average_speed,
            density_per_km=density_per_km,
            occupancy=occupancy,
            min_ttc=min_ttc,
        )

        risk_heat = _normalize_risk(min_ttc, occupancy, average_speed)
        congestion_heat = max(
            _clamp(density_per_km / 80),
            _clamp(occupancy),
            _clamp((10 - average_speed) / 10) if vehicle_count else 0.0,
        )
        density_heat = _clamp(density_per_km / 80)
        lane_change_heat = _clamp(lane_change_count / 3)

        metrics.append(
            {
                "laneId": lane_id,
                "edgeId": str(lane.get("edgeId", "")),
                "laneIndex": int(lane.get("index", 0)),
                "vehicleCount": vehicle_count,
                "averageSpeed": round(average_speed, 4),
                "averageSpeedKmh": round(average_speed * 3.6, 2),
                "densityPerKm": round(density_per_km, 4),
                "occupancy": round(occupancy, 4),
                "queueLength": round(queue_length, 2),
                "laneChangeCount": lane_change_count,
                "minTtc": round(min_ttc, 4) if min_ttc is not None else None,
                "riskLevel": risk_level,
                "heatmapValues": {
                    "speed": round(_clamp(1 - average_speed / max(float(lane.get("speed", 30.0)), 1)), 4),
                    "density": round(density_heat, 4),
                    "congestion": round(congestion_heat, 4),
                    "risk": round(risk_heat, 4),
                    "emission": round(_estimate_emission_proxy(lane_vehicles, average_speed), 4),
                    "laneChangeFrequency": round(lane_change_heat, 4),
                },
                "sampleStep": step,
                "sampleTime": round(sim_time, 2),
            }
        )

    return metrics


def compute_risk_metrics(
    vehicles: List[VehicleState],
    lane_metrics: List[LaneMetric],
    step: int,
    sim_time: float,
) -> List[RiskEvent]:
    events: List[RiskEvent] = []
    vehicles_by_lane: Dict[str, List[VehicleState]] = defaultdict(list)
    for vehicle in vehicles:
        vehicles_by_lane[str(vehicle.get("laneId", ""))].append(vehicle)

    for lane_id, lane_vehicles in vehicles_by_lane.items():
        for event in _create_ttc_events(lane_vehicles, lane_id, step, sim_time):
            events.append(event)

    for vehicle in vehicles:
        acceleration = float(vehicle.get("acceleration", 0.0))
        if acceleration < HARD_BRAKE_THRESHOLD:
            events.append(
                {
                    "time": round(sim_time, 2),
                    "step": step,
                    "type": "hard_brake",
                    "vehicleId": str(vehicle.get("id", "")),
                    "laneId": str(vehicle.get("laneId", "")),
                    "value": round(acceleration, 4),
                    "severity": "high" if acceleration < HIGH_HARD_BRAKE_THRESHOLD else "medium",
                }
            )

    for lane in lane_metrics:
        if float(lane["occupancy"]) > 0.85 and float(lane["averageSpeed"]) < 3.0:
            events.append(
                {
                    "time": round(sim_time, 2),
                    "step": step,
                    "type": "queue_spillback",
                    "laneId": lane["laneId"],
                    "value": round(float(lane["occupancy"]), 4),
                    "severity": "high",
                }
            )
        if float(lane["queueLength"]) > 0 and float(lane["averageSpeed"]) < 0.5:
            events.append(
                {
                    "time": round(sim_time, 2),
                    "step": step,
                    "type": "stopped_vehicle",
                    "laneId": lane["laneId"],
                    "value": round(float(lane["queueLength"]), 2),
                    "severity": "low",
                }
            )

    return events


def compute_emission_metrics_placeholder(lane_metrics: List[LaneMetric]) -> Dict[str, Any]:
    values = [
        float(lane["heatmapValues"]["emission"])
        for lane in lane_metrics
        if "heatmapValues" in lane
    ]
    return {
        "isProxy": True,
        "description": "Speed and acceleration based proxy, not measured CO2/NOx/fuel.",
        "networkProxy": round(sum(values) / len(values), 4) if values else 0.0,
    }


def summarize_metric_history(
    history: Iterable[MetricSample],
    scenario_config: Dict[str, Any] | None = None,
    total_vehicles_seen: int | None = None,
) -> Dict[str, Any]:
    samples = list(history)
    if not samples:
        return {
            "simulationDuration": 0.0,
            "totalVehiclesSeen": total_vehicles_seen or 0,
            "averageSpeedKmh": 0.0,
            "averageDelay": 0.0,
            "totalLaneChanges": 0,
            "totalHardBrakes": 0,
            "totalHighRiskEvents": 0,
            "minTtc": None,
            "cavPenetrationRate": 0.0,
            "worstLanesByCongestion": [],
            "worstLanesByRisk": [],
            "scenarioConfig": scenario_config,
        }

    latest = samples[-1]
    simulation_duration = max(float(sample["simTime"]) for sample in samples)
    average_speed_kmh = _mean(float(sample["averageSpeedKmh"]) for sample in samples)
    average_delay = _mean(float(sample["averageDelay"]) for sample in samples)
    min_ttc_values = [
        float(sample["minTtc"]) for sample in samples if sample.get("minTtc") is not None
    ]
    lane_aggregate = _aggregate_lanes(samples)

    return {
        "simulationDuration": round(simulation_duration, 2),
        "totalVehiclesSeen": (
            int(total_vehicles_seen)
            if total_vehicles_seen is not None
            else int(max(float(sample["vehicleCount"]) for sample in samples))
        ),
        "averageSpeedKmh": round(average_speed_kmh, 2),
        "averageDelay": round(average_delay, 3),
        "totalLaneChanges": int(sum(int(sample["laneChangeCount"]) for sample in samples)),
        "totalHardBrakes": int(sum(int(sample["hardBrakeCount"]) for sample in samples)),
        "totalHighRiskEvents": int(sum(int(sample["highRiskEventCount"]) for sample in samples)),
        "minTtc": round(min(min_ttc_values), 3) if min_ttc_values else None,
        "cavPenetrationRate": float(latest["cavPenetrationRate"]),
        "worstLanesByCongestion": lane_aggregate["congestion"][:5],
        "worstLanesByRisk": lane_aggregate["risk"][:5],
        "scenarioConfig": scenario_config,
    }


def _aggregate_lanes(samples: List[MetricSample]) -> Dict[str, List[Dict[str, Any]]]:
    lanes: Dict[str, Dict[str, Any]] = {}
    for sample in samples:
        for lane in sample.get("laneMetrics", []):
            lane_id = str(lane["laneId"])
            lane_stats = lanes.setdefault(
                lane_id,
                {
                    "laneId": lane_id,
                    "edgeId": lane["edgeId"],
                    "laneIndex": lane["laneIndex"],
                    "congestionScore": 0.0,
                    "riskScore": 0.0,
                    "queueLength": 0.0,
                    "samples": 0,
                },
            )
            lane_stats["congestionScore"] += float(lane["heatmapValues"]["congestion"])
            lane_stats["riskScore"] += float(lane["heatmapValues"]["risk"])
            lane_stats["queueLength"] = max(
                float(lane_stats["queueLength"]),
                float(lane["queueLength"]),
            )
            lane_stats["samples"] += 1

    normalized = []
    for lane in lanes.values():
        sample_count = max(int(lane.pop("samples")), 1)
        normalized.append(
            {
                **lane,
                "congestionScore": round(float(lane["congestionScore"]) / sample_count, 4),
                "riskScore": round(float(lane["riskScore"]) / sample_count, 4),
                "queueLength": round(float(lane["queueLength"]), 2),
            }
        )

    return {
        "congestion": sorted(
            normalized,
            key=lambda lane: (lane["congestionScore"], lane["queueLength"]),
            reverse=True,
        ),
        "risk": sorted(normalized, key=lambda lane: lane["riskScore"], reverse=True),
    }


def _calculate_lane_min_ttc(vehicles: List[VehicleState]) -> Optional[float]:
    ttc_values: List[float] = []
    sorted_vehicles = sorted(vehicles, key=lambda vehicle: float(vehicle.get("lanePosition", 0.0)))
    for index in range(len(sorted_vehicles) - 1):
        follower = sorted_vehicles[index]
        leader = sorted_vehicles[index + 1]
        gap = (
            float(leader.get("lanePosition", 0.0))
            - float(follower.get("lanePosition", 0.0))
            - float(leader.get("length", 0.0))
        )
        relative_speed = float(follower.get("speed", 0.0)) - float(leader.get("speed", 0.0))
        if relative_speed > 0 and gap > 0:
            ttc_values.append(gap / relative_speed)
    return min(ttc_values) if ttc_values else None


def _create_ttc_events(
    vehicles: List[VehicleState],
    lane_id: str,
    step: int,
    sim_time: float,
) -> List[RiskEvent]:
    events: List[RiskEvent] = []
    sorted_vehicles = sorted(vehicles, key=lambda vehicle: float(vehicle.get("lanePosition", 0.0)))
    for index in range(len(sorted_vehicles) - 1):
        follower = sorted_vehicles[index]
        leader = sorted_vehicles[index + 1]
        gap = (
            float(leader.get("lanePosition", 0.0))
            - float(follower.get("lanePosition", 0.0))
            - float(leader.get("length", 0.0))
        )
        relative_speed = float(follower.get("speed", 0.0)) - float(leader.get("speed", 0.0))
        if relative_speed <= 0 or gap <= 0:
            continue

        ttc = gap / relative_speed
        if ttc < 3.0:
            events.append(
                {
                    "time": round(sim_time, 2),
                    "step": step,
                    "type": "low_ttc",
                    "vehicleId": str(follower.get("id", "")),
                    "laneId": lane_id,
                    "value": round(ttc, 4),
                    "severity": "high" if ttc < 1.5 else "medium",
                }
            )
    return events


def _estimate_queue_length(vehicles: List[VehicleState]) -> float:
    queued_vehicles = sorted(
        [vehicle for vehicle in vehicles if float(vehicle.get("speed", 0.0)) < QUEUE_SPEED_THRESHOLD],
        key=lambda vehicle: float(vehicle.get("lanePosition", 0.0)),
    )
    if not queued_vehicles:
        return 0.0

    first = queued_vehicles[0]
    last = queued_vehicles[-1]
    return max(
        float(last.get("lanePosition", 0.0))
        - float(first.get("lanePosition", 0.0))
        + float(last.get("length", 0.0)),
        0.0,
    )


def _average_delay_proxy(vehicles: List[VehicleState], network_config: Dict[str, Any]) -> float:
    if not vehicles:
        return 0.0

    lane_speed_by_id = {
        str(lane["id"]): float(lane.get("speed", 0.0))
        for lane in network_config.get("lanes", [])
    }
    delay_rates = []
    for vehicle in vehicles:
        desired_speed = vehicle.get("desiredSpeed")
        if desired_speed is None:
            desired_speed = lane_speed_by_id.get(str(vehicle.get("laneId", "")), 0.0)
        desired = max(float(desired_speed or 0.0), 0.1)
        speed = float(vehicle.get("speed", 0.0))
        delay_rates.append(max(0.0, desired - speed) / desired)
    return _mean(delay_rates)


def _count_lane_changes_by_lane(
    lane_change_events: Iterable[Dict[str, Any]],
) -> Dict[str, int]:
    counts: Dict[str, int] = defaultdict(int)
    for event in lane_change_events:
        lane_id = event.get("laneId")
        if lane_id is None and event.get("fromEdge") is not None and event.get("toLane") is not None:
            lane_id = f"{event['fromEdge']}_{event['toLane']}"
        if lane_id is not None:
            counts[str(lane_id)] += 1
    return counts


def _classify_lane_risk(
    vehicle_count: int,
    average_speed: float,
    density_per_km: float,
    occupancy: float,
    min_ttc: Optional[float],
) -> str:
    if vehicle_count == 0:
        return "free"
    if (min_ttc is not None and min_ttc < 1.5) or (occupancy > 0.85 and average_speed < 3.0):
        return "risk"
    if average_speed * 3.6 < 25 or density_per_km > 48 or occupancy > 0.62:
        return "congested"
    if average_speed * 3.6 < 55 or density_per_km > 28 or occupancy > 0.34:
        return "moderate"
    return "free"


def _normalize_risk(min_ttc: Optional[float], occupancy: float, average_speed: float) -> float:
    ttc_risk = 0.0
    if min_ttc is not None:
        if min_ttc < 1.5:
            ttc_risk = 1.0
        elif min_ttc < 3.0:
            ttc_risk = (3.0 - min_ttc) / 1.5
    spillback_risk = 1.0 if occupancy > 0.85 and average_speed < 3.0 else 0.0
    return max(ttc_risk, spillback_risk, _clamp((occupancy - 0.6) / 0.4))


def _estimate_emission_proxy(vehicles: List[VehicleState], average_speed: float) -> float:
    if not vehicles:
        return 0.0
    acceleration_load = _mean(abs(float(vehicle.get("acceleration", 0.0))) for vehicle in vehicles)
    low_speed_load = _clamp((8.0 - average_speed) / 8.0)
    return _clamp(low_speed_load * 0.6 + acceleration_load / 5.0 * 0.4)


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


def _is_connected(vehicle: VehicleState) -> bool:
    vehicle_type = str(vehicle.get("type", ""))
    return vehicle_type.lower() in {"connected", "cav"}


def _mean(values: Iterable[float]) -> float:
    value_list = list(values)
    if not value_list:
        return 0.0
    return sum(value_list) / len(value_list)


def _clamp(value: float, lower: float = 0.0, upper: float = 1.0) -> float:
    return max(lower, min(upper, value))
