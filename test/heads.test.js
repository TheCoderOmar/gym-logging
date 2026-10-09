const test = require('node:test');
const assert = require('node:assert/strict');
const { HEAD_GROUPS, hasHeads, defaultHeads, exerciseHeads, headStatus } = require('../src/lib/heads');

const ex = (name, target, secondary_muscles = []) => ({ name, target, secondary_muscles });
const pts = (e, region, score = 3) => Object.fromEntries(defaultHeads(e, region, score).map((h) => [h.head, h.points]));

test('head groups cover the 8 clickable muscles', () => {
  assert.deepEqual(Object.keys(HEAD_GROUPS).sort(), ['abs', 'biceps', 'chest', 'forearms', 'lats', 'quads', 'shoulders', 'triceps']);
  assert.deepEqual(HEAD_GROUPS.biceps.map((h) => h.id), ['biceps_long', 'biceps_short', 'brachialis']);
  assert.equal(hasHeads('biceps'), true);
  assert.equal(hasHeads('glutes'), false);
});

test('biceps rules', () => {
  assert.deepEqual(pts(ex('dumbbell hammer curl', 'biceps'), 'biceps'), { biceps_long: 1, biceps_short: 1, brachialis: 3 });
  assert.deepEqual(pts(ex('dumbbell incline curl', 'biceps'), 'biceps'), { biceps_long: 3, biceps_short: 1, brachialis: 0 });
  assert.deepEqual(pts(ex('barbell preacher curl', 'biceps'), 'biceps'), { biceps_long: 1, biceps_short: 3, brachialis: 0 });
  assert.deepEqual(pts(ex('barbell prone incline curl', 'biceps'), 'biceps'), { biceps_long: 1, biceps_short: 3, brachialis: 0 });
  assert.equal(pts(ex('barbell reverse preacher curl', 'biceps'), 'biceps').brachialis, 3);
  assert.deepEqual(pts(ex('barbell curl', 'biceps'), 'biceps'), { biceps_long: 3, biceps_short: 3, brachialis: 1 });
});

test('chest rules', () => {
  assert.deepEqual(pts(ex('barbell incline bench press', 'pectorals'), 'chest'), { chest_upper: 3, chest_middle: 1, chest_lower: 0 });
  assert.deepEqual(pts(ex('chest dip', 'pectorals'), 'chest'), { chest_upper: 0, chest_middle: 1, chest_lower: 3 });
  assert.deepEqual(pts(ex('barbell bench press', 'pectorals'), 'chest'), { chest_upper: 1, chest_middle: 3, chest_lower: 1 });
});

test('shoulder rules, including as a helper', () => {
  assert.deepEqual(pts(ex('dumbbell lateral raise', 'delts'), 'shoulders'), { delt_front: 1, delt_side: 3, delt_rear: 1 });
  assert.deepEqual(pts(ex('barbell rear delt row', 'delts'), 'shoulders'), { delt_front: 0, delt_side: 1, delt_rear: 3 });
  assert.deepEqual(pts(ex('dumbbell arnold press', 'delts'), 'shoulders'), { delt_front: 3, delt_side: 1, delt_rear: 0 });
  assert.deepEqual(pts(ex('barbell bench press', 'pectorals', ['triceps', 'shoulders']), 'shoulders', 2), { delt_front: 2, delt_side: 0, delt_rear: 0 });
  assert.deepEqual(pts(ex('cable bar lateral pulldown', 'lats', ['biceps', 'rhomboids', 'rear deltoids']), 'shoulders', 1), { delt_front: 0, delt_side: 0, delt_rear: 1 });
});

test('triceps, forearm, quad, abs and lats rules', () => {
  assert.deepEqual(pts(ex('cable pushdown', 'triceps'), 'triceps'), { triceps_long: 1, triceps_lateral: 3, triceps_medial: 3 });
  assert.equal(pts(ex('dumbbell lying triceps extension', 'triceps'), 'triceps').triceps_long, 3);
  assert.deepEqual(pts(ex('barbell reverse wrist curl', 'forearms'), 'forearms'), { forearm_flexors: 0, forearm_extensors: 3, brachioradialis: 0 });
  assert.deepEqual(pts(ex('lever leg extension', 'quads'), 'quads'), { quad_rf: 3, quad_vl: 3, quad_vm: 3 });
  assert.deepEqual(pts(ex('barbell full squat', 'glutes', ['quadriceps']), 'quads', 2), { quad_rf: 1, quad_vl: 2, quad_vm: 2 });
  assert.deepEqual(pts(ex('hanging leg raise', 'abs'), 'abs'), { abs_upper: 1, abs_lower: 3 });
  assert.deepEqual(pts(ex('crunch floor', 'abs'), 'abs'), { abs_upper: 3, abs_lower: 1 });
  assert.deepEqual(pts(ex('cable bar lateral pulldown', 'lats'), 'lats'), { lats_upper: 3, lats_lower: 1 });
  assert.deepEqual(pts(ex('cable straight arm pulldown', 'lats'), 'lats'), { lats_upper: 1, lats_lower: 3 });
});

