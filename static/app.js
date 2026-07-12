'use strict';

/* ── State ── */
const APP = { user: null, settings: { protein_goal_g: 200, bodyweight_lbs: 185 }, charts: {}, currentPage: 'dashboard' };

/* ── API ── */
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
const GET  = p      => api('GET',    p);
const POST = (p, b) => api('POST',   p, b);
const PUT  = (p, b) => api('PUT',    p, b);
const DEL  = p      => api('DELETE', p);

function flash(id, msg, ms = 2000) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { el.textContent = ''; }, ms);
}

function today() { return new Date().toISOString().split('T')[0]; }
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtNum(n, dec = 1) { if (n == null || n === '') return '—'; return Number(n).toFixed(dec); }
function destroyChart(key) { if (APP.charts[key]) { APP.charts[key].destroy(); delete APP.charts[key]; } }
function srcBadge(src) {
  const map = { Strong: 'blue', Garmin: 'teal', 'Apple Health': 'purple', Manual: 'gray' };
  return `badge-${map[src] || 'gray'}`;
}
function weekStart(ds) {
  const d = new Date(ds + 'T00:00:00');
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function chartOpts(unit = '') {
  return {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', maxTicksLimit: 7, font: { size: 11 } } },
      y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + unit } },
    },
  };
}

/* AUTH */
let authMode = 'login';
function toggleAuthMode() {
  authMode = authMode === 'login' ? 'register' : 'login';
  document.getElementById('auth-subtitle').textContent = authMode === 'login' ? 'Sign in to continue' : 'Create your account';
  document.getElementById('auth-submit-btn').textContent = authMode === 'login' ? 'Sign in' : 'Create account';
  document.getElementById('auth-toggle-text').textContent = authMode === 'login' ? 'No account? Register' : 'Have an account? Sign in';
  document.getElementById('auth-error').textContent = '';
}

async function authSubmit() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.textContent = '';
  if (!username || !password) { errEl.textContent = 'Please enter a username and password.'; return; }
  try {
    const email = document.getElementById('auth-email')?.value.trim() || null;
    const data = await POST(authMode === 'login' ? '/auth/login' : '/auth/register', { username, password, email });
    APP.user = data.username;
    document.getElementById('topbar-username').textContent = data.username;
    document.getElementById('auth-screen').classList.add('hidden');
    await loadSettings();
    showPage('dashboard');
  } catch (err) { errEl.textContent = err.message; }
}

async function logout() {
  await POST('/auth/logout').catch(() => {});
  APP.user = null;
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
}

async function checkAuth() {
  try {
    const data = await GET('/auth/me');
    APP.user = data.username;
    document.getElementById('topbar-username').textContent = data.username;
    document.getElementById('auth-screen').classList.add('hidden');
    await loadSettings();
    showPage('dashboard');
  } catch {}
}

async function loadSettings() {
  try { APP.settings = await GET('/auth/settings'); } catch {}
}

/* ROUTING */
const PAGE_LOADERS = {
  dashboard: loadDashboard,
  body:      loadBody,
  training:  loadTraining,
  recovery:  loadRecovery,
  nutrition: loadNutrition,
  protocol:  loadProtocol,
  import:    loadImport,
};

function showPage(name, tabEl = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (tabEl) tabEl.classList.add('active');
  else document.querySelectorAll('.tab-btn').forEach(b => { if (b.getAttribute('onclick')?.includes(name)) b.classList.add('active'); });
  APP.currentPage = name;
  if (PAGE_LOADERS[name]) PAGE_LOADERS[name]();
}

