const express = require('express');
const fmt = require('../lib/format');
const { muscleStatus, trainingCalendar, BUCKETS, EMOJI, AREA_LABEL } = require('../lib/muscles');
const { bodyMap } = require('../lib/bodymap');

const CALENDAR_WEEKS = 53;

module.exports = (repo) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const unit = res.locals.unit;
    const now = new Date();
    const weekIso = fmt.startOfWeek(now).toISOString();

    const calStart = fmt.startOfWeek(now);
    calStart.setDate(calStart.getDate() - 7 * (CALENDAR_WEEKS - 1));
    const log = repo.exerciseLog(calStart.toISOString());

    // Muscles never trained in the calendar window are shown as "not trained yet";
    // a year is plenty for the recency colours, which top out at 6+ days.
    const status = muscleStatus(log, now);
    const groups = BUCKETS.map((b) => ({ ...b, muscles: Object.values(status).filter((s) => s.bucket === b.id) }));

    const days = trainingCalendar(log, { weeks: CALENDAR_WEEKS, now });
    // Month labels: the first week column that contains the 1st of a month.
    const months = [];
    days.forEach((d, i) => {
      if (d.date.getDate() === 1 || i === 0) months.push({ col: Math.floor(i / 7), label: d.date.toLocaleDateString('en-GB', { month: 'short' }) });
    });
    if (months.length > 1 && months[1].col - months[0].col < 3) months.shift(); // avoid a cramped first label

    res.render('home', {
      title: '',
      stats: repo.statsSince(weekIso, unit),
      routines: repo.listRoutines(),
      recent: repo.listWorkouts({ limit: 6, unit }).rows,
      totals: repo.totals(),
      figures: bodyMap(status),
      groups,
      days,
      months,
      weeks: Math.ceil(days.length / 7),
      activeDays: days.filter((d) => d.exercises).length,
      emojiKey: Object.entries(EMOJI).filter(([k]) => k !== 'other').map(([k, e]) => ({ emoji: e, label: AREA_LABEL[k] })),
      scripts: ['/js/home.js'],
    });
  });

  return router;
};
