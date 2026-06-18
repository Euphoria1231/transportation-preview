from __future__ import annotations

from typing import Any, Dict


DEFAULT_SCENARIO_CONFIG: Dict[str, object] = {
    "simulationDuration": 300,
    "stepLength": 0.1,
    "totalFlow": 6000,
    "cavPenetrationRate": 0.5,
    "mainlineRatio": 0.75,
    "rampRatio": 0.25,
    "exitRatio": 0.2,
    "speedLimitKmh": 120,
    "randomSeed": 42,
    "enableCavLaneChangeControl": True,
    "disableSumoLaneChangeControl": False,
    "scenarioPreset": "balanced",
}

SCENARIO_PRESETS: Dict[str, Dict[str, object]] = {
    "low-flow": {
        "totalFlow": 4500,
        "cavPenetrationRate": 0.5,
        "mainlineRatio": 0.75,
        "exitRatio": 0.2,
    },
    "balanced": {},
    "high-flow": {
        "totalFlow": 7500,
        "cavPenetrationRate": 0.5,
        "mainlineRatio": 0.78,
        "exitRatio": 0.2,
    },
    "high-cav": {
        "totalFlow": 6000,
        "cavPenetrationRate": 0.8,
        "mainlineRatio": 0.75,
        "exitRatio": 0.2,
    },
    "low-cav": {
        "totalFlow": 6000,
        "cavPenetrationRate": 0.2,
        "mainlineRatio": 0.75,
        "exitRatio": 0.2,
    },
    "ramp-heavy": {
        "totalFlow": 6000,
        "cavPenetrationRate": 0.5,
        "mainlineRatio": 0.6,
        "exitRatio": 0.18,
    },
    "exit-heavy": {
        "totalFlow": 6000,
        "cavPenetrationRate": 0.5,
        "mainlineRatio": 0.78,
        "exitRatio": 0.4,
    },
}


def get_default_scenario_config() -> Dict[str, object]:
    return dict(DEFAULT_SCENARIO_CONFIG)


def validate_scenario_config(raw: Dict[str, Any] | None) -> Dict[str, object]:
    raw_config = raw or {}
    preset_name = str(raw_config.get("scenarioPreset", DEFAULT_SCENARIO_CONFIG["scenarioPreset"]))
    if preset_name not in SCENARIO_PRESETS:
        raise ValueError(f"Unknown scenarioPreset: {preset_name}")

    merged: Dict[str, Any] = {
        **DEFAULT_SCENARIO_CONFIG,
        **SCENARIO_PRESETS[preset_name],
        **raw_config,
        "scenarioPreset": preset_name,
    }

    simulation_duration = _parse_int(merged["simulationDuration"], "simulationDuration")
    step_length = _parse_float(merged["stepLength"], "stepLength")
    total_flow = _parse_float(merged["totalFlow"], "totalFlow")
    cav_rate = _parse_float(merged["cavPenetrationRate"], "cavPenetrationRate")
    mainline_ratio = _parse_float(merged["mainlineRatio"], "mainlineRatio")
    exit_ratio = _parse_float(merged["exitRatio"], "exitRatio")
    speed_limit = _parse_float(merged["speedLimitKmh"], "speedLimitKmh")
    random_seed = _parse_int(merged["randomSeed"], "randomSeed")
    enable_cav_control = _parse_bool(
        merged["enableCavLaneChangeControl"],
        "enableCavLaneChangeControl",
    )
    disable_sumo_lane_change_control = _parse_bool(
        merged["disableSumoLaneChangeControl"],
        "disableSumoLaneChangeControl",
    )

    _require_range(simulation_duration, "simulationDuration", minimum=1, maximum=7200)
    _require_range(step_length, "stepLength", minimum=0.001, maximum=1)
    _require_range(total_flow, "totalFlow", minimum=0, maximum=8000)
    _require_range(cav_rate, "cavPenetrationRate", minimum=0, maximum=1)
    _require_range(mainline_ratio, "mainlineRatio", minimum=0, maximum=1)
    _require_range(exit_ratio, "exitRatio", minimum=0, maximum=1)
    _require_range(speed_limit, "speedLimitKmh", minimum=30, maximum=140)

    ramp_ratio = round(1 - mainline_ratio, 6)

    return {
        "simulationDuration": simulation_duration,
        "stepLength": step_length,
        "totalFlow": round(total_flow, 2),
        "cavPenetrationRate": round(cav_rate, 4),
        "mainlineRatio": round(mainline_ratio, 4),
        "rampRatio": ramp_ratio,
        "exitRatio": round(exit_ratio, 4),
        "speedLimitKmh": round(speed_limit, 2),
        "randomSeed": random_seed,
        "enableCavLaneChangeControl": enable_cav_control,
        "disableSumoLaneChangeControl": disable_sumo_lane_change_control,
        "scenarioPreset": preset_name,
    }


def derive_flow_plan(config: Dict[str, object]) -> Dict[str, float]:
    total_flow = float(config["totalFlow"])
    mainline_ratio = float(config["mainlineRatio"])
    exit_ratio = float(config["exitRatio"])
    cav_rate = float(config["cavPenetrationRate"])
    speed_limit_kmh = float(config["speedLimitKmh"])

    mainline_flow = total_flow * mainline_ratio
    ramp_flow = total_flow - mainline_flow
    exit_flow = mainline_flow * exit_ratio
    straight_flow = mainline_flow - exit_flow
    straight_flow_a = straight_flow * 0.5
    straight_flow_b = straight_flow * 0.5

    return {
        "totalFlow": _round_flow(total_flow),
        "cavFlow": _round_flow(total_flow * cav_rate),
        "hdvFlow": _round_flow(total_flow * (1 - cav_rate)),
        "mainlineFlow": _round_flow(mainline_flow),
        "rampFlow": _round_flow(ramp_flow),
        "exitFlow": _round_flow(exit_flow),
        "straightFlow": _round_flow(straight_flow),
        "straightFlowA": _round_flow(straight_flow_a),
        "straightFlowB": _round_flow(straight_flow_b),
        "straightFlowAConnected": _round_flow(straight_flow_a * cav_rate),
        "straightFlowAHuman": _round_flow(straight_flow_a * (1 - cav_rate)),
        "straightFlowBConnected": _round_flow(straight_flow_b * cav_rate),
        "straightFlowBHuman": _round_flow(straight_flow_b * (1 - cav_rate)),
        "exitFlowConnected": _round_flow(exit_flow * cav_rate),
        "exitFlowHuman": _round_flow(exit_flow * (1 - cav_rate)),
        "rampFlowConnected": _round_flow(ramp_flow * cav_rate),
        "rampFlowHuman": _round_flow(ramp_flow * (1 - cav_rate)),
        "speedLimitMetersPerSecond": round(speed_limit_kmh / 3.6, 2),
    }


def _parse_float(value: Any, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be a number") from exc

    if parsed != parsed:
        raise ValueError(f"{field_name} must be a valid number")
    return parsed


def _parse_int(value: Any, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{field_name} must be an integer") from exc
    return parsed


def _parse_bool(value: Any, field_name: str) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes"}:
            return True
        if normalized in {"false", "0", "no"}:
            return False
    raise ValueError(f"{field_name} must be a boolean")


def _require_range(value: float, field_name: str, minimum: float, maximum: float) -> None:
    if value < minimum or value > maximum:
        raise ValueError(f"{field_name} must be between {minimum} and {maximum}")


def _round_flow(value: float) -> float:
    return round(value, 2)
