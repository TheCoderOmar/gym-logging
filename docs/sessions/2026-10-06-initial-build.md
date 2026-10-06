# Session log — 3–6 Oct 2026: initial build and first round of fixes

Built the whole app from an exercise dataset, then iterated on Omar's feedback on a `fixes` branch, merged to `main`, and published to a private GitHub repo.

## Starting point

- Workspace held only the dataset: `data/exercises.json` (1,324 exercises, multilingual instructions), `data/exercises.schema.json`, `images/` (1,324 jpg thumbnails, ~8 MB), `videos/` (1,324 GIFs, ~123 MB). Not a git repo.
- Omar installed the `superpowers` and `frontend-design` Claude Code plugins at the start.

## Requirements (from Omar)

- Local-only gym app, single user.
- Browse the dataset, add custom exercises, build own workouts.
- Track weight × reps per set; home page with workout history; a few more pages.
- Everything stored in a DB, **including the media**; start using git, with media **not** committed.
- Answers to planning questions: Node + Express + SQLite; weights in **both** kg and lb; pages = exercise library, routines, progress charts, live logger.

## Part 1 — initial build (on `main`)

| Commit | What |
|---|---|
| `568c891` | git init, `.gitignore` (db, images, videos, node_modules), README, dataset JSON |
| `ca919a9` | SQLite data layer, schema, seed (exercises + media BLOBs + 4 starter routines: Full Body A, Push, Pull, Legs), tests |
| `54b5b82` | Express shell, layout (side rail / mobile tab bar), design tokens, media routes |
| `ad8d0dc` | Exercise library: search, filters, detail page with GIF + steps + PRs, custom exercises with uploads |
| `06876ec` | Routines + builder with exercise-picker dialog |
| `0a9d18c` | Live logger: autosave, previous-session placeholders, per-exercise kg/lb, barbell plate calculator, rest timer |
| `2322579` | Home + workout history/detail |
| `e6d4c76` | Progress: e1RM / top set / volume charts, rep maxes, weekly volume, sets by body part |
| `6d38614` | Settings: display unit, bar weight, theme, DB backup (`VACUUM INTO`) |
| `72b5e77` | README: pages, Node requirement, phone access |

Notable decisions and problems:
- **better-sqlite3 segfaulted** (prebuilt binary, Node 22.13 on Windows) → switched to built-in `node:sqlite`.
- Media stored as BLOBs in `exercise_media`; DB ends up ~154 MB.
- Units stored per set; display unit converts for stats.
- Design: cool chalk/iron palette with competition plate colours; Saira Semi Condensed + Atkinson Hyperlegible bundled locally. The plate-loading strip in the logger is the signature element.
- Bugs found via screenshots and fixed: nav "active" read a router-relative `req.path`; mobile top bar hidden by CSS order; logger table columns shifted when the "Previous" column was hidden on mobile; "Add set" copied an empty row.

## Part 2 — fixes branch (`fixes`, merged in `fca8fdb`)

Omar reviewed the running app and asked for changes one at a time:

1. **Home redesign** (`f29680f`): front/back **muscle recovery heat map** (today red, 1–3 days yellow, 4–5 green, 6+ blue, never grey) and a **GitHub-style training log** with two views — exercise-count levels (1–3, 4, 5, 6, 7+) and an emoji per day for the main body part. Kept the weekly stats Omar liked. Scoring: target 3 / secondary 1 per set, trained at ≥ 3 points per day. Swapped 🔙 for 🦅 because 🔙 renders as a "BACK" sign.
2. **Training log layout** (`61ab3c8`): calendar year Jan–Dec, weeks start **Saturday**, cells size to fill the panel (no horizontal scroll on desktop), months aligned. Found and fixed an **Egypt DST bug** (clocks change at midnight → stepping local midnights dropped a day); days are now built by offset at noon.
3. **Legend filters + 5 years ahead** (`9ab79ac`): clicking level/emoji legend items filters the calendar; year arrows reach first logged year … current + 5.
4. **No flicker** (`87a63aa`): year paging swaps the training-log partial in place (`/training-log?year=`) instead of reloading.
5. **Routine cards** (`63367e1`): buttons aligned at the card bottom (Start, Edit, icon Duplicate/Delete), equal-height cards, and an **in-app confirm popup** (`public/js/confirm.js`) replacing every `window.confirm`.
6. **Toasts** (`2ad7b63`, `a58d34a`): all `?msg=` notices are top-right toasts, 15 s, pause on hover, red tone for errors; they **stack across page loads** (sessionStorage), newest on top, max 5.
7. **Exercise filters** (`3581441`): custom-styled dropdowns app-wide, search icon, **live search** and results/paging swapped in place.
8. **Muscle scores per exercise** (`2c7c3d3`): new `exercise_muscles` table filled for all 1,324 exercises; each exercise page has a "Muscle score per set" section with a 0–3 picker that saves instantly; the heat map uses these scores.
9. **Smarter defaults** (`671f679`): helpers that are prime movers in compound lifts default to **2** (e.g. bench → triceps/shoulders 2, pulldown → biceps/rhomboids/rear delts 2, hinges → glutes/hamstrings/lower back 2, hammer curl → forearms 2, crunch → obliques 2); isolation/stabilisers stay 1. One-time upgrade of unedited exercises (`muscle_defaults_version` = 2). Result in Omar's DB: 1,324 × 3, 924 × 2, 1,655 × 1.
10. **Muscle picker in the library** (`5a46d6a`): side panel with one body figure (front/back toggle); clicking muscles filters exercises; several muscles = exercises that work **all** of them, ranked by combined score, with a "closest matches / Works N of M" fallback.

Then: merged `fixes` → `main` (`fca8fdb`, all 23 tests passing).

## Publishing

- Omar created the repo on github.com as **gym-logging**, private. It ended up under the **TheCoderOmar** account (the account Git's credential manager is logged into), not `Omar-Aliii` as first assumed — pushing to `Omar-Aliii/...` returned "Repository not found".
- `origin` → https://github.com/TheCoderOmar/gym-logging, `main` pushed and tracking. `fixes` not pushed (already merged).

## State at end of session

- `main` = `origin/main` + this documentation commit. 23 tests passing.
- Omar's real DB has no workouts yet (only exercises, media, muscle scores, 4 starter routines). All visual testing used a scratch demo DB via `GYM_DB`.
- App runs with `npm start` at http://127.0.0.1:3000.

## Ideas not done yet (possible next steps)

- Logger and Progress pages haven't had a feedback pass from Omar yet.
- Muscle scores can't add a muscle the dataset doesn't list for an exercise (only re-score existing ones).
- The `fixes` branch could be deleted locally.
- Optional: move the GitHub repo to the `Omar-Aliii` account if that was the intent.
