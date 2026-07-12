from flask import Blueprint, make_response, render_template
import os

main_bp = Blueprint("main", __name__)


@main_bp.route("/")
def index():
    template_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        'templates',
        'index.html'
    )
    with open(template_path, 'r') as f:
        content = f.read()
    response = make_response(content)
    response.headers["Content-Type"] = "text/html"
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


@main_bp.route("/health")
def health():
    from flask import jsonify
    return jsonify({"status": "ok"}), 200


@main_bp.route("/reset-password")
def reset_password():
    response = make_response(render_template("index.html"))
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response
