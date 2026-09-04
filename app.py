from flask import Flask, render_template, request, jsonify, send_file
import os, json, io, sqlite3, time
import pymysql
from datetime import datetime, timedelta

from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "fitlog-secret-2024")

DB_PATH  = os.path.join(os.path.dirname(__file__), "fitlog.db")

# ── SCHEDULER ─────────────────────────────────────────────────────────────────
scheduler = BackgroundScheduler(daemon=True)
scheduler.start()

# ── PEPTIDETRACK HEALTH METRICS (read-only cross-app) ─────────────────────────
# FitLog user -> PeptideTrack patient_id mapping. Emails don't always match
# across the two apps (e.g. Eileen uses a different login on each), so this
# has to be explicit rather than looked up by email.
PEPTIDETRACK_PATIENT_MAP = {
    "657b7583-772a-4f6a-82cc-1fdd1bf0f976": 1,   # mark.a.garrison@gmail.com
    "73c6b5e6-5806-4945-ac73-417aa123fec2": 17,  # eileen.p.garrison@gmail.com -> PeptideTrack patient 17
}

def get_peptidetrack_conn():
    return pymysql.connect(
        host=os.environ.get("PT_DB_HOST", "madfella.mysql.pythonanywhere-services.com"),
        user=os.environ.get("PT_DB_USER", "madfella"),
        password=os.environ.get("PT_DB_PASS", ""),
        database="madfella$peptidetrack",
        cursorclass=pymysql.cursors.DictCursor,
        connect_timeout=5,
    )

@app.route("/api/health-metrics")
def health_metrics():
    from flask import request as _req
    auth_header = _req.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401
    user_id = _req.args.get("user_id", "")
    patient_id = PEPTIDETRACK_PATIENT_MAP.get(user_id)
    if not patient_id:
        return jsonify({"weight": [], "bodyFat": []})

    try:
        conn = get_peptidetrack_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT date, weight_lbs, body_fat_pct FROM checkins "
                    "WHERE patient_id=%s AND (weight_lbs IS NOT NULL OR body_fat_pct IS NOT NULL) "
                    "ORDER BY date ASC LIMIT 90",
                    (patient_id,)
                )
                rows = cur.fetchall()
        finally:
            conn.close()

        weight = [{"date": str(r["date"]), "value": r["weight_lbs"]} for r in rows if r["weight_lbs"] is not None]
        bodyfat = [{"date": str(r["date"]), "value": r["body_fat_pct"]} for r in rows if r["body_fat_pct"] is not None]
        return jsonify({"weight": weight, "bodyFat": bodyfat})
    except Exception as e:
        return jsonify({"error": str(e), "weight": [], "bodyFat": []}), 500

