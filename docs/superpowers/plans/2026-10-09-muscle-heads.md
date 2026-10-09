# Muscle Heads Close-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking one of 8 muscles on Home's recovery map opens a popup that draws the muscle split into its heads, each coloured by when it was last trained; head scores are guessed from exercise names and editable per exercise.

**Architecture:** A new pure module `src/lib/heads.js` holds the head list, name rules and `headStatus()` (mirrors `muscleStatus`). Only Omar's edits are stored (`exercise_heads` table); defaults are computed on the fly. `bodymap.js` gains hand-drawn close-up SVGs; Home fetches a popup fragment from `GET /muscles/:region`.

**Tech Stack:** Node 22 `node:sqlite`, Express 5, EJS, vanilla JS, `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-09-muscle-heads-design.md`

## Global Constraints

- Head ids, labels and rules exactly as in the spec tables; scores are integers 0–3 (`MAX_POINTS`).
- A head only counts if its region's score for the exercise is > 0, and a head's score is capped at that region score (overrides included).
- Same status logic as the map: trained on a day at ≥ `TRAINED_THRESHOLD` (3) points; buckets via `recencyBucket`, shading via `intensity`; existing CSS classes `b-<bucket> i-<intensity>`.
- No full-page reloads (fetch fragments); errors via `window.toast(msg, { tone: 'error' })`; never `window.confirm`.
- Every page works at 390 px; light and dark mode via existing tokens; copy in sentence case.
- Run `npm test` after each task — keep it green. Do **not** commit unless Omar asks.

## Review Focus

