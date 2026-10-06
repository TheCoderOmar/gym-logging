// Muscle regions for the body heat map, and the logic that turns logged sets into
// "how recently was each muscle trained" plus the daily training-log calendar.
const { startOfDay, DAY } = require('./format');

const REGIONS = [
  { id: 'chest', label: 'Chest' },
  { id: 'shoulders', label: 'Shoulders' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'forearms', label: 'Forearms' },
  { id: 'abs', label: 'Abs' },
  { id: 'obliques', label: 'Obliques' },
  { id: 'traps', label: 'Traps' },
  { id: 'upper_back', label: 'Upper back' },
  { id: 'lats', label: 'Lats' },
  { id: 'lower_back', label: 'Lower back' },
  { id: 'glutes', label: 'Glutes' },
  { id: 'quads', label: 'Quads' },
  { id: 'hamstrings', label: 'Hamstrings' },
  { id: 'adductors', label: 'Adductors' },
  { id: 'calves', label: 'Calves' },
];

// Dataset muscle names (targets and secondary muscles) → region id.
const NAME_TO_REGION = {
  pectorals: 'chest', chest: 'chest', 'upper chest': 'chest', 'serratus anterior': 'chest',
  delts: 'shoulders', deltoids: 'shoulders', shoulders: 'shoulders', 'rear deltoids': 'shoulders', 'rotator cuff': 'shoulders',
  biceps: 'biceps', brachialis: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms', wrists: 'forearms', 'wrist flexors': 'forearms', 'wrist extensors': 'forearms', 'grip muscles': 'forearms', hands: 'forearms',
  abs: 'abs', core: 'abs', abdominals: 'abs', 'lower abs': 'abs', 'hip flexors': 'abs',
  obliques: 'obliques',
  traps: 'traps', trapezius: 'traps', 'levator scapulae': 'traps', sternocleidomastoid: 'traps',
  'upper back': 'upper_back', rhomboids: 'upper_back', back: 'upper_back',
  lats: 'lats', 'latissimus dorsi': 'lats',
  spine: 'lower_back', 'lower back': 'lower_back',
  glutes: 'glutes', abductors: 'glutes',
  quads: 'quads', quadriceps: 'quads',
  hamstrings: 'hamstrings',
  adductors: 'adductors', 'inner thighs': 'adductors', groin: 'adductors',
  calves: 'calves', soleus: 'calves', shins: 'calves', ankles: 'calves', 'ankle stabilizers': 'calves', feet: 'calves',
};

// Points per working set: the target muscle does the work, secondary muscles assist.
const TARGET_POINTS = 3;
const SECONDARY_POINTS = 1;
// A muscle counts as trained on a day once it collects this many points
// (one set as the target, or three sets as a helper).
const TRAINED_THRESHOLD = 3;

function regionOf(name) {
  return NAME_TO_REGION[String(name || '').trim().toLowerCase()] || null;
}

// Heat-map area a muscle name counts toward, e.g. "rear deltoids" → "Shoulders"; null if none.
function regionLabelOf(name) {
  const id = regionOf(name);
  return id ? REGIONS.find((r) => r.id === id).label : null;
}

// Highest score a muscle can get per set (the editor offers 0–3).
const MAX_POINTS = 3;

// Score for a helper muscle that is a prime mover in a compound lift.
const SYNERGIST_POINTS = 2;
// Bumped when the default rules change, so unedited exercises pick up the new defaults.
const MUSCLE_DEFAULTS_VERSION = 2;

// For a target region, the helper regions that do real work in compound lifts.
const SYNERGISTS = {
  chest: ['shoulders', 'triceps'],
  triceps: ['chest', 'shoulders'],
  shoulders: ['triceps'],
  lats: ['biceps', 'upper_back', 'shoulders'],
  upper_back: ['biceps', 'lats', 'shoulders'],
  quads: ['glutes'],
  glutes: ['hamstrings', 'quads'],
  hamstrings: ['glutes', 'lower_back'],
  lower_back: ['glutes', 'hamstrings'],
};

const COMPOUND = /\b(press|push[- ]?ups?|dips?|rows?|pull[- ]?ups?|chin[- ]?ups?|pulldown|squats?|lunges?|deadlifts?|thrusts?|bridges?|step[- ]?ups?|split|clean|snatch|swing|jerk|good morning|hyperextension|back extension|leg press|sled|burpee|muscle[- ]up|inverted)\b/;
const ISOLATION = /\b(fly|flye|flyes|raises?|curls?|kickbacks?|crossover|cross over|pullover|shrugs?|kick|abduction|adduction)\b/;

function isCompound(name) {
  const n = String(name || '').toLowerCase();
  const isolatedExtension = /extension/.test(n) && !/(hyper|back) ?extension/.test(n);
  return COMPOUND.test(n) && !ISOLATION.test(n) && !isolatedExtension;
}

