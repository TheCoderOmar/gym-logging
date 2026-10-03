const test = require('node:test');
const assert = require('node:assert/strict');
const { convert, toKg, round1, format } = require('../src/lib/units');
const { e1rm, volume, sessionSummaries, personalRecords } = require('../src/lib/stats');

test('unit conversion round-trips', () => {
  assert.equal(round1(convert(100, 'kg', 'lb')), 220.5);
  assert.equal(round1(toKg(225, 'lb')), 102.1);
  assert.equal(convert(60, 'kg', 'kg'), 60);
  assert.equal(convert(null, 'kg', 'lb'), null);
  assert.ok(Math.abs(convert(convert(80, 'kg', 'lb'), 'lb', 'kg') - 80) < 1e-9);
  assert.equal(format(102.5, 'kg'), '102.5 kg');
  assert.equal(format(null, 'kg'), '—');
});

test('Epley e1RM', () => {
  assert.equal(e1rm(100, 1), 100);
  assert.equal(e1rm(100, 10), 100 * (1 + 10 / 30));
  assert.equal(e1rm(0, 5), 0);
  assert.equal(e1rm(100, 0), 0);
});

const set = (o) => ({ done: 1, is_warmup: 0, unit: 'kg', workout_id: 1, started_at: '2026-01-01T10:00:00Z', ...o });

test('volume skips warmups and unfinished sets, converts lb', () => {
  const sets = [
    set({ weight: 100, reps: 5 }),                 // 500 kg
    set({ weight: 50, reps: 10, is_warmup: 1 }),   // warmup, ignored
    set({ weight: 100, reps: 5, done: 0 }),        // not done, ignored
    set({ weight: 220.462, unit: 'lb', reps: 2 }), // ~100 kg x 2 = 200
  ];
  assert.equal(Math.round(volume(sets, 'kg')), 700);
  assert.equal(Math.round(volume(sets, 'lb')), Math.round(700 / 0.45359237));
});

test('session summaries group by workout in date order, mixing units', () => {
  const sets = [
    set({ workout_id: 2, started_at: '2026-01-08T10:00:00Z', weight: 225, unit: 'lb', reps: 5 }),
    set({ workout_id: 1, weight: 100, reps: 5 }),
    set({ workout_id: 1, weight: 90, reps: 8 }),
  ];
  const s = sessionSummaries(sets, 'kg');
  assert.equal(s.length, 2);
  assert.equal(s[0].workout_id, 1);
  assert.equal(s[0].topWeight, 100);
  assert.equal(s[0].volume, 100 * 5 + 90 * 8);
  assert.equal(s[1].topWeight, 102.1);
});

test('personal records', () => {
  const sets = [
    set({ weight: 100, reps: 5 }),
    set({ weight: 110, reps: 1 }),
    set({ weight: 60, reps: 20 }),
    set({ weight: 250, unit: 'lb', reps: 1, is_warmup: 1 }), // warmup never counts
  ];
  const pr = personalRecords(sets, 'kg');
  assert.equal(pr.heaviest.weight, 110);
  assert.equal(pr.mostReps.reps, 20);
  assert.equal(pr.bestE1rm.e1rm, round1(100 * (1 + 5 / 30)));
  assert.equal(pr.repMaxes[5].weight, 100);
  assert.equal(pr.repMaxes[20], undefined);
  assert.equal(personalRecords([], 'kg'), null);
});
