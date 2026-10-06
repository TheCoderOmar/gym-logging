const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');

function freshDb() {
  const repo = openDb(':memory:');
  const ins = repo.db.prepare('INSERT INTO exercises (id, name, body_part, equipment, target) VALUES (?, ?, ?, ?, ?)');
  ins.run('0001', 'barbell bench press', 'chest', 'barbell', 'pectorals');
  ins.run('0002', 'barbell full squat', 'upper legs', 'barbell', 'glutes');
  ins.run('0003', 'dumbbell curl', 'upper arms', 'dumbbell', 'biceps');
  return repo;
}

function logSet(repo, weId, weight, unit, reps, extra = {}) {
  const s = repo.addSet(weId);
  return repo.updateSet(s.id, { weight, unit, reps, done: 1, ...extra });
}

test('routine → workout pre-fills exercises and empty sets', () => {
  const repo = freshDb();
  const rid = repo.saveRoutine({
    name: 'Push',
    exercises: [
      { exercise_id: '0001', target_sets: 3, target_reps: '5', rest_seconds: 120 },
      { exercise_id: '0003', target_sets: 2 },
    ],
  });
  const wid = repo.startWorkout({ routineId: rid });
  const w = repo.getWorkout(wid);
  assert.equal(w.name, 'Push');
  assert.equal(w.exercises.length, 2);
  assert.deepEqual(w.exercises.map((e) => e.sets.length), [3, 2]);
  assert.equal(w.exercises[0].rest_seconds, 120);
  assert.equal(repo.inProgressWorkout().id, wid);
});

test('finishing drops empty sets and exercises, keeps logged ones', () => {
  const repo = freshDb();
  const wid = repo.startWorkout();
  const bench = repo.addWorkoutExercise(wid, '0001'); // comes with one empty set
  repo.addWorkoutExercise(wid, '0002');               // left empty
  const [first] = repo.getWorkout(wid).exercises[0].sets;
  repo.updateSet(first.id, { weight: 80, reps: 8, done: 1 });
  repo.addSet(bench); // copies 80x8 but stays not-done → kept (has values)
  repo.finishWorkout(wid);
  const w = repo.getWorkout(wid);
  assert.ok(w.finished_at);
  assert.equal(w.exercises.length, 1);
  assert.equal(w.exercises[0].sets.length, 2);
  assert.equal(repo.inProgressWorkout(), undefined);
});

test('mixed kg/lb stats and unit memory', () => {
  const repo = freshDb();
  const w1 = repo.startWorkout();
  const we1 = repo.addWorkoutExercise(w1, '0001');
  repo.deleteSet(repo.getWorkout(w1).exercises[0].sets[0].id);
  logSet(repo, we1, 100, 'kg', 5);
  repo.finishWorkout(w1);

  const w2 = repo.startWorkout();
  const we2 = repo.addWorkoutExercise(w2, '0001');
  repo.deleteSet(repo.getWorkout(w2).exercises[0].sets[0].id);
  logSet(repo, we2, 225, 'lb', 5);
  logSet(repo, we2, 135, 'lb', 10, { is_warmup: 1 });
  repo.finishWorkout(w2);

  assert.equal(repo.lastUnitFor('0001'), 'lb');
  assert.equal(repo.lastUnitFor('0002'), 'kg'); // falls back to display unit

  const list = repo.listWorkouts({ unit: 'kg' });
  assert.equal(list.total, 2);
  const vol = Object.fromEntries(list.rows.map((r) => [r.id, r.volume]));
  assert.equal(vol[w1], 500);
  assert.equal(vol[w2], Math.round(225 * 0.45359237 * 5)); // warmup excluded

  const stats = repo.statsSince('2000-01-01', 'kg');
  assert.equal(stats.workouts, 2);
  assert.equal(stats.sets, 2);

  const prev = repo.previousSets('0001', w2);
  assert.equal(prev.workout_id, w1);
  assert.equal(prev.sets[0].weight, 100);

  assert.equal(repo.exerciseSets('0001').length, 3);
  assert.equal(repo.exercisesWithHistory()[0].sessions, 2);
});

test('switching an exercise unit converts its sets', () => {
  const repo = freshDb();
  const wid = repo.startWorkout();
  const we = repo.addWorkoutExercise(wid, '0001');
  const [s] = repo.getWorkout(wid).exercises[0].sets;
  repo.updateSet(s.id, { weight: 100, unit: 'kg', reps: 5 });
  const sets = repo.setExerciseUnit(we, 'lb');
  assert.equal(sets[0].unit, 'lb');
  assert.equal(sets[0].weight, 220.5); // rounded to nearest 0.25
});

test('custom exercises get C-ids, are editable, and protected once used', () => {
  const repo = freshDb();
  const id = repo.createCustomExercise({ name: 'Landmine Press', body_part: 'shoulders', equipment: 'barbell', target: 'delts', instructions: 'Step one\nStep two' });
  assert.equal(id, 'C0001');
  assert.equal(repo.nextCustomId(), 'C0002');
  const ex = repo.getExercise(id);
  assert.equal(ex.name, 'landmine press');
  assert.deepEqual(ex.instruction_steps.en, ['Step one', 'Step two']);
  assert.throws(() => repo.updateCustomExercise('0001', { name: 'x', body_part: 'x', equipment: 'x', target: 'x' }));
  const wid = repo.startWorkout();
  repo.addWorkoutExercise(wid, id);
  assert.throws(() => repo.deleteCustomExercise(id), /used/);
});

