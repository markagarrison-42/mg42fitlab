from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date, datetime
from extensions import db
from models import StrengthLog

strength_bp = Blueprint("strength", __name__)


@strength_bp.route("/", methods=["GET"])
@login_required
def get_all():
    logs = (
        StrengthLog.query
        .filter_by(user_id=current_user.id)
        .order_by(StrengthLog.date.desc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200


@strength_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        log = StrengthLog(
            user_id=current_user.id,
            date=date.fromisoformat(data["date"]),
            exercise=data["exercise"].strip(),
            sets=int(data.get("sets", 1)),
            reps=int(data["reps"]),
            weight_lbs=float(data.get("weight_lbs", 0)),
            rpe=float(data["rpe"]) if data.get("rpe") else None,
            source=data.get("source", "Manual"),
            notes=data.get("notes"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@strength_bp.route("/<int:log_id>", methods=["DELETE"])
@login_required
def delete(log_id):
    log = StrengthLog.query.filter_by(id=log_id, user_id=current_user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@strength_bp.route("/bulk", methods=["POST"])
@login_required
def bulk_create():
    """Used by the import flow (Strong CSV, Apple Health)."""
    items = request.get_json()
    if not isinstance(items, list):
        return jsonify({"error": "Expected a list"}), 400

    added = 0
    skipped = 0
    for data in items:
        try:
            # Deduplicate on date + exercise + reps + weight
            existing = StrengthLog.query.filter_by(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                exercise=data["exercise"].strip(),
                reps=int(data["reps"]),
                weight_lbs=float(data.get("weight_lbs", 0)),
            ).first()
            if existing:
                skipped += 1
                continue

            log = StrengthLog(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                exercise=data["exercise"].strip(),
                sets=int(data.get("sets", 1)),
                reps=int(data["reps"]),
                weight_lbs=float(data.get("weight_lbs", 0)),
                rpe=float(data["rpe"]) if data.get("rpe") else None,
                source=data.get("source", "Import"),
                notes=data.get("notes"),
            )
            db.session.add(log)
            added += 1
        except (KeyError, ValueError):
            skipped += 1

    db.session.commit()
    return jsonify({"added": added, "skipped": skipped}), 201


@strength_bp.route("/exercises", methods=["GET"])
@login_required
def exercises():
    """Return distinct exercise names logged by this user."""
    rows = (
        db.session.query(StrengthLog.exercise)
        .filter_by(user_id=current_user.id)
        .distinct()
        .order_by(StrengthLog.exercise)
        .all()
    )
    return jsonify([r[0] for r in rows]), 200
