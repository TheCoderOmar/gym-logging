const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { KG_PER_LB, convert, isUnit } = require('./lib/units');
const { defaultMusclePoints, legacyMusclePoints, musclesInRegion, REGIONS, MAX_POINTS, MUSCLE_DEFAULTS_VERSION } = require('./lib/muscles');

// GYM_DB lets you point the app at another database file (e.g. a demo copy).
const DEFAULT_PATH = process.env.GYM_DB || path.join(__dirname, '..', 'db', 'gym.sqlite');
const SCHEMA = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

// Weight of a set in kg, as a SQL expression over the `sets` table alias `s`.
const KG_SQL = `(CASE WHEN s.unit = 'lb' THEN s.weight * ${KG_PER_LB} ELSE s.weight END)`;
const WORKING_SQL = 's.done = 1 AND s.is_warmup = 0 AND s.reps > 0';

function openDb(file = DEFAULT_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  const repo = createRepo(db);
  repo.ensureExerciseMuscles();
  return repo;
}

function createRepo(db) {
  const cache = new Map();
  const stmt = (sql) => {
    if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
    return cache.get(sql);
  };
  const all = (sql, ...p) => stmt(sql).all(...p);
  const get = (sql, ...p) => stmt(sql).get(...p);
  const run = (sql, ...p) => stmt(sql).run(...p);

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  const parseExercise = (row) =>
    row && {
      ...row,
      secondary_muscles: JSON.parse(row.secondary_muscles || '[]'),
      instructions: JSON.parse(row.instructions || '{}'),
      instruction_steps: JSON.parse(row.instruction_steps || '{}'),
    };

  /* ---------------- settings ---------------- */

  function getSetting(key, fallback = null) {
    const row = get('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : fallback;
  }

  function setSetting(key, value) {
    run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
  }

  function displayUnit() {
    const u = getSetting('display_unit', 'kg');
    return isUnit(u) ? u : 'kg';
  }

  /* ---------------- exercises ---------------- */

  function exerciseCount() {
    return get('SELECT COUNT(*) AS n FROM exercises').n;
  }

  /**
   * Search the library. `regions` (heat-map region ids) keeps exercises that work every one
   * of them (score > 0), best combined score first. If none work them all, falls back to the
   * exercises that work the most of them and sets `partial`.
   */
  function searchExercises({ q = '', body_part = '', equipment = '', target = '', custom = false, regions = [], limit = 60, offset = 0 } = {}) {
    const where = [];
    const params = [];
    for (const word of q.trim().toLowerCase().split(/\s+/).filter(Boolean)) {
      where.push('LOWER(e.name) LIKE ?');
      params.push(`%${word}%`);
    }
    if (body_part) { where.push('e.body_part = ?'); params.push(body_part); }
    if (equipment) { where.push('e.equipment = ?'); params.push(equipment); }
    if (target) { where.push('e.target = ?'); params.push(target); }
    if (custom) where.push('e.is_custom = 1');
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const valid = new Set(REGIONS.map((r) => r.id));
    regions = [...new Set(regions)].filter((r) => valid.has(r));
    if (!regions.length) {
      const total = get(`SELECT COUNT(*) AS n FROM exercises e ${whereSql}`, ...params).n;
      // Exercises you've actually done float to the top, then alphabetical.
      const rows = all(
        `SELECT e.id, e.name, e.body_part, e.equipment, e.target, e.is_custom,
                (SELECT COUNT(*) FROM workout_exercises we WHERE we.exercise_id = e.id) AS times_done,
                (m.image IS NOT NULL) AS has_image
           FROM exercises e LEFT JOIN exercise_media m ON m.exercise_id = e.id
           ${whereSql}
          ORDER BY times_done > 0 DESC, e.name
          LIMIT ? OFFSET ?`,
        ...params, limit, offset,
      );
      return { total, rows, partial: false };
    }

    // One column per selected region: the exercise's best score for any muscle in it (NULL if none).
    const regionCols = [];
    const regionParams = [];
    regions.forEach((r, i) => {
      const names = musclesInRegion(r);
      regionCols.push(
        `(SELECT MAX(em.points) FROM exercise_muscles em
           WHERE em.exercise_id = e.id AND em.points > 0 AND em.muscle IN (${names.map(() => '?').join(', ')})) AS r${i}`,
      );
      regionParams.push(...names);
    });
    const hits = regions.map((_, i) => `(r${i} IS NOT NULL)`).join(' + ');
    const score = regions.map((_, i) => `COALESCE(r${i}, 0)`).join(' + ');
    const inner = `
      SELECT e.id, e.name, e.body_part, e.equipment, e.target, e.is_custom,
             (SELECT COUNT(*) FROM workout_exercises we WHERE we.exercise_id = e.id) AS times_done,
             (m.image IS NOT NULL) AS has_image,
             ${regionCols.join(',\n             ')}
        FROM exercises e LEFT JOIN exercise_media m ON m.exercise_id = e.id
        ${whereSql}`;
    const scored = `SELECT *, ${hits} AS hits, ${score} AS score FROM (${inner})`;
    const run = (minHits) => ({
      total: get(`SELECT COUNT(*) AS n FROM (${scored}) WHERE hits >= ?`, ...regionParams, ...params, minHits).n,
      rows: all(
        `SELECT * FROM (${scored}) WHERE hits >= ?
          ORDER BY hits DESC, score DESC, times_done > 0 DESC, name
          LIMIT ? OFFSET ?`,
        ...regionParams, ...params, minHits, limit, offset,
      ),
    });

    let result = run(regions.length);
    let partial = false;
    if (!result.total && regions.length > 1) {
      result = run(1);
      partial = result.total > 0;
    }
    return { ...result, partial };
  }

  function filterOptions() {
    const col = (c) => all(`SELECT DISTINCT ${c} AS v FROM exercises ORDER BY ${c}`).map((r) => r.v);
    return { body_parts: col('body_part'), equipment: col('equipment'), targets: col('target') };
  }

  function getExercise(id) {
    return parseExercise(
      get(
        `SELECT e.*, (m.image IS NOT NULL) AS has_image, (m.gif IS NOT NULL) AS has_gif
           FROM exercises e LEFT JOIN exercise_media m ON m.exercise_id = e.id WHERE e.id = ?`,
        id,
      ),
    );
  }

  function getMedia(id, kind) {
    const col = kind === 'gif' ? 'gif' : 'image';
    return get(`SELECT ${col} AS data, ${col}_mime AS mime FROM exercise_media WHERE exercise_id = ?`, id);
  }

  function nextCustomId() {
    const row = get("SELECT MAX(CAST(SUBSTR(id, 2) AS INTEGER)) AS n FROM exercises WHERE id LIKE 'C%'");
    return 'C' + String((row.n || 0) + 1).padStart(4, '0');
  }

  function saveMedia(id, media = {}) {
    if (!media.image && !media.gif) return;
    run('INSERT OR IGNORE INTO exercise_media (exercise_id) VALUES (?)', id);
    if (media.image) run('UPDATE exercise_media SET image = ?, image_mime = ? WHERE exercise_id = ?', media.image.data, media.image.mime, id);
    if (media.gif) run('UPDATE exercise_media SET gif = ?, gif_mime = ? WHERE exercise_id = ?', media.gif.data, media.gif.mime, id);
  }

  function customFields(data) {
    const steps = String(data.instructions || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    const secondary = String(data.secondary_muscles || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return {
      name: String(data.name || '').trim().toLowerCase(),
      body_part: String(data.body_part || '').trim().toLowerCase(),
      equipment: String(data.equipment || '').trim().toLowerCase(),
      target: String(data.target || '').trim().toLowerCase(),
      muscle_group: String(data.muscle_group || '').trim().toLowerCase() || null,
      secondary_muscles: JSON.stringify(secondary),
      instructions: JSON.stringify({ en: steps.join(' ') }),
      instruction_steps: JSON.stringify({ en: steps }),
    };
  }

  function createCustomExercise(data, media) {
    const f = customFields(data);
    if (!f.name || !f.body_part || !f.equipment || !f.target) throw new Error('Name, body part, equipment and target are required');
    return tx(() => {
      const id = nextCustomId();
      run(
        `INSERT INTO exercises (id, name, body_part, equipment, target, muscle_group, secondary_muscles, instructions, instruction_steps, is_custom)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        id, f.name, f.body_part, f.equipment, f.target, f.muscle_group, f.secondary_muscles, f.instructions, f.instruction_steps,
      );
      saveMedia(id, media);
      syncExerciseMuscles(id);
      return id;
    });
  }

  function updateCustomExercise(id, data, media) {
    const f = customFields(data);
    if (!f.name || !f.body_part || !f.equipment || !f.target) throw new Error('Name, body part, equipment and target are required');
    tx(() => {
      const r = run(
        `UPDATE exercises SET name = ?, body_part = ?, equipment = ?, target = ?, muscle_group = ?,
                secondary_muscles = ?, instructions = ?, instruction_steps = ?
          WHERE id = ? AND is_custom = 1`,
        f.name, f.body_part, f.equipment, f.target, f.muscle_group, f.secondary_muscles, f.instructions, f.instruction_steps, id,
      );
      if (!r.changes) throw new Error('Only custom exercises can be edited');
      saveMedia(id, media);
      syncExerciseMuscles(id);
    });
  }

  /* ---------------- muscle scores per exercise ---------------- */

  function insertMuscles(exerciseId, muscles) {
    muscles.forEach((m, i) => {
      run(
        `INSERT INTO exercise_muscles (exercise_id, muscle, points, position) VALUES (?, ?, ?, ?)
         ON CONFLICT(exercise_id, muscle) DO UPDATE SET position = excluded.position`,
        exerciseId, m.muscle, m.points, i,
      );
    });
  }

  // Give every exercise that has no muscle scores yet the defaults (see defaultMusclePoints),
  // and move exercises still on the original 3/1 rule to the current defaults once.
  function ensureExerciseMuscles() {
    upgradeMuscleDefaults();
    const missing = all(
      `SELECT id, name, target, secondary_muscles FROM exercises
        WHERE id NOT IN (SELECT DISTINCT exercise_id FROM exercise_muscles)`,
    );
    if (!missing.length) return 0;
    tx(() => {
      for (const ex of missing) insertMuscles(ex.id, defaultMusclePoints(ex.target, JSON.parse(ex.secondary_muscles || '[]'), ex.name));
    });
    return missing.length;
  }

  // Exercises whose scores still exactly match the old rule were never edited, so they get
  // the new defaults. Anything you changed by hand is left alone.
  function upgradeMuscleDefaults() {
    if (Number(getSetting('muscle_defaults_version', '1')) >= MUSCLE_DEFAULTS_VERSION) return;
    const rows = all('SELECT exercise_id, muscle, points FROM exercise_muscles ORDER BY exercise_id, position');
    const byExercise = new Map();
    for (const r of rows) {
      if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
      byExercise.get(r.exercise_id).push(`${r.muscle}:${r.points}`);
    }
    const exercises = all('SELECT id, name, target, secondary_muscles FROM exercises');
    tx(() => {
      for (const ex of exercises) {
        const saved = byExercise.get(ex.id);
        if (!saved) continue;
        const secondary = JSON.parse(ex.secondary_muscles || '[]');
        const legacy = legacyMusclePoints(ex.target, secondary).map((m) => `${m.muscle}:${m.points}`);
        if (saved.join('|') !== legacy.join('|')) continue; // edited by hand
        for (const m of defaultMusclePoints(ex.target, secondary, ex.name)) {
          run('UPDATE exercise_muscles SET points = ? WHERE exercise_id = ? AND muscle = ?', m.points, ex.id, m.muscle);
        }
      }
      setSetting('muscle_defaults_version', MUSCLE_DEFAULTS_VERSION);
    });
  }

  // After an exercise's target/secondary list changes: drop muscles no longer listed,
  // add new ones with default scores, keep scores already set for muscles still listed.
  // The target always scores at least the default target points.
  function syncExerciseMuscles(exerciseId) {
    const ex = get('SELECT name, target, secondary_muscles FROM exercises WHERE id = ?', exerciseId);
    if (!ex) return;
    const defaults = defaultMusclePoints(ex.target, JSON.parse(ex.secondary_muscles || '[]'), ex.name);
    const current = new Map(all('SELECT muscle, points FROM exercise_muscles WHERE exercise_id = ?', exerciseId).map((r) => [r.muscle, r.points]));
    const target = defaults[0] && defaults[0].muscle;
    const next = defaults.map((d) => ({
      muscle: d.muscle,
      points: current.has(d.muscle) ? (d.muscle === target ? Math.max(current.get(d.muscle), d.points) : current.get(d.muscle)) : d.points,
    }));
    run('DELETE FROM exercise_muscles WHERE exercise_id = ?', exerciseId);
    insertMuscles(exerciseId, next);
  }

  function getExerciseMuscles(exerciseId) {
    const rows = all('SELECT muscle, points FROM exercise_muscles WHERE exercise_id = ? ORDER BY position', exerciseId);
    if (rows.length) return rows.map((r) => ({ muscle: r.muscle, points: r.points }));
    const ex = get('SELECT name, target, secondary_muscles FROM exercises WHERE id = ?', exerciseId);
    return ex ? defaultMusclePoints(ex.target, JSON.parse(ex.secondary_muscles || '[]'), ex.name) : [];
  }

  // Update scores for muscles the exercise already lists. Unknown muscles are rejected.
  function setExerciseMuscles(exerciseId, scores) {
    const known = new Set(getExerciseMuscles(exerciseId).map((m) => m.muscle));
    if (!known.size) throw new Error('Exercise not found');
    tx(() => {
      if (!get('SELECT 1 FROM exercise_muscles WHERE exercise_id = ? LIMIT 1', exerciseId)) insertMuscles(exerciseId, getExerciseMuscles(exerciseId));
      for (const { muscle, points } of scores) {
        if (!known.has(muscle)) throw new Error(`“${muscle}” isn’t listed for this exercise`);
        const p = Number(points);
        if (!Number.isInteger(p) || p < 0 || p > MAX_POINTS) throw new Error(`Score must be a whole number from 0 to ${MAX_POINTS}`);
        run('UPDATE exercise_muscles SET points = ? WHERE exercise_id = ? AND muscle = ?', p, exerciseId, muscle);
      }
    });
    return getExerciseMuscles(exerciseId);
  }

  function resetExerciseMuscles(exerciseId) {
    tx(() => {
      run('DELETE FROM exercise_muscles WHERE exercise_id = ?', exerciseId);
      syncExerciseMuscles(exerciseId);
    });
    return getExerciseMuscles(exerciseId);
  }

  function deleteCustomExercise(id) {
    const used =
      get('SELECT COUNT(*) AS n FROM workout_exercises WHERE exercise_id = ?', id).n +
      get('SELECT COUNT(*) AS n FROM routine_exercises WHERE exercise_id = ?', id).n;
    if (used) throw new Error('This exercise is used in workouts or routines, so it can’t be deleted');
    run('DELETE FROM exercises WHERE id = ? AND is_custom = 1', id);
  }

  /* ---------------- routines ---------------- */

  function listRoutines() {
    const routines = all('SELECT * FROM routines ORDER BY name');
    const items = all(
      `SELECT re.routine_id, re.target_sets, e.id, e.name, e.body_part
         FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
        ORDER BY re.routine_id, re.position`,
    );
    const lastDone = all('SELECT routine_id, MAX(started_at) AS last FROM workouts WHERE routine_id IS NOT NULL GROUP BY routine_id');
    return routines.map((r) => {
      const ex = items.filter((i) => i.routine_id === r.id);
      return {
        ...r,
        exercises: ex,
        total_sets: ex.reduce((n, i) => n + i.target_sets, 0),
        body_parts: [...new Set(ex.map((i) => i.body_part))],
        last_done: lastDone.find((l) => l.routine_id === r.id)?.last || null,
      };
    });
  }

  function getRoutine(id) {
    const routine = get('SELECT * FROM routines WHERE id = ?', id);
    if (!routine) return null;
    routine.exercises = all(
      `SELECT re.*, e.name, e.body_part, e.equipment, e.target
         FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
        WHERE re.routine_id = ? ORDER BY re.position`,
      id,
    );
    return routine;
  }

  function saveRoutine({ id = null, name, notes = '', exercises = [] }) {
    name = String(name || '').trim();
    if (!name) throw new Error('Routine needs a name');
    return tx(() => {
      if (id) {
        const r = run('UPDATE routines SET name = ?, notes = ? WHERE id = ?', name, notes, id);
        if (!r.changes) throw new Error('Routine not found');
        run('DELETE FROM routine_exercises WHERE routine_id = ?', id);
      } else {
        id = Number(run('INSERT INTO routines (name, notes) VALUES (?, ?)', name, notes).lastInsertRowid);
      }
      exercises.forEach((ex, i) => {
        run(
          `INSERT INTO routine_exercises (routine_id, exercise_id, position, target_sets, target_reps, rest_seconds)
           VALUES (?, ?, ?, ?, ?, ?)`,
          id, ex.exercise_id, i,
          clampInt(ex.target_sets, 1, 20, 3),
          String(ex.target_reps || '8-12').slice(0, 20),
          clampInt(ex.rest_seconds, 0, 900, 90),
        );
      });
      return id;
    });
  }

  function deleteRoutine(id) {
    run('DELETE FROM routines WHERE id = ?', id);
  }

  /* ---------------- workouts ---------------- */

  function lastUnitFor(exerciseId) {
    const row = get(
      `SELECT s.unit FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.exercise_id = ? AND s.weight IS NOT NULL ORDER BY s.id DESC LIMIT 1`,
      exerciseId,
    );
    return row ? row.unit : displayUnit();
  }

  // Sets from the most recent *other* workout that included this exercise.
  function previousSets(exerciseId, excludeWorkoutId = 0) {
    const last = get(
      `SELECT w.id, w.started_at FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id
        WHERE we.exercise_id = ? AND w.id != ?
          AND EXISTS (SELECT 1 FROM sets s WHERE s.workout_exercise_id = we.id AND s.done = 1)
        ORDER BY w.started_at DESC LIMIT 1`,
      exerciseId, excludeWorkoutId,
    );
    if (!last) return null;
    const sets = all(
      `SELECT s.weight, s.unit, s.reps, s.is_warmup FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = ? AND we.exercise_id = ? AND s.done = 1 ORDER BY we.position, s.set_number`,
      last.id, exerciseId,
    );
    return { workout_id: last.id, date: last.started_at, sets };
  }

  function insertWorkoutExercise(workoutId, exerciseId, restSeconds = 90) {
    const pos = get('SELECT COALESCE(MAX(position) + 1, 0) AS p FROM workout_exercises WHERE workout_id = ?', workoutId).p;
    return Number(
      run('INSERT INTO workout_exercises (workout_id, exercise_id, position, rest_seconds) VALUES (?, ?, ?, ?)', workoutId, exerciseId, pos, restSeconds)
        .lastInsertRowid,
    );
  }

  function insertSet(weId, { weight = null, unit, reps = null, is_warmup = 0 } = {}) {
    const n = get('SELECT COALESCE(MAX(set_number) + 1, 1) AS n FROM sets WHERE workout_exercise_id = ?', weId).n;
    return Number(
      run('INSERT INTO sets (workout_exercise_id, set_number, weight, unit, reps, is_warmup) VALUES (?, ?, ?, ?, ?, ?)', weId, n, weight, unit, reps, is_warmup ? 1 : 0)
        .lastInsertRowid,
    );
  }

  function startWorkout({ routineId = null, name = '' } = {}) {
    return tx(() => {
      const routine = routineId ? getRoutine(routineId) : null;
      const title = String(name || '').trim() || (routine ? routine.name : defaultWorkoutName());
      const id = Number(run('INSERT INTO workouts (name, routine_id) VALUES (?, ?)', title, routine ? routine.id : null).lastInsertRowid);
      if (routine) {
        for (const re of routine.exercises) {
          const weId = insertWorkoutExercise(id, re.exercise_id, re.rest_seconds);
          const unit = lastUnitFor(re.exercise_id);
          for (let i = 0; i < re.target_sets; i++) insertSet(weId, { unit });
        }
      }
      return id;
    });
  }

  function defaultWorkoutName() {
    const h = new Date().getHours();
    const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
    return `${part} workout`;
  }

  function inProgressWorkout() {
    return get('SELECT * FROM workouts WHERE finished_at IS NULL ORDER BY started_at DESC LIMIT 1');
  }

  function getWorkout(id) {
    const workout = get('SELECT w.*, r.name AS routine_name FROM workouts w LEFT JOIN routines r ON r.id = w.routine_id WHERE w.id = ?', id);
    if (!workout) return null;
    const exercises = all(
      `SELECT we.*, e.name, e.body_part, e.equipment, e.target, (m.image IS NOT NULL) AS has_image
         FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
         LEFT JOIN exercise_media m ON m.exercise_id = e.id
        WHERE we.workout_id = ? ORDER BY we.position`,
      id,
    );
    const sets = all(
      `SELECT s.* FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
        WHERE we.workout_id = ? ORDER BY s.set_number`,
      id,
    );
    workout.exercises = exercises.map((we) => ({ ...we, sets: sets.filter((s) => s.workout_exercise_id === we.id) }));
    return workout;
  }

  function updateWorkout(id, { name, notes, started_at, finished_at }) {
    const w = get('SELECT * FROM workouts WHERE id = ?', id);
    if (!w) throw new Error('Workout not found');
    run(
      'UPDATE workouts SET name = ?, notes = ?, started_at = ?, finished_at = ? WHERE id = ?',
      name !== undefined ? String(name).trim() || w.name : w.name,
      notes !== undefined ? notes : w.notes,
      started_at || w.started_at,
      finished_at !== undefined ? finished_at : w.finished_at,
      id,
    );
  }

  function finishWorkout(id) {
    return tx(() => {
      // Drop empty sets that were never filled in, then exercises left with no sets.
      run(
        `DELETE FROM sets WHERE done = 0 AND weight IS NULL AND reps IS NULL
           AND workout_exercise_id IN (SELECT id FROM workout_exercises WHERE workout_id = ?)`,
        id,
      );
      run('DELETE FROM workout_exercises WHERE workout_id = ? AND id NOT IN (SELECT workout_exercise_id FROM sets)', id);
      run("UPDATE workouts SET finished_at = COALESCE(finished_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) WHERE id = ?", id);
    });
  }

  function deleteWorkout(id) {
    run('DELETE FROM workouts WHERE id = ?', id);
  }

  function listWorkouts({ limit = 20, offset = 0, unit = displayUnit() } = {}) {
    const total = get('SELECT COUNT(*) AS n FROM workouts WHERE finished_at IS NOT NULL').n;
    const rows = all(
      `SELECT w.*,
              (SELECT COUNT(*) FROM workout_exercises we WHERE we.workout_id = w.id) AS exercise_count,
              (SELECT COUNT(*) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
                WHERE we.workout_id = w.id AND ${WORKING_SQL}) AS set_count,
              (SELECT COALESCE(SUM(${KG_SQL} * s.reps), 0) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
                WHERE we.workout_id = w.id AND ${WORKING_SQL}) AS volume_kg,
              (SELECT GROUP_CONCAT(name, ' · ') FROM (
                  SELECT e.name FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id
                   WHERE we.workout_id = w.id ORDER BY we.position)) AS exercise_names
         FROM workouts w WHERE w.finished_at IS NOT NULL
        ORDER BY w.started_at DESC LIMIT ? OFFSET ?`,
      limit, offset,
    );
    return { total, rows: rows.map((r) => ({ ...r, volume: Math.round(convert(r.volume_kg, 'kg', unit)) })) };
  }

  function workoutToRoutine(workoutId) {
    const w = getWorkout(workoutId);
    if (!w) throw new Error('Workout not found');
    return saveRoutine({
      name: w.name,
      exercises: w.exercises.map((we) => ({
        exercise_id: we.exercise_id,
        target_sets: Math.max(1, we.sets.filter((s) => !s.is_warmup).length),
        target_reps: '8-12',
        rest_seconds: we.rest_seconds,
      })),
    });
  }

  /* ---------------- workout exercises & sets (logger API) ---------------- */

  function addWorkoutExercise(workoutId, exerciseId) {
    if (!get('SELECT 1 FROM exercises WHERE id = ?', exerciseId)) throw new Error('Unknown exercise');
    return tx(() => {
      const weId = insertWorkoutExercise(workoutId, exerciseId);
      insertSet(weId, { unit: lastUnitFor(exerciseId) });
      return weId;
    });
  }

  function removeWorkoutExercise(weId) {
    run('DELETE FROM workout_exercises WHERE id = ?', weId);
  }

  function moveWorkoutExercise(weId, direction) {
    const we = get('SELECT * FROM workout_exercises WHERE id = ?', weId);
    if (!we) return;
    const op = direction < 0 ? '<' : '>';
    const order = direction < 0 ? 'DESC' : 'ASC';
    const other = get(
      `SELECT * FROM workout_exercises WHERE workout_id = ? AND position ${op} ? ORDER BY position ${order} LIMIT 1`,
      we.workout_id, we.position,
    );
    if (!other) return;
    tx(() => {
      run('UPDATE workout_exercises SET position = ? WHERE id = ?', other.position, we.id);
      run('UPDATE workout_exercises SET position = ? WHERE id = ?', we.position, other.id);
    });
  }

  function updateWorkoutExercise(weId, { rest_seconds, notes }) {
    const we = get('SELECT * FROM workout_exercises WHERE id = ?', weId);
    if (!we) throw new Error('Not found');
    run(
      'UPDATE workout_exercises SET rest_seconds = ?, notes = ? WHERE id = ?',
      rest_seconds !== undefined ? clampInt(rest_seconds, 0, 900, we.rest_seconds) : we.rest_seconds,
      notes !== undefined ? notes : we.notes,
      weId,
    );
  }

  // New set copies the last filled-in set of this exercise so you just tap ✓.
  function addSet(weId) {
    const prev =
      get('SELECT * FROM sets WHERE workout_exercise_id = ? AND (weight IS NOT NULL OR reps IS NOT NULL) ORDER BY set_number DESC LIMIT 1', weId) ||
      get('SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY set_number DESC LIMIT 1', weId);
    const we = get('SELECT exercise_id FROM workout_exercises WHERE id = ?', weId);
    if (!we) throw new Error('Not found');
    const id = insertSet(weId, prev ? { weight: prev.weight, unit: prev.unit, reps: prev.reps } : { unit: lastUnitFor(we.exercise_id) });
    return get('SELECT * FROM sets WHERE id = ?', id);
  }

  function updateSet(id, fields) {
    const s = get('SELECT * FROM sets WHERE id = ?', id);
    if (!s) throw new Error('Set not found');
    const num = (v) => (v === '' || v === null ? null : Number(v));
    const next = {
      weight: 'weight' in fields ? num(fields.weight) : s.weight,
      unit: 'unit' in fields && isUnit(fields.unit) ? fields.unit : s.unit,
      reps: 'reps' in fields ? num(fields.reps) : s.reps,
      is_warmup: 'is_warmup' in fields ? (fields.is_warmup ? 1 : 0) : s.is_warmup,
      done: 'done' in fields ? (fields.done ? 1 : 0) : s.done,
    };
    if (next.weight != null && (!Number.isFinite(next.weight) || next.weight < 0)) throw new Error('Invalid weight');
    if (next.reps != null && (!Number.isInteger(next.reps) || next.reps < 0)) throw new Error('Invalid reps');
    run('UPDATE sets SET weight = ?, unit = ?, reps = ?, is_warmup = ?, done = ? WHERE id = ?', next.weight, next.unit, next.reps, next.is_warmup, next.done, id);
    return get('SELECT * FROM sets WHERE id = ?', id);
  }

  // Switching an exercise's unit converts every set already entered so the numbers stay true.
  function setExerciseUnit(weId, unit) {
    if (!isUnit(unit)) throw new Error('Invalid unit');
    const sets = all('SELECT * FROM sets WHERE workout_exercise_id = ?', weId);
    tx(() => {
      for (const s of sets) {
        if (s.unit === unit) continue;
        const w = s.weight == null ? null : Math.round(convert(s.weight, s.unit, unit) * 4) / 4;
        run('UPDATE sets SET weight = ?, unit = ? WHERE id = ?', w, unit, s.id);
      }
    });
    return all('SELECT * FROM sets WHERE workout_exercise_id = ? ORDER BY set_number', weId);
  }

  function deleteSet(id) {
    const s = get('SELECT * FROM sets WHERE id = ?', id);
    if (!s) return;
    tx(() => {
      run('DELETE FROM sets WHERE id = ?', id);
      run('UPDATE sets SET set_number = set_number - 1 WHERE workout_exercise_id = ? AND set_number > ?', s.workout_exercise_id, s.set_number);
    });
  }

  /* ---------------- history & stats ---------------- */

  // Every set ever logged for an exercise, with its workout date (oldest first).
  function exerciseSets(exerciseId) {
    return all(
      `SELECT s.*, w.id AS workout_id, w.started_at, w.name AS workout_name
         FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND w.finished_at IS NOT NULL
        ORDER BY w.started_at, we.position, s.set_number`,
      exerciseId,
    );
  }

  function exercisesWithHistory() {
    return all(
      `SELECT e.id, e.name, e.body_part, COUNT(DISTINCT we.workout_id) AS sessions, MAX(w.started_at) AS last_done
         FROM exercises e JOIN workout_exercises we ON we.exercise_id = e.id
         JOIN workouts w ON w.id = we.workout_id
         JOIN sets s ON s.workout_exercise_id = we.id
        WHERE w.finished_at IS NOT NULL AND ${WORKING_SQL}
        GROUP BY e.id ORDER BY last_done DESC`,
    );
  }

  function statsSince(isoStart, unit = displayUnit()) {
    const row = get(
      `SELECT COUNT(DISTINCT w.id) AS workouts,
              COUNT(s.id) AS sets,
              COALESCE(SUM(${KG_SQL} * s.reps), 0) AS volume_kg,
              COALESCE(SUM(s.reps), 0) AS reps
         FROM workouts w
         LEFT JOIN workout_exercises we ON we.workout_id = w.id
         LEFT JOIN sets s ON s.workout_exercise_id = we.id AND ${WORKING_SQL}
        WHERE w.finished_at IS NOT NULL AND w.started_at >= ?`,
      isoStart,
    );
    return { ...row, volume: Math.round(convert(row.volume_kg, 'kg', unit)) };
  }

  function totals() {
    return get(
      `SELECT (SELECT COUNT(*) FROM workouts WHERE finished_at IS NOT NULL) AS workouts,
              (SELECT MIN(started_at) FROM workouts WHERE finished_at IS NOT NULL) AS first_workout`,
    );
  }

  // Working-set volume per workout, for weekly charts (grouped in JS by local week).
  function workoutVolumes(isoStart, unit = displayUnit()) {
    return all(
      `SELECT w.id, w.started_at, COALESCE(SUM(${KG_SQL} * s.reps), 0) AS volume_kg, COUNT(s.id) AS sets
         FROM workouts w
         LEFT JOIN workout_exercises we ON we.workout_id = w.id
         LEFT JOIN sets s ON s.workout_exercise_id = we.id AND ${WORKING_SQL}
        WHERE w.finished_at IS NOT NULL AND w.started_at >= ?
        GROUP BY w.id ORDER BY w.started_at`,
      isoStart,
    ).map((r) => ({ ...r, volume: convert(r.volume_kg, 'kg', unit) }));
  }

  // Working sets per body part since a date — "what have I trained lately".
  function bodyPartSets(isoStart) {
    return all(
      `SELECT e.body_part, COUNT(s.id) AS sets
         FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id
         JOIN exercises e ON e.id = we.exercise_id
         JOIN sets s ON s.workout_exercise_id = we.id
        WHERE w.finished_at IS NOT NULL AND w.started_at >= ? AND ${WORKING_SQL}
        GROUP BY e.body_part ORDER BY sets DESC`,
      isoStart,
    );
  }

  // One row per exercise per workout with its completed working-set count, since a date.
  // Includes the workout in progress so today's ticked-off sets show up immediately.
  function exerciseLog(isoStart) {
    const muscleCache = new Map();
    return all(
      `SELECT w.id AS workout_id, w.started_at, e.id AS exercise_id, e.body_part, e.target, e.secondary_muscles,
              COUNT(s.id) AS sets
         FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id
         JOIN exercises e ON e.id = we.exercise_id
         JOIN sets s ON s.workout_exercise_id = we.id
        WHERE w.started_at >= ? AND ${WORKING_SQL}
        GROUP BY we.id ORDER BY w.started_at`,
      isoStart,
    ).map((r) => {
      // One muscle-score lookup per distinct exercise, not per row.
      if (!muscleCache.has(r.exercise_id)) muscleCache.set(r.exercise_id, getExerciseMuscles(r.exercise_id));
      return { ...r, secondary_muscles: JSON.parse(r.secondary_muscles || '[]'), muscles: muscleCache.get(r.exercise_id) };
    });
  }

  function backupTo(file) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    db.prepare('VACUUM INTO ?').run(file);
  }

  return {
    db, tx, all, get, run,
    getSetting, setSetting, displayUnit,
    exerciseCount, searchExercises, filterOptions, getExercise, getMedia, saveMedia,
    createCustomExercise, updateCustomExercise, deleteCustomExercise, nextCustomId,
    ensureExerciseMuscles, syncExerciseMuscles, getExerciseMuscles, setExerciseMuscles, resetExerciseMuscles,
    listRoutines, getRoutine, saveRoutine, deleteRoutine,
    lastUnitFor, previousSets, startWorkout, inProgressWorkout, getWorkout, updateWorkout,
    finishWorkout, deleteWorkout, listWorkouts, workoutToRoutine,
    addWorkoutExercise, removeWorkoutExercise, moveWorkoutExercise, updateWorkoutExercise,
    addSet, updateSet, setExerciseUnit, deleteSet,
    exerciseSets, exercisesWithHistory, statsSince, totals, workoutVolumes, bodyPartSets, exerciseLog,
    backupTo, close: () => db.close(),
  };
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

module.exports = { openDb, DEFAULT_PATH };