# ── DATABASE ──────────────────────────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS logs (
                exercise_id TEXT PRIMARY KEY,
                data        TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS user_workouts (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    TEXT NOT NULL,
                data       TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fitlog_push_subscriptions (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id    TEXT NOT NULL,
                endpoint   TEXT NOT NULL,
                p256dh     TEXT NOT NULL,
                auth       TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, endpoint)
            )
        """)
        conn.commit()

init_db()

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

# ── LOGS ──────────────────────────────────────────────────────────────────────
@app.route("/api/logs", methods=["GET"])
def get_logs():
    with get_db() as conn:
        rows = conn.execute("SELECT exercise_id, data FROM logs").fetchall()
    result = {}
    for row in rows:
        try: result[row["exercise_id"]] = json.loads(row["data"])
        except: pass
    return jsonify(result)

@app.route("/api/logs", methods=["POST"])
def save_logs():
    data = request.get_json()
    if not isinstance(data, dict):
        return jsonify({"error": "Invalid data"}), 400
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        for exercise_id, entries in data.items():
            conn.execute("""
                INSERT INTO logs (exercise_id, data, updated_at) VALUES (?, ?, ?)
                ON CONFLICT(exercise_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
            """, (exercise_id, json.dumps(entries), now))
        conn.commit()
    return jsonify({"message": "Saved", "count": len(data)})

@app.route("/api/logs/<exercise_id>", methods=["POST"])
def save_exercise_logs(exercise_id):
    entries = request.get_json()
    now = datetime.utcnow().isoformat()
    with get_db() as conn:
        conn.execute("""
            INSERT INTO logs (exercise_id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(exercise_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
        """, (exercise_id, json.dumps(entries), now))
        conn.commit()
    return jsonify({"message": "Saved"})

@app.route("/api/export")
def export_logs():
    with get_db() as conn:
        rows = conn.execute("SELECT exercise_id, data FROM logs").fetchall()
    result = {}
    for row in rows:
        try: result[row["exercise_id"]] = json.loads(row["data"])
        except: pass
    filename = "fitlog-export-" + datetime.utcnow().strftime("%Y%m%d") + ".json"
    buf = io.BytesIO(json.dumps(result, indent=2).encode("utf-8"))
    buf.seek(0)
    return send_file(buf, mimetype="application/json", as_attachment=True, download_name=filename)

@app.route("/api/import", methods=["POST"])
def import_logs():
    try:
        if "file" in request.files:
            data = json.loads(request.files["file"].read())
        else:
            data = request.get_json()
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid format"}), 400
    except Exception as e:
        return jsonify({"error": "Could not parse: " + str(e)}), 400
    now = datetime.utcnow().isoformat()
    count = 0
    with get_db() as conn:
        for exercise_id, entries in data.items():
            if isinstance(entries, list):
                conn.execute("""
                    INSERT INTO logs (exercise_id, data, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(exercise_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at
                """, (exercise_id, json.dumps(entries), now))
                count += 1
        conn.commit()
    return jsonify({"message": "Imported " + str(count) + " exercises"})

# ── WORKOUTS (server-side persistence) ───────────────────────────────────────
@app.route("/api/workouts", methods=["GET"])
def get_workouts():
    user_id = session.get("user", USERNAME)
    with get_db() as conn:
        row = conn.execute(
            "SELECT data FROM user_workouts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
            (user_id,)
        ).fetchone()
    if row:
        return jsonify(json.loads(row["data"]))
    return jsonify(None)

@app.route("/api/workouts", methods=["POST"])
def save_workouts():
    user_id = session.get("user", USERNAME)
    data = request.get_json()
    if not data:
        return jsonify({"error": "no data"}), 400
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id FROM user_workouts WHERE user_id = ?", (user_id,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE user_workouts SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                (json.dumps(data), user_id)
            )
        else:
            conn.execute(
                "INSERT INTO user_workouts (user_id, data) VALUES (?, ?)",
                (user_id, json.dumps(data))
            )
        conn.commit()
    return jsonify({"ok": True})

# ── PUSH NOTIFICATIONS ────────────────────────────────────────────────────────
def send_push(endpoint, p256dh, auth_key, title, body, url="/"):
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth_key}},
            data=json.dumps({"title": title, "body": body, "url": url}),
            vapid_private_key=os.environ.get("VAPID_PRIVATE_KEY", ""),
            vapid_claims={"sub": os.environ.get("VAPID_CLAIM_EMAIL", "mailto:mark.a.garrison@gmail.com")}
        )
    except WebPushException as e:
        print("Push error:", e)

@app.route("/api/push/vapid-public-key", methods=["GET"])
def push_vapid_key():
    return jsonify({"key": os.environ.get("VAPID_PUBLIC_KEY", "")})

@app.route("/api/push/subscribe", methods=["POST"])
def push_subscribe():
    user_id  = session.get("user", USERNAME)
    data     = request.get_json()
    endpoint = data.get("endpoint")
    p256dh   = data.get("keys", {}).get("p256dh")
    auth_key = data.get("keys", {}).get("auth")
    if not endpoint or not p256dh or not auth_key:
        return jsonify({"error": "invalid"}), 400
    with get_db() as conn:
        conn.execute("""
            INSERT INTO fitlog_push_subscriptions (user_id, endpoint, p256dh, auth)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, endpoint) DO UPDATE SET
                p256dh=excluded.p256dh,
                auth=excluded.auth,
                updated_at=CURRENT_TIMESTAMP
        """, (user_id, endpoint, p256dh, auth_key))
        conn.commit()
    return jsonify({"ok": True})

@app.route("/api/push/timer", methods=["POST"])
def push_schedule_timer():
    user_id  = session.get("user", USERNAME)
    data     = request.get_json()
    seconds  = int(data.get("seconds", 60))
    exercise = data.get("exercise", "Rest")
    with get_db() as conn:
        subs = conn.execute(
            "SELECT endpoint, p256dh, auth FROM fitlog_push_subscriptions WHERE user_id = ?",
            (user_id,)
        ).fetchall()
    if not subs:
        return jsonify({"ok": False, "reason": "no subscription"})
    subs_list = [dict(s) for s in subs]
    def fire():
        for sub in subs_list:
            send_push(sub["endpoint"], sub["p256dh"], sub["auth"],
                      title="Rest Over \u2714",
                      body=exercise + " \u2014 Time to go!",
                      url="https://fit.mg42health.com")
    job_id = "timer_" + user_id + "_" + str(int(time.time()))
    scheduler.add_job(fire, "date",
                      run_date=datetime.now() + timedelta(seconds=seconds),
                      id=job_id, replace_existing=True, misfire_grace_time=30)
    return jsonify({"ok": True, "job_id": job_id})

@app.route("/api/push/cancel", methods=["POST"])
def push_cancel_timer():
    data   = request.get_json()
    job_id = data.get("job_id")
    if job_id:
        try: scheduler.remove_job(job_id)
        except: pass
    return jsonify({"ok": True})


# ── AI ROUTINE GENERATOR ──────────────────────────────────────────────────────
@app.route("/api/generate-routine", methods=["POST"])
def generate_routine():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    prompt = data.get("prompt", "").strip()
    if not prompt:
        return jsonify({"error": "No prompt provided"}), 400

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        return jsonify({"error": "API key not configured"}), 500

    try:
        import urllib.request as urlreq

        system_prompt = """You are a strength training program designer. Output ONLY a Strong template CSV with NO other text.

Header row (exact, 12 columns):
"Folder","Template Name","Exercise","Set","Group","Weight (kg)","Reps","Set Duration (s)","Distance (m)","Rest Timer (s)","Exercise Notes","Template Note"

Rules:
- Folder: program/folder name (e.g. "Custom"). Same value on every row of that program.
- Template Name: workout name (e.g. "Push Day")
- Exercise: exercise name, e.g. "Bench Press (Barbell)"
- Set: 1,2,3... restarting for each new exercise. May also be WARM_UP or FAILURE.
- Group: blank unless supersetted. If supersetted, use a letter (A, B, C) shared by the grouped exercises.
- Weight (kg): always blank so the user fills in their own working weight
- Reps: integer (upper end of a range, e.g. 12 for 8-12)
- Set Duration (s), Distance (m): blank unless it is a timed or distance exercise
- Rest Timer (s): integer seconds (e.g. 90, 120, 180)
- Exercise Notes: blank, or a short cue. Repeat the same note on every row of that exercise.
- Template Note: one short description of the workout, REPEATED on every row of that template

Quote any field containing a comma.

Output ONLY the CSV. No markdown, no explanation, no code fences."""

        payload = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 2000,
            "system": system_prompt,
            "messages": [{"role": "user", "content": prompt}]
        }).encode("utf-8")

        req = urlreq.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "x-api-key": anthropic_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )

        with urlreq.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        csv_text = result["content"][0]["text"].strip()
        # Strip accidental markdown fences
        lines = csv_text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        csv_text = "\n".join(lines).strip()

        return jsonify({"csv": csv_text})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── PROTEIN ESTIMATOR ─────────────────────────────────────────────────────────
@app.route("/api/estimate-macros", methods=["POST"])
@app.route("/api/estimate-protein", methods=["POST"])  # legacy alias
def estimate_macros():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401

    data = request.get_json()
    meal = data.get("meal", "").strip()
    if not meal:
        return jsonify({"error": "No meal provided"}), 400

    anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not anthropic_key:
        return jsonify({"error": "API key not configured"}), 500

    try:
        import urllib.request as urlreq

        system_prompt = """You are a nutrition analyst estimating macronutrients from a meal description.

METHOD - follow this internally before answering:
1. Split the meal into individual food items.
2. For each item, determine the portion. If a weight/volume is given, use it. If not, assume a standard serving for that food (see defaults below).
3. Look up per-100g or per-serving macros for each item from standard nutrition data (USDA-style values).
4. Scale each item to its portion, then sum across all items.
5. Verify: calories should equal (protein*4 + carbs*4 + fat*9) within about 5%. If not, recheck the item that is most likely wrong rather than fudging the total.

PORTION DEFAULTS when unstated:
- Meat/fish/poultry: 6oz (170g) cooked
- Cooked rice/pasta/grains: 1 cup cooked
- Bread: 1 slice; bagel: 1 medium
- Eggs: 2 large
- Nuts/nut butter: 1oz / 2 tbsp
- Cooking oil: 1 tbsp if any sauteing/roasting is implied
- Vegetables: 1 cup
- Cheese: 1oz
- Protein shake/powder: 1 scoop

ACCURACY RULES:
- Account for cooking fat even when unstated - restaurant and pan-cooked food usually includes added oil or butter.
- Use COOKED weights for meat unless the user says raw. Raw-to-cooked loses roughly 25% weight.
- Do not round aggressively. 47g protein is more useful than 50g.
- Restaurant portions run 1.5-2x home portions. If a restaurant or chain is named, size up accordingly.
- Distinguish lean vs fatty cuts: chicken breast, 93/7 beef and white fish are lean; ribeye, salmon, thigh meat and 80/20 beef carry substantially more fat.
- If the description is too vague to estimate a portion, choose the most common interpretation and state that assumption explicitly in breakdown.

Respond with ONLY valid JSON, no markdown, no code fences, no explanation:
{"calories": <int>, "protein": <int grams>, "carbs": <int grams>, "fat": <int grams>, "breakdown": "<item-by-item with portions>"}

breakdown format: list each item with the portion you assumed and its calories, e.g.
"6oz chicken breast 280cal, 1c white rice 205cal, 1tbsp olive oil 119cal"

Output nothing except the JSON object."""

        payload = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 600,
            "system": system_prompt,
            "messages": [{"role": "user", "content": meal}]
        }).encode("utf-8")

        req = urlreq.Request(
            "https://api.anthropic.com/v1/messages",
            data=payload,
            headers={
                "x-api-key": anthropic_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
        )

        with urlreq.urlopen(req, timeout=20) as resp:
            result = json.loads(resp.read().decode("utf-8"))

        text = result["content"][0]["text"].strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        parsed = json.loads(text.strip())
        return jsonify(parsed)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── DEPLOY WEBHOOK ─────────────────────────────────────────────
@app.route("/api/deploy", methods=["POST"])
def deploy():
    import subprocess
    secret = os.environ.get("DEPLOY_SECRET", "")
    provided = request.headers.get("X-Deploy-Secret", "")
    if not secret or provided != secret:
        return jsonify({"error": "Unauthorized"}), 401

    repo = "/home/madfella/mg42fitlab"
    try:
        pull = subprocess.run(
            ["git", "-C", repo, "pull", "--ff-only", "origin", "main"],
            capture_output=True, text=True, timeout=60
        )
        if pull.returncode != 0:
            return jsonify({"error": "git pull failed", "stderr": pull.stderr[:500]}), 500

        # Touch the WSGI file to trigger a reload
        wsgi = "/var/www/fitlog_mg42apps_com_wsgi.py"
        os.utime(wsgi, None)

        return jsonify({"status": "deployed", "output": pull.stdout[-300:]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── ENTRY POINT ───────────────────────────────────────────────────────────────
application = app
if __name__ == "__main__":
    app.run(debug=True)
