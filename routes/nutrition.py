from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
from extensions import db
from models import NutritionLog

nutrition_bp = Blueprint("nutrition", __name__)


@nutrition_bp.route("/", methods=["GET"])
@login_required
def get_all():
    logs = (
        NutritionLog.query
        .filter_by(user_id=current_user.id)
        .order_by(NutritionLog.date.desc(), NutritionLog.time.desc())
        .all()
    )
    return jsonify([l.to_dict() for l in logs]), 200


@nutrition_bp.route("/today", methods=["GET"])
@login_required
def today():
    today_date = date.today()
    logs = (
        NutritionLog.query
        .filter_by(user_id=current_user.id, date=today_date)
        .order_by(NutritionLog.time)
        .all()
    )
    total_protein = sum(l.protein_g for l in logs)
    total_calories = sum(l.calories or 0 for l in logs)
    return jsonify({
        "date": today_date.isoformat(),
        "entries": [l.to_dict() for l in logs],
        "total_protein_g": total_protein,
        "total_calories": total_calories,
    }), 200


@nutrition_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        log = NutritionLog(
            user_id=current_user.id,
            date=date.fromisoformat(data["date"]),
            time=data.get("time"),
            food_source=data["food_source"].strip(),
            protein_g=float(data["protein_g"]),
            calories=int(data["calories"]) if data.get("calories") else None,
            notes=data.get("notes"),
        )
        db.session.add(log)
        db.session.commit()
        return jsonify(log.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@nutrition_bp.route("/<int:log_id>", methods=["DELETE"])
@login_required
def delete(log_id):
    log = NutritionLog.query.filter_by(id=log_id, user_id=current_user.id).first_or_404()
    db.session.delete(log)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


@nutrition_bp.route("/summary", methods=["GET"])
@login_required
def summary():
    """Return daily protein totals for the last N days (default 14)."""
    days = int(request.args.get("days", 14))
    from datetime import timedelta
    from sqlalchemy import func

    end = date.today()
    start = end - timedelta(days=days - 1)

    rows = (
        db.session.query(
            NutritionLog.date,
            func.sum(NutritionLog.protein_g).label("total_protein"),
            func.sum(NutritionLog.calories).label("total_calories"),
        )
        .filter(
            NutritionLog.user_id == current_user.id,
            NutritionLog.date >= start,
            NutritionLog.date <= end,
        )
        .group_by(NutritionLog.date)
        .order_by(NutritionLog.date)
        .all()
    )

    # Fill in zeros for missing days
    result = {}
    current_day = start
    while current_day <= end:
        result[current_day.isoformat()] = {"protein_g": 0, "calories": 0}
        current_day += timedelta(days=1)

    for row in rows:
        result[row.date.isoformat()] = {
            "protein_g": round(row.total_protein or 0, 1),
            "calories": int(row.total_calories or 0),
        }

    return jsonify(result), 200