- An exercise whose region score was edited to 0: its heads must not count (test in Task 1).
- An override saved while the region score was 3, then the region score lowered to 1: the head must be capped at 1 (test in Task 2).
- A custom exercise (`C0001`) with a free-text name and no rule match: every head gets the region score (test in Task 1).
- `GET /muscles/glutes` or `/muscles/nonsense`: 404, and the Home click handler shows the error toast rather than an empty dialog (test in Task 5).
- Workouts logged before this feature (no overrides anywhere): popup still colours heads from rule defaults (covered by Task 5's visual check on the demo DB).

---

### Task 1: Head definitions, name rules and head status

**Files:**
- Create: `src/lib/heads.js`
- Test: `test/heads.test.js`

**Interfaces:**
- Consumes: `regionOf`, `regionPoints`, `defaultMusclePoints`, `recencyBucket`, `intensity`, `daysBetween`, `dayKey`, `TRAINED_THRESHOLD`, `MAX_POINTS`, `REGIONS` from `src/lib/muscles.js`.
- Produces:
  - `HEAD_GROUPS: { [regionId]: Array<{ id: string, label: string }> }` — the 8 regions in the spec, heads in spec order.
  - `hasHeads(regionId): boolean`
  - `defaultHeads(ex, regionId, regionScore): Array<{ head, points }>` — `ex = { name, target, secondary_muscles }`.
  - `exerciseHeads(ex, muscles, overrides = []): { [regionId]: Array<{ head, label, points, defaultPoints, edited: boolean }> }` — only regions with heads whose region score > 0; `muscles` = `[{ muscle, points }]` (falls back to `defaultMusclePoints` when empty); `overrides` = `[{ head, points }]`; all values capped at the region score.
  - `headStatus(rows, regionId, now = new Date()): Array<{ head, label, bucket, days, lastDate, points, sets, intensity }>` — `rows` are `repo.exerciseLog` rows with `{ started_at, sets, name, target, secondary_muscles, muscles, heads }` (`heads` = overrides).

- [ ] **Step 1: Write the failing tests** in `test/heads.test.js`. Helper `pts(ex, region, score = 3)` returns `Object.fromEntries(defaultHeads(ex, region, score).map((h) => [h.head, h.points]))`. Cases (exercise objects use real dataset names):
  - `'dumbbell hammer curl'`, biceps → `{ biceps_long: 1, biceps_short: 1, brachialis: 3 }`
  - `'dumbbell incline curl'` → `biceps_long: 3, biceps_short: 1, brachialis: 0`
  - `'ez barbell preacher curl'` → `biceps_short: 3, biceps_long: 1`
  - `'barbell curl'` → `biceps_long: 3, biceps_short: 3, brachialis: 1`
  - `'barbell incline bench press'`, chest → `chest_upper: 3, chest_middle: 1, chest_lower: 0`
  - `'chest dip'`, chest → `chest_lower: 3, chest_middle: 1`
  - `'barbell bench press'`, chest → `chest_middle: 3, chest_upper: 1, chest_lower: 1`
  - `'dumbbell lateral raise'`, shoulders → `delt_side: 3, delt_front: 1, delt_rear: 1`
  - `'cable face pull'` (target upper back), shoulders score 2 → `delt_rear: 2, delt_side: 1, delt_front: 0`
  - `'barbell bench press'` (target pectorals), shoulders score 2 → `delt_front: 2, delt_side: 0, delt_rear: 0`
  - `'cable pushdown'`, triceps → `triceps_lateral: 3, triceps_medial: 3, triceps_long: 1`
  - `'dumbbell lying triceps extension'` → `triceps_long: 3`
  - `'barbell reverse wrist curl'`, forearms → `forearm_extensors: 3, forearm_flexors: 0`
  - `'lever leg extension'`, quads → all three 3
  - `'barbell full squat'`, quads → `quad_vl: 3, quad_vm: 3, quad_rf: 1`
  - `'hanging leg raise'`, abs → `abs_lower: 3, abs_upper: 1`
  - `'crunch floor'`, abs → `abs_upper: 3, abs_lower: 1`
  - `'cable bar lateral pulldown'`, lats → `lats_upper: 3, lats_lower: 1`
  - `'cable straight arm pulldown'`, lats → `lats_lower: 3, lats_upper: 1`
  - no match: `{ name: 'my weird move', target: 'biceps' }` → every biceps head 3
  - capping: `defaultHeads(barbell curl, 'biceps', 2)` → long 2, short 2, brachialis 1
  - `exerciseHeads` with muscles `[{ muscle: 'biceps', points: 0 }]` → no `biceps` key
  - `exerciseHeads` with override `{ head: 'brachialis', points: 3 }` on a curl whose biceps score is 2 → brachialis `points: 2, edited: true`
  - `headStatus`: one hammer-curl row today with 2 sets → brachialis `bucket 'today'`, `sets 2`, `points 6`; biceps_long has points 2 (< 3) → `bucket 'never'`
- [ ] **Step 2: Run** `node --disable-warning=ExperimentalWarning --test test/heads.test.js` — expect FAIL (`Cannot find module '../src/lib/heads'`).
- [ ] **Step 3: Implement `src/lib/heads.js`.** Rules as data: per region an ordered list of `{ test: (name, ex) => boolean, main: [headIds], some: [headIds] }`; first match wins; helper rules (shoulders front/rear, biceps all-heads, forearms flexors) check `regionOf(ex.target)`; "upper chest" / "rear deltoids" check `ex.secondary_muscles`. Main → `regionScore`, some → `Math.min(1, regionScore)`, others 0; no match → all `regionScore`. `headStatus` copies `muscleStatus`'s per-day accumulation but keyed by head.
- [ ] **Step 4: Run** the test file — expect PASS; then `npm test` — all green.

### Task 2: Storage and repo functions

**Files:**
- Modify: `src/schema.sql` (append table from spec), `src/db.js` (new functions, `exerciseLog`, export list)
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: Task 1 `exerciseHeads`, `HEAD_GROUPS`, `hasHeads`.
- Produces (on the repo):
  - `getExerciseHeads(exerciseId): { [regionId]: [...] }` — `exerciseHeads(ex, getExerciseMuscles(id), overrides)`.
  - `setExerciseHeads(exerciseId, regionId, scores: [{ head, points }])` → returns `getExerciseHeads(exerciseId)`. Throws `Error` with a user-facing message if the region has no heads, the exercise doesn't work it, a head isn't in that region, or points aren't an integer 0–3. Stores **all** heads of the region (unspecified ones keep their current effective points), in one `tx`.
  - `resetExerciseHeads(exerciseId, regionId)` → deletes that region's rows, returns `getExerciseHeads`.
  - `exerciseLog(isoStart)` rows gain `name` (`e.name`) and `heads` (overrides `[{ head, points }]`, cached per exercise like `muscles`).

- [ ] **Step 1: Write failing tests** in `test/db.test.js` (use `freshDb()`; add `ins.run('0004', 'dumbbell hammer curl', 'upper arms', 'dumbbell', 'biceps')`):
  - `getExerciseHeads('0004').biceps` → brachialis points 3, `edited: false`.
  - `setExerciseHeads('0004', 'biceps', [{ head: 'biceps_long', points: 3 }])` → biceps_long 3 `edited: true`; brachialis still 3.
  - Lowering the region: `setExerciseMuscles('0004', [{ muscle: 'biceps', points: 1 }])` → every biceps head ≤ 1.
  - `resetExerciseHeads('0004', 'biceps')` → back to defaults, `edited: false`.
  - Throws on `setExerciseHeads('0004', 'glutes', …)`, on head `'delt_side'` for biceps, on points `4`.
  - `exerciseLog` row for a logged hammer-curl set includes `name: 'dumbbell hammer curl'` and the saved `heads`.
- [ ] **Step 2: Run** `npm test` — the new tests FAIL.
- [ ] **Step 3: Implement** the table and functions above.
- [ ] **Step 4: Run** `npm test` — all green.

### Task 3: Head editor on the exercise page

**Files:**
- Modify: `src/routes/api.js`, `src/routes/exercises.js` (pass `heads: repo.getExerciseHeads(ex.id)`, `headGroups`), `views/exercises/show.ejs`, `public/js/muscle-scores.js`, `public/css/app.css`

**Interfaces:**
- Consumes: Task 2 repo functions.
- Produces: `GET /api/exercises/:id/heads` → `{ heads }`; `PUT /api/exercises/:id/heads` body `{ region, scores }` → `{ heads }`; `POST /api/exercises/:id/heads/reset` body `{ region }` → `{ heads }`. Errors → 400 `{ error }`, same as the muscles endpoints.

- [ ] **Step 1: Markup.** Under the muscle list, inside `#muscle-scores`, a `<div class="ms-heads" id="ms-heads">` with one block per region in `heads`: heading "<Region> heads" + "Reset to automatic" button (`data-reset-heads="<region>"`, hidden unless any head `edited`), then an `<ul class="ms-list">` of heads using the same row markup as muscles (`li[data-head]`, `.ms-pick` radiogroup 0–3). Buttons above the region score get `disabled` and a `title="Can't be higher than the <region> score"`.
- [ ] **Step 2: JS.** In `muscle-scores.js`, clicks on `li[data-head] [data-points]` PUT to the heads endpoint; reset buttons POST; after **any** muscle-score change, `GET /api/exercises/:id/heads` and re-render the heads block (scores and disabled states). Toast copy: "Long head: 2 points per set", "Biceps heads reset to automatic".
- [ ] **Step 3: Verify** on a demo server (`GYM_DB=<scratch copy> PORT=3001`): open `/exercises/0025` (bench press) — Chest, Shoulders, Triceps heads blocks show; change a head, reload, it persists; lower Shoulders to 1 → shoulder heads show ≤ 1 and buttons 2–3 disabled; reset works. Screenshot at 1280 px and 390 px, light and dark.
- [ ] **Step 4: Run** `npm test` — green.

### Task 4: Close-up drawings

**Files:**
- Modify: `src/lib/bodymap.js`
- Test: `test/heads.test.js` (append)

**Interfaces:**
- Consumes: `HEAD_GROUPS` (Task 1).
- Produces: `headFigure(regionId, status): string` — an `<svg class="head-fig">` with a neutral base outline and one `<g class="muscle b-<bucket> i-<intensity>" data-head="<id>"><title>…</title>…</g>` per head (title text from `describe`-style copy: "Long head: trained today, 6 sets"). `status` = Task 1 `headStatus` output.

- [ ] **Step 1: Write failing test:** for every region in `HEAD_GROUPS`, `headFigure(region, fakeStatus)` contains a `data-head="<id>"` for every head id and starts with `<svg`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Draw** 8 close-ups as data `CLOSEUPS[region] = { viewBox, base: [svg strings], heads: { headId: [pathD] } }`, in the body figure's flat style: chest (front torso, 3 horizontal bands per side, mirrored), shoulders (side view, front/side/rear delt caps), biceps (front upper arm: long head outer, short head inner, brachialis peeking below on the outside), triceps (back upper arm: long inner, lateral outer, medial low near the elbow), forearms (two views side by side: inner = flexors, outer = extensors + brachioradialis along the top), abs (front core: upper 2 rows of the six-pack, lower = lowest row + below navel), quads (front thigh: rectus femoris centre, vastus lateralis outer, vastus medialis teardrop above inner knee), lats (back torso: upper = top band under the armpit, lower = sweep to the waist, mirrored).
- [ ] **Step 4: Run** — PASS; render each figure to a scratch HTML page and screenshot it to check the drawings read correctly.

### Task 5: Clickable map and popup on Home

**Files:**
- Modify: `src/lib/bodymap.js` (`bodyMap` adds `data-heads` + `role="button"` + `aria-haspopup="dialog"` to regions where `hasHeads`), `src/routes/home.js` (new route), `views/home.ejs` (empty `<dialog class="heads-dialog" id="heads-dialog">`), `public/js/home.js`, `public/css/app.css`
- Create: `views/partials/heads.ejs`
- Test: `test/heads.test.js` (append: `bodyMap` marks only the 8 head regions); the 404 is checked with `curl` in Step 5.

**Interfaces:**
- Consumes: Task 1 `headStatus`, `HEAD_GROUPS`, `hasHeads`; Task 4 `headFigure`; `repo.exerciseLog`.
- Produces: `GET /muscles/:region` → the partial (200) or 404 for regions without heads.

- [ ] **Step 1: Write failing test:** `bodyMap(status).front` contains `data-heads` on `data-region="biceps"` and not on `data-region="glutes"`.
- [ ] **Step 2: Run** — FAIL; implement the `bodyMap` change; PASS.
- [ ] **Step 3: Route + partial.** Route computes `headStatus(repo.exerciseLog(<now − 365 days>), region)` and renders `partials/heads.ejs`: header (`<h2>` region label + close button `data-close` with `icon('x')`), `headFigure`, list rows (swatch with `b-<bucket>`, label, "today · 6 sets" / "3 days ago · 4 sets" / "yesterday · 2 sets" / "not trained yet"), then the existing colour key markup (`recency-key`).
- [ ] **Step 4: Home JS.** Click or Enter/Space on `.muscle[data-heads]` → fetch `/muscles/<region>`; on `!res.ok` or network error → `window.toast("Couldn't load that muscle", { tone: 'error' })` and stop; else fill the dialog and `showModal()`. Close on `[data-close]`, Esc (native), backdrop click; return focus to the clicked muscle. CSS: `.muscle[data-heads] { cursor: pointer }`; `dialog.heads-dialog` card (max-width 420 px, `--sheet` background, radius `--r-md`), bottom sheet at ≤ 600 px; `.head-fig` max-height 46vh.
- [ ] **Step 5: Verify** on the demo server with fake workouts covering each bucket (log a hammer curl today, incline press 2 days ago, leg extension 5 days ago, lat pulldown 8 days ago): click each of the 8 muscles; screenshots at 1280 px and 390 px, light and dark; Esc/backdrop/× close; `curl -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/muscles/glutes` → `404`.
- [ ] **Step 6: Run** `npm test` — green.

### Task 6: Docs

**Files:**
- Modify: `CLAUDE.md` (layout list: `src/lib/heads.js`; data model: `exercise_heads` overrides only; domain rules: heads popup, rules-from-names, capping)

- [ ] **Step 1:** Add those three lines; keep the existing wording style.
- [ ] **Step 2:** Restart reminder: tell Omar to restart `npm start` on port 3000.
