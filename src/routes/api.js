const express = require('express');

module.exports = (repo) => {
  const router = express.Router();
  const id = (req, key = 'id') => {
    const n = Number(req.params[key]);
    if (!Number.isInteger(n)) throw new Error('Bad id');
    return n;
  };

  // Full logger state: workout, its exercises and sets, plus last session's sets per exercise.
  function workoutState(workoutId) {
    const w = repo.getWorkout(workoutId);
    if (!w) return null;
    for (const we of w.exercises) {
      we.previous = repo.previousSets(we.exercise_id, w.id);
    }
    return {
      workout: w,
      unit: repo.displayUnit(),
      bar: { kg: Number(repo.getSetting('bar_kg', '20')), lb: Number(repo.getSetting('bar_lb', '45')) },
    };
  }

  router.get('/exercises', (req, res) => {
    const { rows, total } = repo.searchExercises({
      q: String(req.query.q || ''),
      body_part: String(req.query.body_part || ''),
      equipment: String(req.query.equipment || ''),
      limit: Math.min(100, Number(req.query.limit) || 40),
    });
    res.json({ total, rows });
  });

  // Per-set muscle scores for an exercise: { scores: [{ muscle, points }] }
  router.put('/exercises/:id/muscles', (req, res) => {
    const scores = Array.isArray(req.body.scores) ? req.body.scores : [];
    res.json({ muscles: repo.setExerciseMuscles(String(req.params.id), scores) });
  });

  router.post('/exercises/:id/muscles/reset', (req, res) => {
    res.json({ muscles: repo.resetExerciseMuscles(String(req.params.id)) });
  });

  // Per-set head scores for one region: { region, scores: [{ head, points }] }
  router.get('/exercises/:id/heads', (req, res) => {
    res.json({ heads: repo.getExerciseHeads(String(req.params.id)) });
  });

  router.put('/exercises/:id/heads', (req, res) => {
    const scores = Array.isArray(req.body.scores) ? req.body.scores : [];
    res.json({ heads: repo.setExerciseHeads(String(req.params.id), String(req.body.region || ''), scores) });
  });

  router.post('/exercises/:id/heads/reset', (req, res) => {
    res.json({ heads: repo.resetExerciseHeads(String(req.params.id), String(req.body.region || '')) });
  });

  // iPhone app: send what it logged offline, get back a fresh snapshot to work from.
  router.post('/sync', (req, res) => {
    const body = req.body || {};
    try {
      const imported = repo.importFromPhone({ workouts: body.workouts || [], sports: body.sports || [] });
      res.json({ imported, snapshot: repo.snapshotForPhone() });
    } catch (err) {
      console.error('[sync] failed:', err);
      res.status(400).json({ error: err.message });
    }
  });

  router.get('/workouts/:id', (req, res) => {
    const state = workoutState(id(req));
    if (!state) return res.status(404).json({ error: 'Workout not found' });
    res.json(state);
  });

  router.patch('/workouts/:id', (req, res) => {
    repo.updateWorkout(id(req), { name: req.body.name, notes: req.body.notes, date: req.body.date });
    res.json({ ok: true });
  });

  router.post('/workouts/:id/exercises', (req, res) => {
    repo.addWorkoutExercise(id(req), String(req.body.exercise_id));
    res.json(workoutState(id(req)));
  });

  router.post('/workouts/:id/finish', (req, res) => {
    repo.finishWorkout(id(req));
    res.json({ ok: true, redirect: `/workouts/${id(req)}` });
  });

  router.delete('/workout-exercises/:id', (req, res) => {
    repo.removeWorkoutExercise(id(req));
    res.json({ ok: true });
  });

  router.post('/workout-exercises/:id/move', (req, res) => {
    repo.moveWorkoutExercise(id(req), Number(req.body.direction) < 0 ? -1 : 1);
    res.json({ ok: true });
  });

  router.patch('/workout-exercises/:id', (req, res) => {
    repo.updateWorkoutExercise(id(req), req.body);
    res.json({ ok: true });
  });

  router.post('/workout-exercises/:id/unit', (req, res) => {
    res.json({ sets: repo.setExerciseUnit(id(req), req.body.unit) });
  });

  router.post('/workout-exercises/:id/sets', (req, res) => {
    res.json({ set: repo.addSet(id(req)) });
  });

  router.patch('/sets/:id', (req, res) => {
    res.json({ set: repo.updateSet(id(req), req.body) });
  });

  router.delete('/sets/:id', (req, res) => {
    repo.deleteSet(id(req));
    res.json({ ok: true });
  });

  router.post('/routines', (req, res) => {
    const routineId = repo.saveRoutine({
      id: req.body.id ? Number(req.body.id) : null,
      name: req.body.name,
      notes: req.body.notes || '',
      exercises: Array.isArray(req.body.exercises) ? req.body.exercises : [],
    });
    res.json({ ok: true, id: routineId, redirect: '/routines?msg=' + encodeURIComponent('Routine saved') });
  });

  return router;
};