/* DASHBOARD */
async function loadDashboard() {
  const el = document.getElementById('page-dashboard');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const [body, cardio, rowing, nutSummary, recovery] = await Promise.all([
      GET('/api/body/'), GET('/api/cardio/'), GET('/api/rowing/'),
      GET('/api/nutrition/summary?days=14'), GET('/api/recovery/summary?days=30'),
    ]);

    const latest = body[0] || null;
    const prev   = body[1] || null;
    const todayProt = Object.values(nutSummary).slice(-1)[0]?.protein_g || 0;
    const latestRec = recovery.length ? recovery[recovery.length - 1] : null;

    function dHtml(curr, prev, invert = false) {
      if (curr == null || prev == null) return '';
      const d = (Number(curr) - Number(prev)).toFixed(1);
      const neg = invert ? d > 0 : d < 0;
      return '<div class="metric-delta ' + (neg ? 'delta-pos' : 'delta-neg') + '">' + (d > 0 ? '+' : '') + d + '</div>';
    }

    el.innerHTML =
      '<div class="metric-grid">' +
      '<div class="metric-card"><div class="metric-label">Weight</div><div class="metric-value">' + (latest ? fmtNum(latest.weight_lbs) : '—') + '<small> lbs</small></div>' + dHtml(latest?.weight_lbs, prev?.weight_lbs, true) + '</div>' +
      '<div class="metric-card"><div class="metric-label">Body fat</div><div class="metric-value">' + (latest ? fmtNum(latest.body_fat_pct) : '—') + '<small>%</small></div>' + dHtml(latest?.body_fat_pct, prev?.body_fat_pct, true) + '</div>' +
      '<div class="metric-card"><div class="metric-label">Muscle mass</div><div class="metric-value">' + (latest ? fmtNum(latest.muscle_mass_lbs) : '—') + '<small> lbs</small></div>' + dHtml(latest?.muscle_mass_lbs, prev?.muscle_mass_lbs) + '</div>' +
      '<div class="metric-card"><div class="metric-label">Protein today</div><div class="metric-value">' + Math.round(todayProt) + '<small>g</small></div><div class="metric-delta" style="color:var(--muted)">goal: ' + APP.settings.protein_goal_g + 'g</div></div>' +
      '<div class="metric-card"><div class="metric-label">Resting HR</div><div class="metric-value">' + (latestRec?.resting_hr || '—') + '<small> bpm</small></div></div>' +
      '<div class="metric-card"><div class="metric-label">HRV</div><div class="metric-value">' + (latestRec?.hrv || '—') + '<small> ms</small></div></div>' +
      '</div>' +
      '<div class="card"><div class="card-title">Weight <span>30 days</span></div><div class="chart-wrap" style="height:150px"><canvas id="ch-w"></canvas></div></div>' +
      '<div class="card"><div class="card-title">Body composition <span>latest</span></div><div class="chart-wrap" style="height:150px"><canvas id="ch-comp"></canvas></div></div>' +
      '<div class="card"><div class="card-title">Protein <span>14 days</span></div><div class="chart-wrap" style="height:130px"><canvas id="ch-prot"></canvas></div></div>' +
      '<div class="card"><div class="card-title">Weekly training <span>mins</span></div><div class="chart-wrap" style="height:150px"><canvas id="ch-vol"></canvas></div></div>' +
      '<div class="card"><div class="card-title">HRV <span>30 days</span></div><div class="chart-wrap" style="height:130px"><canvas id="ch-hrv"></canvas></div></div>' +
      '<div class="card"><div class="card-title">Sleep <span>hrs/night</span></div><div class="chart-wrap" style="height:130px"><canvas id="ch-sleep"></canvas></div></div>' +
      '<div class="card"><div class="card-title">Recent activity</div><div id="dash-recent"></div></div>';

    // Weight chart
    const bodyAsc = body.slice().reverse().slice(-30);
    if (bodyAsc.length) {
      destroyChart('w');
      APP.charts['w'] = new Chart(document.getElementById('ch-w'), {
        type: 'line',
        data: { labels: bodyAsc.map(d => fmtDate(d.date)), datasets: [{ data: bodyAsc.map(d => d.weight_lbs), borderColor: '#38bdf8', borderWidth: 2, pointRadius: 3, tension: 0.35, fill: false }] },
        options: chartOpts('lb'),
      });
    }

    // Body comp donut
    if (latest?.body_fat_pct) {
      const fm = +(latest.weight_lbs * latest.body_fat_pct / 100).toFixed(1);
      const lean = +(latest.weight_lbs - fm).toFixed(1);
      destroyChart('comp');
      APP.charts['comp'] = new Chart(document.getElementById('ch-comp'), {
        type: 'doughnut',
        data: { labels: ['Fat', 'Muscle', 'Other lean'], datasets: [{ data: [fm, latest.muscle_mass_lbs || 0, Math.max(0, lean - (latest.muscle_mass_lbs || 0))], backgroundColor: ['#f87171', '#34d399', '#38bdf8'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', boxWidth: 10, padding: 8, font: { size: 11 } } } }, cutout: '65%' },
      });
    }

    // Protein chart
    const dates = Object.keys(nutSummary).sort();
    const protVals = dates.map(d => nutSummary[d].protein_g);
    const goal = APP.settings.protein_goal_g;
    destroyChart('prot');
    APP.charts['prot'] = new Chart(document.getElementById('ch-prot'), {
      type: 'bar',
      data: { labels: dates.map(fmtDate), datasets: [
        { data: protVals, backgroundColor: protVals.map(v => v >= goal ? '#34d399aa' : v >= goal * 0.8 ? '#fbbf24aa' : '#f87171aa'), borderRadius: 3 },
        { type: 'line', data: dates.map(() => goal), borderColor: '#38bdf8', borderWidth: 1.5, borderDash: [4, 3], pointRadius: 0, fill: false },
      ]},
      options: chartOpts('g'),
    });

    // Weekly training volume
    const weeks = {};
    const actColors = { Strength: '#818cf8', Running: '#34d399', HIIT: '#f87171', Bicycling: '#38bdf8', Elliptical: '#fbbf24', 'Stair Stepper': '#818cf8', Treadmill: '#fb923c', Walking: '#94a3b8', Rowing: '#6ee7b7', Other: '#64748b' };
    const actTypes = new Set();
    const allSessions = [
      ...cardio,
      ...rowing.map(r => {
        let dur = 0;
        if (r.duration) { const p = r.duration.split(':'); dur = parseFloat(p[0]) + parseFloat(p[1] || 0) / 60; }
        return { ...r, activity_type: 'Rowing', duration_mins: dur };
      })
    ];
    allSessions.forEach(r => {
      const w = weekStart(r.date);
      if (!weeks[w]) weeks[w] = {};
      actTypes.add(r.activity_type);
      weeks[w][r.activity_type] = (weeks[w][r.activity_type] || 0) + (r.duration_mins || 0);
    });
    const wKeys = Object.keys(weeks).sort().slice(-8);
    destroyChart('vol');
    if (wKeys.length) {
      APP.charts['vol'] = new Chart(document.getElementById('ch-vol'), {
        type: 'bar',
        data: { labels: wKeys, datasets: [...actTypes].map(t => ({ label: t, data: wKeys.map(w => Math.round(weeks[w][t] || 0)), backgroundColor: (actColors[t] || '#64748b') + 'aa', borderRadius: 3, stack: 'a' })) },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 10, padding: 6, font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } }, stacked: true }, y: { grid: { color: '#1e293b' }, ticks: { color: '#64748b', font: { size: 11 }, callback: v => v + 'm' }, stacked: true } } },
      });
    }

    // HRV chart
    const recAsc = recovery.slice(-30);
    destroyChart('hrv');
    if (recAsc.some(r => r.hrv)) {
      APP.charts['hrv'] = new Chart(document.getElementById('ch-hrv'), {
        type: 'line',
        data: { labels: recAsc.map(r => fmtDate(r.date)), datasets: [{ data: recAsc.map(r => r.hrv), borderColor: '#818cf8', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false }] },
        options: chartOpts('ms'),
      });
    }

    // Sleep chart
    destroyChart('sleep');
    if (recAsc.some(r => r.sleep_hrs)) {
      const sleepVals = recAsc.map(r => r.sleep_hrs);
      APP.charts['sleep'] = new Chart(document.getElementById('ch-sleep'), {
        type: 'bar',
        data: { labels: recAsc.map(r => fmtDate(r.date)), datasets: [{ data: sleepVals, backgroundColor: sleepVals.map(v => (v || 0) >= 7 ? '#34d399aa' : (v || 0) >= 6 ? '#fbbf24aa' : '#f87171aa'), borderRadius: 3 }] },
        options: chartOpts('h'),
      });
    }

    // Recent activity
    const recent = [
      ...cardio.slice(0, 15).map(r => ({ date: r.date, badge: 'teal', label: r.activity_type, detail: r.duration_mins ? Math.round(r.duration_mins) + ' min' : '', sub: r.calories ? r.calories + ' cal' : '' })),
      ...rowing.slice(0, 5).map(r => ({ date: r.date, badge: 'blue', label: 'Rowing', detail: r.distance_m ? r.distance_m.toLocaleString() + 'm' : r.duration || '', sub: r.split ? r.split + '/500m' : '' })),
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

    document.getElementById('dash-recent').innerHTML = recent.length
      ? recent.map(r => '<div class="recent-item"><div><div class="recent-main">' + r.label + ' <span class="badge badge-' + r.badge + '" style="font-size:10px">' + r.detail + '</span></div><div class="recent-sub">' + fmtDate(r.date) + (r.sub ? ' · ' + r.sub : '') + '</div></div></div>').join('')
      : '<div class="empty-state">No activity yet</div>';

  } catch (err) {
    el.innerHTML = '<div class="empty-state">Error: ' + err.message + '</div>';
  }
}

