# Gym Log — project guide for Claude

Personal, **local-only** gym tracker for one user (Omar). Built on the exercise dataset in `data/`.
No auth, no cloud: runs on Omar's Windows PC and is opened in the browser (optionally on a phone on the same Wi-Fi).

Session history lives in `docs/sessions/` — read the latest one for context on recent work and open ideas.

## Run, seed, test

```
npm install
npm start          # http://127.0.0.1:3000  (seeds automatically if the DB is empty)
npm run dev        # same, with node --watch
npm run seed       # (re)load data/exercises.json + images/ + videos/ into the DB — idempotent
npm test           # node:test suite (test/*.test.js) — keep it green
```

- Node **22.13+** — uses the built-in `node:sqlite` (`DatabaseSync`). Do **not** reintroduce `better-sqlite3`: its prebuilt binary segfaulted on this machine.
- Env vars: `PORT` (default 3000), `HOST` (default `127.0.0.1`; `0.0.0.0` for phone access), `GYM_DB` (path to a different DB file — use this for demo/test data, never pollute the real DB).
- npm scripts pass `--disable-warning=ExperimentalWarning` because `node:sqlite` is flagged experimental.

## Stack and layout

Express 5 + EJS server-rendered pages, vanilla JS for interactive bits, Chart.js (served from `node_modules`), fonts bundled via `@fontsource` (works offline). No build step.

```
src/server.js          app setup, res.locals (unit, live workout, flash/tone, active nav)
src/db.js              openDb() → repo with every query (one place for SQL)
src/schema.sql         tables (CREATE IF NOT EXISTS — runs on every start)
src/lib/units.js       kg↔lb
src/lib/stats.js       e1RM (Epley), volume, PRs, session summaries
src/lib/muscles.js     heat-map regions, muscle-name→region map, scoring rules, recency buckets, training-log calendar
src/lib/bodymap.js     front/back body SVG generator (home heat map + library muscle picker)
src/lib/format.js      date/number helpers exposed to views as `fmt`
src/lib/icons.js       inline SVG icons exposed to views as `icon()`
src/routes/*.js        one router per area; api.js = JSON for interactive pages
views/                 EJS; partials/head.ejs + foot.ejs wrap every page
public/js/             logger, routine builder, exercise picker/library, charts, home, toast, confirm, muscle-scores
scripts/seed.js        dataset → DB, plus 4 starter routines
test/                  lib.test.js, db.test.js (in-memory DB), muscles.test.js
```

## Data model (SQLite, `db/gym.sqlite`, gitignored)

- `exercises` (dataset ids `0001`…, custom ids `C0001`…; JSON columns for secondary muscles / instructions)
- `exercise_media` — image + GIF **BLOBs** (Omar wanted media in the DB). `images/` and `videos/` folders are only the seed source and are gitignored.
- `exercise_muscles` — points per working set for each muscle an exercise lists (0–3). Defaults: target 3, helper 2 if it's a prime mover in a compound lift, else 1 (`defaultMusclePoints` in muscles.js). Editable per exercise; `muscle_defaults_version` setting upgrades unedited exercises when the rules change.
- `routines`, `routine_exercises`; `workouts` (in progress while `finished_at` is NULL), `workout_exercises`, `sets` (weight + **unit stored per set**, reps, is_warmup, done)
- `settings` (display_unit, bar_kg, bar_lb, muscle_defaults_version)

Stats only count **working sets**: `done = 1 AND is_warmup = 0 AND reps > 0` (`WORKING_SQL` in db.js).

## Domain rules worth knowing

- **Units:** each set keeps the unit it was logged in; totals/charts/PRs convert to the Settings display unit. Switching an exercise's unit in the logger converts its sets (rounded to 0.25).
- **Recovery heat map (Home):** per region, points = Σ sets × muscle score per day; a muscle counts as trained on a day at ≥ 3 points. Colour by days since: today red, 1–3 yellow, 4–5 green, 6+ blue, never grey. Fill opacity = intensity.
- **Training log (Home):** calendar year Jan–Dec, **weeks start Saturday**, two views — exercise-count levels (1–3, 4, 5, 6, 7+) and an emoji per day for the most-trained area. Legend items are filters. Year paging (first logged year … +5) swaps the partial in place via `GET /training-log?year=`.
- **Exercise library:** live search/filters and a clickable body figure (front/back toggle). Multiple muscles = exercises that work **all** of them (score > 0), ranked by combined score; falls back to closest matches with `partial`.
- **Dates:** build day sequences by offset at **noon** (`new Date(y, 0, 1 + i, 12)`) — Egypt's DST changes at local midnight, stepping midnights drops days.

## UI conventions

- Design tokens on `:root` in `public/css/app.css`, dark mode via `prefers-color-scheme` and `data-theme`. Plate colours (`--plate-red/blue/yellow/green`) mean weight/training; don't use them as decoration.
- Fonts: Saira Semi Condensed (display/numbers), Atkinson Hyperlegible (body).
- Every page must work at 390 px wide (bottom tab bar on mobile, side rail on desktop).
- **No full-page reloads for in-page interactions** (Omar dislikes flicker): fetch and swap a fragment, `history.replaceState` the URL, fall back to a normal navigation on error.
- Messages: redirect with `?msg=…` (`&tone=error` for errors) → shown as top-right stacking toasts (15 s, pause on hover). In JS use `window.toast(msg, { tone })`.
- Destructive actions: add `data-confirm` (+ `data-confirm-title`, `data-confirm-label`) to the form, or `await confirmDialog({...})` in JS. Never `window.confirm`.
- Copy: sentence case, plain verbs, buttons say what happens ("Delete routine", "Finish workout").

## Git / GitHub

- `main` is the default branch; feature work goes on a branch (e.g. `fixes`) and is merged with `--no-ff`.
- Remote: `origin` → https://github.com/TheCoderOmar/gym-logging (private). Git's stored GitHub login is the **TheCoderOmar** account.
- Never commit `db/`, `images/`, `videos/`, `node_modules/`.

## Working notes for Claude

- Verify UI changes visually: start a demo server on another port with `GYM_DB=<scratch copy> PORT=3001`, drive headless Edge over CDP (`--remote-debugging-port`), screenshot at 1280–1500 px and 390 px, light and dark. Desktop headless windows have a minimum width — use `Emulation.setDeviceMetricsOverride` for real phone widths.
- Make a demo DB by downloading `/settings/backup` from the running server into the scratchpad, then add fake workouts with `openDb()` + repo functions.
- In Git Bash, `node -e "…"` with template-literal backticks gets mangled by the shell — use the Edit/Write tools for JS containing backticks.
- After changing server code, restart the background `npm start` (the old process keeps serving stale code); make sure nothing else holds port 3000.
