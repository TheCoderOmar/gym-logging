# Muscle heads in the recovery map — design

Date: 2026-10-09 · Status: approved in chat, awaiting spec review

## Goal

On Home's muscle-recovery map, Omar can click a muscle and see it split into its heads, each coloured by when he last trained it (same colours and intensity as the map). Heads appear **only** in that close-up — the main figure stays as it is.

## Muscles and heads

| Region (existing id) | Heads (id → label) |
|---|---|
| `chest` | `chest_upper` Upper chest · `chest_middle` Middle chest · `chest_lower` Lower chest |
| `shoulders` | `delt_front` Front delt · `delt_side` Side delt · `delt_rear` Rear delt |
| `biceps` | `biceps_long` Long head · `biceps_short` Short head · `brachialis` Brachialis |
| `triceps` | `triceps_long` Long head · `triceps_lateral` Lateral head · `triceps_medial` Medial head |
| `forearms` | `forearm_flexors` Inner forearm (flexors) · `forearm_extensors` Outer forearm (extensors) · `brachioradialis` Brachioradialis |
| `abs` | `abs_upper` Upper abs · `abs_lower` Lower abs |
| `quads` | `quad_rf` Rectus femoris · `quad_vl` Outer quad (vastus lateralis) · `quad_vm` Teardrop (vastus medialis) |
| `lats` | `lats_upper` Upper lats · `lats_lower` Lower lats |

Other regions (traps, upper back, lower back, obliques, glutes, hamstrings, adductors, calves) are unchanged and not clickable.

## Head scores

- Each head gets 0–3 points per working set, like muscle scores.
- An exercise only counts toward a region's heads if it counts toward that region (its region score, from `regionPoints(muscles)`, is > 0). Head scores are capped at the region score.
- **Defaults come from rules on the exercise name**, computed on the fly (never stored). Each rule marks heads as *main* (= the region score) or *some* (= 1, capped at the region score); unlisted heads get 0. If no rule matches, every head gets the region score.
- **Edits are stored as overrides only**: just the heads Omar edits are stored; the others stay automatic. "Reset to automatic" deletes a region's overrides. (Changed after the final review: storing every head of the region froze values capped by a temporarily lowered muscle score.) Rule improvements therefore reach every unedited exercise without a version setting.

### Rules (first match wins, per region)

| Region | Name pattern → main (some) |
|---|---|
| chest | incline, low-to-high/low cable crossover, reverse-grip bench → upper (middle) · decline, dip, high-to-low/high cable crossover → lower (middle) · otherwise (flat press, push-up, fly, pec deck) → middle (upper, lower) · secondary muscle "upper chest" listed → upper (middle) |
| shoulders | lateral/side raise, upright row, Y-raise → side (front, rear) · rear delt, reverse fly, face pull, or "rear deltoids" listed → rear (side) · front raise, overhead/military/shoulder/Arnold/push press → front (side) · as helper when target is chest or triceps → front · as helper when target is upper back or lats (rows, pulls) → rear |
| biceps | hammer, reverse curl/grip curl, Zottman, cross-body → brachialis (long, short) · incline curl, drag curl, Bayesian, behind-the-body → long (short) · preacher, spider, concentration, wide-grip curl, Scott → short (long) · other curls → long, short (brachialis) · as helper (rows, pulls, chin-ups) → all heads at the region score |
| triceps | overhead/French/skull crusher/lying extension, JM press → long (lateral, medial) · reverse-grip pushdown → medial (lateral, long) · pushdown, kickback, close-grip press, dip, diamond push-up → lateral, medial (long) |
| forearms | reverse wrist curl, wrist extension → extensors · wrist curl, wrist roller, grip, farmer, hang, plate pinch → flexors (extensors) · hammer, reverse curl, Zottman → brachioradialis (extensors) · as helper elsewhere → flexors (brachioradialis) |
| quads | leg extension → all three main · sissy squat, reverse Nordic, kick/hip-flexor raises → rectus femoris (vastus medialis) · squat, leg press, lunge, split squat, step-up, hack → vastus lateralis, vastus medialis (rectus femoris) |
| abs | leg raise, knee raise, reverse crunch, hip raise, flutter, scissor, V-up, toes-to-bar → lower (upper) · crunch, sit-up, cable crunch, jackknife → upper (lower) · plank, rollout, ab wheel, hollow, dead bug, L-sit → upper, lower |
| lats | wide-grip pulldown/pull-up, lat pulldown, pull-up → upper (lower) · close/neutral/underhand-grip pulldown, row, straight-arm pulldown, pullover, chin-up → lower (upper) |

