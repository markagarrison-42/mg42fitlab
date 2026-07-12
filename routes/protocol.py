from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
from extensions import db
from models import ProtocolItem, DoseLog

protocol_bp = Blueprint("protocol", __name__)


# --- Protocol items ---

@protocol_bp.route("/", methods=["GET"])
@login_required
def get_all():
    items = (
        ProtocolItem.query
        .filter_by(user_id=current_user.id)
        .order_by(ProtocolItem.created_at)
        .all()
    )
    return jsonify([i.to_dict() for i in items]), 200


@protocol_bp.route("/", methods=["POST"])
@login_required
def create():
    data = request.get_json()
    try:
        item = ProtocolItem(
            user_id=current_user.id,
            name=data["name"].strip(),
            category=data.get("category", "Supplement"),
            dose=data.get("dose"),
            frequency=data.get("frequency"),
            route=data.get("route"),
            timing=data.get("timing"),
            goal=data.get("goal"),
            active=data.get("active", True),
        )
        db.session.add(item)
        db.session.commit()
        return jsonify(item.to_dict()), 201
    except (KeyError, ValueError) as e:
        return jsonify({"error": str(e)}), 400


@protocol_bp.route("/<int:item_id>", methods=["PUT"])
@login_required
def update(item_id):
    item = ProtocolItem.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    data = request.get_json()

    for field in ("name", "category", "dose", "frequency", "route", "timing", "goal"):
        if field in data:
            setattr(item, field, data[field])
    if "active" in data:
        item.active = bool(data["active"])

    db.session.commit()
    return jsonify(item.to_dict()), 200


@protocol_bp.route("/<int:item_id>", methods=["DELETE"])
@login_required
def delete(item_id):
    item = ProtocolItem.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()
    db.session.delete(item)
    db.session.commit()
    return jsonify({"message": "Deleted"}), 200


# --- Dose logging ---

@protocol_bp.route("/doses", methods=["GET"])
@login_required
def get_doses():
    """Return dose logs, optionally filtered by date range."""
    start_str = request.args.get("start")
    end_str = request.args.get("end")

    query = DoseLog.query.filter_by(user_id=current_user.id)

    if start_str:
        query = query.filter(DoseLog.date >= date.fromisoformat(start_str))
    if end_str:
        query = query.filter(DoseLog.date <= date.fromisoformat(end_str))

    doses = query.order_by(DoseLog.date.desc(), DoseLog.taken_at.desc()).all()
    return jsonify([d.to_dict() for d in doses]), 200


@protocol_bp.route("/doses/today", methods=["GET"])
@login_required
def doses_today():
    today_date = date.today()
    doses = DoseLog.query.filter_by(user_id=current_user.id, date=today_date).all()
    taken_ids = [d.protocol_item_id for d in doses]
    return jsonify({"date": today_date.isoformat(), "taken_ids": taken_ids}), 200


@protocol_bp.route("/doses/toggle", methods=["POST"])
@login_required
def toggle_dose():
    """Mark a dose taken or untaken for today."""
    data = request.get_json()
    item_id = data.get("protocol_item_id")
    today_date = date.today()

    # Verify the protocol item belongs to this user
    item = ProtocolItem.query.filter_by(id=item_id, user_id=current_user.id).first_or_404()

    existing = DoseLog.query.filter_by(
        user_id=current_user.id,
        protocol_item_id=item_id,
        date=today_date,
    ).first()

    if existing:
        db.session.delete(existing)
        db.session.commit()
        return jsonify({"taken": False, "protocol_item_id": item_id}), 200
    else:
        dose = DoseLog(
            user_id=current_user.id,
            protocol_item_id=item_id,
            date=today_date,
        )
        db.session.add(dose)
        db.session.commit()
        return jsonify({"taken": True, "protocol_item_id": item_id}), 201


@protocol_bp.route("/doses/adherence", methods=["GET"])
@login_required
def adherence():
    """Return % adherence per day for the last N days."""
    days = int(request.args.get("days", 14))
    from datetime import timedelta

    end = date.today()
    start = end - timedelta(days=days - 1)

    active_items = ProtocolItem.query.filter_by(
        user_id=current_user.id, active=True
    ).all()
    total_items = len(active_items)

    if total_items == 0:
        return jsonify({}), 200

    doses = DoseLog.query.filter(
        DoseLog.user_id == current_user.id,
        DoseLog.date >= start,
        DoseLog.date <= end,
    ).all()

    doses_by_date = {}
    for d in doses:
        key = d.date.isoformat()
        doses_by_date[key] = doses_by_date.get(key, 0) + 1

    result = {}
    current_day = start
    while current_day <= end:
        key = current_day.isoformat()
        taken = doses_by_date.get(key, 0)
        result[key] = round(taken / total_items * 100)
        current_day += timedelta(days=1)

    return jsonify(result), 200
