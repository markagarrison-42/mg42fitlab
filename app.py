from flask import Flask, render_template, redirect, url_for, request, session, jsonify, send_file
from functools import wraps
import os, json, io, sqlite3, time
from datetime import datetime, timedelta

from pywebpush import webpush, WebPushException
from apscheduler.schedulers.background import BackgroundScheduler

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", "fitlog-secret-2024")

USERNAME = os.environ.get("FITLOG_USER", "madfella")
PASSWORD = os.environ.get("FITLOG_PASS", "Fitlog2024")
DB_PATH  = os.path.join(os.path.dirname(__file__), "fitlog.db")

# ── SCHEDULER ─────────────────────────────────────────────────────────────────
scheduler = BackgroundScheduler(daemon=True)
scheduler.start()

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

# ── AUTH ──────────────────────────────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("logged_in"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated

@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        if (request.form.get("username", "").strip().lower() == USERNAME.lower() and
                request.form.get("password", "") == PASSWORD):
            session["logged_in"] = True
            session["user"] = USERNAME
            return redirect(url_for("index"))
        error = "Invalid username or password."
    return render_template("login.html", error=error)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))

@app.route("/")
@login_required
def index():
    return render_template("index.html")

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

# ── LOGS ──────────────────────────────────────────────────────────────────────
@app.route("/api/logs", methods=["GET"])
@login_required
def get_logs():
    with get_db() as conn:
        rows = conn.execute("SELECT exercise_id, data FROM logs").fetchall()
    result = {}
    for row in rows:
        try: result[row["exercise_id"]] = json.loads(row["data"])
        except: pass
    return jsonify(result)

@app.route("/api/logs", methods=["POST"])
@login_required
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
@login_required
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
@login_required
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
@login_required
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
@login_required
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
@login_required
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
@login_required
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
@login_required
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
@login_required
def push_cancel_timer():
    data   = request.get_json()
    job_id = data.get("job_id")
    if job_id:
        try: scheduler.remove_job(job_id)
        except: pass
    return jsonify({"ok": True})

# ── ENTRY POINT ───────────────────────────────────────────────────────────────
application = app
if __name__ == "__main__":
    app.run(debug=True)
