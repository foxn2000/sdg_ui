from __future__ import annotations
from flask import Flask, jsonify

def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(400)
    def bad_request(e):
        return jsonify(error="bad_request", message=str(e)), 400

    @app.errorhandler(413)
    def too_large(e):
        return jsonify(error="payload_too_large", message="Upload is too large."), 413

    @app.errorhandler(404)
    def not_found(e):
        return jsonify(error="not_found", message="Resource not found."), 404

    @app.errorhandler(500)
    def server_error(e):
        app.logger.exception("Unhandled error: %s", e)
        return jsonify(error="server_error", message="Unexpected error."), 500
