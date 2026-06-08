from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional


Summary = Dict[str, Any]
SimulationReport = Dict[str, Any]
ComparisonReport = Dict[str, Any]


def build_simulation_report(summary: Summary) -> SimulationReport:
    congestion_lane = _first_lane_label(summary.get("worstLanesByCongestion", []))
    risk_lane = _first_lane_label(summary.get("worstLanesByRisk", []))

    return {
        "generatedAt": _utc_timestamp(),
        "scenarioName": _scenario_name(summary.get("scenarioConfig")),
        "scenarioConfig": summary.get("scenarioConfig"),
        "simulationDuration": summary["simulationDuration"],
        "totalVehiclesSeen": summary["totalVehiclesSeen"],
        "averageSpeedKmh": summary["averageSpeedKmh"],
        "averageDelay": summary["averageDelay"],
        "totalLaneChanges": summary["totalLaneChanges"],
        "totalHardBrakes": summary["totalHardBrakes"],
        "totalHighRiskEvents": summary["totalHighRiskEvents"],
        "minTtc": summary["minTtc"],
        "cavPenetrationRate": summary["cavPenetrationRate"],
        "congestionSummary": _build_congestion_summary(summary),
        "riskSummary": _build_risk_summary(summary),
        "conclusion": (
            f"当前场景平均速度为 {summary['averageSpeedKmh']:.1f} km/h，"
            f"平均延误为 {summary['averageDelay']:.2f} s，"
            f"高风险事件 {summary['totalHighRiskEvents']} 次。"
            f"最拥堵车道是 {congestion_lane}，风险最高车道是 {risk_lane}。"
        ),
        "metricNotes": {
            "singleRun": "No baseline is used, so this report does not claim improvement or reduction.",
            "delay": "Delay is a current delay-rate proxy unless TraCI timeLoss is available.",
        },
    }


def build_comparison_report(baseline_summary: Summary, experiment_summary: Summary) -> ComparisonReport:
    deltas = {
        "averageSpeedChangePercent": _percent_change(
            baseline_summary["averageSpeedKmh"],
            experiment_summary["averageSpeedKmh"],
        ),
        "averageSpeedAbsoluteChange": _absolute_change(
            baseline_summary["averageSpeedKmh"],
            experiment_summary["averageSpeedKmh"],
        ),
        "averageDelayChangePercent": _percent_change(
            baseline_summary["averageDelay"],
            experiment_summary["averageDelay"],
        ),
        "averageDelayAbsoluteChange": _absolute_change(
            baseline_summary["averageDelay"],
            experiment_summary["averageDelay"],
        ),
        "hardBrakeChangePercent": _percent_change(
            baseline_summary["totalHardBrakes"],
            experiment_summary["totalHardBrakes"],
        ),
        "hardBrakeAbsoluteChange": _absolute_change(
            baseline_summary["totalHardBrakes"],
            experiment_summary["totalHardBrakes"],
        ),
        "highRiskEventChangePercent": _percent_change(
            baseline_summary["totalHighRiskEvents"],
            experiment_summary["totalHighRiskEvents"],
        ),
        "highRiskEventAbsoluteChange": _absolute_change(
            baseline_summary["totalHighRiskEvents"],
            experiment_summary["totalHighRiskEvents"],
        ),
        "laneChangeChangePercent": _percent_change(
            baseline_summary["totalLaneChanges"],
            experiment_summary["totalLaneChanges"],
        ),
        "laneChangeAbsoluteChange": _absolute_change(
            baseline_summary["totalLaneChanges"],
            experiment_summary["totalLaneChanges"],
        ),
    }

    return {
        "generatedAt": _utc_timestamp(),
        "baselineSummary": baseline_summary,
        "experimentSummary": experiment_summary,
        "deltas": deltas,
        "conclusion": _build_comparison_conclusion(baseline_summary, experiment_summary, deltas),
    }


def _build_congestion_summary(summary: Summary) -> str:
    worst_lanes = summary.get("worstLanesByCongestion", [])
    if not worst_lanes:
        return "当前缓存中没有可排序的拥堵车道。"
    lane = worst_lanes[0]
    return (
        f"{lane['laneId']} 拥堵评分 {lane.get('congestionScore', 0):.2f}，"
        f"最大排队长度 {lane.get('queueLength', 0):.1f} m。"
    )


def _build_risk_summary(summary: Summary) -> str:
    worst_lanes = summary.get("worstLanesByRisk", [])
    if not worst_lanes:
        return "当前缓存中没有可排序的风险车道。"
    lane = worst_lanes[0]
    min_ttc = summary.get("minTtc")
    ttc_text = f"，全网最小 TTC {min_ttc:.2f} s" if min_ttc is not None else ""
    return f"{lane['laneId']} 风险评分 {lane.get('riskScore', 0):.2f}{ttc_text}。"


def _build_comparison_conclusion(
    baseline: Summary,
    experiment: Summary,
    deltas: Dict[str, Optional[float]],
) -> str:
    baseline_cav = _scenario_cav_rate(baseline)
    experiment_cav = _scenario_cav_rate(experiment)
    parts = [
        f"CAV 渗透率从 {baseline_cav:.0f}% 变化到 {experiment_cav:.0f}%。",
        _delta_sentence(
            "平均速度",
            deltas["averageSpeedChangePercent"],
            deltas["averageSpeedAbsoluteChange"],
            "km/h",
            positive_word="提升",
            negative_word="降低",
        ),
        _delta_sentence(
            "平均延误",
            deltas["averageDelayChangePercent"],
            deltas["averageDelayAbsoluteChange"],
            "s",
            positive_word="增加",
            negative_word="降低",
        ),
        _delta_sentence(
            "急刹事件",
            deltas["hardBrakeChangePercent"],
            deltas["hardBrakeAbsoluteChange"],
            "次",
            positive_word="增加",
            negative_word="降低",
        ),
        _delta_sentence(
            "高风险事件",
            deltas["highRiskEventChangePercent"],
            deltas["highRiskEventAbsoluteChange"],
            "次",
            positive_word="增加",
            negative_word="降低",
        ),
    ]
    return "".join(parts)


def _delta_sentence(
    label: str,
    percent: Optional[float],
    absolute: float,
    unit: str,
    positive_word: str,
    negative_word: str,
) -> str:
    if absolute == 0:
        return f"{label}无变化。"

    direction = positive_word if absolute > 0 else negative_word
    magnitude = abs(absolute)
    if percent is None:
        return f"{label}{direction} {magnitude:.2f} {unit}（绝对变化）。"
    return f"{label}{direction} {abs(percent):.1f}%。"


def _percent_change(baseline_value: Any, experiment_value: Any) -> Optional[float]:
    baseline = float(baseline_value)
    experiment = float(experiment_value)
    if baseline == 0:
        return None
    return round((experiment - baseline) / baseline * 100, 4)


def _absolute_change(baseline_value: Any, experiment_value: Any) -> float:
    return round(float(experiment_value) - float(baseline_value), 4)


def _scenario_name(config: Any) -> str:
    if not isinstance(config, dict):
        return "current-simulation"
    return str(config.get("scenarioPreset") or "current-simulation")


def _scenario_cav_rate(summary: Summary) -> float:
    config = summary.get("scenarioConfig")
    if isinstance(config, dict) and "cavPenetrationRate" in config:
        return float(config["cavPenetrationRate"]) * 100
    return float(summary.get("cavPenetrationRate", 0.0)) * 100


def _first_lane_label(lanes: Any) -> str:
    if isinstance(lanes, list) and lanes:
        return str(lanes[0].get("laneId", "--"))
    return "--"


def _utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()
