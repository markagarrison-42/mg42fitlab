from flask import Blueprint, request, jsonify
from flask_login import current_user
from datetime import date, datetime
from extensions import db
from models import RowingLog, CardioLog, RecoveryLog, BodyLog
import os

sync_bp = Blueprint("sync", __name__)

ACTIVITY_MAP = {
    'Running':                          'Running',
    'Cycling':                          'Bicycling',
    'Elliptical':                       'Elliptical',
    'Stair Climbing':                   'Stair Stepper',
    'High Intensity Interval Training': 'HIIT',
    'Cross Training':                   'HIIT',
    'Functional Strength Training':     'HIIT',
    'Traditional Strength Training':    'Strength',
    'Walking':                          'Walking',
    'Hiking':                           'Hiking',
    'Treadmill':                        'Treadmill',
    'Indoor Cycling':                   'Bicycling',
    'Indoor Running':                   'Running',
    'Mixed Cardio':                     'HIIT',
}

def check_api_key():
    key = request.headers.get('X-API-Key') or request.headers.get('x-api-key')
    expected = os.environ.get('SYNC_API_KEY', 'mg42-sync-key')
    return key == expected

def parse_date(s):
    if not s:
        return None
    return s[:10]

@sync_bp.route("/workouts", methods=["POST"])
def sync_workouts():
    if not check_api_key():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "No data received"}), 400

    # Handle both {"workouts": [...]} and {"data": {"workouts": [...]}}
    raw = data.get("workouts") or data.get("data", {}).get("workouts", [])
    workouts = raw if isinstance(raw, list) else []
    if not workouts:
        return jsonify({"added": 0, "skipped": 0}), 200
    # Debug
    names = list(set(w.get("name","") for w in workouts))

    # Get user_id=1 (single user app)
    from models import User
    user = User.query.first()
    if not user:
        return jsonify({"error": "No user found"}), 400

    rowing_added = 0
    cardio_added = 0
    skipped = 0

    for w in workouts:
        name     = w.get("name", "")
        start    = w.get("start", "")
        end      = w.get("end", "")
        duration = float(w.get("duration") or 0)
        dstr     = parse_date(start)
        if not dstr:
            skipped += 1
            continue

        row_date = date.fromisoformat(dstr)
        dur_mins = round(duration / 60, 1)

        # Calories
        cals = None
        if w.get("activeEnergyBurned"):
            cals = int(w["activeEnergyBurned"].get("qty") or 0) or None

        # Heart rate
        avg_hr = None
        max_hr = None
        if w.get("heartRate"):
            avg_hr = int(w["heartRate"].get("avg", {}).get("qty") or 0) or None
            max_hr = int(w["heartRate"].get("max", {}).get("qty") or 0) or None
        elif w.get("avgHeartRate"):
            avg_hr = int(w["avgHeartRate"].get("qty") or 0) or None

        # Distance
        dist_m = None
        if w.get("distance"):
            qty   = float(w["distance"].get("qty") or 0)
            units = w["distance"].get("units", "mi")
            dist_m = round(qty * 1609.34 if units == "mi" else qty * 1000)

        # ROWING
        if name == "Rowing":
            mins = int(dur_mins)
            secs = int((dur_mins % 1) * 60)
            duration_str = f"{mins}:{secs:02d}"

            existing = RowingLog.query.filter_by(
                user_id=user.id, date=row_date, distance_m=dist_m
            ).first()
            if existing:
                skipped += 1
                continue

            db.session.add(RowingLog(
                user_id=user.id,
                date=row_date,
                session_type="Apple Health",
                distance_m=dist_m,
                duration=duration_str,
                avg_hr=avg_hr,
                source="Apple Health",
            ))
            rowing_added += 1
            continue

        # CARDIO / TRAINING
        activity = ACTIVITY_MAP.get(name)
        if not activity:
            skipped += 1
            continue

        existing = CardioLog.query.filter_by(
            user_id=user.id,
            date=row_date,
            activity_type=activity,
            duration_mins=dur_mins,
        ).first()
        if existing:
            skipped += 1
            continue

        # Speed / pace
        avg_speed = None
        avg_pace  = None
        if w.get("avgSpeed"):
            avg_speed = round(float(w["avgSpeed"].get("qty") or 0), 1)
        if avg_speed and activity in ("Running", "Treadmill"):
            if avg_speed > 0:
                pace_secs = 60 / avg_speed
                pm = int(pace_secs)
                ps = int((pace_secs % 1) * 60)
                avg_pace = f"{pm}:{ps:02d}"

        db.session.add(CardioLog(
            user_id=user.id,
            date=row_date,
            activity_type=activity,
            duration_mins=dur_mins,
            distance_m=dist_m,
            avg_hr=avg_hr,
            max_hr=max_hr,
            calories=cals,
            avg_speed=avg_speed,
            avg_pace=avg_pace,
            source="Apple Health",
        ))
        cardio_added += 1

    db.session.commit()
    return jsonify({
        "added": rowing_added + cardio_added,
        "rowing_added": rowing_added,
        "cardio_added": cardio_added,
        "skipped": skipped,
    }), 201


