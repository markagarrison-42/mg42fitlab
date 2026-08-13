"""
Run this on PythonAnywhere to export your old FitLog data to JSON,
so it can be migrated into your new Supabase account.

Usage:
    cd /home/madfella/mg42fitlab
    python3 export_fitlog_data.py

Produces: fitlog_export.json in the current directory.
"""
import sqlite3, json

conn = sqlite3.connect("fitlog.db")
conn.row_factory = sqlite3.Row

logs = {}
for row in conn.execute("SELECT exercise_id, data FROM logs"):
    try:
        logs[row["exercise_id"]] = json.loads(row["data"])
    except Exception:
        pass

workouts = None
row = conn.execute(
    "SELECT data FROM user_workouts ORDER BY updated_at DESC LIMIT 1"
).fetchone()
if row:
    try:
        workouts = json.loads(row["data"])
    except Exception:
        pass

conn.close()

export = {"logs": logs, "workouts": workouts}

with open("fitlog_export.json", "w") as f:
    json.dump(export, f)

total_sets = sum(len(v) for v in logs.values())
print(f"Exported {len(logs)} exercises, {total_sets} total sets")
print(f"Exported {len(workouts) if workouts else 0} routines")
print("Wrote fitlog_export.json")
