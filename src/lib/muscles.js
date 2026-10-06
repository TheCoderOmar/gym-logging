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

// Regions an exercise works, with points per set. A muscle listed as both target
// and secondary only gets the target points.
function exerciseRegions(target, secondary = []) {
  const out = new Map();
  for (const m of secondary) {
    const r = regionOf(m);
    if (r) out.set(r, Math.max(out.get(r) || 0, SECONDARY_POINTS));
  }
  const t = regionOf(target);
  if (t) out.set(t, TARGET_POINTS);
  return out;
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
 * rows: { started_at, target, secondary_muscles (array), sets } — `sets` = working sets done.
 * Returns { [regionId]: { region, label, bucket, days, lastDate, points, sets, intensity } }
 */
function muscleStatus(rows, now = new Date()) {
  // points[region][dayKey] = { points, sets, date }
  const perDay = new Map();
  for (const row of rows) {
    if (!row.sets) continue;
    const key = dayKey(row.started_at);
    for (const [region, pts] of exerciseRegions(row.target, row.secondary_muscles)) {
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

/**
 * GitHub-style calendar: every day from the Monday `weeks` weeks back through today.
 * rows: { workout_id, started_at, exercise_id, body_part, target, sets }
 */
function trainingCalendar(rows, { weeks = 53, now = new Date() } = {}) {
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

  const today = startOfDay(now);
  const start = new Date(today);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * (weeks - 1)); // Monday, `weeks` weeks ago
  const days = [];
  for (let d = new Date(start); d <= today; d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    const info = byDay.get(key);
    const areas = info ? [...info.areas.entries()].sort((a, b) => b[1] - a[1]) : [];
    days.push({
      key,
      date: new Date(d),
      weekday: (d.getDay() + 6) % 7, // 0 = Monday
      exercises: info ? info.exercises.size : 0,
      sets: info ? info.sets : 0,
      level: info ? exerciseLevel(info.exercises.size) : 0,
      workoutId: info ? Math.min(...info.workouts) : null,
      area: areas.length ? areas[0][0] : null,
      emoji: areas.length ? EMOJI[areas[0][0]] : null,
      areas: areas.map(([a]) => AREA_LABEL[a]),
    });
  }
  return days;
}

module.exports = {
  REGIONS, BUCKETS, EMOJI, AREA_LABEL, TARGET_POINTS, SECONDARY_POINTS, TRAINED_THRESHOLD,
  regionOf, exerciseRegions, recencyBucket, intensity, daysBetween, muscleStatus, exerciseLevel, areaOf, trainingCalendar, dayKey,
};