test('no rule match gives every head the region score; scores cap at the region score', () => {
  assert.deepEqual(pts(ex('my weird move', 'biceps'), 'biceps'), { biceps_long: 3, biceps_short: 3, brachialis: 3 });
  assert.deepEqual(pts(ex('barbell curl', 'biceps'), 'biceps', 2), { biceps_long: 2, biceps_short: 2, brachialis: 1 });
});

test('exerciseHeads skips regions scored 0 and caps overrides', () => {
  const curl = ex('barbell curl', 'biceps', ['forearms']);
  assert.equal(exerciseHeads(curl, [{ muscle: 'biceps', points: 0 }, { muscle: 'forearms', points: 1 }]).biceps, undefined);
  const heads = exerciseHeads(curl, [{ muscle: 'biceps', points: 2 }], [{ head: 'brachialis', points: 3 }]);
  const brach = heads.biceps.find((h) => h.head === 'brachialis');
  assert.equal(brach.points, 2);
  assert.equal(brach.edited, true);
  assert.equal(brach.defaultPoints, 1);
  assert.equal(brach.max, 2);
  assert.equal(heads.biceps.find((h) => h.head === 'biceps_long').edited, false);
  // Falls back to the default muscle scores when none are saved.
  assert.ok(exerciseHeads(curl, []).biceps);
});

test('headStatus colours heads like the map', () => {
  const now = new Date();
  const rows = [{ started_at: now.toISOString(), sets: 2, name: 'dumbbell hammer curl', target: 'biceps', secondary_muscles: ['forearms'], muscles: [], heads: [] }];
  const st = Object.fromEntries(headStatus(rows, 'biceps', now).map((h) => [h.head, h]));
  assert.equal(st.brachialis.bucket, 'today');
  assert.equal(st.brachialis.sets, 2);
  assert.equal(st.brachialis.points, 6);
  assert.equal(st.biceps_long.bucket, 'never'); // 2 sets × 1 point < 3
  assert.equal(st.brachialis.label, 'Brachialis');
});

test('every head region has a close-up drawing with one shape per head', () => {
  const { headFigure } = require('../src/lib/bodymap');
  for (const [region, heads] of Object.entries(HEAD_GROUPS)) {
    const status = heads.map((h, i) => ({ head: h.id, label: h.label, bucket: i ? 'never' : 'today', days: i ? null : 0, sets: i ? 0 : 4, points: i ? 0 : 12, intensity: i ? 0 : 3 }));
    const svg = headFigure(region, status);
    assert.ok(svg.startsWith('<svg'), region);
    for (const h of heads) assert.ok(svg.includes(`data-head="${h.id}"`), `${region} draws ${h.id}`);
    assert.ok(svg.includes('b-today i-3'), `${region} colours the trained head`);
  }
});

test('the home body map makes only muscles with heads clickable', () => {
  const { bodyMap } = require('../src/lib/bodymap');
  const { muscleStatus } = require('../src/lib/muscles');
  const { front, back } = bodyMap(muscleStatus([]));
  const tag = (svg, region) => svg.match(new RegExp(`<g [^>]*data-region="${region}"[^>]*>`))[0];
  assert.match(tag(front, 'biceps'), /data-heads/);
  assert.match(tag(back, 'lats'), /data-heads/);
  assert.match(tag(front, 'biceps'), /role="button"/);
  assert.doesNotMatch(tag(back, 'glutes'), /data-heads/);
  assert.doesNotMatch(tag(front, 'obliques'), /data-heads/);
});

test('review fixes: "grip" in a name is not grip training; rear lateral raise is a rear-delt move', () => {
  assert.deepEqual(pts(ex('ez barbell reverse grip curl', 'biceps', ['forearms']), 'forearms', 2), { forearm_flexors: 0, forearm_extensors: 1, brachioradialis: 2 });
  assert.deepEqual(pts(ex('barbell reverse grip bent over row', 'upper back', ['biceps', 'forearms']), 'forearms', 1), { forearm_flexors: 1, forearm_extensors: 0, brachioradialis: 1 });
  assert.equal(pts(ex('dumbbell wrist curl', 'forearms'), 'forearms').forearm_flexors, 3);
  assert.deepEqual(pts(ex('dumbbell rear lateral raise', 'delts'), 'shoulders'), { delt_front: 0, delt_side: 1, delt_rear: 3 });
});
