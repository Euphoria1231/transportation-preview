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
