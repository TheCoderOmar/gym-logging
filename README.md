# Gym Log

A personal, local-only gym tracker built on the exercise dataset in `data/`.

## Run

```
npm install
npm run seed   # loads data/exercises.json + images/ + videos/ into db/gym.sqlite
npm start      # http://localhost:3000
```

`npm start` seeds automatically if the database is empty. Needs Node 22.13+ (uses the built-in `node:sqlite`).

To log from your phone on the same Wi-Fi, start it with `HOST=0.0.0.0 npm start` (PowerShell: `$env:HOST='0.0.0.0'; npm start`) and open `http://<your-PC-IP>:3000`.

## Pages

- **Home** — start a freestyle workout (opens straight into the exercise picker) or one from a routine, this week at a glance, recent workouts.
- **History** — every finished workout with sets, volume and duration; edit, delete or save as a routine.
- **Exercises** — search and filter the library, see GIF + instructions + your records; add your own.
- **Routines** — build reusable workouts with target sets/reps/rest. Four starter routines are included.
- **Logger** — tick off sets as you go; last session's numbers pre-filled, per-exercise kg/lb, plate calculator, rest timer. Autosaves.
- **Progress** — estimated 1RM, top set and volume per exercise, rep maxes, weekly volume.
- **Settings** — display unit, bar weight, theme, database backup.

## Data

- `data/exercises.json` — 1,324 exercises (schema in `data/exercises.schema.json`).
- `images/` and `videos/` — thumbnails and GIFs. They are **not** in git; the seed copies them into the database as BLOBs.
- `db/gym.sqlite` — everything: exercises, media, routines, workouts, sets, settings. Back it up from the Settings page.

## Units

Each set is stored in the unit it was logged in (kg or lb). Charts, PRs and volume convert to the display unit chosen in Settings.

## Test

```
npm test
```
