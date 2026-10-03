const { convert, round1 } = require('./units');

// Epley estimated one-rep max. A single is its own 1RM.
function e1rm(weight, reps) {
  if (!weight || !reps || reps < 1) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

// Sets that count toward stats: completed working sets with reps logged.
function isWorkingSet(s) {
  return s.done && !s.is_warmup && s.reps > 0;
}

// Normalise a set's weight into the display unit.
function weightIn(s, unit) {
  return convert(s.weight || 0, s.unit, unit);
}

function volume(sets, unit) {
  return sets.filter(isWorkingSet).reduce((sum, s) => sum + weightIn(s, unit) * s.reps, 0);
}

/**
 * Group an exercise's sets by workout session and summarise each one.
 * `sets` rows need: workout_id, started_at, weight, unit, reps, is_warmup, done.
 * Returns sessions in chronological order.
 */
function sessionSummaries(sets, unit) {
  const byWorkout = new Map();
  for (const s of sets) {
    if (!isWorkingSet(s)) continue;
    if (!byWorkout.has(s.workout_id)) {
      byWorkout.set(s.workout_id, { workout_id: s.workout_id, date: s.started_at, sets: [] });
    }
    byWorkout.get(s.workout_id).sets.push(s);
  }
  return [...byWorkout.values()]
    .map((sess) => {
      let top = 0;
      let best = 0;
      let vol = 0;
      for (const s of sess.sets) {
        const w = weightIn(s, unit);
        top = Math.max(top, w);
        best = Math.max(best, e1rm(w, s.reps));
        vol += w * s.reps;
      }
      return {
        workout_id: sess.workout_id,
        date: sess.date,
        topWeight: round1(top),
        e1rm: round1(best),
        volume: Math.round(vol),
        sets: sess.sets.length,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Personal records for one exercise, in the display unit.
 * - heaviest: max weight lifted (with reps and date)
 * - bestE1rm: best estimated 1RM (with the set that produced it)
 * - mostReps: most reps in a single set (with weight)
 * - repMaxes: heaviest weight for each rep count 1..12
 */
function personalRecords(sets, unit) {
  const working = sets.filter(isWorkingSet);
  if (!working.length) return null;
  let heaviest = null;
  let bestE1rm = null;
  let mostReps = null;
  const repMaxes = {};
  for (const s of working) {
    const w = weightIn(s, unit);
    const est = e1rm(w, s.reps);
    const rec = { weight: round1(w), reps: s.reps, date: s.started_at, workout_id: s.workout_id };
    if (!heaviest || w > heaviest.weight || (round1(w) === heaviest.weight && s.reps > heaviest.reps)) {
      heaviest = rec;
    }
    if (!bestE1rm || est > bestE1rm.e1rm) bestE1rm = { ...rec, e1rm: round1(est) };
    if (!mostReps || s.reps > mostReps.reps || (s.reps === mostReps.reps && w > mostReps.weight)) {
      mostReps = rec;
    }
    if (s.reps <= 12 && (!repMaxes[s.reps] || w > repMaxes[s.reps].weight)) {
      repMaxes[s.reps] = rec;
    }
  }
  return { heaviest, bestE1rm, mostReps, repMaxes };
}

module.exports = { e1rm, isWorkingSet, volume, sessionSummaries, personalRecords };