/* BODY */
async function loadBody() {
  const el = document.getElementById('page-body');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const data = await GET('/api/body/');
    renderBodyPage(el, data);
  } catch (err) { el.innerHTML = '<div class="empty-state">Error: ' + err.message + '</div>'; }
}

function renderBodyPage(el, data) {
  const latest = data[0] || null;
  const recent = data.slice(0, 5);
  el.innerHTML =
    '<div class="card"><div class="card-title">Log measurement</div>' +
    '<div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="b-date" value="' + today() + '"></div>' +
    '<div class="form-group"><label>Weight (lbs)</label><input type="number" id="b-weight" value="' + (latest ? latest.weight_lbs : 185) + '" step="0.1" min="80" inputmode="decimal"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Body fat %</label><input type="number" id="b-fat" value="' + (latest?.body_fat_pct || '') + '" step="0.1" min="3" max="50" inputmode="decimal"></div>' +
    '<div class="form-group"><label>Muscle mass (lbs)</label><input type="number" id="b-muscle" value="' + (latest?.muscle_mass_lbs || '') + '" step="0.1" min="50" inputmode="decimal"></div></div>' +
    '<div style="display:flex;align-items:center"><button class="btn btn-primary" onclick="submitBody()">Log measurement</button><span class="flash" id="b-flash"></span></div></div>' +

    (latest ? '<div class="card"><div class="card-title">Latest <span>' + fmtDate(latest.date) + '</span></div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center">' +
    '<div><div style="font-size:11px;color:var(--muted)">Weight</div><div style="font-size:18px;font-weight:600">' + fmtNum(latest.weight_lbs) + '<small style="font-size:11px;color:var(--muted)">lb</small></div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">Fat</div><div style="font-size:18px;font-weight:600">' + fmtNum(latest.body_fat_pct) + '<small style="font-size:11px;color:var(--muted)">%</small></div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">Muscle</div><div style="font-size:18px;font-weight:600">' + fmtNum(latest.muscle_mass_lbs) + '<small style="font-size:11px;color:var(--muted)">lb</small></div></div>' +
    '</div></div>' : '') +

    '<div class="card"><div class="card-title">Recent <span>' + data.length + ' total</span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Weight</th><th>Fat %</th><th>Muscle</th></tr></thead><tbody>' +
    recent.map(r => '<tr><td>' + fmtDate(r.date) + '</td><td>' + fmtNum(r.weight_lbs) + 'lb</td><td>' + fmtNum(r.body_fat_pct) + '%</td><td>' + fmtNum(r.muscle_mass_lbs) + 'lb</td></tr>').join('') +
    '</tbody></table></div></div>';
}

async function submitBody() {
  try {
    await POST('/api/body/', {
      date: document.getElementById('b-date').value,
      weight_lbs: document.getElementById('b-weight').value,
      body_fat_pct: document.getElementById('b-fat').value || null,
      muscle_mass_lbs: document.getElementById('b-muscle').value || null,
      source: 'Manual',
    });
    flash('b-flash', 'Logged!');
    const data = await GET('/api/body/');
    renderBodyPage(document.getElementById('page-body'), data);
  } catch (err) { flash('b-flash', 'Error: ' + err.message); }
}

/* TRAINING */
const TRAINING_TYPES = ['Strength', 'HIIT', 'Running', 'Rowing', 'Bicycling', 'Elliptical', 'Stair Stepper', 'Treadmill', 'Walking', 'Hiking', 'Other'];

async function loadTraining() {
  const el = document.getElementById('page-training');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const [cardio, rowing] = await Promise.all([GET('/api/cardio/'), GET('/api/rowing/')]);
    renderTrainingPage(el, cardio, rowing);
  } catch (err) { el.innerHTML = '<div class="empty-state">Error: ' + err.message + '</div>'; }
}

