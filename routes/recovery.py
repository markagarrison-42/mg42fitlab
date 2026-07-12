from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
from extensions import db
from models import RecoveryLog

recovery_bp = Blueprint("recovery", __name__)


@recovery_bp.route("/", methods=["GET"])
@login_required
def get_all():
    logs = (
        RecoveryLog.query
        .filter_by(user_id=current_user.id)
        .order_by(RecoveryLog.date.desc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200


@recovery_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        log = RecoveryLog(
            user_id=current_user.id,
            date=date.fromisoformat(data["date"]),
            resting_hr=int(data["resting_hr"]) if data.get("resting_hr") else None,
            hrv=float(data["hrv"]) if data.get("hrv") else None,
            vo2_max=float(data["vo2_max"]) if data.get("vo2_max") else None,
            sleep_hrs=float(data["sleep_hrs"]) if data.get("sleep_hrs") else None,
            sleep_quality=data.get("sleep_quality"),
            steps=int(data["steps"]) if data.get("steps") else None,
            active_calories=int(data["active_calories"]) if data.get("active_calories") else None,
            source=data.get("source", "Manual"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@recovery_bp.route("/<int:log_id>", methods=["DELETE"])
@login_required
def delete(log_id):
    log = RecoveryLog.query.filter_by(id=log_id, user_id=current_user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@recovery_bp.route("/bulk", methods=["POST"])
@login_required
def bulk_create():
    items = request.get_json()
    if not isinstance(items, list):
        return jsonify({"error": "Expected a list"}), 400

    added = 0
    skipped = 0
    for data in items:
        try:
            existing = RecoveryLog.query.filter_by(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
            ).first()
            if existing:
                # Update with any new values
                for field in ("resting_hr", "hrv", "vo2_max", "sleep_hrs", "steps", "active_calories"):
                    if data.get(field):
                        setattr(existing, field, data[field])
                skipped += 1
                continue
            log = RecoveryLog(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                resting_hr=int(data["resting_hr"]) if data.get("resting_hr") else None,
                hrv=float(data["hrv"]) if data.get("hrv") else None,
                vo2_max=float(data["vo2_max"]) if data.get("vo2_max") else None,
                sleep_hrs=float(data["sleep_hrs"]) if data.get("sleep_hrs") else None,
                sleep_quality=data.get("sleep_quality"),
                steps=int(data["steps"]) if data.get("steps") else None,
                active_calories=int(data["active_calories"]) if data.get("active_calories") else None,
                source=data.get("source", "Import"),
            )
            db.session.add(log)
            added += 1
        except (KeyError, ValueError):
            skipped += 1

    db.session.commit()
    return jsonify({"added": added, "skipped": skipped}), 201


@recovery_bp.route("/summary", methods=["GET"])
@login_required
def summary():
    """Return daily recovery metrics for the last N days."""
    from datetime import timedelta

    days = int(request.args.get("days", 30))
    end = date.today()
    start = end - timedelta(days=days)

    logs = (
        RecoveryLog.query
        .filter(
            RecoveryLog.user_id == current_user.id,
            RecoveryLog.date >= start,
            RecoveryLog.date <= end,
        )
        .order_by(RecoveryLog.date)
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200