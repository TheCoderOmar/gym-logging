const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/lib/muscles');

const NOW = new Date(2026, 9, 6, 18, 0); // 6 Oct 2026, 18:00 local
const daysAgo = (n, hour = 10) => new Date(2026, 9, 6 - n, hour).toISOString();

test('exercise regions: target 3 points, secondary 1, target wins over duplicates', () => {
  const r = m.exerciseRegions('pectorals', ['triceps', 'shoulders', 'chest']);
  assert.equal(r.get('chest'), 3);
  assert.equal(r.get('triceps'), 1);
  assert.equal(r.get('shoulders'), 1);
  assert.equal(m.exerciseRegions('cardiovascular system', []).size, 0);
});

test('recency buckets', () => {
  assert.equal(m.recencyBucket(null), 'never');
  assert.equal(m.recencyBucket(0), 'today');
  assert.equal(m.recencyBucket(1), 'recent');
  assert.equal(m.recencyBucket(3), 'recent');
  assert.equal(m.recencyBucket(4), 'recovering');
  assert.equal(m.recencyBucket(5), 'recovering');
  assert.equal(m.recencyBucket(6), 'rested');
});

test('muscle status: colour by last real session, secondary work needs 3 sets', () => {
  const rows = [
    // bench today, 4 sets: chest 12 pts (heavy), triceps/shoulders 4 pts
    { started_at: daysAgo(0), target: 'pectorals', secondary_muscles: ['triceps', 'shoulders'], sets: 4 },
    // squats 2 days ago
    { started_at: daysAgo(2), target: 'quads', secondary_muscles: ['hamstrings'], sets: 2 },
    // lat pulldown 5 days ago, biceps as helper with only 2 sets → not counted
    { started_at: daysAgo(5), target: 'lats', secondary_muscles: ['biceps'], sets: 2 },
    // curls 9 days ago
    { started_at: daysAgo(9), target: 'biceps', secondary_muscles: [], sets: 3 },
  ];
  const s = m.muscleStatus(rows, NOW);
  assert.equal(s.chest.bucket, 'today');
  assert.equal(s.chest.points, 12);
  assert.equal(s.chest.intensity, 3);
  assert.equal(s.triceps.bucket, 'today');
  assert.equal(s.quads.bucket, 'recent');
  assert.equal(s.hamstrings.bucket, 'never'); // 2 helper sets = 2 points < 3
  assert.equal(s.lats.bucket, 'recovering');
  assert.equal(s.biceps.bucket, 'rested');   // the 5-days-ago helper work doesn't count
  assert.equal(s.biceps.days, 9);
  assert.equal(s.glutes.bucket, 'never');
  assert.equal(Object.keys(s).length, m.REGIONS.length);
});

test('muscle status adds up multiple exercises on the same day', () => {
  const rows = [
    { started_at: daysAgo(1, 9), target: 'lats', secondary_muscles: ['biceps'], sets: 2 },
    { started_at: daysAgo(1, 9), target: 'upper back', secondary_muscles: ['biceps'], sets: 1 },
  ];
  const s = m.muscleStatus(rows, NOW);
  assert.equal(s.biceps.points, 3);
  assert.equal(s.biceps.bucket, 'recent');
});

test('exercise levels', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 9].map(m.exerciseLevel), [0, 1, 1, 1, 2, 3, 4, 5, 5]);
});

test('training calendar: weeks start Monday, ends today, levels and emoji per day', () => {
  const rows = [
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'a', body_part: 'upper arms', target: 'biceps', sets: 3 },
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'b', body_part: 'upper arms', target: 'triceps', sets: 3 },
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'c', body_part: 'chest', target: 'pectorals', sets: 2 },
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'd', body_part: 'back', target: 'lats', sets: 2 },
    { workout_id: 2, started_at: daysAgo(1), exercise_id: 'e', body_part: 'upper legs', target: 'glutes', sets: 4 },
  ];
  const days = m.trainingCalendar(rows, { weeks: 2, now: NOW });
  assert.equal(days[0].weekday, 0);
  assert.equal(days[0].date.getDay(), 1); // Monday
  const today = days[days.length - 1];
  assert.equal(today.key, m.dayKey(NOW));
  assert.equal(today.exercises, 4);
  assert.equal(today.level, 2);
  assert.equal(today.emoji, m.EMOJI.arms);
  assert.equal(today.workoutId, 1);
  const yesterday = days[days.length - 2];
  assert.equal(yesterday.emoji, m.EMOJI.glutes);
  assert.equal(yesterday.level, 1);
  assert.equal(days[0].level, 0);
});