function renderTrainingPage(el, cardio, rowing) {
  const allRecent = [
    ...cardio.slice(0, 10).map(r => ({ date: r.date, type: r.activity_type, detail: r.duration_mins ? Math.round(r.duration_mins) + ' min' : '', sub: r.calories ? r.calories + ' cal' : '', src: r.source })),
    ...rowing.slice(0, 4).map(r => ({ date: r.date, type: 'Rowing', detail: r.distance_m ? r.distance_m.toLocaleString() + 'm' : r.duration || '', sub: r.split ? r.split + '/500m' : '', src: r.source }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  el.innerHTML =
    '<div class="card"><div class="card-title">Log a session</div>' +
    '<div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="t-date" value="' + today() + '"></div>' +
    '<div class="form-group"><label>Activity</label><select id="t-type" onchange="toggleRowingFields()">' + TRAINING_TYPES.map(t => '<option>' + t + '</option>').join('') + '</select></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Duration (mins)</label><input type="number" id="t-duration" value="45" min="1" inputmode="decimal"></div>' +
    '<div class="form-group"><label>Distance (m)</label><input type="number" id="t-distance" placeholder="optional" min="0" step="100" inputmode="numeric"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Avg HR</label><input type="number" id="t-hr" placeholder="optional" min="60" max="220" inputmode="numeric"></div>' +
    '<div class="form-group"><label>Calories</label><input type="number" id="t-cals" placeholder="optional" min="0" inputmode="numeric"></div></div>' +
    '<div id="rowing-extra" style="display:none">' +
    '<div class="form-row"><div class="form-group"><label>Split /500m</label><input type="text" id="t-split" placeholder="2:00.0"></div>' +
    '<div class="form-group"><label>Stroke rate</label><input type="number" id="t-rate" placeholder="20" inputmode="numeric"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Avg watts</label><input type="number" id="t-watts" placeholder="200" inputmode="numeric"></div><div class="form-group"></div></div></div>' +
    '<div class="form-row single"><div class="form-group"><label>Notes</label><input type="text" id="t-notes" placeholder="optional"></div></div>' +
    '<div style="display:flex;align-items:center"><button class="btn btn-primary" onclick="submitTraining()">Log session</button><span class="flash" id="t-flash"></span></div></div>' +

    '<div class="card"><div class="card-title">Recent sessions <span>' + (cardio.length + rowing.length) + ' total</span></div>' +
    allRecent.map(r => '<div class="recent-item"><div><div class="recent-main">' + r.type + ' <span style="font-size:12px;color:var(--muted)">' + r.detail + '</span></div><div class="recent-sub">' + fmtDate(r.date) + (r.sub ? ' · ' + r.sub : '') + '</div></div><span class="badge ' + srcBadge(r.src) + '">' + r.src + '</span></div>').join('') +
    (allRecent.length === 0 ? '<div class="empty-state">No sessions yet</div>' : '') + '</div>';
}

function toggleRowingFields() {
  const type = document.getElementById('t-type').value;
  document.getElementById('rowing-extra').style.display = type === 'Rowing' ? 'block' : 'none';
}

async function submitTraining() {
  const type = document.getElementById('t-type').value;
  try {
    if (type === 'Rowing') {
      const durMins = +document.getElementById('t-duration').value;
      const m = Math.floor(durMins); const s = Math.round((durMins % 1) * 60);
      await POST('/api/rowing/', {
        date: document.getElementById('t-date').value, session_type: 'Manual',
        distance_m: document.getElementById('t-distance').value || null,
        duration: m + ':' + (s < 10 ? '0' : '') + s,
        split: document.getElementById('t-split').value || null,
        stroke_rate: document.getElementById('t-rate').value || null,
        avg_watts: document.getElementById('t-watts').value || null,
        avg_hr: document.getElementById('t-hr').value || null,
        source: 'Manual', notes: document.getElementById('t-notes').value,
      });
    } else {
      await POST('/api/cardio/', {
        date: document.getElementById('t-date').value, activity_type: type,
        duration_mins: document.getElementById('t-duration').value,
        distance_m: document.getElementById('t-distance').value || null,
        avg_hr: document.getElementById('t-hr').value || null,
        calories: document.getElementById('t-cals').value || null,
        source: 'Manual', notes: document.getElementById('t-notes').value,
      });
    }
    flash('t-flash', 'Logged!');
    const [cardio, rowing] = await Promise.all([GET('/api/cardio/'), GET('/api/rowing/')]);
    renderTrainingPage(document.getElementById('page-training'), cardio, rowing);
  } catch (err) { flash('t-flash', 'Error: ' + err.message); }
}

/* RECOVERY */
async function loadRecovery() {
  const el = document.getElementById('page-recovery');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const data = await GET('/api/recovery/');
    renderRecoveryPage(el, data);
  } catch (err) { el.innerHTML = '<div class="empty-state">Error: ' + err.message + '</div>'; }
}

function renderRecoveryPage(el, data) {
  const latest = data[0] || null;
  const recent = data.slice(0, 5);
  el.innerHTML =
    '<div class="card"><div class="card-title">Log recovery</div>' +
    '<div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="rec-date" value="' + today() + '"></div>' +
    '<div class="form-group"><label>Resting HR (bpm)</label><input type="number" id="rec-rhr" placeholder="' + (latest?.resting_hr || 60) + '" min="30" max="120" inputmode="numeric"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>HRV (ms)</label><input type="number" id="rec-hrv" placeholder="' + (latest?.hrv || '') + '" min="0" max="200" inputmode="decimal"></div>' +
    '<div class="form-group"><label>Sleep (hrs)</label><input type="number" id="rec-sleep" placeholder="7.5" step="0.1" min="0" max="24" inputmode="decimal"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Steps</label><input type="number" id="rec-steps" placeholder="8000" min="0" inputmode="numeric"></div>' +
    '<div class="form-group"><label>Active calories</label><input type="number" id="rec-cals" placeholder="500" min="0" inputmode="numeric"></div></div>' +
    '<div style="display:flex;align-items:center"><button class="btn btn-primary" onclick="submitRecovery()">Log recovery</button><span class="flash" id="rec-flash"></span></div></div>' +

    (latest ? '<div class="card"><div class="card-title">Latest <span>' + fmtDate(latest.date) + '</span></div>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">' +
    '<div><div style="font-size:11px;color:var(--muted)">RHR</div><div style="font-size:18px;font-weight:600">' + (latest.resting_hr || '—') + '<small style="font-size:11px;color:var(--muted)"> bpm</small></div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">HRV</div><div style="font-size:18px;font-weight:600">' + (latest.hrv || '—') + '<small style="font-size:11px;color:var(--muted)"> ms</small></div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">Sleep</div><div style="font-size:18px;font-weight:600">' + (latest.sleep_hrs ? fmtNum(latest.sleep_hrs) : '—') + '<small style="font-size:11px;color:var(--muted)"> hrs</small></div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">Steps</div><div style="font-size:16px;font-weight:600">' + (latest.steps ? latest.steps.toLocaleString() : '—') + '</div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">VO2 Max</div><div style="font-size:16px;font-weight:600">' + (latest.vo2_max || '—') + '</div></div>' +
    '<div><div style="font-size:11px;color:var(--muted)">Active cal</div><div style="font-size:16px;font-weight:600">' + (latest.active_calories ? latest.active_calories.toLocaleString() : '—') + '</div></div>' +
    '</div></div>' : '') +

    '<div class="card"><div class="card-title">Recent <span>' + data.length + ' total</span></div>' +
    '<div class="table-wrap"><table><thead><tr><th>Date</th><th>RHR</th><th>HRV</th><th>Sleep</th><th>Steps</th></tr></thead><tbody>' +
    recent.map(r => '<tr><td>' + fmtDate(r.date) + '</td><td>' + (r.resting_hr || '—') + '</td><td>' + (r.hrv || '—') + '</td><td>' + (r.sleep_hrs ? fmtNum(r.sleep_hrs) + 'h' : '—') + '</td><td>' + (r.steps ? r.steps.toLocaleString() : '—') + '</td></tr>').join('') +
    '</tbody></table></div></div>';
}

async function submitRecovery() {
  try {
    await POST('/api/recovery/', {
      date: document.getElementById('rec-date').value,
      resting_hr: document.getElementById('rec-rhr').value || null,
      hrv: document.getElementById('rec-hrv').value || null,
      sleep_hrs: document.getElementById('rec-sleep').value || null,
      steps: document.getElementById('rec-steps').value || null,
      active_calories: document.getElementById('rec-cals').value || null,
      source: 'Manual',
    });
    flash('rec-flash', 'Logged!');
    const data = await GET('/api/recovery/');
    renderRecoveryPage(document.getElementById('page-recovery'), data);
  } catch (err) { flash('rec-flash', 'Error: ' + err.message); }
}

/* NUTRITION */
const FOOD_SOURCES = ['Chicken breast', 'Ground beef', 'Salmon', 'Eggs', 'Greek yogurt', 'Cottage cheese', 'Whey protein shake', 'Casein shake', 'Protein bar', 'Tuna', 'Turkey', 'Steak'];

async function loadNutrition() {
  const el = document.getElementById('page-nutrition');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const [todayData, logs] = await Promise.all([GET('/api/nutrition/today'), GET('/api/nutrition/')]);
    renderNutritionPage(el, todayData, logs);
  } catch (err) { el.innerHTML = '<div class="empty-state">Error: ' + err.message + '</div>'; }
}

function renderNutritionPage(el, todayData, logs) {
  const goal = APP.settings.protein_goal_g;
  const total = Math.round(todayData.total_protein_g || 0);
  const pct = Math.min(100, Math.round(total / goal * 100));
  const barColor = pct >= 100 ? '#34d399' : pct >= 75 ? '#fbbf24' : '#f87171';
  const recent = logs.slice(0, 5);

  el.innerHTML =
    '<div class="card"><div class="card-title">Today\'s protein <span>' + todayData.date + '</span></div>' +
    '<div style="display:flex;align-items:baseline;gap:6px;margin-bottom:8px"><span style="font-size:32px;font-weight:700;color:' + barColor + '">' + total + '</span><span style="font-size:14px;color:var(--muted)">/ ' + goal + 'g</span></div>' +
    '<div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div></div>' +
    '<div style="font-size:11px;color:var(--muted);margin-top:5px">' + Math.max(0, goal - total) + 'g remaining</div></div>' +

    '<div class="card"><div class="card-title">Log protein intake</div>' +
    '<div class="form-row"><div class="form-group"><label>Date</label><input type="date" id="n-date" value="' + today() + '"></div>' +
    '<div class="form-group"><label>Time</label><input type="time" id="n-time" value="' + new Date().toTimeString().slice(0, 5) + '"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Food source</label><select id="n-source">' + FOOD_SOURCES.map(f => '<option>' + f + '</option>').join('') + '<option value="__custom__">Custom...</option></select></div>' +
    '<div class="form-group"><label>Protein (g)</label><input type="number" id="n-protein" value="40" min="1" max="200" inputmode="numeric"></div></div>' +
    '<div id="n-custom-row" style="display:none" class="form-row single"><div class="form-group"><label>Custom food name</label><input type="text" id="n-custom-name" placeholder="e.g. Bison burger"></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Calories (optional)</label><input type="number" id="n-cals" placeholder="0" min="0" step="10" inputmode="numeric"></div>' +
    '<div class="form-group"><label>Notes</label><input type="text" id="n-notes" placeholder="e.g. post-workout"></div></div>' +
    '<div style="display:flex;align-items:center"><button class="btn btn-primary" onclick="submitNutrition()">Log intake</button><span class="flash" id="n-flash"></span></div></div>' +

    '<div class="card"><div class="card-title">Protein goal</div>' +
    '<div class="form-row"><div class="form-group"><label>Target (g/day)</label><input type="number" id="n-goal" value="' + goal + '" min="50" max="400" step="5" inputmode="numeric"></div>' +
    '<div class="form-group"><label>Bodyweight (lbs)</label><input type="number" id="n-bw" value="' + (APP.settings.bodyweight_lbs || '') + '" step="1" min="80" inputmode="decimal"></div></div>' +
    '<div id="n-ratio" style="font-size:12px;color:var(--muted);margin-bottom:10px"></div>' +
    '<div style="display:flex;align-items:center"><button class="btn btn-secondary btn-sm" onclick="saveNutritionGoal()">Save goal</button><span class="flash" id="ng-flash"></span></div></div>' +

    '<div class="card"><div class="card-title">Recent entries <span>' + logs.length + ' total</span></div>' +
    recent.map(r => '<div class="recent-item"><div><div class="recent-main">' + r.food_source + '</div><div class="recent-sub">' + fmtDate(r.date) + ' ' + (r.time || '') + (r.notes ? ' · ' + r.notes : '') + '</div></div><span style="font-size:16px;font-weight:600;color:var(--green)">' + r.protein_g + 'g</span></div>').join('') +
    (recent.length === 0 ? '<div class="empty-state">No entries yet</div>' : '') + '</div>';

  document.getElementById('n-source').addEventListener('change', function () {
    document.getElementById('n-custom-row').style.display = this.value === '__custom__' ? 'block' : 'none';
  });
  document.getElementById('n-goal').addEventListener('input', updateNutRatio);
  document.getElementById('n-bw').addEventListener('input', updateNutRatio);
  updateNutRatio();
}

function updateNutRatio() {
  const goal = parseFloat(document.getElementById('n-goal')?.value);
  const bw   = parseFloat(document.getElementById('n-bw')?.value);
  const el   = document.getElementById('n-ratio');
  if (!el) return;
  el.textContent = (goal && bw) ? '= ' + (goal / (bw * 0.453592)).toFixed(2) + ' g/kg bodyweight' : '';
}

async function submitNutrition() {
  const srcSel = document.getElementById('n-source').value;
  const food_source = srcSel === '__custom__' ? document.getElementById('n-custom-name').value.trim() : srcSel;
  if (!food_source) return;
  try {
    await POST('/api/nutrition/', {
      date: document.getElementById('n-date').value, time: document.getElementById('n-time').value,
      food_source, protein_g: document.getElementById('n-protein').value,
      calories: document.getElementById('n-cals').value || null, notes: document.getElementById('n-notes').value,
    });
    flash('n-flash', 'Logged!');
    const [todayData, logs] = await Promise.all([GET('/api/nutrition/today'), GET('/api/nutrition/')]);
    renderNutritionPage(document.getElementById('page-nutrition'), todayData, logs);
  } catch (err) { flash('n-flash', 'Error: ' + err.message); }
}

async function saveNutritionGoal() {
  const protein_goal_g = parseInt(document.getElementById('n-goal').value);
  const bodyweight_lbs = parseFloat(document.getElementById('n-bw').value) || null;
  try {
    APP.settings = await PUT('/auth/settings', { protein_goal_g, bodyweight_lbs });
    flash('ng-flash', 'Saved!');
  } catch (err) { flash('ng-flash', 'Error: ' + err.message); }
}

/* PROTOCOL */
let protoData  = [];
let takenToday = [];

async function loadProtocol() {
  const el = document.getElementById('page-protocol');
  el.innerHTML = '<div class="empty-state">Loading...</div>';
  try {
    const [items, doses] = await Promise.all([GET('/api/protocol/'), GET('/api/protocol/doses/today')]);
    protoData  = items;
    takenToday = doses.taken_ids || [];
    renderProtocolPage(el);
  } catch (err) { el.innerHTML = '<div class="empty-state">Error: ' + err.message + '</div>'; }
}

function renderProtocolPage(el) {
  const catBadge = { Peptide: 'badge-purple', Supplement: 'badge-teal', 'Vitamin / mineral': 'badge-green', 'Pre-workout': 'badge-amber', Recovery: 'badge-blue' };
  const active = protoData.filter(p => p.active);

  el.innerHTML =
    '<div class="card"><div class="card-title">Today\'s doses</div>' +
    (active.length === 0 ? '<div class="empty-state">No active protocol items</div>' :
    active.map(p => '<div class="dose-row" id="dose-row-' + p.id + '"><div><div class="dose-name">' + p.name + '</div><div class="dose-sub">' + (p.dose || '') + ' · ' + (p.timing || p.frequency || '') + '</div></div>' +
    '<button class="dose-btn ' + (takenToday.includes(p.id) ? 'taken' : '') + '" onclick="toggleDose(' + p.id + ', this)">' + (takenToday.includes(p.id) ? '✓ Taken' : 'Mark taken') + '</button></div>').join('')) +
    '</div>' +

    '<div class="card"><div class="card-title">Add protocol item</div>' +
    '<div class="form-row"><div class="form-group"><label>Name</label><input type="text" id="p-name" placeholder="e.g. Tesamorelin, Creatine"></div>' +
    '<div class="form-group"><label>Category</label><select id="p-cat"><option>Peptide</option><option>Supplement</option><option>Vitamin / mineral</option><option>Pre-workout</option><option>Recovery</option></select></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Dose</label><input type="text" id="p-dose" placeholder="e.g. 500mcg, 5g"></div>' +
    '<div class="form-group"><label>Frequency</label><select id="p-freq"><option>Daily</option><option>Twice daily</option><option>3x / week</option><option>Weekly</option><option>Pre-workout</option><option>Post-workout</option><option>Before bed</option></select></div></div>' +
    '<div class="form-row"><div class="form-group"><label>Route</label><select id="p-route"><option>Subcutaneous injection</option><option>Oral</option><option>Intramuscular injection</option><option>Topical</option><option>Sublingual</option></select></div>' +
    '<div class="form-group"><label>Timing</label><input type="text" id="p-timing" placeholder="e.g. Fasted, pre-bed"></div></div>' +
    '<div class="form-row single"><div class="form-group"><label>Goal / purpose</label><input type="text" id="p-goal" placeholder="e.g. Fat loss, GH pulse"></div></div>' +
    '<div style="display:flex;align-items:center"><button class="btn btn-primary" onclick="submitProtocol()">Add item</button><span class="flash" id="p-flash"></span></div></div>' +

    '<div class="card"><div class="card-title">Protocol <span>' + protoData.length + ' items</span></div>' +
    protoData.map(p =>
      '<div class="proto-item ' + (p.active ? '' : 'inactive') + '">' +
      '<div class="proto-header"><div><div class="proto-name">' + p.name + ' <span class="badge ' + (catBadge[p.category] || 'badge-gray') + '" style="margin-left:5px">' + p.category + '</span></div>' +
      '<div class="proto-dose">' + (p.dose || '') + ' · ' + (p.frequency || '') + '</div></div>' +
      '<div style="display:flex;gap:6px"><button class="btn btn-secondary btn-sm" onclick="toggleProtoActive(' + p.id + ',' + p.active + ')">' + (p.active ? 'Pause' : 'Resume') + '</button>' +
      '<button class="btn btn-danger btn-sm" onclick="deleteProto(' + p.id + ')">X</button></div></div>' +
      '<div class="proto-tags"><span class="tag tag-purple">⬡ ' + (p.route || 'Oral') + '</span>' +
      (p.timing ? '<span class="tag tag-gray">⏱ ' + p.timing + '</span>' : '') +
      (p.goal ? '<span class="tag tag-teal">◎ ' + p.goal + '</span>' : '') +
      '</div></div>').join('') +
    (protoData.length === 0 ? '<div class="empty-state">No items yet</div>' : '') + '</div>';
}

async function toggleDose(itemId, btn) {
  try {
    const res = await POST('/api/protocol/doses/toggle', { protocol_item_id: itemId });
    if (res.taken) { btn.textContent = '✓ Taken'; btn.classList.add('taken'); if (!takenToday.includes(itemId)) takenToday.push(itemId); }
    else { btn.textContent = 'Mark taken'; btn.classList.remove('taken'); takenToday = takenToday.filter(id => id !== itemId); }
  } catch (err) { alert(err.message); }
}

async function submitProtocol() {
  const name = document.getElementById('p-name').value.trim();
  if (!name) return;
  try {
    await POST('/api/protocol/', {
      name, category: document.getElementById('p-cat').value,
      dose: document.getElementById('p-dose').value, frequency: document.getElementById('p-freq').value,
      route: document.getElementById('p-route').value, timing: document.getElementById('p-timing').value,
      goal: document.getElementById('p-goal').value,
    });
    flash('p-flash', 'Added!');
    ['p-name', 'p-dose', 'p-timing', 'p-goal'].forEach(id => { document.getElementById(id).value = ''; });
    const [items, doses] = await Promise.all([GET('/api/protocol/'), GET('/api/protocol/doses/today')]);
    protoData = items; takenToday = doses.taken_ids || [];
    renderProtocolPage(document.getElementById('page-protocol'));
  } catch (err) { flash('p-flash', 'Error: ' + err.message); }
}

async function toggleProtoActive(id, active) {
  try { await PUT('/api/protocol/' + id, { active: !active }); loadProtocol(); } catch (err) { alert(err.message); }
}

async function deleteProto(id) {
  if (!confirm('Remove this item?')) return;
  try { await DEL('/api/protocol/' + id); loadProtocol(); } catch (err) { alert(err.message); }
}

/* IMPORT */
function loadImport() {
  const el = document.getElementById('page-import');
  el.innerHTML =
    '<div class="card"><div class="card-title">Import data</div>' +
    '<div class="src-tabs">' +
    '<button class="src-tab active" onclick="selImportSrc(\'strong\', this)">Strong</button>' +
    '<button class="src-tab" onclick="selImportSrc(\'garmin\', this)">Garmin</button>' +
    '<button class="src-tab" onclick="selImportSrc(\'apple\', this)">Apple Health</button>' +
    '</div>' +
    '<div class="src-panel active" id="ip-strong">' +
    '<div class="steps"><ol><li>Open Strong → Profile → Settings → Export Data</li><li>Export as CSV and save</li><li>Upload below</li></ol></div>' +
    '<div class="import-zone" onclick="document.getElementById(\'f-strong\').click()">' +
    '<input type="file" id="f-strong" accept=".csv" onchange="handleImport(this,\'strong\')">' +
    '<div class="import-title">Drop Strong CSV or tap to browse</div>' +
    '<div class="import-sub">Imports: exercise, sets, reps, weight, RPE</div></div>' +
    '<div class="import-result" id="res-strong"></div></div>' +
    '<div class="src-panel" id="ip-garmin">' +
    '<div class="steps"><ol><li>Go to connect.garmin.com → Activities</li><li>Export FIT file</li><li>Upload below</li></ol></div>' +
    '<div class="import-zone" onclick="document.getElementById(\'f-garmin\').click()">' +
    '<input type="file" id="f-garmin" onchange="handleImport(this,\'garmin\')">' +
    '<div class="import-title">Drop Garmin FIT file or tap to browse</div>' +
    '<div class="import-sub">Imports: distance, time, split, HR, watts</div></div>' +
    '<div class="import-result" id="res-garmin"></div></div>' +
    '<div class="src-panel" id="ip-apple">' +
    '<div class="steps"><ol><li>Health app → Profile → Export All Health Data</li><li>Unzip and upload export.xml</li></ol></div>' +
    '<div class="import-zone" onclick="document.getElementById(\'f-apple\').click()">' +
    '<input type="file" id="f-apple" accept=".xml" onchange="handleImport(this,\'apple\')">' +
    '<div class="import-title">Drop export.xml or tap to browse</div>' +
    '<div class="import-sub">Imports: weight, body fat, lean mass, workouts</div></div>' +
    '<div class="import-result" id="res-apple"></div></div></div>' +
    '<div class="card"><div class="card-title">Import history</div><div id="import-history"><div class="empty-state">No imports yet</div></div></div>';
}

function selImportSrc(src, btn) {
  document.querySelectorAll('.src-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.src-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('ip-' + src).classList.add('active');
}

function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = []; let cur = '', inQ = false;
    for (const c of line) { if (c === '"') { inQ = !inQ; } else if (c === ',' && !inQ) { vals.push(cur.trim()); cur = ''; } else cur += c; }
    vals.push(cur.trim());
    const obj = {}; headers.forEach((h, i) => obj[h] = vals[i] || ''); return obj;
  });
}

