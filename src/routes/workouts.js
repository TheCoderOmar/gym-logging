const express = require('express');
const { personalRecords, volume } = require('../lib/stats');
const { convert } = require('../lib/units');

const PAGE_SIZE = 25;

module.exports = (repo) => {
  const router = express.Router();
  const msg = (text) => `msg=${encodeURIComponent(text)}`;

  router.post('/start', (req, res) => {
    const live = repo.inProgressWorkout();
    if (live) return res.redirect(`/workouts/${live.id}/log?tone=error&${msg('Finish or discard this workout before starting another')}`);
    const routineId = req.body.routine_id ? Number(req.body.routine_id) : null;
    const id = repo.startWorkout({ routineId });
    res.redirect(`/workouts/${id}/log`);
  });

  router.get('/', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const { total, rows } = repo.listWorkouts({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, unit: res.locals.unit });
    res.render('workouts/index', { title: 'History', rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) });
  });

  router.get('/:id', (req, res, next) => {
    const w = repo.getWorkout(Number(req.params.id));
    if (!w) return next();
    if (!w.finished_at) return res.redirect(`/workouts/${w.id}/log`);
    const unit = res.locals.unit;
    // Flag sets in this workout that are (or tie) the all-time heaviest for that exercise.
    for (const we of w.exercises) {
      const prs = personalRecords(repo.exerciseSets(we.exercise_id), unit);
      we.volume = Math.round(volume(we.sets, unit));
      we.prIds = new Set();
      if (prs) {
        for (const s of we.sets) {
          if (s.is_warmup || !s.done) continue;
          if (prs.heaviest.workout_id === w.id && Math.abs(convert(s.weight, s.unit, unit) - prs.heaviest.weight) < 0.06) we.prIds.add(s.id);
        }
      }
    }
    const allSets = w.exercises.flatMap((we) => we.sets);
    res.render('workouts/show', {
      title: w.name,
      w,
      totals: { volume: Math.round(volume(allSets, unit)), sets: allSets.filter((s) => s.done && !s.is_warmup).length },
    });
  });

  router.get('/:id/log', (req, res, next) => {
    const w = repo.getWorkout(Number(req.params.id));
    if (!w) return next();
    res.render('workouts/log', {
      title: w.finished_at ? `Edit ${w.name}` : w.name,
      w,
      options: repo.filterOptions(),
      scripts: ['/js/exercise-picker.js', '/js/logger.js'],
    });
  });

  router.post('/:id/add-exercise', (req, res) => {
    const id = Number(req.params.id);
    repo.addWorkoutExercise(id, String(req.body.exercise_id));
    res.redirect(`/workouts/${id}/log`);
  });

  router.post('/:id/update', (req, res) => {
    const id = Number(req.params.id);
    const toIso = (v) => (v ? new Date(v).toISOString() : undefined);
    repo.updateWorkout(id, {
      name: req.body.name,
      notes: req.body.notes,
      started_at: toIso(req.body.started_at),
      finished_at: toIso(req.body.finished_at),
    });
    res.redirect(`/workouts/${id}?${msg('Workout saved')}`);
  });

  router.post('/:id/delete', (req, res) => {
    repo.deleteWorkout(Number(req.params.id));
    res.redirect(`/?${msg('Workout deleted')}`);
  });

  router.post('/:id/to-routine', (req, res) => {
    const rid = repo.workoutToRoutine(Number(req.params.id));
    res.redirect(`/routines/${rid}/edit?${msg('Routine created from this workout. Adjust the targets and save')}`);
  });

  return router;
};
