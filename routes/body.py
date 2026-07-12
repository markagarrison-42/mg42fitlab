from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
from extensions import db
from models import BodyLog

body_bp = Blueprint("body", __name__)


@body_bp.route("/", methods=["GET"])
@login_required
def get_all():
    logs = (
        BodyLog.query
        .filter_by(user_id=current_user.id)
        .order_by(BodyLog.date.desc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200


@body_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        log = BodyLog(
            user_id=current_user.id,
            date=date.fromisoformat(data["date"]),
            weight_lbs=float(data["weight_lbs"]) if data.get("weight_lbs") else None,
            body_fat_pct=float(data["body_fat_pct"]) if data.get("body_fat_pct") else None,
            muscle_mass_lbs=float(data["muscle_mass_lbs"]) if data.get("muscle_mass_lbs") else None,
            source=data.get("source", "Manual"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@body_bp.route("/<int:log_id>", methods=["DELETE"])
@login_required
def delete(log_id):
    log = BodyLog.query.filter_by(id=log_id, user_id=current_user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@body_bp.route("/bulk", methods=["POST"])
@login_required
def bulk_create():
    """Used by Apple Health XML import."""
    items = request.get_json()
    if not isinstance(items, list):
        return jsonify({"error": "Expected a list"}), 400

    added = 0
    skipped = 0
    for data in items:
        try:
            existing = BodyLog.query.filter_by(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
            ).first()
            if existing:
                # Update existing record with any new values
                if data.get("weight_lbs"):
                    existing.weight_lbs = float(data["weight_lbs"])
                if data.get("body_fat_pct"):
                    existing.body_fat_pct = float(data["body_fat_pct"])
                if data.get("muscle_mass_lbs"):
                    existing.muscle_mass_lbs = float(data["muscle_mass_lbs"])
                skipped += 1
                continue

            log = BodyLog(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                weight_lbs=float(data["weight_lbs"]) if data.get("weight_lbs") else None,
                body_fat_pct=float(data["body_fat_pct"]) if data.get("body_fat_pct") else None,
                muscle_mass_lbs=float(data["muscle_mass_lbs"]) if data.get("muscle_mass_lbs") else None,
                source=data.get("source", "Import"),
            )
            db.session.add(log)
            added += 1
        except (KeyError, ValueError):
            skipped += 1

    db.session.commit()
    return jsonify({"added": added, "skipped": skipped}), 201