async function handleImport(input, src) {
  const file = input.files[0]; if (!file) return;
  const resEl = document.getElementById('res-' + src);
  try {
    let result;
    if (src === 'strong') { const text = await file.text(); result = await importStrong(text); }
    else if (src === 'garmin') { result = await importGarmin(file); }
    else if (src === 'apple') { const text = await file.text(); result = await importApple(text); }
    resEl.className = 'import-result result-ok'; resEl.style.display = 'block';
    resEl.textContent = 'Imported ' + result.added + ' records' + (result.skipped ? ' (' + result.skipped + ' duplicates skipped)' : '');
    addImportHistory(src, result);
  } catch (err) {
    resEl.className = 'import-result result-err'; resEl.style.display = 'block';
    resEl.textContent = 'Error: ' + err.message;
  }
  input.value = '';
}

async function importStrong(text) {
  const rows = parseCSV(text);
  const items = rows.filter(r => r['Date'] && r['Exercise Name'] && r['Reps']).map(r => ({
    date: r['Date'].slice(0, 10), exercise: r['Exercise Name'], sets: 1,
    reps: parseInt(r['Reps']) || 1, weight_lbs: parseFloat(r['Weight']) || 0,
    rpe: parseFloat(r['RPE']) || null, source: 'Strong',
  }));
  return await POST('/api/strength/bulk', items);
}

