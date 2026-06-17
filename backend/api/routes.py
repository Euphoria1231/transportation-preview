from __future__ import annotations

from flask import Blueprint, Response, current_app, jsonify, request, stream_with_context

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
        except Exception as exc:
            return _simulation_error_response("Failed to start SUMO scenario", exc)

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

    @api.get("/metrics/latest")
    def latest_metrics():
        return jsonify(runner.get_latest_metrics())

    @api.get("/metrics/history")
    def metric_history():
        raw_window = request.args.get("window", "100")
        try:
            window = int(raw_window)
        except ValueError:
            window = 100
        return jsonify(runner.get_metric_history(window))

    @api.get("/metrics/lane/latest")
    def latest_lane_metrics():
        return jsonify(runner.get_latest_lane_metrics())

    @api.get("/analysis/summary")
    def analysis_summary():
        return jsonify(runner.get_analysis_summary())

    @api.post("/report/baseline")
    def save_baseline():
        return jsonify(runner.save_baseline_summary())

    @api.get("/report/baseline")
    def get_baseline():
        return jsonify(runner.get_baseline_summary())

    @api.post("/report/current")
    def current_report():
        return jsonify(runner.generate_current_report())

    @api.post("/report/compare")
    def comparison_report():
        try:
            return jsonify(runner.generate_comparison_report())
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    @api.post("/sim/start")
    def start():
        try:
            return jsonify(runner.start())
        except Exception as exc:
            return _simulation_error_response("Failed to start SUMO simulation", exc)

    @api.post("/sim/pause")
    def pause():
        try:
            return jsonify(runner.pause())
        except Exception as exc:
            return _simulation_error_response("Failed to pause SUMO simulation", exc)

    @api.post("/sim/reset")
    def reset():
        try:
            return jsonify(runner.reset())
        except Exception as exc:
            return _simulation_error_response("Failed to reset SUMO simulation", exc)

    @api.post("/sim/step")
    def step():
        try:
            return jsonify(runner.step_once())
        except Exception as exc:
            return _simulation_error_response("Failed to step SUMO simulation", exc)

    return api


def _simulation_error_response(message: str, exc: Exception):
    current_app.logger.exception("%s: %s", message, exc)
    return jsonify({"error": f"{message}: {exc}"}), 500
