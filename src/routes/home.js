const express = require('express');
const fmt = require('../lib/format');
const { muscleStatus, trainingCalendar, weeklySets, startOfTrainingWeek, startOfLastDays, BUCKETS, EMOJI, AREA_LABEL } = require('../lib/muscles');
const { bodyMap, headFigure } = require('../lib/bodymap');
const { hasHeads, headStatus, regionLabel } = require('../lib/heads');
const { sportRows, SPORTS } = require('../lib/sports');
const { historyType, historyKind, historyFilters, EMPTY } = require('../lib/history');

// How many years ahead the training log lets you page to.
const FUTURE_YEARS = 5;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

module.exports = (repo) => {
  const router = express.Router();

  // Workouts and sports sessions since a date, as rows the map / heads / calendar read.
  const activityLog = (isoStart) => repo.exerciseLog(isoStart).concat(sportRows(repo.sportSessionsSince(isoStart)));

  // Everything the training-log partial needs for one year (clamped to the pageable range).
  function trainingLog(requestedYear, now = new Date()) {
    const thisYear = now.getFullYear();
    const first = repo.totals().first_workout;
    const minYear = Math.min(first ? new Date(first).getFullYear() : thisYear, thisYear);
    const asked = /^\d{4}$/.test(String(requestedYear || '')) ? Number(requestedYear) : thisYear;
    const year = Math.max(minYear, Math.min(asked, thisYear + FUTURE_YEARS));

    const yearLog = activityLog(new Date(year, 0, 1).toISOString()).filter((r) => new Date(r.started_at).getFullYear() === year);
    const days = trainingCalendar(yearLog, { year, now });
    return {
      year,
      prevYear: year > minYear ? year - 1 : null,
      nextYear: year < thisYear + FUTURE_YEARS ? year + 1 : null,
      days,
      weeks: days.length / 7,
      // Month labels sit over the week column that holds the 1st of the month.
      months: days
        .map((d, i) => (d.date.getDate() === 1 && !d.outside ? { col: Math.floor(i / 7), label: MONTHS[d.date.getMonth()] } : null))
        .filter(Boolean),
      activeDays: days.filter((d) => d.exercises && !d.outside).length,
      emojiKey: Object.entries(EMOJI).filter(([k]) => k !== 'other').map(([k, e]) => ({ key: k, emoji: e, label: AREA_LABEL[k] })),
    };
  }

  // Home's "Recent activity": last 6 workouts / sports sessions, filterable.
  function recentList(requested, unit) {
    const type = historyType(requested);
    return {
      rows: repo.listHistory({ limit: 6, unit, kind: historyKind(type) }).rows,
      filters: historyFilters(type, (t) => ({ href: t === 'all' ? '/#recent-title' : `/?recent=${t}#recent-title`, fragment: `/recent?type=${t}` })),
      emptyText: EMPTY[type],
    };
  }

  router.get('/recent', (req, res) => {
    res.render('partials/history-list', recentList(req.query.type, res.locals.unit));
  });

  router.get('/', (req, res) => {
    const unit = res.locals.unit;
    const now = new Date();

    // Body map looks back a year from today; recency colours top out at 6+ days anyway.
    const status = muscleStatus(activityLog(new Date(now.getTime() - 365 * fmt.DAY).toISOString()), now);

    // "This week" stats: calendar week from Saturday, like the training log.
    const weekStart = startOfTrainingWeek(now).toISOString();
    // Sets per muscle: rolling last 7 days, so nothing drops off when Saturday comes.
    const last7 = startOfLastDays(7, now).toISOString();
    const weekSports = new Map();
    for (const s of repo.sportSessionsSince(last7)) {
      if (SPORTS[s.sport]) weekSports.set(SPORTS[s.sport].label, (weekSports.get(SPORTS[s.sport].label) || 0) + s.minutes);
    }

    res.render('home', {
      title: '',
      stats: repo.statsSince(weekStart, unit),
      weekSets: weeklySets(activityLog(last7)),
      weekSports: [...weekSports].map(([label, minutes]) => ({ label, minutes })),
      routines: repo.listRoutines(),
      recent: recentList(req.query.recent, unit),
      totals: repo.totals(),
      figures: bodyMap(status),
      groups: BUCKETS.map((b) => ({ ...b, muscles: Object.values(status).filter((s) => s.bucket === b.id) })),
      ...trainingLog(req.query.year, now),
      scripts: ['/js/home.js', '/js/history-filter.js'],
    });
  });

  // Close-up of one muscle split into its heads, for the recovery-map popup.
  router.get('/muscles/:region', (req, res, next) => {
    const region = String(req.params.region);
    if (!hasHeads(region)) return next(); // → 404
    const now = new Date();
    const heads = headStatus(activityLog(new Date(now.getTime() - 365 * fmt.DAY).toISOString()), region, now);
    res.render('partials/heads', { region, label: regionLabel(region), heads, figure: headFigure(region, heads), buckets: BUCKETS });
  });

  // Just the training-log panel, so the year arrows can swap it in without a page reload.
  router.get('/training-log', (req, res) => {
    res.render('partials/training-log', trainingLog(req.query.year));
  });

  return router;
};