// How hard a helper muscle works in an exercise: 2 for a prime mover in a compound lift,
// 1 for stabilisers, grip and isolation moves.
function helperPoints(exerciseName, targetRegion, helperRegion) {
  const n = String(exerciseName || '').toLowerCase();
  if (!helperRegion || helperRegion === targetRegion) return SECONDARY_POINTS;
  if (/deadlift/.test(n) && ['glutes', 'hamstrings', 'lower_back'].includes(helperRegion)) return SYNERGIST_POINTS;
  if (targetRegion === 'biceps' && helperRegion === 'forearms' && /\b(hammer|reverse|zottman)\b/.test(n)) return SYNERGIST_POINTS;
  if (targetRegion === 'abs' && helperRegion === 'obliques') return SYNERGIST_POINTS;
  if (isCompound(n) && (SYNERGISTS[targetRegion] || []).includes(helperRegion)) return SYNERGIST_POINTS;
  return SECONDARY_POINTS;
}

// Default per-set scores for an exercise: target 3, helpers 2 or 1 (see helperPoints).
// A muscle listed as both target and secondary keeps the target score.
function defaultMusclePoints(target, secondary = [], exerciseName = '') {
  const out = new Map();
  const t = String(target || '').trim().toLowerCase();
  if (t) out.set(t, TARGET_POINTS);
  const targetRegion = regionOf(t);
  for (const m of secondary) {
    const name = String(m || '').trim().toLowerCase();
    if (name && !out.has(name)) out.set(name, helperPoints(exerciseName, targetRegion, regionOf(name)));
  }
  return [...out].map(([muscle, points]) => ({ muscle, points }));
}

// The original rule (target 3, every helper 1), used to spot exercises nobody has edited.
function legacyMusclePoints(target, secondary = []) {
  const out = new Map();
  const t = String(target || '').trim().toLowerCase();
  if (t) out.set(t, TARGET_POINTS);
  for (const m of secondary) {
    const name = String(m || '').trim().toLowerCase();
    if (name && !out.has(name)) out.set(name, SECONDARY_POINTS);
  }
  return [...out].map(([muscle, points]) => ({ muscle, points }));
}

// Muscle scores → heat-map regions. Two muscles in the same region (e.g. "back" and
// "rhomboids") don't add up; the region takes the higher score.
function regionPoints(muscles) {
  const out = new Map();
  for (const { muscle, points } of muscles) {
    const r = regionOf(muscle);
    if (r && points > 0) out.set(r, Math.max(out.get(r) || 0, points));
  }
  return out;
}

function exerciseRegions(target, secondary = []) {
  return regionPoints(defaultMusclePoints(target, secondary));
}

// Whole calendar days between two dates, in local time.
function daysBetween(earlier, later) {
  return Math.round((startOfDay(later) - startOfDay(earlier)) / DAY);
}

// 0 days → today, 1–3 → recent, 4–5 → recovering, 6+ → rested.
function recencyBucket(days) {
  if (days == null) return 'never';
  if (days <= 0) return 'today';
  if (days <= 3) return 'recent';
  if (days <= 5) return 'recovering';
  return 'rested';
}

const BUCKETS = [
  { id: 'today', label: 'Today' },
  { id: 'recent', label: '1–3 days ago' },
  { id: 'recovering', label: '4–5 days ago' },
  { id: 'rested', label: '6+ days ago' },
  { id: 'never', label: 'Not trained yet' },
];

// How hard the last session hit the muscle: 1 light, 2 solid, 3 heavy.
function intensity(points) {
  if (points >= 12) return 3;
  if (points >= 6) return 2;
  return 1;
}

