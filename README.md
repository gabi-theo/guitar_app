# ShredTrainer

Guitar speed-training web app: practice predefined exercises for advanced
techniques (alternate picking, legato, two-hand tapping — sweep picking in
Phase 2) against an interactive, Songsterr-style tab with live pitch/timing
scoring through the microphone.

## Stack

- **Backend** — Django + DRF, PostgreSQL, Redis, SimpleJWT (Celery + Channels arrive in Phases 2/3)
- **Frontend** — React + TypeScript + Vite, Zustand, Web Audio API + AudioWorklet (McLeod Pitch Method)
- **Infra** — Docker Compose for Postgres + Redis

## Dev setup

```sh
# infrastructure (Postgres on host port 5433 — 5432 is taken by a native install)
docker compose up -d

# backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py seed_exercises
.venv\Scripts\python manage.py runserver 8000

# frontend (separate shell)
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api to :8000)
```

Run backend tests: `cd backend && .venv\Scripts\python -m pytest`

## Deployment (Vercel frontend + hosted backend)

The frontend deploys to Vercel as a static SPA; the Django API must be hosted
separately (Railway, Render, Fly.io, a VPS — anything that runs
Django + Postgres + Redis).

**Frontend (Vercel):**

1. Import the repo in Vercel and set **Root Directory** to `frontend`
   (framework auto-detects as Vite; `frontend/vercel.json` adds the SPA
   fallback so client-side routes work on refresh).
2. Set the environment variable `VITE_API_URL` to the deployed API, including
   the `/api` prefix — e.g. `https://your-backend.example.com/api`. When
   unset, the app falls back to `/api` (the local Vite dev proxy).

**Backend (wherever it's hosted):**

- `SECRET_KEY` — required; `DEBUG=0`.
- `ALLOWED_HOSTS` — comma-separated backend hostnames.
- `CORS_ALLOWED_ORIGINS` — comma-separated frontend origins, e.g.
  `https://shredtrainer.vercel.app`. Any `https://*.vercel.app` origin is
  also allowed via regex so Vercel preview deploys work (safe here: auth is
  Bearer-token, not cookie-based).
- `DB_NAME`/`DB_USER`/`DB_PASSWORD`/`DB_HOST`/`DB_PORT`, `REDIS_URL`.
- Run `manage.py migrate` and `manage.py seed_exercises` once per environment.

Mic access requires HTTPS in production; Vercel provides it out of the box.

Mic access works on `http://localhost` without HTTPS. Use headphones while
practicing so the metronome/synth doesn't bleed into the microphone.

## How scoring works

- The exercise's `note_pattern` JSON (backend `exercises.Exercise`) is the
  single source of truth driving the tab renderer, the preview synth, and the
  scoring engine.
- In the browser, an AudioWorklet analyses the mic (pitch via MPM + RMS
  envelope); onsets are matched against expected note times on the shared
  AudioContext clock. `timing_accuracy` = onsets within a tolerance window
  (narrows with BPM), `pitch_accuracy` = matched onsets with the right pitch.
- The server recomputes `accuracy = (timing + pitch) / 2` and
  `score = accuracy × bpm_achieved` (no pass threshold — every attempt scores).
- Audio upload / server-side re-verification was cut from scope (the
  `audio`/`verified` model fields remain but nothing populates them). If
  competitive features land later, how leaderboards treat unverified
  client-scored attempts needs to be decided first.

## Phasing

1. **Done — core practice loop**: auth, exercise library + seed data,
   interactive tab (playhead, auto-scroll, loop regions, note-preview synth,
   metronome), live scoring, personal history.
2. **Done — practice QoL**: guitar tuner page (needle, cents, per-string
   targets), sound check gate before the first attempt of a session, history
   table with technique/exercise/passed filters, sortable columns, pagination.
   (MediaRecorder upload + Celery re-verification: excluded by decision.)
3. **Done — competitive v1**: sweep picking exercises, global per-exercise
   leaderboards (best attempt per user, computed on read), async
   challenges (same exercise + BPM, auto-resolves when both attempts are in,
   draw on tie), UI restyle. Scores are client-computed — see note above.
4. **Done — progression v1**:
   - **Dashboard** (`/dashboard`): streak/attempts/accuracy/best-score stat
     tiles, per-day evolution chart (score / accuracy / top BPM, 30d–1y,
     technique filter; `/api/stats/overview/`, `/api/stats/progress/`),
     per-technique breakdown.
   - **Daily challenges** (`goals` app): three per day (consolidate / push /
     explore) generated from practice history on first request
     (`/api/goals/daily/`), auto-completed by matching attempts via signal.
   - **Objectives** with adaptive target dates: reach a BPM at an accuracy on
     an exercise by a date; the date is re-projected from the measured
     effective-BPM gain per day after every relevant attempt
     (`/api/objectives/`). `initial_target_date` keeps the original plan so
     the UI shows ahead/behind.
   - **Custom exercises**: users create/edit/delete their own (private or
     shared with everyone) in a tab-preview editor (`/exercises/new`);
     deleting deactivates so attempt history survives. Library filters:
     built-in / mine / community.
   - 12 more seeded exercises (7–8 per technique).
5. Later: live duels (Django Channels + Redis, websockets).
