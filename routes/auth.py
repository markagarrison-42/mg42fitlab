from flask import Blueprint, request, jsonify, session
from flask_login import login_user, logout_user, login_required, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
from models import User, UserSettings

auth_bp = Blueprint("auth", __name__)


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""
    import sys
    print(f"LOGIN ATTEMPT: username='{username}' password_len={len(password)}", file=sys.stderr)

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already taken"}), 409

    email = data.get("email") or None
    user = User(
        username=username,
        password_hash=generate_password_hash(password),
        email=email,
    )
    db.session.add(user)
    db.session.flush()  # get user.id before commit

    # Create default settings for the new user
    settings = UserSettings(user_id=user.id, protein_goal_g=200)
    db.session.add(settings)
    db.session.commit()

    login_user(user)
    return jsonify({"message": "Account created", "username": user.username}), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    username = (data.get("username") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"error": "User not found", "username": username}), 401
    if not check_password_hash(user.password_hash, password):
        return jsonify({"error": "Wrong password", "username": username}), 401

    login_user(user, remember=True)
    return jsonify({"message": "Logged in", "username": user.username}), 200


@auth_bp.route("/logout", methods=["POST"])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "Logged out"}), 200


@auth_bp.route("/me", methods=["GET"])
@login_required
def me():
    return jsonify({"username": current_user.username, "id": current_user.id}), 200


@auth_bp.route("/settings", methods=["GET", "PUT"])
@login_required
def settings():
    s = UserSettings.query.filter_by(user_id=current_user.id).first()
    if not s:
        s = UserSettings(user_id=current_user.id)
        db.session.add(s)

    if request.method == "PUT":
        data = request.get_json()
        if "protein_goal_g" in data:
            s.protein_goal_g = int(data["protein_goal_g"])
        if "bodyweight_lbs" in data:
            s.bodyweight_lbs = float(data["bodyweight_lbs"])
        db.session.commit()

    return jsonify(s.to_dict()), 200