test('search ranks done exercises first and filters', () => {
  const repo = freshDb();
  const wid = repo.startWorkout();
  repo.addWorkoutExercise(wid, '0003');
  const all = repo.searchExercises();
  assert.equal(all.total, 3);
  assert.equal(all.rows[0].id, '0003');
  assert.equal(repo.searchExercises({ q: 'barbell squat' }).rows[0].id, '0002');
  assert.equal(repo.searchExercises({ body_part: 'chest' }).total, 1);
});

test('updateSet validates input', () => {
  const repo = freshDb();
  const wid = repo.startWorkout();
  repo.addWorkoutExercise(wid, '0001');
  const [s] = repo.getWorkout(wid).exercises[0].sets;
  assert.throws(() => repo.updateSet(s.id, { weight: -5 }));
  assert.throws(() => repo.updateSet(s.id, { reps: 2.5 }));
  assert.equal(repo.updateSet(s.id, { weight: '', reps: '' }).weight, null);
});

test('muscle scores: defaults for every exercise, editable, resettable, synced on edit', () => {
  const repo = openDb(':memory:');
  repo.db.prepare("INSERT INTO exercises (id, name, body_part, equipment, target, secondary_muscles) VALUES ('0150', 'cable pulldown', 'back', 'cable', 'lats', ?)")
    .run(JSON.stringify(['biceps', 'rhomboids', 'rear deltoids']));
  assert.equal(repo.ensureExerciseMuscles(), 1);
  assert.equal(repo.ensureExerciseMuscles(), 0); // idempotent
  assert.deepEqual(repo.getExerciseMuscles('0150'), [
    { muscle: 'lats', points: 3 }, { muscle: 'biceps', points: 2 }, { muscle: 'rhomboids', points: 2 }, { muscle: 'rear deltoids', points: 2 },
  ]);

  repo.setExerciseMuscles('0150', [{ muscle: 'rear deltoids', points: 3 }, { muscle: 'biceps', points: 1 }]);
  assert.equal(repo.getExerciseMuscles('0150').find((m) => m.muscle === 'rear deltoids').points, 3);
  assert.throws(() => repo.setExerciseMuscles('0150', [{ muscle: 'quads', points: 2 }]), /isn’t listed/);
  assert.throws(() => repo.setExerciseMuscles('0150', [{ muscle: 'biceps', points: 4 }]), /0 to 3/);

  // The heat map uses the edited scores: shoulders 2 sets × 3 = 6, biceps 2 sets × 1 = 2 (< 3).
  const wid = repo.startWorkout();
  const we = repo.addWorkoutExercise(wid, '0150');
  const [s] = repo.getWorkout(wid).exercises[0].sets;
  repo.updateSet(s.id, { weight: 50, reps: 10, done: 1 });
  const s2 = repo.addSet(we);
  repo.updateSet(s2.id, { done: 1 });
  const { muscleStatus } = require('../src/lib/muscles');
  const status = muscleStatus(repo.exerciseLog('2000-01-01'), new Date());
  assert.equal(status.shoulders.bucket, 'today');
  assert.equal(status.shoulders.points, 6);
  assert.equal(status.biceps.bucket, 'never'); // 2 sets × 1 point

  assert.equal(repo.resetExerciseMuscles('0150').find((m) => m.muscle === 'rear deltoids').points, 2);

  // Custom exercise: scores follow edits to its muscle lists, keeping changed scores.
  const id = repo.createCustomExercise({ name: 'Landmine press', body_part: 'shoulders', equipment: 'barbell', target: 'delts', secondary_muscles: 'triceps, upper chest' });
  repo.setExerciseMuscles(id, [{ muscle: 'triceps', points: 3 }]);
  repo.updateCustomExercise(id, { name: 'Landmine press', body_part: 'shoulders', equipment: 'barbell', target: 'delts', secondary_muscles: 'triceps, serratus anterior' });
  assert.deepEqual(repo.getExerciseMuscles(id), [
    { muscle: 'delts', points: 3 }, { muscle: 'triceps', points: 3 }, { muscle: 'serratus anterior', points: 1 },
  ]);
});

test('muscle defaults upgrade: unedited exercises move to the new rule, edited ones are kept', () => {
  const repo = openDb(':memory:');
  const ins = repo.db.prepare('INSERT INTO exercises (id, name, body_part, equipment, target, secondary_muscles) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run('0001', 'barbell bench press', 'chest', 'barbell', 'pectorals', JSON.stringify(['triceps', 'shoulders']));
  ins.run('0002', 'dumbbell bench press', 'chest', 'dumbbell', 'pectorals', JSON.stringify(['triceps', 'shoulders']));
  // Simulate a database from before: old 3/1 scores, one exercise edited by hand.
  const put = repo.db.prepare('INSERT INTO exercise_muscles (exercise_id, muscle, points, position) VALUES (?, ?, ?, ?)');
  [['0001', 'pectorals', 3], ['0001', 'triceps', 1], ['0001', 'shoulders', 1], ['0002', 'pectorals', 3], ['0002', 'triceps', 1], ['0002', 'shoulders', 3]]
    .forEach(([e, m, p], i) => put.run(e, m, p, i % 3));
  repo.setSetting('muscle_defaults_version', 1);
  repo.ensureExerciseMuscles();
  assert.deepEqual(repo.getExerciseMuscles('0001').map((m) => m.points), [3, 2, 2]); // upgraded
  assert.deepEqual(repo.getExerciseMuscles('0002').map((m) => m.points), [3, 1, 3]); // hand-edited, kept
  assert.equal(repo.getSetting('muscle_defaults_version'), '2');
});
