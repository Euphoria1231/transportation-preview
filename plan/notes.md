# Notes: SUMO Browser Migration Discussion

## Current Repo Findings

- `main.py` starts `sumo-gui` by default and runs a step loop through TraCI.
- Current lane-change logic is rule-based and minimal:
  - identify `Connected` vehicles
  - check current edge, lane, and route destination
  - call `traci.vehicle.changeLane(...)`
- `post_control.sumocfg` points to:
  - `test.net.xml`
  - `post_control.rou.xml`
- `test.net.xml` already contains usable lane geometry for browser rendering.
- `post_control.rou.xml` distinguishes `Connected` and `Human` vehicle types and flow definitions.
- `changelane` is not an executable; its file signature is `ftypmp42`, consistent with an MP4 asset.

## PDF Section 5 Findings

- The thesis platform is layered as:
  - browser/frontend UI
  - backend web service
  - SUMO simulation engine extended through TraCI
- The original platform includes:
  - login page
  - navigation page
  - simulation operation page
  - multiple traffic scenarios
- For the current task, the essential reusable part is the architecture split, not the full product surface.

## Practical Scope for This Repo

- Keep decision logic in Python + TraCI first.
- Replace SUMO-GUI with browser visualization.
- Start with one browser page:
  - scenario canvas
  - simulation controls
  - live vehicle table / metrics
- Later, if needed, expand to multi-scene management and model comparison panels.