@sync_bp.route("/metrics", methods=["POST"])
def sync_metrics():
    if not check_api_key():
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json(force=True)
    if not data:
        return jsonify({"error": "No data received"}), 400

    from models import User
    user = User.query.first()
    if not user:
        return jsonify({"error": "No user found"}), 400

    raw = data.get("metrics", data.get("data", []))
    # Handle double-nested {"metrics": {"metrics": [...]}}
    if isinstance(raw, dict):
        raw = raw.get("metrics", raw.get("data", []))
    # Handle both list format [{name, data}] and dict format {name: {data}}
    if isinstance(raw, list):
        metrics = {item["name"]: item for item in raw if "name" in item}
    else:
        metrics = raw

    body_added     = 0
    recovery_added = 0
    skipped        = 0

    date_map = {}

    def add_to_date(dstr, key, val):
        if dstr not in date_map:
            date_map[dstr] = {}
        date_map[dstr][key] = val

    for metric_name, metric_data in metrics.items():
        if not isinstance(metric_data, dict):
            continue
        entries = metric_data.get("data", [])
        if not isinstance(entries, list):
            continue

        for entry in entries:
            dstr = parse_date(entry.get("date", ""))
            if not dstr:
                continue
            qty = entry.get("qty")
            if qty is None and metric_name != "sleep_analysis":
                continue

            if metric_name in ("body_mass", "weight_body_mass", "weight"):
                units = entry.get("units", "lb")
                lbs = float(qty) * 2.20462 if units == "kg" else float(qty)
                add_to_date(dstr, "weight_lbs", round(lbs, 1))
            elif metric_name == "body_fat_percentage":
                pct = float(qty) * 100 if float(qty) <= 1 else float(qty)
                add_to_date(dstr, "body_fat_pct", round(pct, 1))
            elif metric_name == "lean_body_mass":
                units = entry.get("units", "lb")
                lbs = float(qty) * 2.20462 if units == "kg" else float(qty)
                add_to_date(dstr, "muscle_mass_lbs", round(lbs, 1))
            elif metric_name == "resting_heart_rate":
                add_to_date(dstr, "resting_hr", int(float(qty)))
            elif metric_name == "heart_rate_variability_sdnn":
                add_to_date(dstr, "hrv", round(float(qty), 1))
            elif metric_name == "vo2_max":
                add_to_date(dstr, "vo2_max", round(float(qty), 1))
            elif metric_name == "step_count":
                add_to_date(dstr, "steps",
                    (date_map.get(dstr, {}).get("steps") or 0) + int(float(qty)))
            elif metric_name in ("active_energy_burned", "active_energy"):
                add_to_date(dstr, "active_calories",
                    (date_map.get(dstr, {}).get("active_calories") or 0) + int(float(qty)))
    body_added     = 0
    recovery_added = 0
    skipped        = 0

    # Collect all dates from all metrics
    date_map = {}

    def add_to_date(dstr, key, val):
        if dstr not in date_map:
            date_map[dstr] = {}
        date_map[dstr][key] = val

    for metric_name, metric_data in metrics.items():
        if not isinstance(metric_data, dict):
            continue
        entries = metric_data.get("data", [])
        if not isinstance(entries, list):
            continue

        for entry in entries:
            dstr = parse_date(entry.get("date", ""))
            if not dstr:
                continue
            qty = entry.get("qty")

            if metric_name in ("body_mass", "weight_body_mass", "weight"):
                units = entry.get("units", "lb")
                lbs = float(qty) * 2.20462 if units == "kg" else float(qty)
                add_to_date(dstr, "weight_lbs", round(lbs, 1))
            elif metric_name == "body_fat_percentage":
                pct = float(qty) * 100 if float(qty) <= 1 else float(qty)
                add_to_date(dstr, "body_fat_pct", round(pct, 1))
            elif metric_name == "lean_body_mass":
                units = entry.get("units", "lb")
                lbs = float(qty) * 2.20462 if units == "kg" else float(qty)
                add_to_date(dstr, "muscle_mass_lbs", round(lbs, 1))
            elif metric_name == "resting_heart_rate":
                add_to_date(dstr, "resting_hr", int(float(qty)))
            elif metric_name == "heart_rate_variability_sdnn":
                add_to_date(dstr, "hrv", round(float(qty), 1))
            elif metric_name == "vo2_max":
                add_to_date(dstr, "vo2_max", round(float(qty), 1))
            elif metric_name == "step_count":
                add_to_date(dstr, "steps",
                    (date_map.get(dstr, {}).get("steps") or 0) + int(float(qty)))
            elif metric_name == "active_energy_burned":
                add_to_date(dstr, "active_calories",
                    (date_map.get(dstr, {}).get("active_calories") or 0) + int(float(qty)))

     # Direct sleep processing
    sleep_metric = metrics.get("sleep_analysis", {})
    sleep_entries = sleep_metric.get("data", [])
    for entry in sleep_entries:
        dstr = parse_date(entry.get("date", ""))
        total_sleep = entry.get("totalSleep")
        if dstr and total_sleep is not None:
            add_to_date(dstr, "sleep_hrs", round(float(total_sleep), 1))

    # Write body logs
    for dstr, vals in date_map.items():
        row_date = date.fromisoformat(dstr)
        if vals.get("weight_lbs"):
            existing = BodyLog.query.filter_by(user_id=user.id, date=row_date).first()
            if existing:
                if vals.get("body_fat_pct"):
                    existing.body_fat_pct = vals["body_fat_pct"]
                if vals.get("muscle_mass_lbs"):
                    existing.muscle_mass_lbs = vals["muscle_mass_lbs"]
                skipped += 1
            else:
                db.session.add(BodyLog(
                    user_id=user.id,
                    date=row_date,
                    weight_lbs=vals.get("weight_lbs"),
                    body_fat_pct=vals.get("body_fat_pct"),
                    muscle_mass_lbs=vals.get("muscle_mass_lbs"),
                    source="Apple Health",
                ))
                body_added += 1

        # Write recovery logs
        rec_fields = ("resting_hr", "hrv", "vo2_max", "sleep_hrs", "steps", "active_calories")
        if any(vals.get(f) for f in rec_fields):
            existing = RecoveryLog.query.filter_by(user_id=user.id, date=row_date).first()
            if existing:
                for f in rec_fields:
                    if vals.get(f) is not None:
                        setattr(existing, f, vals[f])
                skipped += 1
            else:
                db.session.add(RecoveryLog(
                    user_id=user.id,
                    date=row_date,
                    resting_hr=vals.get("resting_hr"),
                    hrv=vals.get("hrv"),
                    vo2_max=vals.get("vo2_max"),
                    sleep_hrs=vals.get("sleep_hrs"),
                    steps=vals.get("steps"),
                    active_calories=vals.get("active_calories"),
                    source="Apple Health",
                ))
                recovery_added += 1

    db.session.commit()
    return jsonify({
        "added": body_added + recovery_added,
        "body_added": body_added,
        "recovery_added": recovery_added,
        "skipped": skipped,
    }), 201