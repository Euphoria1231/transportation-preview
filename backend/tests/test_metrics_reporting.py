from __future__ import annotations

import unittest

from backend.sim.metrics import create_metric_sample
from backend.sim.reporting import build_comparison_report, build_simulation_report


NETWORK_CONFIG = {
    "lanes": [
        {
            "id": "E1_0",
            "edgeId": "E1",
            "index": 0,
            "speed": 30.0,
            "shape": [[0.0, 0.0], [100.0, 0.0]],
        },
        {
            "id": "E1_1",
            "edgeId": "E1",
            "index": 1,
            "speed": 30.0,
            "shape": [[0.0, 4.0], [100.0, 4.0]],
        },
    ]
}


class MetricsReportingTest(unittest.TestCase):
    def test_metric_sample_calculates_lane_ttc_queue_and_risk_events(self) -> None:
        vehicles = [
            {
                "id": "leader",
                "type": "Human",
                "speed": 4.0,
                "acceleration": 0.0,
                "edgeId": "E1",
                "laneId": "E1_0",
                "laneIndex": 0,
                "lanePosition": 50.0,
                "length": 5.0,
            },
            {
                "id": "follower",
                "type": "Connected",
                "speed": 10.0,
                "acceleration": -4.8,
                "edgeId": "E1",
                "laneId": "E1_0",
                "laneIndex": 0,
                "lanePosition": 35.0,
                "length": 5.0,
            },
            {
                "id": "queued",
                "type": "Human",
                "speed": 0.4,
                "acceleration": -0.1,
                "edgeId": "E1",
                "laneId": "E1_1",
                "laneIndex": 1,
                "lanePosition": 20.0,
                "length": 5.0,
            },
        ]

        sample = create_metric_sample(
            sim_time=2.0,
            step=20,
            vehicles=vehicles,
            network_config=NETWORK_CONFIG,
            lane_change_events=[{"vehicleId": "follower", "toLane": 1}],
        )

        self.assertEqual(sample["vehicleCount"], 3)
        self.assertEqual(sample["connectedCount"], 1)
        self.assertAlmostEqual(sample["averageSpeed"], 4.8, places=2)
        self.assertAlmostEqual(sample["densityPerKm"], 15.0, places=2)
        self.assertAlmostEqual(sample["minTtc"], 1.6667, places=3)
        self.assertEqual(sample["hardBrakeCount"], 1)
        self.assertEqual(sample["laneChangeCount"], 1)

        lane_by_id = {lane["laneId"]: lane for lane in sample["laneMetrics"]}
        self.assertAlmostEqual(lane_by_id["E1_0"]["minTtc"], 1.6667, places=3)
        self.assertEqual(lane_by_id["E1_1"]["queueLength"], 5.0)
        self.assertGreater(lane_by_id["E1_0"]["heatmapValues"]["risk"], 0)
        self.assertTrue(
            any(event["type"] == "hard_brake" for event in sample["riskEvents"])
        )
        self.assertTrue(
            any(event["type"] == "low_ttc" for event in sample["riskEvents"])
        )

    def test_reports_avoid_percent_delta_when_baseline_is_zero(self) -> None:
        baseline = {
            "simulationDuration": 10.0,
            "totalVehiclesSeen": 0,
            "averageSpeedKmh": 0.0,
            "averageDelay": 0.0,
            "totalLaneChanges": 0,
            "totalHardBrakes": 0,
            "totalHighRiskEvents": 0,
            "minTtc": None,
            "cavPenetrationRate": 0.0,
            "worstLanesByCongestion": [],
            "worstLanesByRisk": [],
            "scenarioConfig": {"cavPenetrationRate": 0.0},
        }
        experiment = {
            **baseline,
            "averageSpeedKmh": 36.0,
            "averageDelay": 4.0,
            "totalHardBrakes": 2,
            "totalHighRiskEvents": 3,
            "scenarioConfig": {"cavPenetrationRate": 0.5},
        }

        report = build_comparison_report(baseline, experiment)

        self.assertIsNone(report["deltas"]["averageSpeedChangePercent"])
        self.assertEqual(report["deltas"]["averageSpeedAbsoluteChange"], 36.0)
        self.assertIsNone(report["deltas"]["hardBrakeChangePercent"])
        self.assertEqual(report["deltas"]["hardBrakeAbsoluteChange"], 2)
        self.assertIn("绝对变化", report["conclusion"])

    def test_single_report_does_not_claim_improvement_without_baseline(self) -> None:
        summary = {
            "simulationDuration": 12.0,
            "totalVehiclesSeen": 3,
            "averageSpeedKmh": 28.5,
            "averageDelay": 1.2,
            "totalLaneChanges": 1,
            "totalHardBrakes": 0,
            "totalHighRiskEvents": 2,
            "minTtc": 1.4,
            "cavPenetrationRate": 0.5,
            "worstLanesByCongestion": [{"laneId": "E1_0", "queueLength": 10.0}],
            "worstLanesByRisk": [{"laneId": "E1_1", "riskScore": 0.7}],
            "scenarioConfig": {"cavPenetrationRate": 0.5},
        }

        report = build_simulation_report(summary)

        self.assertIn("当前场景平均速度为 28.5 km/h", report["conclusion"])
        self.assertNotIn("提升", report["conclusion"])
        self.assertNotIn("降低", report["conclusion"])


if __name__ == "__main__":
    unittest.main()
