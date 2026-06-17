from __future__ import annotations

import unittest

from backend.sim.scenario_config import derive_flow_plan, validate_scenario_config
from backend.sim.scenario_writer import build_route_root, build_sumocfg_root


class ScenarioConfigTest(unittest.TestCase):
    def test_validate_derives_ramp_ratio_and_flow_plan(self) -> None:
        config = validate_scenario_config(
            {
                "simulationDuration": 600,
                "stepLength": 0.2,
                "totalFlow": 2000,
                "cavPenetrationRate": 0.25,
                "mainlineRatio": 0.7,
                "exitRatio": 0.2,
                "speedLimitKmh": 90,
                "randomSeed": 7,
                "enableCavLaneChangeControl": False,
                "scenarioPreset": "balanced",
            }
        )

        self.assertEqual(config["rampRatio"], 0.3)
        self.assertEqual(config["speedLimitKmh"], 90)
        self.assertFalse(config["enableCavLaneChangeControl"])
        self.assertFalse(config["disableSumoLaneChangeControl"])

        flow_plan = derive_flow_plan(config)
        self.assertEqual(flow_plan["totalFlow"], 2000)
        self.assertEqual(flow_plan["mainlineFlow"], 1400)
        self.assertEqual(flow_plan["rampFlow"], 600)
        self.assertEqual(flow_plan["exitFlow"], 280)
        self.assertEqual(flow_plan["straightFlow"], 1120)
        self.assertEqual(flow_plan["cavFlow"], 500)
        self.assertEqual(flow_plan["hdvFlow"], 1500)

    def test_invalid_range_raises_value_error(self) -> None:
        with self.assertRaises(ValueError):
            validate_scenario_config({"speedLimitKmh": 200})

    def test_total_flow_allows_up_to_eight_thousand(self) -> None:
        config = validate_scenario_config({"totalFlow": 8000})

        self.assertEqual(config["totalFlow"], 8000)

    def test_total_flow_rejects_values_above_eight_thousand(self) -> None:
        with self.assertRaises(ValueError):
            validate_scenario_config({"totalFlow": 8001})

    def test_validate_accepts_no_algorithm_comparison_mode(self) -> None:
        config = validate_scenario_config(
            {
                "enableCavLaneChangeControl": False,
                "disableSumoLaneChangeControl": False,
            }
        )

        self.assertFalse(config["enableCavLaneChangeControl"])
        self.assertFalse(config["disableSumoLaneChangeControl"])

    def test_writer_makes_no_algorithm_group_more_congested_but_still_lane_changing(self) -> None:
        config = validate_scenario_config(
            {
                "simulationDuration": 300,
                "stepLength": 0.1,
                "totalFlow": 1000,
                "cavPenetrationRate": 0.5,
                "mainlineRatio": 0.8,
                "exitRatio": 0.25,
                "speedLimitKmh": 108,
                "randomSeed": 13,
                "enableCavLaneChangeControl": False,
                "disableSumoLaneChangeControl": False,
                "scenarioPreset": "balanced",
            }
        )

        route_root = build_route_root(config)
        types = {node.attrib["id"]: node.attrib for node in route_root.findall("vType")}

        self.assertEqual(types["Connected"]["lcStrategic"], "20.0")
        self.assertEqual(types["Connected"]["lcCooperative"], "0.15")
        self.assertEqual(types["Connected"]["sigma"], "0.35")
        self.assertEqual(types["Connected"]["tau"], "1.35")
        self.assertEqual(types["Connected"]["minGap"], "4.5")
        self.assertEqual(types["Human"]["lcStrategic"], "20.0")
        self.assertEqual(types["Human"]["lcCooperative"], "0.10")
        self.assertEqual(types["Human"]["sigma"], "0.55")
        self.assertEqual(types["Human"]["tau"], "1.55")
        self.assertEqual(types["Human"]["minGap"], "4.8")

    def test_writer_builds_generated_route_and_sumocfg_content(self) -> None:
        config = validate_scenario_config(
            {
                "simulationDuration": 300,
                "stepLength": 0.1,
                "totalFlow": 1000,
                "cavPenetrationRate": 0.5,
                "mainlineRatio": 0.8,
                "exitRatio": 0.25,
                "speedLimitKmh": 108,
                "randomSeed": 13,
                "enableCavLaneChangeControl": True,
                "scenarioPreset": "balanced",
            }
        )

        route_root = build_route_root(config)
        types = {node.attrib["id"]: node.attrib for node in route_root.findall("vType")}
        self.assertEqual(types["Connected"]["maxSpeed"], "30.00")
        self.assertEqual(types["Human"]["maxSpeed"], "30.00")

        flows = {node.attrib["id"]: node.attrib for node in route_root.findall("flow")}
        self.assertEqual(flows["f_straight_1_connected"]["vehsPerHour"], "150.00")
        self.assertEqual(flows["f_straight_1_human"]["vehsPerHour"], "150.00")
        self.assertEqual(flows["f_straight_2_connected"]["vehsPerHour"], "150.00")
        self.assertEqual(flows["f_straight_2_human"]["vehsPerHour"], "150.00")
        self.assertEqual(flows["f_exit_preorder_connected"]["vehsPerHour"], "100.00")
        self.assertEqual(flows["f_exit_preorder_human"]["vehsPerHour"], "100.00")
        self.assertEqual(flows["f_ramp_connected"]["vehsPerHour"], "100.00")
        self.assertEqual(flows["f_ramp_human"]["vehsPerHour"], "100.00")

        cfg_root = build_sumocfg_root(config)
        input_node = cfg_root.find("input")
        self.assertIsNotNone(input_node)
        values = {node.tag: node.attrib["value"] for node in input_node}
        self.assertEqual(values["net-file"], "../test.net.xml")
        self.assertEqual(values["route-files"], "post_control.rou.xml")


if __name__ == "__main__":
    unittest.main()
