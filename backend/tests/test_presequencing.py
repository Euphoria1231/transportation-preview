from __future__ import annotations

import unittest

from backend.sim.presequencing import build_presequencing_state


NETWORK_CONFIG = {
    "lanes": [
        {
            "id": "L1_1",
            "edgeId": "L1",
            "index": 1,
            "speed": 30.0,
            "shape": [[0.0, 0.0], [100.0, 0.0]],
        },
        {
            "id": "L1_2",
            "edgeId": "L1",
            "index": 2,
            "speed": 30.0,
            "shape": [[0.0, 4.0], [100.0, 4.0]],
        },
        {
            "id": "L2_0",
            "edgeId": "L2",
            "index": 0,
            "speed": 30.0,
            "shape": [[100.0, 0.0], [200.0, 0.0]],
        },
        {
            "id": "L2_1",
            "edgeId": "L2",
            "index": 1,
            "speed": 30.0,
            "shape": [[100.0, 4.0], [200.0, 4.0]],
        },
        {
            "id": "L3_1",
            "edgeId": "L3",
            "index": 1,
            "speed": 30.0,
            "shape": [[200.0, 0.0], [300.0, 0.0]],
        },
        {
            "id": "L3_2",
            "edgeId": "L3",
            "index": 2,
            "speed": 30.0,
            "shape": [[200.0, 4.0], [300.0, 4.0]],
        },
        {
            "id": "L4_0",
            "edgeId": "L4",
            "index": 0,
            "speed": 30.0,
            "shape": [[300.0, 0.0], [400.0, 0.0]],
        },
        {
            "id": "L4_1",
            "edgeId": "L4",
            "index": 1,
            "speed": 30.0,
            "shape": [[300.0, 4.0], [400.0, 4.0]],
        },
    ]
}


class PresequencingTest(unittest.TestCase):
    def test_builds_active_zone_from_candidate_vehicle(self) -> None:
        vehicles = [
            {
                "id": "exit_cav",
                "type": "Connected",
                "speed": 12.0,
                "edgeId": "L1",
                "laneId": "L1_2",
                "laneIndex": 2,
                "route": ["L1", "L2", "E4"],
            },
            {
                "id": "target_gap",
                "type": "Human",
                "speed": 14.0,
                "edgeId": "L1",
                "laneId": "L1_1",
                "laneIndex": 1,
                "route": ["L1", "L2", "E2"],
            },
        ]

        zones = build_presequencing_state(vehicles, NETWORK_CONFIG, control_enabled=True)
        zone_by_id = {zone["id"]: zone for zone in zones}

        self.assertTrue(zone_by_id["L1"]["active"])
        self.assertEqual(zone_by_id["L1"]["candidateCount"], 1)
        self.assertEqual(zone_by_id["L1"]["cavCandidateCount"], 1)
        self.assertGreater(zone_by_id["L1"]["intensity"], 0.3)
        self.assertIn("L1_2", zone_by_id["L1"]["laneIds"])

    def test_control_disabled_keeps_zone_inactive(self) -> None:
        vehicles = [
            {
                "id": "exit_cav",
                "type": "Connected",
                "speed": 12.0,
                "edgeId": "L1",
                "laneId": "L1_2",
                "laneIndex": 2,
                "route": ["L1", "L2", "E4"],
            }
        ]

        zones = build_presequencing_state(vehicles, NETWORK_CONFIG, control_enabled=False)
        zone_by_id = {zone["id"]: zone for zone in zones}

        self.assertFalse(zone_by_id["L1"]["active"])
        self.assertEqual(zone_by_id["L1"]["reason"], "lane-change control disabled")


if __name__ == "__main__":
    unittest.main()
