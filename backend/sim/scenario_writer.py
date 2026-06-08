from __future__ import annotations

from pathlib import Path
from typing import Dict
import tempfile
import xml.etree.ElementTree as ET

from .scenario_config import derive_flow_plan


GENERATED_DIR_NAME = "generated"
GENERATED_ROUTE_NAME = "post_control.rou.xml"
GENERATED_SUMOCFG_NAME = "post_control.sumocfg"


def write_scenario_files(scenario_dir: Path, config: Dict[str, object]) -> Dict[str, Path]:
    generated_dir = scenario_dir / GENERATED_DIR_NAME
    try:
        return _write_scenario_files_to_dir(
            generated_dir,
            config,
            net_file_value="../test.net.xml",
        )
    except OSError:
        fallback_dir = Path(tempfile.gettempdir()) / "transportation-preview-scenario" / GENERATED_DIR_NAME
        return _write_scenario_files_to_dir(
            fallback_dir,
            config,
            net_file_value=str((scenario_dir / "test.net.xml").resolve()),
        )


def _write_scenario_files_to_dir(
    generated_dir: Path,
    config: Dict[str, object],
    net_file_value: str,
) -> Dict[str, Path]:
    generated_dir.mkdir(parents=True, exist_ok=True)

    route_path = generated_dir / GENERATED_ROUTE_NAME
    sumocfg_path = generated_dir / GENERATED_SUMOCFG_NAME

    _write_route_file(route_path, config)
    _write_sumocfg_file(sumocfg_path, config, net_file_value)

    return {
        "routePath": route_path,
        "sumocfgPath": sumocfg_path,
    }


def _write_route_file(route_path: Path, config: Dict[str, object]) -> None:
    _write_xml(route_path, build_route_root(config))


def build_route_root(config: Dict[str, object]) -> ET.Element:
    flow_plan = derive_flow_plan(config)
    speed_limit = _format_number(flow_plan["speedLimitMetersPerSecond"])
    simulation_duration = str(int(config["simulationDuration"]))

    routes = ET.Element("routes")
    ET.SubElement(
        routes,
        "vType",
        {
            "id": "Connected",
            "laneChangeModel": "SL2015",
            "accel": "2.5",
            "decel": "4.5",
            "sigma": "0.0",
            "length": "4.5",
            "minGap": "3.0",
            "maxSpeed": speed_limit,
            "color": "0,255,0",
        },
    )
    ET.SubElement(
        routes,
        "vType",
        {
            "id": "Human",
            "laneChangeModel": "SL2015",
            "lcStrategic": "100.0",
            "lcCooperative": "1.0",
            "lcSpeedGain": "0.0",
            "lcKeepRight": "0.0",
            "accel": "2.5",
            "decel": "4.5",
            "sigma": "0.0",
            "length": "4.5",
            "minGap": "3.0",
            "maxSpeed": speed_limit,
            "color": "255,0,0",
        },
    )

    flows = [
        (
            "f_straight_1_connected",
            "Connected",
            flow_plan["straightFlowAConnected"],
            "L1",
            "E2",
        ),
        (
            "f_straight_1_human",
            "Human",
            flow_plan["straightFlowAHuman"],
            "L1",
            "E2",
        ),
        (
            "f_straight_2_connected",
            "Connected",
            flow_plan["straightFlowBConnected"],
            "L1",
            "E2",
        ),
        (
            "f_straight_2_human",
            "Human",
            flow_plan["straightFlowBHuman"],
            "L1",
            "E2",
        ),
        (
            "f_exit_preorder_connected",
            "Connected",
            flow_plan["exitFlowConnected"],
            "L1",
            "E4",
        ),
        (
            "f_exit_preorder_human",
            "Human",
            flow_plan["exitFlowHuman"],
            "L1",
            "E4",
        ),
        ("f_ramp_connected", "Connected", flow_plan["rampFlowConnected"], "E3", "E2"),
        ("f_ramp_human", "Human", flow_plan["rampFlowHuman"], "E3", "E2"),
    ]

    for flow_id, vehicle_type, vehicles_per_hour, from_edge, to_edge in flows:
        ET.SubElement(
            routes,
            "flow",
            {
                "id": flow_id,
                "type": vehicle_type,
                "begin": "0",
                "end": simulation_duration,
                "vehsPerHour": _format_number(vehicles_per_hour),
                "from": from_edge,
                "to": to_edge,
                "departLane": "random",
            },
        )

    return routes


def _write_sumocfg_file(sumocfg_path: Path, config: Dict[str, object], net_file_value: str) -> None:
    _write_xml(sumocfg_path, build_sumocfg_root(config, net_file_value=net_file_value))


def build_sumocfg_root(config: Dict[str, object], net_file_value: str = "../test.net.xml") -> ET.Element:
    configuration = ET.Element(
        "configuration",
        {
            "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
            "xsi:noNamespaceSchemaLocation": "http://sumo.dlr.de/xsd/sumoConfiguration.xsd",
        },
    )

    input_node = ET.SubElement(configuration, "input")
    ET.SubElement(input_node, "net-file", {"value": net_file_value})
    ET.SubElement(input_node, "route-files", {"value": GENERATED_ROUTE_NAME})

    time_node = ET.SubElement(configuration, "time")
    ET.SubElement(time_node, "begin", {"value": "0"})
    ET.SubElement(time_node, "end", {"value": str(int(config["simulationDuration"]))})
    ET.SubElement(time_node, "step-length", {"value": _format_number(float(config["stepLength"]))})

    random_node = ET.SubElement(configuration, "random_number")
    ET.SubElement(random_node, "seed", {"value": str(int(config["randomSeed"]))})

    processing_node = ET.SubElement(configuration, "processing")
    ET.SubElement(processing_node, "lateral-resolution", {"value": "0.5"})

    return configuration


def _write_xml(path: Path, root: ET.Element) -> None:
    tree = ET.ElementTree(root)
    ET.indent(tree, space="    ")
    tree.write(path, encoding="UTF-8", xml_declaration=True)


def _format_number(value: float) -> str:
    return f"{value:.2f}"
