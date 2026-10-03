const express = require('express');

module.exports = (repo) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.render('routines/index', { title: 'Routines', routines: repo.listRoutines() });
  });

  function builder(res, routine) {
    // The builder needs image flags for thumbnails.
    for (const ex of routine.exercises) {
      const full = repo.getExercise(ex.exercise_id);
      ex.has_image = full ? full.has_image : 0;
    }
    res.render('routines/edit', {
      title: routine.id ? `Edit ${routine.name}` : 'New routine',
      routine,
      options: repo.filterOptions(),
      scripts: ['/js/exercise-picker.js', '/js/routine-builder.js'],
    });
  }

  router.get('/new', (req, res) => builder(res, { id: null, name: '', notes: '', exercises: [] }));

  router.get('/:id/edit', (req, res, next) => {
    const routine = repo.getRoutine(Number(req.params.id));
    if (!routine) return next();
    builder(res, routine);
  });

  router.get('/:id', (req, res) => res.redirect(`/routines/${req.params.id}/edit`));

  router.post('/:id/duplicate', (req, res, next) => {
    const r = repo.getRoutine(Number(req.params.id));
    if (!r) return next();
    const id = repo.saveRoutine({ name: `${r.name} (copy)`, notes: r.notes, exercises: r.exercises });
    res.redirect(`/routines/${id}/edit?msg=${encodeURIComponent('Copy created')}`);
  });

  router.post('/:id/delete', (req, res) => {
    repo.deleteRoutine(Number(req.params.id));
    res.redirect(`/routines?msg=${encodeURIComponent('Routine deleted. Past workouts are kept')}`);
  });

  return router;
};
