from flask import Blueprint, request, jsonify
from extensions import db, mail
from models import User, PasswordResetToken
from werkzeug.security import generate_password_hash
from flask_mail import Message
from datetime import datetime, timedelta
import secrets
import os

reset_bp = Blueprint("reset", __name__)


@reset_bp.route("/request", methods=["POST"])
def request_reset():
    data = request.get_json()
    username = (data.get("username") or "").strip().lower()
    if not username:
        return jsonify({"error": "Username required"}), 400

    user = User.query.filter_by(username=username).first()
    # Always return success to prevent username enumeration
    if not user:
        return jsonify({"message": "If that username exists, a reset email has been sent"}), 200

    # Check if user has an email - for now use username as email if it contains @
    email = user.email if user.email else (username if "@" in username else None)
    if not email:
        return jsonify({"error": "No email address on file for this account."}), 400
    if not email:
        # For usernames without email, send to admin
        admin_email = os.environ.get("MAIL_USER")
        return jsonify({"error": "No email on file. Ask the admin to reset your password."}), 400

    # Create reset token
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=1)

    # Invalidate old tokens
    PasswordResetToken.query.filter_by(user_id=user.id, used=False).update({"used": True})

    reset_token = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=expires,
    )
    db.session.add(reset_token)
    db.session.commit()

    # Send email
    base_url = os.environ.get("APP_URL", "https://madfella.pythonanywhere.com")
    reset_link = f"{base_url}/reset-password?token={token}"

    try:
        msg = Message(
            subject="MG42 FitLog — Password Reset",
            recipients=[email],
            body=f"""Hi {username},

You requested a password reset for your MG42 FitLog account.

Click the link below to reset your password (expires in 1 hour):

{reset_link}

If you didn't request this, you can ignore this email.

— MG42 FitLog
"""
        )
        mail.send(msg)
    except Exception as e:
        return jsonify({"error": "Failed to send email: " + str(e)}), 500

    return jsonify({"message": "Reset email sent"}), 200


@reset_bp.route("/confirm", methods=["POST"])
def confirm_reset():
    data = request.get_json()
    token = data.get("token") or ""
    new_password = data.get("password") or ""

    if not token or not new_password:
        return jsonify({"error": "Token and password required"}), 400
    if len(new_password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    reset = PasswordResetToken.query.filter_by(token=token).first()
    if not reset or not reset.is_valid():
        return jsonify({"error": "Invalid or expired reset link"}), 400

    user = User.query.get(reset.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 400

    user.password_hash = generate_password_hash(new_password)
    reset.used = True
    db.session.commit()

    return jsonify({"message": "Password reset successfully"}), 200
