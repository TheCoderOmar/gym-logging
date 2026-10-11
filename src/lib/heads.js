// Muscle heads for the recovery-map close-ups: which heads each clickable muscle has,
// how much an exercise works each head (guessed from its name, editable per exercise),
// and when each head was last trained.
const {
  REGIONS, TRAINED_THRESHOLD, regionOf, regionPoints, defaultMusclePoints, recencyBucket, intensity, daysBetween, dayKey, addActivity, sportsOf,
} = require('./muscles');

const HEAD_GROUPS = {
  chest: [
    { id: 'chest_upper', label: 'Upper chest' },
    { id: 'chest_middle', label: 'Middle chest' },
    { id: 'chest_lower', label: 'Lower chest' },
  ],
  shoulders: [
    { id: 'delt_front', label: 'Front delt' },
    { id: 'delt_side', label: 'Side delt' },
    { id: 'delt_rear', label: 'Rear delt' },
  ],
  biceps: [
    { id: 'biceps_long', label: 'Long head' },
    { id: 'biceps_short', label: 'Short head' },
    { id: 'brachialis', label: 'Brachialis' },
  ],
  triceps: [
    { id: 'triceps_long', label: 'Long head' },
    { id: 'triceps_lateral', label: 'Lateral head' },
    { id: 'triceps_medial', label: 'Medial head' },
  ],
  forearms: [
    { id: 'forearm_flexors', label: 'Inner forearm (flexors)' },
    { id: 'forearm_extensors', label: 'Outer forearm (extensors)' },
    { id: 'brachioradialis', label: 'Brachioradialis' },
  ],
  abs: [
    { id: 'abs_upper', label: 'Upper abs' },
    { id: 'abs_lower', label: 'Lower abs' },
  ],
  quads: [
    { id: 'quad_rf', label: 'Rectus femoris' },
    { id: 'quad_vl', label: 'Outer quad (vastus lateralis)' },
    { id: 'quad_vm', label: 'Teardrop (vastus medialis)' },
  ],
  lats: [
    { id: 'lats_upper', label: 'Upper lats' },
    { id: 'lats_lower', label: 'Lower lats' },
  ],
};

const hasHeads = (regionId) => Object.prototype.hasOwnProperty.call(HEAD_GROUPS, regionId);
const ALL = (region) => HEAD_GROUPS[region].map((h) => h.id);

// Rules per region, first match wins. `main` heads get the region score, `some` heads 1.
// `when(name, ex)` sees the lower-cased exercise name and the exercise ({ target, secondary_muscles }).
const helperFor = (...regions) => (n, ex) => regions.includes(regionOf(ex.target));
const lists = (muscle) => (n, ex) => (ex.secondary_muscles || []).some((m) => String(m).toLowerCase() === muscle);
const named = (re) => (n) => re.test(n);

const RULES = {
  chest: [
    { when: named(/incline|low[- ]to[- ]high|low cable|reverse[- ]grip bench/), main: ['chest_upper'], some: ['chest_middle'] },
    { when: named(/decline|\bdips?\b|high[- ]to[- ]low|high cable/), main: ['chest_lower'], some: ['chest_middle'] },
    { when: lists('upper chest'), main: ['chest_upper'], some: ['chest_middle'] },
    { when: () => true, main: ['chest_middle'], some: ['chest_upper', 'chest_lower'] },
  ],
  shoulders: [
    { when: helperFor('chest', 'triceps'), main: ['delt_front'], some: [] },
    { when: helperFor('upper_back', 'lats'), main: ['delt_rear'], some: [] },
    // Rear before side: "rear lateral raise" is a rear-delt move.
    { when: (n, ex) => /rear (delt|lateral|fly)|reverse fly|face pull/.test(n) || lists('rear deltoids')(n, ex), main: ['delt_rear'], some: ['delt_side'] },
    { when: named(/lateral raise|side raise|upright row|\by[- ]raise/), main: ['delt_side'], some: ['delt_front', 'delt_rear'] },
    { when: named(/front raise|overhead|military|shoulder press|arnold|push press|\bpress\b/), main: ['delt_front'], some: ['delt_side'] },
  ],
  biceps: [
    { when: (n, ex) => regionOf(ex.target) !== 'biceps', main: ALL('biceps'), some: [] },
    { when: named(/hammer|\breverse\b|zottman|cross[- ]body/), main: ['brachialis'], some: ['biceps_long', 'biceps_short'] },
    { when: named(/prone|preacher|spider|concentration|wide[- ]grip|scott/), main: ['biceps_short'], some: ['biceps_long'] },
    { when: named(/incline|drag|bayesian|behind/), main: ['biceps_long'], some: ['biceps_short'] },
    { when: named(/curl/), main: ['biceps_long', 'biceps_short'], some: ['brachialis'] },
  ],
  triceps: [
    { when: named(/overhead|french|skull|lying|jm press/), main: ['triceps_long'], some: ['triceps_lateral', 'triceps_medial'] },
    { when: named(/reverse[- ]grip/), main: ['triceps_medial'], some: ['triceps_lateral', 'triceps_long'] },
    { when: named(/pushdown|kickback|close[- ]grip|\bdips?\b|diamond/), main: ['triceps_lateral', 'triceps_medial'], some: ['triceps_long'] },
  ],
  forearms: [
    { when: named(/reverse wrist|wrist extension/), main: ['forearm_extensors'], some: [] },
    { when: named(/hammer|zottman|\breverse\b.*curl/), main: ['brachioradialis'], some: ['forearm_extensors'] },
    // Grip work only — "close grip", "reverse grip" etc. in a name are about hand position.
    { when: named(/wrist curl|wrist roller|gripper|hand grip|farmer|\bhang|pinch/), main: ['forearm_flexors'], some: ['forearm_extensors'] },
    { when: (n, ex) => regionOf(ex.target) !== 'forearms', main: ['forearm_flexors'], some: ['brachioradialis'] },
  ],
  quads: [
    { when: named(/leg extension/), main: ALL('quads'), some: [] },
    { when: named(/sissy|reverse nordic|\bkick|hip flexor/), main: ['quad_rf'], some: ['quad_vm'] },
    { when: named(/squat|leg press|lunge|split|step[- ]?up|hack/), main: ['quad_vl', 'quad_vm'], some: ['quad_rf'] },
  ],
  abs: [
    { when: named(/leg raise|knee raise|reverse crunch|hip raise|flutter|scissor|v[- ]up|toes[- ]to[- ]bar/), main: ['abs_lower'], some: ['abs_upper'] },
    { when: named(/crunch|sit[- ]?up|jackknife/), main: ['abs_upper'], some: ['abs_lower'] },
    { when: named(/plank|rollout|ab wheel|hollow|dead bug|l[- ]sit/), main: ['abs_upper', 'abs_lower'], some: [] },
  ],
  lats: [
    { when: named(/close[- ]grip|neutral|underhand|reverse[- ]grip|v[- ]bar|\brows?\b|straight[- ]arm|pullover|chin/), main: ['lats_lower'], some: ['lats_upper'] },
    { when: named(/wide|pulldown|pull[- ]?up/), main: ['lats_upper'], some: ['lats_lower'] },
  ],
};

