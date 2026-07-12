from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
from app import db
from extensions import db
from models import CardioLog

cardio_bp = Blueprint("cardio", __name__)


@cardio_bp.route("/", methods=["GET"])
@login_required
def get_all():
    logs = (
        CardioLog.query
        .filter_by(user_id=current_user.id)
        .order_by(CardioLog.date.desc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200


@cardio_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        log = CardioLog(
            user_id=current_user.id,
            date=date.fromisoformat(data["date"]),
            activity_type=data["activity_type"],
            duration_mins=float(data["duration_mins"]) if data.get("duration_mins") else None,
            distance_m=float(data["distance_m"]) if data.get("distance_m") else None,
            avg_hr=int(data["avg_hr"]) if data.get("avg_hr") else None,
            max_hr=int(data["max_hr"]) if data.get("max_hr") else None,
            calories=int(data["calories"]) if data.get("calories") else None,
            avg_pace=data.get("avg_pace"),
            avg_speed=float(data["avg_speed"]) if data.get("avg_speed") else None,
            cadence=int(data["cadence"]) if data.get("cadence") else None,
            source=data.get("source", "Manual"),
            notes=data.get("notes"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@cardio_bp.route("/<int:log_id>", methods=["DELETE"])
@login_required
def delete(log_id):
    log = CardioLog.query.filter_by(id=log_id, user_id=current_user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@cardio_bp.route("/bulk", methods=["POST"])
@login_required
def bulk_create():
    items = request.get_json()
    if not isinstance(items, list):
        return jsonify({"error": "Expected a list"}), 400

    added = 0
    skipped = 0
    for data in items:
        try:
            existing = CardioLog.query.filter_by(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                activity_type=data["activity_type"],
                duration_mins=float(data["duration_mins"]) if data.get("duration_mins") else None,
            ).first()
            if existing:
                skipped += 1
                continue
            log = CardioLog(
                user_id=current_user.id,
                date=date.fromisoformat(data["date"]),
                activity_type=data["activity_type"],
                duration_mins=float(data["duration_mins"]) if data.get("duration_mins") else None,
                distance_m=float(data["distance_m"]) if data.get("distance_m") else None,
                avg_hr=int(data["avg_hr"]) if data.get("avg_hr") else None,
                max_hr=int(data["max_hr"]) if data.get("max_hr") else None,
                calories=int(data["calories"]) if data.get("calories") else None,
                avg_pace=data.get("avg_pace"),
                avg_speed=float(data["avg_speed"]) if data.get("avg_speed") else None,
                cadence=int(data["cadence"]) if data.get("cadence") else None,
                source=data.get("source", "Import"),
                notes=data.get("notes"),
            )
            db.session.add(log)
            added += 1
        except (KeyError, ValueError):
            skipped += 1

    db.session.commit()
    return jsonify({"added": added, "skipped": skipped}), 201


@cardio_bp.route("/summary", methods=["GET"])
@login_required
def summary():
    """Return weekly distance and duration by activity type."""
    from sqlalchemy import func
    from datetime import timedelta

    days = int(request.args.get("days", 30))
    end = date.today()
    start = end - timedelta(days=days)

    rows = (
        db.session.query(
            CardioLog.date,
            CardioLog.activity_type,
            func.sum(CardioLog.duration_mins).label("total_duration"),
            func.sum(CardioLog.distance_m).label("total_distance"),
            func.avg(CardioLog.avg_hr).label("avg_hr"),
            func.sum(CardioLog.calories).label("total_calories"),
        )
        .filter(
            CardioLog.user_id == current_user.id,
            CardioLog.date >= start,
            CardioLog.date <= end,
        )
        .group_by(CardioLog.date, CardioLog.activity_type)
        .order_by(CardioLog.date)
        .all()
    )

    return jsonify([{
        "date": r.date.isoformat(),
        "activity_type": r.activity_type,
        "total_duration_mins": round(r.total_duration or 0, 1),
        "total_distance_m": round(r.total_distance or 0),
        "avg_hr": round(r.avg_hr or 0),
        "total_calories": round(r.total_calories or 0),
    } for r in rows]), 200