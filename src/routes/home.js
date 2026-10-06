const express = require('express');
const fmt = require('../lib/format');
const { muscleStatus, trainingCalendar, BUCKETS, EMOJI, AREA_LABEL } = require('../lib/muscles');
const { bodyMap } = require('../lib/bodymap');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

module.exports = (repo) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const unit = res.locals.unit;
    const now = new Date();
    const thisYear = now.getFullYear();
    const year = /^\d{4}$/.test(req.query.year || '') ? Number(req.query.year) : thisYear;

    // Body map looks back a year from today; recency colours top out at 6+ days anyway.
    const status = muscleStatus(repo.exerciseLog(new Date(now.getTime() - 365 * fmt.DAY).toISOString()), now);
    const groups = BUCKETS.map((b) => ({ ...b, muscles: Object.values(status).filter((s) => s.bucket === b.id) }));

    const yearLog = repo.exerciseLog(new Date(year, 0, 1).toISOString()).filter((r) => new Date(r.started_at).getFullYear() === year);
    const days = trainingCalendar(yearLog, { year, now });
    const weeks = days.length / 7;
    // Month labels sit over the week column that holds the 1st of the month.
    const months = days
      .map((d, i) => (d.date.getDate() === 1 && !d.outside ? { col: Math.floor(i / 7), label: MONTHS[d.date.getMonth()] } : null))
      .filter(Boolean);

    const firstYear = repo.totals().first_workout ? new Date(repo.totals().first_workout).getFullYear() : thisYear;

    res.render('home', {
      title: '',
      stats: repo.statsSince(fmt.startOfWeek(now).toISOString(), unit),
      routines: repo.listRoutines(),
      recent: repo.listWorkouts({ limit: 6, unit }).rows,
      totals: repo.totals(),
      figures: bodyMap(status),
      groups,
      year,
      prevYear: year > Math.min(firstYear, thisYear) ? year - 1 : null,
      nextYear: year < thisYear ? year + 1 : null,
      days,
      months,
      weeks,
      activeDays: days.filter((d) => d.exercises && !d.outside).length,
      emojiKey: Object.entries(EMOJI).filter(([k]) => k !== 'other').map(([k, e]) => ({ emoji: e, label: AREA_LABEL[k] })),
      scripts: ['/js/home.js'],
    });
  });

  return router;
};
