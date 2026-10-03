const express = require('express');
const fmt = require('../lib/format');

module.exports = (repo) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const unit = res.locals.unit;
    const weekStart = fmt.startOfWeek();
    const weekIso = weekStart.toISOString();
    const thisWeek = repo.workoutVolumes(weekIso, unit);
    // Which days (Mon..Sun) of this week had a workout.
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      const trained = thisWeek.some((w) => fmt.startOfDay(w.started_at).getTime() === d.getTime());
      return { label: d.toLocaleDateString('en-GB', { weekday: 'narrow' }), trained, today: d.getTime() === fmt.startOfDay(new Date()).getTime() };
    });
    res.render('home', {
      title: '',
      stats: repo.statsSince(weekIso, unit),
      days,
      routines: repo.listRoutines(),
      recent: repo.listWorkouts({ limit: 8, unit }).rows,
      totals: repo.totals(),
    });
  });

  return router;
};
