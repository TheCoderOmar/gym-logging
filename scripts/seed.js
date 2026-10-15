// Load data/exercises.json and the images/ + videos/ media into the SQLite DB.
// Safe to re-run: dataset rows are upserted, custom exercises and workout data are untouched.
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');

const ROOT = path.join(__dirname, '..');

const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif' };

const STARTER_ROUTINES = [
  {
    name: 'Full Body A',
    notes: 'Three days a week, alternating with your own variations. Add weight when you hit the top of the rep range.',
    exercises: [
      ['barbell full squat', 3, '5', 180],
      ['barbell bench press', 3, '5', 180],
      ['barbell bent over row', 3, '8', 120],
      ['dumbbell standing overhead press', 3, '8-10', 90],
      ['cable bar lateral pulldown', 3, '10-12', 90],
      ['dumbbell biceps curl', 2, '12', 60],
    ],
  },
  {
    name: 'Push',
    notes: 'Chest, shoulders, triceps.',
    exercises: [
      ['barbell bench press', 4, '6-8', 150],
      ['dumbbell incline bench press', 3, '8-10', 120],
      ['barbell seated overhead press', 3, '8-10', 120],
      ['dumbbell lateral raise', 3, '12-15', 60],
      ['dumbbell fly', 3, '12', 60],
      ['cable pushdown', 3, '10-12', 60],
    ],
  },
  {
    name: 'Pull',
    notes: 'Back and biceps.',
    exercises: [
      ['barbell deadlift', 3, '5', 180],
      ['pull-up', 3, 'max', 120],
      ['cable seated row', 3, '10', 90],
      ['cable bar lateral pulldown', 3, '10-12', 90],
      ['barbell curl', 3, '10', 60],
      ['dumbbell hammer curl', 3, '12', 60],
    ],
  },
  {
    name: 'Legs',
    notes: 'Quads, hamstrings, calves.',
    exercises: [
      ['barbell full squat', 4, '6-8', 180],
      ['barbell romanian deadlift', 3, '8-10', 120],
      ['dumbbell lunge', 3, '10 / leg', 90],
      ['lever leg extension', 3, '12-15', 60],
      ['lever lying leg curl', 3, '12-15', 60],
      ['lever seated calf raise', 4, '15', 45],
    ],
  },
];

function readMedia(rel) {
  if (!rel) return null;
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return null;
  return { data: fs.readFileSync(file), mime: MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' };
}

function seed(repo, { log = console.log } = {}) {
  const exercises = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'exercises.json'), 'utf8'));
  let missingMedia = 0;

  const upsert = repo.db.prepare(`
    INSERT INTO exercises (id, name, body_part, equipment, target, muscle_group, secondary_muscles, instructions, instruction_steps, is_custom, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, body_part = excluded.body_part, equipment = excluded.equipment, target = excluded.target,
      muscle_group = excluded.muscle_group, secondary_muscles = excluded.secondary_muscles,
      instructions = excluded.instructions, instruction_steps = excluded.instruction_steps
    WHERE is_custom = 0`);
  const upsertMedia = repo.db.prepare(`
    INSERT INTO exercise_media (exercise_id, image, image_mime, gif, gif_mime) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(exercise_id) DO UPDATE SET
      image = excluded.image, image_mime = excluded.image_mime, gif = excluded.gif, gif_mime = excluded.gif_mime
    -- Keep the sharper media from scripts/import-liftmanual.js (animated WebP) instead of the 180px GIFs.
    WHERE exercise_media.gif_mime IS NOT 'image/webp'`);

  repo.tx(() => {
    exercises.forEach((ex, i) => {
      upsert.run(
        ex.id, ex.name, ex.body_part, ex.equipment, ex.target, ex.muscle_group || null,
        JSON.stringify(ex.secondary_muscles || []),
        JSON.stringify(ex.instructions || {}),
        JSON.stringify(ex.instruction_steps || {}),
        ex.created_at || new Date().toISOString(),
      );
      const image = readMedia(ex.image);
      const gif = readMedia(ex.gif_url);
      if (!image || !gif) missingMedia++;
      if (image || gif) {
        upsertMedia.run(ex.id, image?.data ?? null, image?.mime ?? null, gif?.data ?? null, gif?.mime ?? null);
      }
      if ((i + 1) % 200 === 0) log(`  ${i + 1}/${exercises.length} exercises`);
    });
  });
  log(`Seeded ${exercises.length} exercises${missingMedia ? ` (${missingMedia} with missing media files)` : ''}.`);
  const scored = repo.ensureExerciseMuscles();
  if (scored) log(`Added default muscle scores for ${scored} exercises.`);

  const routineCount = repo.get('SELECT COUNT(*) AS n FROM routines').n;
  if (routineCount === 0) {
    const byName = repo.db.prepare('SELECT id FROM exercises WHERE name = ? ORDER BY id LIMIT 1');
    for (const r of STARTER_ROUTINES) {
      const items = r.exercises
        .map(([name, sets, reps, rest]) => {
          const row = byName.get(name);
          if (!row) log(`  starter routine "${r.name}": no exercise named "${name}", skipped`);
          return row && { exercise_id: row.id, target_sets: sets, target_reps: reps, rest_seconds: rest };
        })
        .filter(Boolean);
      repo.saveRoutine({ name: r.name, notes: r.notes, exercises: items });
    }
    log(`Added ${STARTER_ROUTINES.length} starter routines.`);
  }
}

if (require.main === module) {
  const repo = openDb();
  const t = Date.now();
  seed(repo);
  const counts = repo.get('SELECT (SELECT COUNT(*) FROM exercises) AS exercises, (SELECT COUNT(*) FROM exercise_media) AS media, (SELECT COUNT(*) FROM routines) AS routines');
  console.log(`DB now has ${counts.exercises} exercises, ${counts.media} media rows, ${counts.routines} routines (${((Date.now() - t) / 1000).toFixed(1)}s).`);
  repo.close();
}

module.exports = { seed };