async function importGarmin(file) {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/import/garmin', { method: 'POST', credentials: 'same-origin', body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Import failed');
  return data;
}

async function importApple(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const wmap = {};
  doc.querySelectorAll('Record').forEach(rec => {
    const type = rec.getAttribute('type') || '';
    const val  = parseFloat(rec.getAttribute('value') || 0);
    const date = (rec.getAttribute('startDate') || '').slice(0, 10);
    if (!date) return;
    if (type.includes('BodyMass') && !type.includes('Lean')) {
      const lbs = rec.getAttribute('unit') === 'kg' ? val * 2.20462 : val;
      if (!wmap[date]) wmap[date] = { date, weight_lbs: +lbs.toFixed(1), body_fat_pct: null, muscle_mass_lbs: null, source: 'Apple Health' };
    }
    if (type.includes('BodyFatPercentage') && wmap[date]) wmap[date].body_fat_pct = +(val > 1 ? val : val * 100).toFixed(1);
    if (type.includes('LeanBodyMass') && wmap[date]) { const lbs = rec.getAttribute('unit') === 'kg' ? val * 2.20462 : val; wmap[date].muscle_mass_lbs = +lbs.toFixed(1); }
  });
  const bodyItems = Object.values(wmap);
  const bodyRes = bodyItems.length ? await POST('/api/body/bulk', bodyItems) : { added: 0, skipped: 0 };
  const rowItems = [];
  doc.querySelectorAll('Workout').forEach(w => {
    const type = (w.getAttribute('workoutActivityType') || '').toLowerCase();
    const date = (w.getAttribute('startDate') || '').slice(0, 10);
    if (!date || !type.includes('row')) return;
    const dist = Math.round(parseFloat(w.getAttribute('totalDistance') || 0) * 1000);
    const dur = parseFloat(w.getAttribute('duration') || 0);
    const m = Math.floor(dur); const s = Math.round((dur % 1) * 60);
    rowItems.push({ date, session_type: 'Apple Health', distance_m: dist, duration: m + ':' + (s < 10 ? '0' : '') + s, source: 'Apple Health' });
  });
  const rowRes = rowItems.length ? await POST('/api/rowing/bulk', rowItems) : { added: 0, skipped: 0 };
  return { added: bodyRes.added + rowRes.added, skipped: bodyRes.skipped + rowRes.skipped };
}

