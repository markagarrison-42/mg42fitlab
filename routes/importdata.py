from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from datetime import date
import tempfile, os
from extensions import db
from models import RowingLog, StrengthLog

importdata_bp = Blueprint("importdata", __name__)


@importdata_bp.route("/garmin", methods=["POST"])
@login_required
def garmin_fit():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    f = request.files["file"]
    if not f.filename.endswith(".fit"):
        return jsonify({"error": "Expected a .fit file"}), 400

    # Save to temp file (fitparse needs a file path)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".fit", dir="/tmp")
    f.save(tmp.name)
    tmp.close()

    try:
        import fitparse
        fitfile = fitparse.FitFile(tmp.name)

        added = 0
        skipped = 0

        for session in fitfile.get_messages("session"):
            data = {d.name: d.value for d in session}
            sport = str(data.get("sport", "")).lower()
            if "row" not in sport:
                continue

            start = data.get("start_time")
            if not start:
                continue

            row_date = start.date() if hasattr(start, "date") else date.today()

            # Distance: FIT stores in metres
            dist = int(data.get("total_distance") or 0)

            # Duration: FIT stores in seconds
            secs = int(data.get("total_elapsed_time") or 0)
            mins = secs // 60
            sec_rem = secs % 60
            duration = f"{mins}:{sec_rem:02d}"

            # Split /500m from avg speed (metres/sec)
            avg_speed = data.get("avg_speed") or 0
            split = ""
            if avg_speed and avg_speed > 0:
                split_secs = 500 / avg_speed
                sm = int(split_secs // 60)
                ss = split_secs % 60
                split = f"{sm}:{ss:04.1f}"

            avg_hr      = int(data.get("avg_heart_rate") or 0) or None
            avg_cadence = int(data.get("avg_cadence") or 0) or None  # stroke rate
            avg_power   = int(data.get("avg_power") or 0) or None

            existing = RowingLog.query.filter_by(
                user_id=current_user.id,
                date=row_date,
                distance_m=dist,
                duration=duration,
            ).first()

            if existing:
                skipped += 1
                continue

            log = RowingLog(
                user_id=current_user.id,
                date=row_date,
                session_type="Garmin import",
                distance_m=dist,
                duration=duration,
                split=split,
                stroke_rate=avg_cadence,
                avg_watts=avg_power,
                avg_hr=avg_hr,
                source="Garmin",
            )
            db.session.add(log)
            added += 1

        db.session.commit()
        return jsonify({"added": added, "skipped": skipped}), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        os.unlink(tmp.name)
