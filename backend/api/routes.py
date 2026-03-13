from __future__ import annotations

from flask import Blueprint, Response, jsonify, stream_with_context

from backend.sim.runner import SimulationRunner


def create_api_blueprint(runner: SimulationRunner) -> Blueprint:
    api = Blueprint("api", __name__, url_prefix="/api")

    @api.get("/config")
    def get_config():
        return jsonify(runner.get_config())

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
