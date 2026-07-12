# FitLog

A Strong-inspired workout tracker built as a single-file React app (no build step) with a Flask + SQLite backend. Hosted at `fitlog.mg42apps.com`.

## Stack

- **Frontend**: Vanilla React (via CDN + in-browser Babel), single file — `static/ppl-tracker.js`
- **Backend**: Flask + SQLite (`app.py`)
- **Hosting**: PythonAnywhere
- **Push notifications**: Web Push via `pywebpush` + `APScheduler`, VAPID keys shared with PeptideTrack

## Features

- **Workout tab** — PM Push/Pull/Legs, RRB Push/Pull/Legs, PF Sat quick-access strip; wall-clock rest timer with sound (chime/beep/silent); Web Worker-backed background timer that survives app backgrounding
- **Active workout** — mid-workout editing (add/remove sets, swap exercise, change rest timer, delete exercise), set type tagging (Normal/Warm-up/Failure), edit completed sets inline, Save as New Routine, wake lock, live elapsed timer
- **Routines tab** — 2-column grid grouped by gym/category folders (Power Matrix, Anthropic, RRB, Gold's, Planet Fitness, etc.), last-used relative timestamps, drag-to-reorder, multiselect archive/restore, full routine editor
- **History tab** — month-grouped session cards with exercise list + best set inline, expandable detail view, session rename, edit/delete individual sets, save any past session as a new routine
- **Exercises tab** — alphabetical A-Z jump list, body part + equipment type filters (auto-detected from name, manually overridable), best set shown inline, create/edit exercises with custom rest timers
- **Schedule tab** — weekly day-by-workout assignment, "today's workout" banner on the Workout tab
- **Settings** — rest timer defaults (global + per-exercise), consistency streak tracker, CSV/JSON export, Strong CSV import (with choice to import history/routines/both), archived routines management
- **Program builder** — define multi-week training blocks with per-exercise weekly progression targets
- **Push notifications** — rest timer completion fires a push notification even when the app is backgrounded, via server-scheduled APScheduler jobs

## Data model

- Workouts (routines) persist server-side via `/api/workouts`, with a hardcoded `DEFAULT_WORKOUTS` set always merged in on load so core routines can never be lost to stale client data
- Logs persist per-exercise via `/api/logs/<exercise_id>`, keyed by exercise ID, each entry storing date/weight/reps/e1RM/set type/workout name
- Sessions are reconstructed from logs by grouping entries within a time window, with workout names resolved by priority: user rename → stored Strong import name → exercise-overlap best guess

## Setup

1. Clone this repo to `/home/madfella/mg42fitlab` (or your PythonAnywhere app directory)
2. Create a virtualenv and install: `flask`, `pywebpush`, `apscheduler`
3. Set WSGI environment variables: `SECRET_KEY`, `FITLOG_USER`, `FITLOG_PASS`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIM_EMAIL`
4. Reload the web app on PythonAnywhere

## Known gotchas

- Deploy target for the tracker JS is `static/ppl-tracker.js` — the working/output filename is `ppl-tracker-complete.js`, must be renamed on upload
- Strong CSV exports use rest-timer phantom rows (`W:0 R:0 Secs>0`) which are filtered out during import
- `DEFAULT_WORKOUTS` protected keys are always re-merged on load to prevent stale localStorage/server data from hiding core routines after code updates
