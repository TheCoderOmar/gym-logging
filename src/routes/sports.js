const express = require('express');
const fmt = require('../lib/format');
const { SPORTS, isSport, duration } = require('../lib/sports');
const { regionPoints, regionLabelOf, REGIONS } = require('../lib/muscles');
const { workMap } = require('../lib/bodymap');

const LABELS = Object.fromEntries(REGIONS.map((r) => [r.id, r.label]));

// "Works most" list for a sport: heat-map areas, hardest first.
function worksMost(sport) {
  return SPORTS[sport].muscles
    .map((m) => ({ label: regionLabelOf(m.muscle), points: m.points }))
    .sort((a, b) => b.points - a.points);
}

module.exports = (repo) => {
  const router = express.Router();
  const msg = (text, tone) => `msg=${encodeURIComponent(text)}${tone ? `&tone=${tone}` : ''}`;
  const fields = (body) => ({
    sport: String(body.sport || ''),
    date: String(body.date || ''),
    minutes: (parseInt(body.hours, 10) || 0) * 60 + (parseInt(body.minutes, 10) || 0),
    notes: body.notes,
  });
  const works = Object.fromEntries(Object.keys(SPORTS).map((k) => [k, worksMost(k)]));

  router.get('/new', (req, res) => {
    res.render('sports/new', {
      title: 'Log sport',
      sports: SPORTS,
      works,
      s: { sport: isSport(req.query.sport) ? req.query.sport : 'football', played_on: fmt.dayIso(), minutes: 90, notes: '' },
      scripts: ['/js/sports.js'],
    });
  });

  router.post('/', (req, res) => {
    const f = fields(req.body);
    try {
      repo.logSport(f);
    } catch (err) {
      return res.redirect(`/sports/new?${msg(err.message, 'error')}`);
    }
    res.redirect(`/?${msg(`${SPORTS[f.sport].label} logged: ${duration(f.minutes)}`)}`);
  });

  router.get('/:id', (req, res, next) => {
    const s = repo.getSport(Number(req.params.id));
    if (!s || !SPORTS[s.sport]) return next();
    res.render('sports/show', {
      title: SPORTS[s.sport].label,
      s,
      sport: SPORTS[s.sport],
      sports: SPORTS,
      works,
      figures: workMap(regionPoints(SPORTS[s.sport].muscles), LABELS),
      scripts: ['/js/sports.js'],
    });
  });

  router.post('/:id/update', (req, res) => {
    const id = Number(req.params.id);
    try {
      repo.updateSport(id, fields(req.body));
    } catch (err) {
      return res.redirect(`/sports/${id}?${msg(err.message, 'error')}`);
    }
    res.redirect(`/sports/${id}?${msg('Session saved')}`);
  });

  router.post('/:id/delete', (req, res) => {
    repo.deleteSport(Number(req.params.id));
    res.redirect(`/workouts?${msg('Session deleted')}`);
  });

  return router;
};
