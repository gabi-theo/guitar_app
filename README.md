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

## Deployment (all on Vercel)

Production: **https://shredtrainer.vercel.app** — two Vercel projects deploy
from this repo on every push to `main`:

- **`shredtrainer`** (Root Directory `frontend`) — static Vite SPA.
  `frontend/vercel.json` proxies `/api/*` to the backend project
  (same-origin, so no CORS in the browser) and adds the SPA fallback so
  client-side routes survive refresh.
- **`shredtrainer-api`** (Root Directory `backend`) — Django on Vercel's
  Python serverless runtime (`backend/vercel.json` builds `config/wsgi.py`,
  which exposes the `app` callable). Env vars: `SECRET_KEY`, `DEBUG=0`, and
  `DATABASE_URL` injected by the Neon Postgres marketplace integration
  (`settings.py` prefers `DATABASE_URL` over the discrete `DB_*` vars).

Redis is not deployed — nothing uses it yet (the `REDIS_URL` setting is a
placeholder for Phase 5).

Migrations/seeding run locally against the production DB (Vercel functions
are request-scoped): `vercel env pull`, then run `manage.py migrate` /
`seed_exercises` with `DATABASE_URL` set to the pulled
`DATABASE_URL_UNPOOLED` value.

Serverless caveats: cold starts after idle; no websockets (Phase 5 live
duels will need a different backend host); Django admin works but unstyled
(no static file serving). Mic access requires HTTPS — Vercel provides it.

If the backend ever moves off Vercel: set `VITE_API_URL` on the frontend
project to the new API base (including `/api`) — the axios client prefers it
over the same-origin `/api` proxy — and allow the frontend origin via the
backend's `CORS_ALLOWED_ORIGINS`/`ALLOWED_HOSTS` env vars.

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
