const express = require('express');
const fmt = require('../lib/format');
const { sessionSummaries, personalRecords } = require('../lib/stats');

const WEEKS = 12;

module.exports = (repo) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const unit = res.locals.unit;
    const exercises = repo.exercisesWithHistory();
    const selectedId = exercises.some((e) => e.id === req.query.exercise) ? req.query.exercise : exercises[0]?.id;
    const selected = selectedId ? repo.getExercise(selectedId) : null;
    const sets = selected ? repo.exerciseSets(selected.id) : [];

    // Weekly volume, last 12 local weeks (Mon–Sun), including empty weeks.
    const firstWeek = fmt.startOfWeek();
    firstWeek.setDate(firstWeek.getDate() - 7 * (WEEKS - 1));
    const weeks = Array.from({ length: WEEKS }, (_, i) => {
      const d = new Date(firstWeek);
      d.setDate(d.getDate() + 7 * i);
      return { start: d, label: fmt.date(d.toISOString()), volume: 0, workouts: 0 };
    });
    for (const w of repo.workoutVolumes(firstWeek.toISOString(), unit)) {
      const idx = Math.floor((fmt.startOfWeek(new Date(w.started_at)) - firstWeek) / (7 * fmt.DAY) + 0.01);
      if (weeks[idx]) {
        weeks[idx].volume += w.volume;
        weeks[idx].workouts += 1;
      }
    }

    const since30 = new Date(Date.now() - 30 * fmt.DAY).toISOString();
    res.render('progress', {
      title: 'Progress',
      exercises,
      selected,
      sessions: sessionSummaries(sets, unit),
      prs: personalRecords(sets, unit),
      weeks: weeks.map((w) => ({ label: w.label, volume: Math.round(w.volume), workouts: w.workouts })),
      bodyParts: repo.bodyPartSets(since30),
      scripts: ['/vendor/chart.js/chart.umd.min.js', '/js/charts.js'],
    });
  });

  return router;
};