The exact regexes live in `src/lib/heads.js` and are covered by tests with real dataset names.

## Head status

`headStatus(rows, now)` mirrors `muscleStatus`: per head per day, points = Σ working sets × head score; trained on a day at ≥ `TRAINED_THRESHOLD` (3); bucket by days since (today / 1–3 / 4–5 / 6+ / never) and `intensity(points)` as the map. Rows come from `repo.exerciseLog`, which gains `e.name` and the exercise's head overrides.

## UI

- **Home figure:** the 8 regions get `data-heads` and act as buttons (pointer cursor, `tabindex`, Enter/Space). Hover tooltip unchanged. Others unchanged.
- **Popup:** a `<dialog class="heads-dialog">` (centred card on desktop, bottom sheet ≤ 600 px). Header: region label + × button. Body: the close-up SVG with each head coloured `b-<bucket> i-<intensity>` (existing classes), then a list: swatch · head label · "today · 6 sets" / "3 days ago · 4 sets" / "not trained yet", then the colour key. Closes on ×, Esc, backdrop click; focus returns to the clicked muscle.
- **Loading:** click → `fetch('/muscles/<region>')` returns the dialog body HTML (partial `views/partials/heads.ejs`); on failure, `toast("Couldn't load that muscle", { tone: 'error' })`. Unknown region → 404.
- **Drawings:** 8 hand-drawn close-up SVGs in the body figure's flat style (`closeup(region, decorate)` in `bodymap.js`): chest (front torso), shoulders (side view of the shoulder cap), biceps (front upper arm), triceps (back upper arm), forearms (inner + outer side by side), abs (front core), quads (front thigh), lats (back torso). Each head is a `<g class="muscle" data-head="…">` with a `<title>`.
- **Exercise page:** for each region the exercise works that has heads, a "Heads" sub-list under the muscle scores with 0–3 radio buttons per head (same control as muscle scores), an "edited" marker, and "Reset to automatic". Saves immediately via `PUT /api/exercises/:id/heads` `{ region, scores: [{ head, points }] }` and `POST /api/exercises/:id/heads/reset` `{ region }`; responses return the region's effective head scores.

## Data

New table (in `schema.sql`, created on start):

```sql
CREATE TABLE IF NOT EXISTS exercise_heads (
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  head        TEXT NOT NULL,
  points      INTEGER NOT NULL CHECK (points BETWEEN 0 AND 3),
  PRIMARY KEY (exercise_id, head)
);
```

Repo: `getExerciseHeads(id)` → effective scores per region (overrides or rule defaults), `setExerciseHeads(id, region, scores)`, `resetExerciseHeads(id, region)`.

## Testing

- `test/heads.test.js`: rule outcomes for real names (e.g. "dumbbell hammer curl" → brachialis main; "barbell incline bench press" → upper chest main; "cable pushdown" → lateral + medial; "lever leg extension" → all quads; "hanging leg raise" → lower abs; "dumbbell lateral raise" → side delt); no-match fallback; capping at region score; `headStatus` buckets/threshold.
- `test/db.test.js`: overrides save, apply in `exerciseLog`, and reset.
- Visual: every popup at 1280 px and 390 px, light and dark; the exercise-page head editor.

## Out of scope

Heads for other regions; heads on the main figure; head filters in the exercise library; head-level stats on the Progress page.
