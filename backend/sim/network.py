from __future__ import annotations

from pathlib import Path
from typing import Dict, List
import xml.etree.ElementTree as ET


def parse_network(net_file: Path) -> Dict[str, object]:
    tree = ET.parse(net_file)
    root = tree.getroot()

    location = root.find("location")
    bounds = _parse_bounds(location.attrib.get("convBoundary", "0,0,1,1")) if location is not None else {
        "minX": 0.0,
        "minY": 0.0,
        "maxX": 1.0,
        "maxY": 1.0,
    }

    lanes: List[Dict[str, object]] = []
    for edge in root.findall("edge"):
        if edge.attrib.get("function") == "internal":
            continue

        edge_id = edge.attrib["id"]
        for lane in edge.findall("lane"):
            shape = _parse_shape(lane.attrib.get("shape", ""))
            if len(shape) < 2:
                continue

            lanes.append(
                {
                    "id": lane.attrib["id"],
                    "edgeId": edge_id,
                    "index": int(lane.attrib["index"]),
                    "speed": float(lane.attrib.get("speed", "0")),
                    "shape": shape,
                }
            )

    return {
        "bounds": bounds,
        "lanes": lanes,
    }


def _parse_bounds(raw_bounds: str) -> Dict[str, float]:
    min_x, min_y, max_x, max_y = [float(value) for value in raw_bounds.split(",")]
    return {
        "minX": min_x,
        "minY": min_y,
        "maxX": max_x,
        "maxY": max_y,
    }


def _parse_shape(raw_shape: str) -> List[List[float]]:
    points: List[List[float]] = []
    for point in raw_shape.split():
        x_str, y_str = point.split(",")
        points.append([float(x_str), float(y_str)])
    return points
