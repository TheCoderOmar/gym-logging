CREATE TABLE IF NOT EXISTS exercises (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  body_part         TEXT NOT NULL,
  equipment         TEXT NOT NULL,
  target            TEXT NOT NULL,
  muscle_group      TEXT,
  secondary_muscles TEXT NOT NULL DEFAULT '[]',  -- JSON array
  instructions      TEXT NOT NULL DEFAULT '{}',  -- JSON {lang: text}
  instruction_steps TEXT NOT NULL DEFAULT '{}',  -- JSON {lang: [steps]}
  is_custom         INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);

CREATE TABLE IF NOT EXISTS exercise_media (
  exercise_id TEXT PRIMARY KEY REFERENCES exercises(id) ON DELETE CASCADE,
  image       BLOB,
  image_mime  TEXT,
  gif         BLOB,
  gif_mime    TEXT
);

CREATE TABLE IF NOT EXISTS routines (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS routine_exercises (
  id           INTEGER PRIMARY KEY,
  routine_id   INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id),
  position     INTEGER NOT NULL,
  target_sets  INTEGER NOT NULL DEFAULT 3,
  target_reps  TEXT NOT NULL DEFAULT '8-12',
  rest_seconds INTEGER NOT NULL DEFAULT 90
);
CREATE INDEX IF NOT EXISTS idx_routine_exercises_routine ON routine_exercises(routine_id);

CREATE TABLE IF NOT EXISTS workouts (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  routine_id  INTEGER REFERENCES routines(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  finished_at TEXT,
  notes       TEXT
);
CREATE INDEX IF NOT EXISTS idx_workouts_started ON workouts(started_at);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id           INTEGER PRIMARY KEY,
  workout_id   INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id),
  position     INTEGER NOT NULL,
  rest_seconds INTEGER NOT NULL DEFAULT 90,
  notes        TEXT
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_workout ON workout_exercises(workout_id);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise ON workout_exercises(exercise_id);

CREATE TABLE IF NOT EXISTS sets (
  id                  INTEGER PRIMARY KEY,
  workout_exercise_id INTEGER NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  set_number          INTEGER NOT NULL,
  weight              REAL,
  unit                TEXT NOT NULL DEFAULT 'kg' CHECK (unit IN ('kg', 'lb')),
  reps                INTEGER,
  is_warmup           INTEGER NOT NULL DEFAULT 0,
  done                INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_sets_workout_exercise ON sets(workout_exercise_id);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO settings (key, value) VALUES ('display_unit', 'kg');

-- Points each muscle gets per working set of an exercise (feeds the body heat map).
-- Filled with defaults (target 3, secondary 1) for every exercise; edits are kept.
CREATE TABLE IF NOT EXISTS exercise_muscles (
  exercise_id TEXT NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  muscle      TEXT NOT NULL,
  points      INTEGER NOT NULL CHECK (points BETWEEN 0 AND 3),
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (exercise_id, muscle)
);