const dayKey = (d) => {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/**
 * Per-region status from per-exercise rows.
 * rows: { started_at, sets, muscles?: [{ muscle, points }], target, secondary_muscles }
 * `sets` = working sets done. Uses the exercise's saved muscle scores when given, else the defaults.
 * Returns { [regionId]: { region, label, bucket, days, lastDate, points, sets, intensity } }
 */
function muscleStatus(rows, now = new Date()) {
  // points[region][dayKey] = { points, sets, date }
  const perDay = new Map();
  for (const row of rows) {
    if (!row.sets) continue;
    const key = dayKey(row.started_at);
    const muscles = row.muscles && row.muscles.length ? row.muscles : defaultMusclePoints(row.target, row.secondary_muscles, row.name);
    for (const [region, pts] of regionPoints(muscles)) {
      if (!perDay.has(region)) perDay.set(region, new Map());
      const days = perDay.get(region);
      const d = days.get(key) || { points: 0, sets: 0, date: row.started_at };
      d.points += pts * row.sets;
      d.sets += row.sets;
      days.set(key, d);
    }
  }
  const status = {};
  for (const { id, label } of REGIONS) {
    const days = perDay.get(id);
    let last = null;
    if (days) {
      for (const d of days.values()) {
        if (d.points >= TRAINED_THRESHOLD && (!last || d.date > last.date)) last = d;
      }
    }
    const ago = last ? Math.max(0, daysBetween(last.date, now)) : null;
    status[id] = {
      region: id,
      label,
      bucket: recencyBucket(ago),
      days: ago,
      lastDate: last ? last.date : null,
      points: last ? last.points : 0,
      sets: last ? last.sets : 0,
      intensity: last ? intensity(last.points) : 0,
    };
  }
  return status;
}

// Training-log levels by number of different exercises in a day.
function exerciseLevel(count) {
  if (!count) return 0;
  if (count <= 3) return 1;
  if (count >= 7) return 5;
  return count - 2; // 4 → 2, 5 → 3, 6 → 4
}

const EMOJI = {
  chest: '🫁', back: '🦅', shoulders: '🏋️', arms: '💪', legs: '🦵', glutes: '🍑', core: '🧱', cardio: '🏃', neck: '🦒', other: '🏋️',
};
const AREA_LABEL = {
  chest: 'Chest', back: 'Back', shoulders: 'Shoulders', arms: 'Arms', legs: 'Legs', glutes: 'Glutes', core: 'Core', cardio: 'Cardio', neck: 'Neck', other: 'Other',
};

// Dataset body_part (plus glute-targeted exercises) → emoji area.
function areaOf(bodyPart, target) {
  if (String(target).toLowerCase() === 'glutes') return 'glutes';
  const bp = String(bodyPart || '').toLowerCase();
  if (bp === 'upper arms' || bp === 'lower arms') return 'arms';
  if (bp === 'upper legs' || bp === 'lower legs') return 'legs';
  if (bp === 'waist') return 'core';
  if (['chest', 'back', 'shoulders', 'cardio', 'neck'].includes(bp)) return bp;
  return 'other';
}

// Weeks in the training log start on Saturday (getDay() 6).
const WEEK_START = 6;
const weekdayIndex = (d) => (d.getDay() - WEEK_START + 7) % 7; // 0 = Saturday … 6 = Friday

/**
 * GitHub-style calendar for one calendar year (1 Jan – 31 Dec), in Saturday-first week columns.
 * Days before 1 Jan / after 31 Dec that pad the first and last week are marked `outside`;
 * days after today are marked `future`.
 * rows: { workout_id, started_at, exercise_id, body_part, target, sets }
 */
function trainingCalendar(rows, { year = new Date().getFullYear(), now = new Date() } = {}) {
  const byDay = new Map();
  for (const row of rows) {
    if (!row.sets) continue;
    const key = dayKey(row.started_at);
    if (!byDay.has(key)) byDay.set(key, { exercises: new Set(), areas: new Map(), workouts: new Set(), sets: 0 });
    const d = byDay.get(key);
    d.exercises.add(row.exercise_id);
    d.workouts.add(row.workout_id);
    d.sets += row.sets;
    const area = areaOf(row.body_part, row.target);
    d.areas.set(area, (d.areas.get(area) || 0) + row.sets);
  }

  // Build dates at noon and by day offset: stepping local midnights drifts across
  // DST changes that happen at midnight (e.g. Egypt).
  const lead = weekdayIndex(new Date(year, 0, 1, 12));
  const trail = 6 - weekdayIndex(new Date(year, 11, 31, 12));
  const total = Math.round((new Date(year, 11, 31, 12) - new Date(year, 0, 1, 12)) / DAY) + 1 + lead + trail;
  const today = startOfDay(now);

  const days = [];
  for (let i = 0; i < total; i++) {
    const d = new Date(year, 0, 1 - lead + i, 12);
    const key = dayKey(d);
    const info = byDay.get(key);
    const areas = info ? [...info.areas.entries()].sort((x, y) => y[1] - x[1]) : [];
    days.push({
      key,
      date: d,
      weekday: weekdayIndex(d),
      outside: d.getFullYear() !== year,
      future: startOfDay(d) > today,
      today: startOfDay(d).getTime() === today.getTime(),
      exercises: info ? info.exercises.size : 0,
      sets: info ? info.sets : 0,
      level: info ? exerciseLevel(info.exercises.size) : 0,
      workoutId: info ? Math.min(...info.workouts) : null,
      area: areas.length ? areas[0][0] : null,
      emoji: areas.length ? EMOJI[areas[0][0]] : null,
      areas: areas.map(([x]) => AREA_LABEL[x]),
      areaKeys: areas.map(([x]) => x),
    });
  }
  return days;
}

module.exports = {
  REGIONS, BUCKETS, EMOJI, AREA_LABEL, TARGET_POINTS, SECONDARY_POINTS, TRAINED_THRESHOLD, MAX_POINTS,
  SYNERGIST_POINTS, MUSCLE_DEFAULTS_VERSION, isCompound, helperPoints, legacyMusclePoints,
  regionOf, regionLabelOf, defaultMusclePoints, regionPoints, exerciseRegions, recencyBucket, intensity, daysBetween, muscleStatus, exerciseLevel, areaOf, trainingCalendar, dayKey, WEEK_START,
};
