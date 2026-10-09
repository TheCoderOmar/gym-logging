const express = require('express');
const multer = require('multer');
const { sessionSummaries, personalRecords } = require('../lib/stats');
const { defaultMusclePoints, regionLabelOf, TRAINED_THRESHOLD, MAX_POINTS, REGIONS } = require('../lib/muscles');
const { muscleFilterMap } = require('../lib/bodymap');
const { HEAD_GROUPS, regionLabel } = require('../lib/heads');

const REGION_LABELS = Object.fromEntries(REGIONS.map((r) => [r.id, r.label]));

const PAGE_SIZE = 48;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)),
});

function mediaFrom(files = {}) {
  const pick = (f) => f && f[0] && { data: f[0].buffer, mime: f[0].mimetype };
  const image = pick(files.image);
  const gif = pick(files.gif);
  // An animated upload with no still also serves as the thumbnail.
  return { image: image || gif, gif };
}

module.exports = (repo) => {
  const router = express.Router();

  // Muscle scores for the exercise page: role (target/also works), default and heat-map area.
  function muscleRows(ex) {
    const defaults = new Map(defaultMusclePoints(ex.target, ex.secondary_muscles, ex.name).map((d) => [d.muscle, d.points]));
    return repo.getExerciseMuscles(ex.id).map((m) => ({
      ...m,
      role: m.muscle === String(ex.target).toLowerCase() ? 'Target' : 'Also works',
      defaultPoints: defaults.get(m.muscle) ?? m.points,
      area: regionLabelOf(m.muscle),
    }));
  }

  router.get('/', (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const filters = {
      q: String(req.query.q || ''),
      body_part: String(req.query.body_part || ''),
      equipment: String(req.query.equipment || ''),
      target: String(req.query.target || ''),
      custom: req.query.custom === '1',
      // Heat-map regions picked on the body figure, comma-separated: ?muscles=lats,biceps
      muscles: String(req.query.muscles || '').split(',').map((s) => s.trim()).filter((s) => REGION_LABELS[s]).join(','),
    };
    const regions = filters.muscles ? filters.muscles.split(',') : [];
    const { total, rows, partial } = repo.searchExercises({ ...filters, regions, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    const qs = (p) => new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(filters.custom ? { custom: '1' } : {}), page: p }).toString();
    res.render('exercises/index', {
      title: 'Exercises',
      filters, rows, total, page, partial,
      regions: regions.map((id) => ({ id, label: REGION_LABELS[id] })),
      figures: muscleFilterMap(new Set(regions), REGION_LABELS),
      pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      qs,
      options: repo.filterOptions(),
      scripts: ['/js/exercise-library.js'],
    });
  });

  router.get('/new', (req, res) => {
    res.render('exercises/form', { title: 'New exercise', ex: { name: req.query.name || '' }, options: repo.filterOptions(), error: null });
  });

  router.post('/', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'gif', maxCount: 1 }]), (req, res) => {
    try {
      const id = repo.createCustomExercise(req.body, mediaFrom(req.files));
      res.redirect(`/exercises/${id}?msg=${encodeURIComponent('Exercise added to your library')}`);
    } catch (err) {
      res.status(400).render('exercises/form', { title: 'New exercise', ex: req.body, options: repo.filterOptions(), error: err.message });
    }
  });

  router.get('/:id', (req, res, next) => {
    const ex = repo.getExercise(req.params.id);
    if (!ex) return next();
    const unit = res.locals.unit;
    const sets = repo.exerciseSets(ex.id);
    const sessions = sessionSummaries(sets, unit);
    const recent = [];
    for (const s of [...sets].reverse()) {
      let r = recent.find((x) => x.workout_id === s.workout_id);
      if (!r) {
        if (recent.length >= 6) continue;
        r = { workout_id: s.workout_id, date: s.started_at, name: s.workout_name, sets: [] };
        recent.push(r);
      }
      if (s.done) r.sets.unshift(s);
    }
    res.render('exercises/show', {
      title: ex.name,
      ex,
      sessions,
      recent: recent.filter((r) => r.sets.length),
      prs: personalRecords(sets, unit),
      muscles: muscleRows(ex),
      heads: repo.getExerciseHeads(ex.id),
      headRegionLabels: Object.fromEntries(Object.keys(HEAD_GROUPS).map((r) => [r, regionLabel(r)])),
      threshold: TRAINED_THRESHOLD,
      maxPoints: MAX_POINTS,
      scripts: [...(sessions.length > 1 ? ['/vendor/chart.js/chart.umd.min.js', '/js/charts.js'] : []), '/js/muscle-scores.js'],
    });
  });

  router.get('/:id/edit', (req, res, next) => {
    const ex = repo.getExercise(req.params.id);
    if (!ex || !ex.is_custom) return next();
    res.render('exercises/form', {
      title: 'Edit exercise',
      ex: { ...ex, instructions: (ex.instruction_steps.en || []).join('\n'), secondary_muscles: ex.secondary_muscles.join(', ') },
      options: repo.filterOptions(),
      error: null,
    });
  });

  router.post('/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'gif', maxCount: 1 }]), (req, res) => {
    try {
      repo.updateCustomExercise(req.params.id, req.body, mediaFrom(req.files));
      res.redirect(`/exercises/${req.params.id}?msg=${encodeURIComponent('Exercise saved')}`);
    } catch (err) {
      res.status(400).render('exercises/form', { title: 'Edit exercise', ex: { ...req.body, id: req.params.id, is_custom: 1 }, options: repo.filterOptions(), error: err.message });
    }
  });

  router.post('/:id/delete', (req, res) => {
    try {
      repo.deleteCustomExercise(req.params.id);
      res.redirect(`/exercises?msg=${encodeURIComponent('Exercise deleted')}`);
    } catch (err) {
      res.redirect(`/exercises/${req.params.id}?tone=error&msg=${encodeURIComponent(err.message)}`);
    }
  });

  return router;
};
