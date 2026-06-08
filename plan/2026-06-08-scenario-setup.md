# Scenario Setup Implementation Plan

**Goal:** Add the second-stage scenario parameter setup flow before entering the SUMO visualization.

**Scope:** Implement scenario configuration, route/sumocfg generation, backend apply/current/default APIs, and a React setup view. Do not add analysis charts, heatmaps, reports, baseline comparisons, future prediction, or dynamic lane-count changes.

## Files

- Create `backend/sim/scenario_config.py` for defaults, validation, presets, and derived flow plan.
- Create `backend/sim/scenario_writer.py` for generated SUMO route and config files under `backend/scenario/generated/`.
- Create `backend/tests/test_scenario_config.py` for backend validation and XML generation checks.
- Modify `backend/sim/runner.py` to support current scenario config, generated sumocfg, reset/apply flow, and optional CAV lane-change control.
- Modify `backend/api/routes.py` to expose scenario default/current/apply endpoints.
- Modify `frontend/src/types/simulation.ts` with scenario types.
- Modify `frontend/src/services/api.ts` with scenario API calls.
- Create `frontend/src/views/ScenarioSetupView.tsx` for the setup console.
- Modify `frontend/src/App.tsx` to switch between setup and simulation.
- Modify `frontend/src/views/SimulationView.tsx` to accept the back-to-setup action and show scenario summary.

## Execution

- [ ] Add failing backend tests for config validation and generated XML flow values.
- [ ] Implement backend config validation and flow derivation.
- [ ] Implement generated route/sumocfg writer without modifying original scenario files.
- [ ] Wire `SimulationRunner.apply_scenario()` and CAV control toggle.
- [ ] Add scenario API endpoints.
- [ ] Add frontend scenario types and API methods.
- [ ] Build the setup page with form controls and live summary.
- [ ] Switch `App` startup to setup first, then simulation after apply.
- [ ] Add simulation reconfiguration action that resets current SUMO before returning.
- [ ] Run backend import/function checks, `pnpm lint`, and TypeScript no-emit checks.
- [ ] Open the local frontend with the in-app browser if the dev server can run.
