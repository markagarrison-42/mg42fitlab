from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
from extensions import db
from models import RowingLog

rowing_bp = Blueprint("rowing", __name__)


@rowing_bp.route("/", methods=["GET"])
@login_required
def get_all():
    logs = (
        RowingLog.query
        .filter_by(user_id=current_user.id)
        .order_by(RowingLog.date.desc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200


@rowing_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        log = RowingLog(
            user_id=current_user.id,
            date=date.fromisoformat(data["date"]),
            session_type=data.get("session_type", "Steady state"),
            distance_m=int(data["distance_m"]) if data.get("distance_m") else None,
            duration=data.get("duration"),
            split=data.get("split"),
            stroke_rate=int(data["stroke_rate"]) if data.get("stroke_rate") else None,
            avg_watts=int(data["avg_watts"]) if data.get("avg_watts") else None,
            avg_hr=int(data["avg_hr"]) if data.get("avg_hr") else None,
            source=data.get("source", "Manual"),
            notes=data.get("notes"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@rowing_bp.route("/<int:log_id>", methods=["DELETE"])
@login_required
def delete(log_id):
    log = RowingLog.query.filter_by(id=log_id, user_id=current_user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@rowing_bp.route("/bulk", methods=["POST"])
@login_required
def bulk_create():
    """Used by Garmin CSV and Apple Health import."""
    items = request.get_json()
    if not isinstance(items, list):
        return jsonify({"error": "Expected a list"}), 400

    added = 0
    skipped = 0
    for data in items:
        try:
            existing = RowingLog.query.filter_by(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                distance_m=int(data["distance_m"]) if data.get("distance_m") else None,
                duration=data.get("duration"),
            ).first()
            if existing:
                skipped += 1
                continue

            log = RowingLog(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                session_type=data.get("session_type", "Import"),
                distance_m=int(data["distance_m"]) if data.get("distance_m") else None,
                duration=data.get("duration"),
                split=data.get("split"),
                stroke_rate=int(data["stroke_rate"]) if data.get("stroke_rate") else None,
                avg_watts=int(data["avg_watts"]) if data.get("avg_watts") else None,
                avg_hr=int(data["avg_hr"]) if data.get("avg_hr") else None,
                source=data.get("source", "Import"),
                notes=data.get("notes"),
            )
            db.session.add(log)
            added += 1
        except (KeyError, ValueError):
            skipped += 1

    db.session.commit()
    return jsonify({"added": added, "skipped": skipped}), 201
