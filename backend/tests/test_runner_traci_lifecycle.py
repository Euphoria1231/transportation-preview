from __future__ import annotations

import importlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace


RUNNER_MODULE = "backend.sim.runner"


class FakeConnection:
    def __init__(self, traci_module: FakeTraciModule, label: str) -> None:
        self._traci_module = traci_module
        self._label = label

    def close(self) -> None:
        self._traci_module.active_labels.discard(self._label)


class FakeTraciModule:
    def __init__(self) -> None:
        self.active_labels: set[str] = set()
        self.current_label: str | None = None
        self.exceptions = SimpleNamespace(TraCIException=RuntimeError)

    def start(self, cmd: list[str], label: str) -> None:
        if label in self.active_labels:
            raise RuntimeError(f"Connection '{label}' is already active.")
        self.active_labels.add(label)
        self.current_label = label

    def getConnection(self, label: str) -> FakeConnection:
        if label not in self.active_labels:
            raise RuntimeError(f"Connection '{label}' is not active.")
        return FakeConnection(self, label)

    def switch(self, label: str) -> None:
        if label not in self.active_labels:
            raise RuntimeError(f"Connection '{label}' is not active.")
        self.current_label = label

    def close(self, wait: bool = True) -> None:
        if self.current_label is None:
            raise RuntimeError("No active connection selected.")
        self.active_labels.discard(self.current_label)
        self.current_label = None


class RunnerTraciLifecycleTest(unittest.TestCase):
    def setUp(self) -> None:
        self.original_traci = sys.modules.get("traci")
        self.fake_traci = FakeTraciModule()
        sys.modules["traci"] = self.fake_traci
        sys.modules.pop(RUNNER_MODULE, None)
        self.runner_module = importlib.import_module(RUNNER_MODULE)

    def tearDown(self) -> None:
        sys.modules.pop(RUNNER_MODULE, None)
        if self.original_traci is None:
            sys.modules.pop("traci", None)
        else:
            sys.modules["traci"] = self.original_traci

    def test_close_connection_releases_stale_browser_label(self) -> None:
        runner = object.__new__(self.runner_module.SimulationRunner)
        runner._connection = None
        runner._step = 0
        runner._error = None
        runner._latest_state = {}
        self.fake_traci.active_labels.add("browser")
        self.fake_traci.current_label = "browser"

        runner._close_connection()

        self.assertNotIn("browser", self.fake_traci.active_labels)
        self.assertEqual(runner._latest_state["running"], False)

    def test_failed_connection_initialization_releases_browser_label(self) -> None:
        runner = object.__new__(self.runner_module.SimulationRunner)
        runner._connection = None
        runner._step = 0
        runner._error = None
        runner._latest_state = {}
        runner.sumocfg_path = Path("scenario.sumocfg")
        runner.current_scenario_config = {"randomSeed": 1}

        def raise_snapshot_error() -> dict[str, object]:
            raise RuntimeError("snapshot failed")

        runner._snapshot_state = raise_snapshot_error

        with self.assertRaisesRegex(RuntimeError, "snapshot failed"):
            runner._ensure_connection()

        self.assertIsNone(runner._connection)
        self.assertNotIn("browser", self.fake_traci.active_labels)


if __name__ == "__main__":
    unittest.main()
