const test = require('node:test');
const assert = require('node:assert/strict');
const { openDb } = require('../src/db');

function freshDb() {
  const repo = openDb(':memory:');
  const ins = repo.db.prepare('INSERT INTO exercises (id, name, body_part, equipment, target) VALUES (?, ?, ?, ?, ?)');
  ins.run('0001', 'barbell bench press', 'chest', 'barbell', 'pectorals');
  ins.run('0002', 'barbell full squat', 'upper legs', 'barbell', 'glutes');
  return repo;
}

const payload = () => ({
  workouts: [{
    client_id: 'w-1111',
    name: 'Phone push',
    date: '2026-10-14',
    notes: 'felt good',
    exercises: [
      { exercise_id: '0001', rest_seconds: 0, sets: [
        { weight: 60, unit: 'kg', reps: 10, is_warmup: 1, done: 1 },
        { weight: 80, unit: 'kg', reps: 8, is_warmup: 0, done: 1 },
        { weight: 185, unit: 'lb', reps: 5, is_warmup: 0, done: 1 },
      ] },
      { exercise_id: '0002', sets: [{ weight: 100, unit: 'kg', reps: 5 }] }, // not ticked: counts (has reps)
    ],
  }],
  sports: [{ client_id: 's-2222', sport: 'football', date: '2026-10-13', minutes: 120, notes: '' }],
});

test('importFromPhone adds finished workouts with their sets, and sports sessions', () => {
  const repo = freshDb();
  const res = repo.importFromPhone(payload());
  assert.deepEqual(res, { workouts: 1, edited: 0, sports: 1 });
  const [row] = repo.listHistory({ kind: 'workout' }).rows;
  const w = repo.getWorkout(row.id);
  assert.equal(w.name, 'Phone push');
  assert.equal(w.notes, 'felt good');
  assert.ok(w.finished_at);
  assert.equal(new Date(w.started_at).getDate(), 14);
  assert.deepEqual(w.exercises.map((e) => e.exercise_id), ['0001', '0002']);
  assert.deepEqual(w.exercises[0].sets.map((s) => [s.weight, s.unit, s.reps, s.is_warmup]), [[60, 'kg', 10, 1], [80, 'kg', 8, 0], [185, 'lb', 5, 0]]);
  assert.equal(w.exercises[1].sets[0].done, 1);
  const [sport] = repo.listHistory({ kind: 'sport' }).rows;
  assert.equal(sport.sport, 'football');
  assert.equal(sport.minutes, 120);
  assert.equal(repo.inProgressWorkout(), undefined); // never leaves a live workout on the PC
});

test('importFromPhone is idempotent: the same payload twice adds nothing the second time', () => {
  const repo = freshDb();
  repo.importFromPhone(payload());
  assert.deepEqual(repo.importFromPhone(payload()), { workouts: 0, edited: 0, sports: 0 });
  assert.equal(repo.listHistory().total, 2);
});

test('importFromPhone rejects bad records without importing anything', () => {
  const repo = freshDb();
  const bad = payload();
  bad.workouts[0].exercises[0].exercise_id = 'nope';
  assert.throws(() => repo.importFromPhone(bad), /Unknown exercise/);
  assert.equal(repo.listHistory().total, 0); // sport not imported either (one transaction)
  const noId = payload();
  delete noId.sports[0].client_id;
  assert.throws(() => repo.importFromPhone(noId), /client_id/);
});

test('snapshotForPhone has everything the phone needs to work offline', () => {
  const repo = freshDb();
  repo.importFromPhone(payload());
  const snap = repo.snapshotForPhone();
  assert.ok(snap.generated_at);
  const bench = snap.exercises.find((e) => e.id === '0001');
  assert.equal(bench.name, 'barbell bench press');
  assert.ok(Array.isArray(bench.secondary_muscles));
  assert.ok(bench.muscles.length > 0);
  assert.ok(Array.isArray(bench.heads));
  assert.equal(snap.workouts.length, 1);
  assert.equal(snap.workouts[0].client_id, 'w-1111');
  assert.equal(snap.workouts[0].exercises[0].sets.length, 3);
  assert.equal(snap.sports[0].client_id, 's-2222');
  assert.equal(snap.settings.display_unit, 'kg');
  assert.ok(Array.isArray(snap.routines));
});

test('importFromPhone applies an edit made on the phone: replaces the workout, repeatably', () => {
  const repo = freshDb();
  repo.importFromPhone(payload());
  const edit = { client_id: 'w-1111', edited: true, name: 'Push (fixed)', date: '2026-10-15', notes: '',
    exercises: [{ exercise_id: '0002', sets: [{ weight: 120, unit: 'kg', reps: 3, done: 1 }] }] };
  assert.deepEqual(repo.importFromPhone({ workouts: [edit] }), { workouts: 0, edited: 1, sports: 0 });
  assert.deepEqual(repo.importFromPhone({ workouts: [edit] }), { workouts: 0, edited: 1, sports: 0 });
  const rows = repo.listHistory({ kind: 'workout' }).rows;
  assert.equal(rows.length, 1);
  const w = repo.getWorkout(rows[0].id);
  assert.equal(w.name, 'Push (fixed)');
  assert.equal(w.notes, null);
  assert.equal(new Date(w.started_at).getDate(), 15);
  assert.deepEqual(w.exercises.map((e) => [e.exercise_id, e.sets.map((s) => [s.weight, s.reps])]), [['0002', [[120, 3]]]]);
});

test('importFromPhone edits a workout logged on the PC by its "pc-<id>" client id', () => {
  const repo = freshDb();
  repo.importFromPhone(payload());
  repo.db.prepare('UPDATE workouts SET client_id = NULL').run(); // as if it was logged on the PC
  const snapW = repo.snapshotForPhone().workouts[0];
  assert.match(snapW.client_id, /^pc-\d+$/);
  const res = repo.importFromPhone({ workouts: [{ ...snapW, edited: true, date: '2026-10-14', name: 'Renamed' }] });
  assert.equal(res.edited, 1);
  const rows = repo.listHistory({ kind: 'workout' }).rows;
  assert.equal(rows.length, 1);
  assert.equal(repo.getWorkout(rows[0].id).name, 'Renamed');
});
