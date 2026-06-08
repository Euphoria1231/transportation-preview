from __future__ import annotations

from typing import Dict, List


CONDITIONS = [
    ("L1", 2, "E4", 1),
    ("L2", 1, "E4", 0),
    ("L3", 1, "E2", 2),
    ("L4", 0, "E2", 1),
]

TYPE_COLORS = {
    "Connected": "#22c55e",
    "Human": "#ef4444",
}


def color_for_type(vehicle_type: str) -> str:
    return TYPE_COLORS.get(vehicle_type, "#94a3b8")


def apply_lane_change_logic(connection, step: int) -> List[Dict[str, object]]:
    """Apply the existing rule-based lane change logic to Connected vehicles."""
    events: List[Dict[str, object]] = []
    vehicle_ids = connection.vehicle.getIDList()
    connected_vehicles = [
        vehicle_id
        for vehicle_id in vehicle_ids
        if connection.vehicle.getTypeID(vehicle_id) == "Connected"
    ]

    for vehicle_id in connected_vehicles:
        edge_id = connection.vehicle.getRoadID(vehicle_id)
        lane_idx = connection.vehicle.getLaneIndex(vehicle_id)
        route = connection.vehicle.getRoute(vehicle_id)
        destination = route[-1] if route else None

        for cond_edge, cond_lane, cond_dest, target_lane in CONDITIONS:
            if edge_id != cond_edge or lane_idx != cond_lane or destination != cond_dest:
                continue

            connection.vehicle.changeLane(vehicle_id, target_lane, duration=10)
            events.append(
                {
                    "step": step,
                    "vehicleId": vehicle_id,
                    "fromEdge": edge_id,
                    "fromLane": lane_idx,
                    "toLane": target_lane,
                    "destination": destination,
                }
            )
            break

    return events
