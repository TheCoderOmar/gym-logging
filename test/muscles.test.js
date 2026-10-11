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

test('training calendar: one calendar year in Saturday-first weeks', () => {
  const days = m.trainingCalendar([], { year: 2026, now: NOW });
  assert.equal(days.length % 7, 0);
  assert.equal(days[0].date.getDay(), 6);                 // starts on a Saturday
  assert.equal(days[days.length - 1].date.getDay(), 5);   // ends on a Friday
  const inYear = days.filter((d) => !d.outside);
  assert.equal(inYear.length, 365);
  assert.equal(inYear[0].key, '2026-01-01');
  assert.equal(inYear[inYear.length - 1].key, '2026-12-31');
  assert.equal(days.find((d) => d.today).key, m.dayKey(NOW));
  assert.ok(days.find((d) => d.key === '2026-12-31').future);
  assert.ok(!days.find((d) => d.key === '2026-10-05').future);
});

test('training calendar: levels and emoji per day', () => {
  const rows = [
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'a', body_part: 'upper arms', target: 'biceps', sets: 3 },
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'b', body_part: 'upper arms', target: 'triceps', sets: 3 },
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'c', body_part: 'chest', target: 'pectorals', sets: 2 },
    { workout_id: 1, started_at: daysAgo(0), exercise_id: 'd', body_part: 'back', target: 'lats', sets: 2 },
    { workout_id: 2, started_at: daysAgo(1), exercise_id: 'e', body_part: 'upper legs', target: 'glutes', sets: 4 },
  ];
  const days = m.trainingCalendar(rows, { year: 2026, now: NOW });
  assert.equal(days[0].weekday, 0);
  const today = days.find((d) => d.today);
  assert.equal(today.key, m.dayKey(NOW));
  assert.equal(today.exercises, 4);
  assert.equal(today.level, 2);
  assert.equal(today.emoji, m.EMOJI.arms);
  assert.equal(today.workoutId, 1);
  const yesterday = days[days.indexOf(today) - 1];
  assert.equal(yesterday.emoji, m.EMOJI.glutes);
  assert.equal(yesterday.level, 1);
  assert.equal(days[0].level, 0);
});

test('default helper scores: 2 for prime movers in compound lifts, 1 otherwise', () => {
  const pts = (target, secondary, name) => Object.fromEntries(m.defaultMusclePoints(target, secondary, name).map((x) => [x.muscle, x.points]));
  assert.deepEqual(pts('pectorals', ['triceps', 'shoulders'], 'barbell bench press'), { pectorals: 3, triceps: 2, shoulders: 2 });
  assert.deepEqual(pts('pectorals', ['shoulders'], 'dumbbell fly'), { pectorals: 3, shoulders: 1 });
  assert.deepEqual(pts('lats', ['biceps', 'rhomboids', 'rear deltoids', 'forearms'], 'cable pulldown'), { lats: 3, biceps: 2, rhomboids: 2, 'rear deltoids': 2, forearms: 1 });
  assert.deepEqual(pts('quads', ['hamstrings'], 'lever leg extension'), { quads: 3, hamstrings: 1 });
  assert.deepEqual(pts('glutes', ['hamstrings', 'lower back'], 'barbell romanian deadlift'), { glutes: 3, hamstrings: 2, 'lower back': 2 });
  assert.deepEqual(pts('spine', ['glutes', 'hamstrings'], 'hyperextension'), { spine: 3, glutes: 2, hamstrings: 2 });
  assert.deepEqual(pts('biceps', ['forearms'], 'dumbbell hammer curl'), { biceps: 3, forearms: 2 });
  assert.deepEqual(pts('biceps', ['forearms'], 'barbell curl'), { biceps: 3, forearms: 1 });
  assert.deepEqual(pts('abs', ['obliques', 'hip flexors'], 'crunch floor'), { abs: 3, obliques: 2, 'hip flexors': 1 });
  assert.deepEqual(pts('triceps', ['forearms'], 'cable pushdown'), { triceps: 3, forearms: 1 });
});

test('weeklySets counts gym sets per muscle by score, and sports separately as a bonus', () => {
  const rows = [
    { started_at: daysAgo(0), sets: 3, name: 'barbell bench press', target: 'pectorals', secondary_muscles: ['triceps', 'shoulders'],
      muscles: [{ muscle: 'pectorals', points: 3 }, { muscle: 'triceps', points: 2 }, { muscle: 'shoulders', points: 1 }] },
    { started_at: daysAgo(1), sets: 4, name: 'cable pushdown', target: 'triceps', secondary_muscles: [], muscles: [] },
    { started_at: daysAgo(0), sport_id: 1, name: 'Football', minutes: 180, sets: 6, target: '', secondary_muscles: [], muscles: [{ muscle: 'quads', points: 3 }] },
  ];
  const week = Object.fromEntries(m.weeklySets(rows).map((r) => [r.region, r]));
  assert.equal(week.chest.sets, 3);
  assert.equal(week.triceps.sets, 6); // 3 × 2/3 + 4
  assert.equal(week.shoulders.sets, 1); // 3 × 1/3
  assert.equal(week.quads.sets, 0); // no gym sets…
  assert.equal(week.quads.sport, 6); // …but 3 h of football = 6 sets' worth
  assert.equal(week.quads.total, 6);
  assert.equal(week.chest.sport, 0);
  assert.deepEqual(m.weeklySets(rows).slice(0, 2).map((r) => r.region).sort(), ['quads', 'triceps']); // most (total) first
  assert.equal(m.weeklySets(rows).length, m.REGIONS.length);
});

test('training weeks start on Saturday', () => {
  const sat = m.startOfTrainingWeek(new Date(2026, 9, 10, 15)); // Sat 10 Oct
  assert.equal(sat.getDay(), 6);
  assert.equal(sat.getDate(), 10);
  assert.equal(m.startOfTrainingWeek(new Date(2026, 9, 9, 15)).getDate(), 3); // Fri 9 → Sat 3
});

test('the last 7 days start at midnight six days before today', () => {
  const start = m.startOfLastDays(7, new Date(2026, 9, 11, 15)); // Sun 11 Oct, afternoon
  assert.equal(start.getDate(), 5);
  assert.equal(start.getHours(), 0);
  assert.equal(m.startOfLastDays(1, new Date(2026, 9, 11, 15)).getDate(), 11);
});
