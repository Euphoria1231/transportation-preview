from __future__ import annotations

from flask import Blueprint, Response, jsonify, request, stream_with_context

from backend.sim.runner import SimulationRunner


def create_api_blueprint(runner: SimulationRunner) -> Blueprint:
    api = Blueprint("api", __name__, url_prefix="/api")

    @api.get("/config")
    def get_config():
        return jsonify(runner.get_config())

    @api.get("/scenario/default")
    def get_default_scenario():
        return jsonify(runner.get_default_scenario_config())

    @api.get("/scenario/current")
    def get_current_scenario():
        return jsonify(runner.get_current_scenario())

    @api.post("/scenario/apply")
    def apply_scenario():
        raw_config = request.get_json(silent=True) or {}
        try:
            return jsonify(runner.apply_scenario(raw_config))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except OSError as exc:
            return jsonify({"error": f"Failed to write generated scenario files: {exc}"}), 500

    @api.get("/stream")
    def stream():
        return Response(
            stream_with_context(runner.event_stream()),
            mimetype="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    @api.post("/sim/start")
    def start():
        return jsonify(runner.start())

    @api.post("/sim/pause")
    def pause():
        return jsonify(runner.pause())

    @api.post("/sim/reset")
    def reset():
        return jsonify(runner.reset())

    @api.post("/sim/step")
    def step():
        return jsonify(runner.step_once())

    return api