// Default per-set points for each head of `regionId`, given the exercise's score for that region.
function defaultHeads(ex, regionId, regionScore) {
  const name = String(ex.name || '').toLowerCase();
  const rule = (RULES[regionId] || []).find((r) => r.when(name, ex));
  return HEAD_GROUPS[regionId].map(({ id }) => {
    let points = regionScore; // no rule matched: the whole muscle works
    if (rule) points = rule.main.includes(id) ? regionScore : rule.some.includes(id) ? Math.min(1, regionScore) : 0;
    return { head: id, points };
  });
}

// Effective head scores for every region with heads the exercise works:
// saved overrides where there are any, else the defaults; all capped at the region score.
function exerciseHeads(ex, muscles, overrides = []) {
  const scores = regionPoints(muscles && muscles.length ? muscles : defaultMusclePoints(ex.target, ex.secondary_muscles, ex.name));
  const saved = new Map(overrides.map((o) => [o.head, o.points]));
  const out = {};
  for (const [region, score] of scores) {
    if (!hasHeads(region) || score <= 0) continue;
    const defaults = new Map(defaultHeads(ex, region, score).map((d) => [d.head, d.points]));
    out[region] = HEAD_GROUPS[region].map(({ id, label }) => ({
      head: id,
      label,
      points: Math.min(score, saved.has(id) ? saved.get(id) : defaults.get(id)),
      defaultPoints: defaults.get(id),
      max: score,
      edited: saved.has(id),
    }));
  }
  return out;
}

/**
 * When each head of `regionId` was last trained, the same way the map does it for muscles.
 * rows: repo.exerciseLog rows ({ started_at, sets, name, target, secondary_muscles, muscles, heads }).
 */
function headStatus(rows, regionId, now = new Date()) {
  const perDay = new Map(); // head → dayKey → { points, sets, date }
  for (const row of rows) {
    if (!row.sets) continue;
    const heads = exerciseHeads(row, row.muscles, row.heads || [])[regionId];
    if (!heads) continue;
    const key = dayKey(row.started_at);
    for (const { head, points } of heads) {
      if (points <= 0) continue;
      if (!perDay.has(head)) perDay.set(head, new Map());
      const days = perDay.get(head);
      const d = days.get(key) || { points: 0, sets: 0, sports: new Map(), date: row.started_at };
      d.points += points * row.sets;
      addActivity(d, row);
      days.set(key, d);
    }
  }
  return HEAD_GROUPS[regionId].map(({ id, label }) => {
    let last = null;
    for (const d of (perDay.get(id) || new Map()).values()) {
      if (d.points >= TRAINED_THRESHOLD && (!last || d.date > last.date)) last = d;
    }
    const ago = last ? Math.max(0, daysBetween(last.date, now)) : null;
    return {
      head: id,
      label,
      bucket: recencyBucket(ago),
      days: ago,
      lastDate: last ? last.date : null,
      points: last ? last.points : 0,
      sets: last ? last.sets : 0,
      sports: sportsOf(last),
      intensity: last ? intensity(last.points) : 0,
    };
  });
}

const regionLabel = (regionId) => (REGIONS.find((r) => r.id === regionId) || {}).label || regionId;

module.exports = { HEAD_GROUPS, hasHeads, defaultHeads, exerciseHeads, headStatus, regionLabel };
