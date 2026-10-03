const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const { isUnit } = require('../lib/units');

module.exports = (repo) => {
  const router = express.Router();

  router.get('/', (req, res) => {
    const counts = repo.get(
      `SELECT (SELECT COUNT(*) FROM exercises) AS exercises,
              (SELECT COUNT(*) FROM exercises WHERE is_custom = 1) AS custom,
              (SELECT COUNT(*) FROM workouts) AS workouts,
              (SELECT COUNT(*) FROM sets) AS sets,
              (SELECT COUNT(*) FROM routines) AS routines`,
    );
    res.render('settings', {
      title: 'Settings',
      counts,
      bar: { kg: repo.getSetting('bar_kg', '20'), lb: repo.getSetting('bar_lb', '45') },
    });
  });

  router.post('/', (req, res) => {
    if (isUnit(req.body.display_unit)) repo.setSetting('display_unit', req.body.display_unit);
    const bar = (v, max) => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
    };
    const kg = bar(req.body.bar_kg, 50);
    const lb = bar(req.body.bar_lb, 110);
    if (kg !== null) repo.setSetting('bar_kg', kg);
    if (lb !== null) repo.setSetting('bar_lb', lb);
    res.redirect('/settings?msg=' + encodeURIComponent('Settings saved'));
  });

  // Consistent snapshot of the whole DB (including media) via VACUUM INTO.
  router.get('/backup', (req, res, next) => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const file = path.join(os.tmpdir(), `gym-log-${stamp}.sqlite`);
    try {
      repo.backupTo(file);
    } catch (err) {
      return next(err);
    }
    res.download(file, path.basename(file), () => fs.unlink(file, () => {}));
  });

  return router;
};
