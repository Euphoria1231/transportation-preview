from __future__ import annotations

import atexit
from pathlib import Path
import sys

from flask import Flask, jsonify

if __package__ in {None, ""}:
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.api.routes import create_api_blueprint
from backend.sim.runner import SimulationRunner


BASE_DIR = Path(__file__).resolve().parent
SCENARIO_DIR = BASE_DIR / "scenario"
runner = SimulationRunner(SCENARIO_DIR)
atexit.register(runner.shutdown)


def create_app() -> Flask:
    app = Flask(__name__)
    app.register_blueprint(create_api_blueprint(runner))

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"})

    return app


app = create_app()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
