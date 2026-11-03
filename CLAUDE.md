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

- Desktop shortcut "Gym Log" → `C:\mainPC\Launchers\Gym Log.bat` (outside the repo, with the YT Downloader and Job Applications launchers and their `.ico` files): starts `npm.cmd start` minimized with `HOST=0.0.0.0` (so the phone can sync) if :3000 isn't listening, then opens the browser. The port variable is `APP_PORT`, never `PORT`, which the started server would inherit.
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
src/lib/bodymap.js     front/back body SVG generator (home heat map + library muscle picker) + muscle-head close-ups
src/lib/heads.js       muscle heads: head list per region, name→head rules, effective head scores, headStatus
src/lib/sports.js      sports days: football/padel muscle points, 30 min = 1 set, sportRows() → exerciseLog-shaped rows
src/lib/format.js      date/number helpers exposed to views as `fmt`
src/lib/icons.js       inline SVG icons exposed to views as `icon()`
src/routes/*.js        one router per area; api.js = JSON for interactive pages
views/                 EJS; partials/head.ejs + foot.ejs wrap every page
public/js/             logger, routine builder, exercise picker/library, charts, home, toast, confirm, muscle-scores, sports, media-hover (hover-to-play GIFs, loaded on every page)
scripts/seed.js        dataset → DB, plus 4 starter routines
test/                  lib.test.js, db.test.js (in-memory DB), muscles.test.js, heads.test.js, sports.test.js
```

## Data model (SQLite, `db/gym.sqlite`, gitignored)

- `exercises` (dataset ids `0001`…, custom ids `C0001`…; JSON columns for secondary muscles / instructions)
- `exercise_media` — image + GIF **BLOBs** (Omar wanted media in the DB). `images/` and `videos/` folders are only the seed source and are gitignored.
- `exercise_muscles` — points per working set for each muscle an exercise lists (0–3). Defaults: target 3, helper 2 if it's a prime mover in a compound lift, else 1 (`defaultMusclePoints` in muscles.js). Editable per exercise; `muscle_defaults_version` setting upgrades unedited exercises when the rules change.
- `routines`, `routine_exercises`; `workouts` (in progress while `finished_at` is NULL), `workout_exercises`, `sets` (weight + **unit stored per set**, reps, is_warmup, done)
- `exercise_heads` — **only head scores Omar edited** (0–3). Defaults are never stored: they're computed from the exercise name by the rules in `heads.js`, so improving a rule reaches every unedited head. Only the heads actually edited are stored (storing the rest would freeze values capped by a temporarily lowered muscle score).
- `sport_sessions` (sport, played_on at local noon, minutes, notes) — sports themselves and their muscles are defined in `src/lib/sports.js`, not in the DB.
- `settings` (display_unit, bar_kg, bar_lb, muscle_defaults_version)

Stats only count **working sets**: `done = 1 AND is_warmup = 0 AND reps > 0` (`WORKING_SQL` in db.js). Finishing a workout (or "Done editing" a finished one) auto-ticks every set that has reps, so Omar can just type weight × reps without tapping ✓. A set with a weight but no reps gets the grey reps hint the logger showed: last time's reps for that set, else **12** (`DEFAULT_REPS`). New exercises in a workout or routine start with **rest 0** (`DEFAULT_REST_SECONDS`). Both are just defaults Omar can change.

## Domain rules worth knowing

- **Units:** each set keeps the unit it was logged in; totals/charts/PRs convert to the Settings display unit. Switching an exercise's unit in the logger converts its sets (rounded to 0.25).
- **Recovery heat map (Home):** per region, points = Σ sets × muscle score per day; a muscle counts as trained on a day at ≥ 3 points. Colour by days since: today red, 1–3 yellow, 4–5 green, 6+ blue, never grey. Fill opacity = intensity.
- **Sets per muscle (Home, next to the map):** working sets each region got in the **last 7 days, rolling** (`weeklySets` + `startOfLastDays(7)` in muscles.js — Omar chose rolling after a Friday football session vanished when the Saturday week reset), weighted by score (target 1, 2-point helper ⅔, 1-point helper ⅓), with a 10–20 sets/week band and a key. Sports add a **green bonus segment** after the gym segment (same weight as the map: 30 min = 1 set × score/3); the number is the total, the row title shows the split ("6 gym + 6 sports"), and sports time is also listed underneath. Gym bars keep one colour; under-10 rows only dim the number. **10–20 (on target)** rows get a flickering two-tone flame (`flame` in icons.js) by the number and a slow shine over the filled bar; both stop under `prefers-reduced-motion`. Tones are judged on the **rounded number shown** (a "10" always gets its flame). It replaced a recency list that only repeated the map (Omar: the card should give *different* info). The "This week" stats card is the calendar week from Saturday (`startOfTrainingWeek`).
- **Sports vs sets wording:** sport rows carry `sets` only as map weight (30 min = 1); anything shown to Omar says time played (`activityText`: "Football 3 h", "4 sets + Football 3 h").
- **Muscle heads (Home):** clicking chest, shoulders, biceps, triceps, forearms, abs, quads or lats opens a popup (`GET /muscles/:region` fragment) with a close-up split into heads, coloured exactly like the map. Heads appear **only** there, never on the main figure (Omar's request). The dataset has no head data: rules guess from the exercise name (main head = the region score, "some" = 1), heads are capped at the exercise's region score, and a region scored 0 contributes nothing. Editable under "Heads" on each exercise page.
- **Training log (Home):** calendar year Jan–Dec, **weeks start Saturday**, two views — exercise-count levels (1–3, 4, 5, 6, 7+) and an emoji per day for the most-trained area. Legend items are filters. Year paging (first logged year … +5) swaps the partial in place via `GET /training-log?year=`.
- **Exercise search is forgiving** (PC `searchStems` + `SQUEEZED_NAME` in db.js, same logic in `public/m/app.js`): case, spaces/hyphens/brackets/apostrophes and a plural "s" are ignored ("Pull ups" and "pullup" find "pull-up"). Search inputs use `enterkeyhint="search"`; Enter runs the search and blurs so the iPhone keyboard closes.
- **Picker dialog has an explicit height** (`dvh`, follows the iPhone keyboard) and `.picker-results { flex: 1 1 auto; min-height: 0 }` — without it iPhone Safari collapsed the results list to nothing.
- **Exercise library:** live search/filters and a clickable body figure (front/back toggle). Multiple muscles = exercises that work **all** of them (score > 0), ranked by combined score; falls back to closest matches with `partial`.
- **Dates:** build day sequences by offset at **noon** (`new Date(y, 0, 1 + i, 12)`) — Egypt's DST changes at local midnight, stepping midnights drops days.
- **Workouts are date-only** (Omar's request): no clock, start/finish times or duration anywhere. `started_at` holds the chosen day at local noon (`fmt.dayIso`); the logger has a date field (defaults to today, no future dates). `finished_at` is only the "finished" flag. Older workouts still have real times stored — never display them.
- **Sports days:** "Log sport" on Home (shown even mid-workout) → `/sports/new`. Football ⚽ and padel 🎾 only. Every 30 minutes = 1 working set; each sport has fixed muscle points (0–3). `activityLog()` in `routes/home.js` merges `sportRows()` into the map, head popups and training log; `repo.listHistory({ kind })` mixes sessions with workouts in History and Home's "Recent activity", each with an All / Workouts / Sports filter (`src/lib/history.js`, swapped in place by `public/js/history-filter.js`). No emoji on sport rows, titles or the Log sport button (Omar's request) — only the calendar's emoji view uses ⚽/🎾. Session page `/sports/:id` shades the muscles it works, with edit and delete.
- **Hover-to-play:** thumbnails with `data-anim="<id>"` grow into a playing preview on hover (picker, logger, routine builder); `data-anim-mode="swap"` plays in place (exercise library cards, with `data-anim-card` on the tile). Mouse only.
- **Freestyle workouts:** Omar mostly trains without a routine. "Start workout" on Home opens the logger with the exercise picker already open (`?add=1`).

## UI conventions

- Design tokens on `:root` in `public/css/app.css`, dark mode via `prefers-color-scheme` and `data-theme`. Plate colours (`--plate-red/blue/yellow/green`) mean weight/training; don't use them as decoration.
- Fonts: Saira Semi Condensed (display/numbers), Atkinson Hyperlegible (body).
- Every page must work at 390 px wide (bottom tab bar on mobile, side rail on desktop).
- **Home top row:** map panel + 340 px side column (This week, Sets per muscle), sized up at Omar's request via `.home-grid …` overrides. On desktop both columns stretch to the same height so the card bottoms line up (Omar notices misalignment — check it after layout changes).
- **No full-page reloads for in-page interactions** (Omar dislikes flicker): fetch and swap a fragment, `history.replaceState` the URL, fall back to a normal navigation on error.
- Messages: redirect with `?msg=…` (`&tone=error` for errors) → shown as top-right stacking toasts (15 s, pause on hover). In JS use `window.toast(msg, { tone })`.
- Destructive actions: add `data-confirm` (+ `data-confirm-title`, `data-confirm-label`) to the form, or `await confirmDialog({...})` in JS. Never `window.confirm`.
- Copy: sentence case, plain verbs, buttons say what happens ("Delete routine", "Finish workout").

## iPhone app (`/m`, branch `iphone-offline`, Oct 2026)

Offline home-screen web app: logs workouts/sports at the gym with no connection, shows the map/heads/sets-per-muscle/history from a local snapshot, and **Sync** (home Wi-Fi, PC app running) sends phone records to the PC and pulls a fresh snapshot.
- Static app in `public/m/` (`index.html`, `app.js` hash-routed screens, `store.js` IndexedDB kv: `snap`/`pending`/`live`/`lastSync`, `sw.js` service worker, `m.css`, manifest + icons). `src/routes/mobile.js` serves `src/lib/*` wrapped for `public/m/require.js` — the phone runs the **same** map/heads/sets/sports code (test in `test/mobile.test.js` checks the SVG matches).
- `POST /api/sync` → `repo.importFromPhone` (idempotent by `client_id`, all-or-nothing, finished via `finishWorkout`) + `repo.snapshotForPhone`. Finished workouts can be edited on the phone ("Edit workout" reopens the logger): the edit is sent with `edited: true` and replaces the PC workout (PC workouts have client_id `pc-<id>`; phone wins over PC changes made meanwhile). History has a search box (name, exercises, notes).
- iOS needs https for offline web apps: `node scripts/make-cert.js` → gitignored `certs/` (local CA + 397-day server cert); server also listens on `HTTPS_PORT` (3443) when certs exist; phone needs `HOST=0.0.0.0`. CA download: `/m/ca.crt`. Re-run make-cert if the PC's IP changes.
- Compressed animations: `python scripts/make-mobile-media.py` → gitignored `mobile-media/` (160 px WebP, ~57 MB), downloaded by the phone after a sync.
- Test on desktop at `http://localhost:<port>/m/` (localhost counts as secure, so the service worker runs); offline via CDP `Network.emulateNetworkConditions` (also on the service-worker target).
- **Omar's setup:** PC `DESKTOP-HID262V` at `192.168.1.2`. Start for the phone with `$env:HOST="0.0.0.0"; npm.cmd start` (PowerShell blocks `npm.ps1` — use `npm.cmd`, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`); allow Node on Private networks in the firewall. CA via `http://192.168.1.2:3000/m/ca.crt` → Settings → Profile → Install → General → About → Certificate Trust Settings → "Gym Log local".
- **Sync says "Can't reach your PC" instantly** (Oct 2026): check, in order, (1) the server was started with `HOST=0.0.0.0`: plain `npm start` listens on 127.0.0.1 only; (2) the iPhone still trusts the CA: a TLS log showed `alert certificate unknown` from the phone (192.168.1.46), fixed by removing the old "Gym Log local" profile, reinstalling `/m/ca.crt` and turning it on in Certificate Trust Settings. The app shows that message for any fetch `TypeError`, so a handshake failure looks like no network. To debug, temporarily log `tlsClientError` on the https server and non-local requests in `server.js`. A failed import now comes back as JSON `{ error }` (shown as "Sync failed: …").
- **Install from `https://192.168.1.2:3443/m/` only**, Share → Add to Home Screen with **"Open as Web App" on**. An icon added from a PC page (`/workouts/...`) opens in Safari, not as an app. In Safari over https Omar sees the PC app (works only on home Wi-Fi) — at the gym he must use the icon.
- **Updates reach the phone** via the service worker's background refresh: after a code change, restart the PC app, open the phone app on home Wi-Fi, close it fully, reopen. Bump `SHELL` in `sw.js` if a change must replace cached files at once.
- Omar confirmed it works offline on his iPhone (Oct 2026). Branch `iphone-offline` is **not merged** — wait for his go-ahead.

## Liftmanual import (Oct 2026)

`scripts/scrape-liftmanual.js` → `scripts/match-liftmanual.py` → `scripts/import-liftmanual.js` (cache in gitignored `scrape/`; personal use only, never publish). Matching is by animation fingerprint (dHash of frame 0), then name. Applied 2026-10-15: 890 exercises got 360×360 media, 1,674 new exercises `L0001…` (ids fixed in `scrape/liftmanual/ids.json`). Backup from just before: `db/backups/before-liftmanual-2026-10-15.sqlite` — to roll back, stop the server and copy it over `db/gym.sqlite` (delete `gym.sqlite-wal`/`-shm`). Seed keeps WebP media; media is served `no-cache` so replaced files show up.

## Open item: exercise animations look choppy (parked by Omar, Oct 2026)

Omar finds the exercise GIFs choppy ("two or three frames") and wants them smooth. He'll decide later — **don't start on this without him**.

**Why they're choppy:** every dataset GIF (`videos/`, 180×180, palette GIF) holds only **2 key poses** (a few have 3–6), one on every 6th frame, with **cross-fades** in between. Pattern: 12 frames, frame 0 held 1000 ms, the rest 100 ms. 1,322 of 1,324 follow it; `3215` and `3218` (47 frames) don't. There is no real motion in the files, so nothing about playback can fix it.

**Already tried — Omar rejected both as "really bad". Don't retry:**
- **RIFE** (rife-ncnn-vulkan v4.6, on the RTX 2060) and **FILM** (PyTorch port, `film_net_fp32`). Both only blend between the two poses: fine on small moves (lat pulldown, curl), but plates smear on bench press and twisting moves (air bike) blur. ffmpeg `minterpolate` is far worse (blocky smears).
- All of it was deleted afterwards (models, PyTorch venv, `videos-smooth/`, the script, the seed change). Nothing in the app or DB changed.

**Options still open (Omar to choose):**
1. **Start + end frame + text prompt → video** (generative; invents the motion instead of blending). Prompts could be built from each exercise's name + `instruction_steps`. Generate one pose-A→B clip per exercise and play it forward then backward (ping-pong) to make a looping rep, which halves the cost.
   - Paid APIs (rough 2026 prices, re-check before paying): Runway Gen-4 Turbo ~$0.05/s, Kling 3.0 ~$0.08/s, Luma Ray 3 ~$0.06/s, Veo 3.1 Lite ~$0.05/s → about **$250–$550** for all 1,324, plus retries. Needs Omar to create an account and supply an API key.
   - Local and free: **Wan 2.2 5B** (first-last-frame mode) reportedly runs on 6–8 GB VRAM quantized. The RTX 2060 has 6 GB, so it's borderline: 10+ GB download, minutes per clip, days for everything, and lower quality.
   - Either way, generative output can get hands/bars/anatomy wrong. Test ~6 samples first (0025 bench press, 0007 lat pulldown, 0043 squat, 0294 curl, 0652 pull-up, 0003 air bike) and show Omar a before/after.
2. **Different source animations** with real motion: Vital Animations (1080p MP4, 400–1,500+ exercises, $49–$299, has a free starter pack to test), RepDB (smooth WebP loops, ~513 animated, $299–$499). Their exercise lists don't match ours one-to-one: match by name, keep the old GIF where there's no match. Exercise ids and workout history are unaffected.
3. **Clean two-pose switch:** drop the cross-fade and hold each pose. Free and quick, but not smooth.

**Technical notes for whichever option:**
- Media is served from `exercise_media.gif` with `gif_mime`, so an animated WebP or MP4 needs a matching mime; `views/exercises/show.ejs` uses `<img>`, which handles WebP but would need `<video>` for MP4.
- `scripts/seed.js` maps file extension → mime.
- Windows has long paths disabled: pip installs of big packages (torch) fail under the long scratchpad path, so use a short folder like `C:\film-tmp` and delete it afterwards.

## Open item: muscle-head rule gaps (from the Oct 2026 review, not fixed yet)

Automatic head guesses Omar can correct by hand; fix in `src/lib/heads.js` with a test per case if he asks:
- Incline/decline **push-ups** map to upper/lower chest — biomechanically reversed (hands-elevated incline push-up works the lower chest). Needs Omar's call.
- Seated/standing triceps extensions without "overhead" in the name score all three heads equally; "close grip behind neck triceps extension" scores lateral/medial instead of long.
- "cable upper chest crossovers" and "cable low fly" fall through to middle chest.
- Dataset typo "revers" ("revers wrist curl", "revers grip concentration curl") dodges the rules.
- If refreshing heads fails after a muscle score saved, the toast wrongly says "Score not saved" (`public/js/muscle-scores.js`).
- Design docs: `docs/superpowers/specs/2026-10-09-muscle-heads-design.md` and the matching plan.

## Git / GitHub

- `main` is the default branch; feature work goes on a branch (e.g. `fixes`) and is merged with `--no-ff`.
- Remote: `origin` → https://github.com/TheCoderOmar/gym-logging (private). Git's stored GitHub login is the **TheCoderOmar** account.
- Never commit `db/`, `images/`, `videos/`, `node_modules/`.
- **Commit locally only — never push to GitHub** unless Omar explicitly asks for a push (his instruction, Oct 2026). Merging branches into `main` locally is fine.

## Working notes for Claude

- Verify UI changes visually: start a demo server on another port with `GYM_DB=<scratch copy> PORT=3001`, drive headless Edge over CDP (`--remote-debugging-port`), screenshot at 1280–1500 px and 390 px, light and dark. Desktop headless windows have a minimum width — use `Emulation.setDeviceMetricsOverride` for real phone widths.
- Make a demo DB by downloading `/settings/backup` from the running server into the scratchpad, then add fake workouts with `openDb()` + repo functions.
- In Git Bash, `node -e "…"` with template-literal backticks gets mangled by the shell — use the Edit/Write tools for JS containing backticks.
- After changing server code, restart the background `npm start` (the old process keeps serving stale code); make sure nothing else holds port 3000.