function addImportHistory(src, result) {
  const el = document.getElementById('import-history');
  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const labels = { strong: 'Strong', garmin: 'Garmin', apple: 'Apple Health' };
  const classes = { strong: 'badge-blue', garmin: 'badge-teal', apple: 'badge-purple' };
  const row = document.createElement('div');
  row.className = 'recent-item';
  row.innerHTML = '<div><div class="recent-main"><span class="badge ' + classes[src] + '">' + labels[src] + '</span> ' + result.added + ' added, ' + result.skipped + ' skipped</div><div class="recent-sub">' + now + '</div></div>';
  if (el.querySelector('.empty-state')) el.innerHTML = '';
  el.prepend(row);
}

/* SERVICE WORKER */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js').catch(err => console.warn('SW:', err));
  });
}

/* PASSWORD RESET */
function showForgotPassword() {
  const section = document.getElementById('forgot-pw-section');
  section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

async function requestReset() {
  const username = document.getElementById('forgot-username').value.trim();
  const msgEl = document.getElementById('reset-msg');
  msgEl.textContent = '';
  if (!username) { msgEl.style.color = 'var(--red)'; msgEl.textContent = 'Please enter your username.'; return; }
  try {
    const data = await POST('/auth/reset/request', { username });
    msgEl.style.color = 'var(--green)';
    msgEl.textContent = data.message || 'Reset email sent.';
  } catch (err) {
    msgEl.style.color = 'var(--red)';
    msgEl.textContent = err.message;
  }
}

async function confirmReset() {
  const password = document.getElementById('reset-new-pw').value;
  const confirm  = document.getElementById('reset-confirm-pw').value;
  const errEl    = document.getElementById('reset-error');
  errEl.textContent = '';
  if (password !== confirm) { errEl.textContent = 'Passwords do not match.'; return; }
  if (password.length < 6)  { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) { errEl.textContent = 'Invalid reset link.'; return; }
  try {
    await POST('/auth/reset/confirm', { token, password });
    window.history.replaceState({}, document.title, '/');
    document.getElementById('reset-screen').style.display = 'none';
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('auth-error').style.color = 'var(--green)';
    document.getElementById('auth-error').textContent = 'Password reset! Please sign in.';
    document.getElementById('email-row').style.display = authMode === 'register' ? 'block' : 'none';
  } catch (err) { errEl.textContent = err.message; }
}

// Check for reset token on page load
(function checkResetToken() {
  const token = new URLSearchParams(window.location.search).get('token');
  if (token && window.location.pathname === '/reset-password') {
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('reset-screen').style.display = 'flex';
      document.getElementById('auth-screen').classList.add('hidden');
    });
  } else if (window.location.pathname !== '/') {
    window.history.replaceState({}, document.title, '/');
  }
})();

/* BOOT */
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  ['auth-username', 'auth-password'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') authSubmit(); });
  });
});
