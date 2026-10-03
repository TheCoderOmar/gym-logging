# Gym Log

A personal, local-only gym tracker built on the exercise dataset in `data/`.

## Run

```
npm install
npm run seed   # loads data/exercises.json + images/ + videos/ into db/gym.sqlite
npm start      # http://localhost:3000
```

`npm start` seeds automatically if the database is empty.

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
