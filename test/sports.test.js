const test = require('node:test');
const assert = require('node:assert/strict');
const { SPORTS, sportSets, sportRows, activityText } = require('../src/lib/sports');
const { muscleStatus, trainingCalendar, regionOf } = require('../src/lib/muscles');
const { headStatus } = require('../src/lib/heads');

test('football and padel are defined with muscles that are on the map', () => {
  assert.deepEqual(Object.keys(SPORTS), ['football', 'padel']);
  for (const s of Object.values(SPORTS)) {
    assert.ok(s.label && s.emoji);
    for (const m of s.muscles) assert.ok(regionOf(m.muscle), `${m.muscle} maps to a region`);
  }
  assert.equal(SPORTS.football.muscles.find((m) => m.muscle === 'quads').points, 3);
  assert.equal(SPORTS.padel.muscles.find((m) => m.muscle === 'shoulders').points, 3);
});

test('every 30 minutes counts as one set, at least one', () => {
  assert.equal(sportSets(180), 6);
  assert.equal(sportSets(60), 2);
  assert.equal(sportSets(45), 2);
  assert.equal(sportSets(10), 1);
});

test('a 3-hour football session colours the map like a hard workout', () => {
  const now = new Date();
  const rows = sportRows([{ id: 1, sport: 'football', played_on: now.toISOString(), minutes: 180 }]);
  const st = muscleStatus(rows, now);
  assert.equal(st.quads.bucket, 'today');
  assert.equal(st.quads.points, 18);
  assert.equal(st.quads.intensity, 3);
  assert.equal(st.biceps.bucket, 'never');
  const quads = headStatus(rows, 'quads', now);
  assert.ok(quads.every((h) => h.bucket === 'today'));
});

test('a sport-only day shows its emoji in the training log and links to the session', () => {
  const now = new Date();
  const rows = sportRows([{ id: 7, sport: 'padel', played_on: now.toISOString(), minutes: 90 }]);
  const day = trainingCalendar(rows, { year: now.getFullYear(), now }).find((d) => d.today);
  assert.equal(day.emoji, '🎾');
  assert.equal(day.sportId, 7);
  assert.equal(day.workoutId, null);
});

test('sports show as time played, not as sets, in the map and head popups', () => {
  const { describe } = require('../src/lib/bodymap');
  const now = new Date();
  const rows = sportRows([{ id: 1, sport: 'football', played_on: now.toISOString(), minutes: 180 }]);
  const quads = muscleStatus(rows, now).quads;
  assert.equal(quads.sets, 0);
  assert.deepEqual(quads.sports, [{ label: 'Football', minutes: 180 }]);
  assert.match(describe(quads), /Football 3 h/);
  assert.doesNotMatch(describe(quads), /set/);
  const rf = headStatus(rows, 'quads', now).find((h) => h.head === 'quad_rf');
  assert.equal(rf.sets, 0);
  assert.deepEqual(rf.sports, [{ label: 'Football', minutes: 180 }]);
  assert.equal(activityText(rf), 'Football 3 h');
  // Same day with a gym workout too: both parts.
  const both = rows.concat([{ started_at: now.toISOString(), sets: 4, name: 'lever leg extension', target: 'quads', secondary_muscles: [], muscles: [], heads: [] }]);
  assert.equal(activityText(headStatus(both, 'quads', now).find((h) => h.head === 'quad_rf')), '4 sets + Football 3 h');
});
