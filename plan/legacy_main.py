import traci
import sumolib
import sys
import optparse

CONDITIONS = [
    ("L1", 2, "E4", 1),
    ("L2", 1, "E4", 0),
    ("L3", 1, "E2", 2),
    ("L4", 0, "E2", 1),
]


def run():
    """主仿真循环"""
    step = 0
    while step < 3600:
        traci.simulationStep()

        connected_vehicles = [veh for veh in traci.vehicle.getIDList()
                              if traci.vehicle.getTypeID(veh) == "Connected"]

        for veh in connected_vehicles:
            edge_id = traci.vehicle.getRoadID(veh)
            lane_idx = traci.vehicle.getLaneIndex(veh)

            route = traci.vehicle.getRoute(veh)
            destination = route[-1] if route else None

            for cond_edge, cond_lane, cond_dest, target_lane in CONDITIONS:
                if edge_id == cond_edge and lane_idx == cond_lane and destination == cond_dest:
                    traci.vehicle.changeLane(veh, target_lane, duration=10)
                    print(f"Step {step}: Vehicle {veh} at {edge_id} lane {lane_idx} -> change to lane {target_lane}")
                    break
        step += 1

    traci.close()


def get_options():
    """解析命令行参数，支持SUMO配置"""
    optParser = optparse.OptionParser()
    optParser.add_option("--sumo-cfg", dest="sumocfg", type="string",
                         default="post_control.sumocfg",
                         help="SUMO 配置文件路径")
    optParser.add_option("--gui", action="store_true", default=True,
                         help="使用GUI模式运行")
    (options, args) = optParser.parse_args()
    return options


if __name__ == "__main__":
    options = get_options()
    sumo_binary = "sumo-gui" if options.gui else "sumo"
    sumo_cmd = [sumo_binary, "-c", options.sumocfg, "--start", "--quit-on-end"]

    # 启动SUMO并连接TraCI
    traci.start(sumo_cmd)
    run()