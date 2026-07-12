# ── ADD THESE ROUTES TO app.py ───────────────────────────────────────────────
# Also add this to your DB init section (create_tables or equivalent):
#
#   cursor.execute('''CREATE TABLE IF NOT EXISTS user_workouts (
#       id INTEGER PRIMARY KEY AUTOINCREMENT,
#       user_id TEXT NOT NULL,
#       data TEXT NOT NULL,
#       updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
#   )''')
#
# Then add these two routes:

@app.route('/api/workouts', methods=['GET'])
def get_workouts():
    if 'user' not in session:
        return jsonify({'error': 'unauthorized'}), 401
    user_id = session['user']
    conn = get_db()
    row = conn.execute(
        'SELECT data FROM user_workouts WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
        (user_id,)
    ).fetchone()
    conn.close()
    if row:
        return jsonify(json.loads(row['data']))
    return jsonify(None)


@app.route('/api/workouts', methods=['POST'])
def save_workouts():
    if 'user' not in session:
        return jsonify({'error': 'unauthorized'}), 401
    user_id = session['user']
    data = request.get_json()
    if not data:
        return jsonify({'error': 'no data'}), 400
    conn = get_db()
    existing = conn.execute(
        'SELECT id FROM user_workouts WHERE user_id = ?', (user_id,)
    ).fetchone()
    if existing:
        conn.execute(
            'UPDATE user_workouts SET data = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            (json.dumps(data), user_id)
        )
    else:
        conn.execute(
            'INSERT INTO user_workouts (user_id, data) VALUES (?, ?)',
            (user_id, json.dumps(data))
        )
    conn.commit()
    conn.close()
    return jsonify({'ok': True})

# ── ALSO MAKE SURE THESE IMPORTS ARE AT TOP OF app.py ────────────────────────
# import json  (add if not already there)
