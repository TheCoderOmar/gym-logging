// Import crawled liftmanual.com exercises (scripts/scrape-liftmanual.js + match-liftmanual.py).
//   matched → swap in their sharper media (360×360 animated WebP + still); nothing else changes
//   new     → add as exercises L0001…, muscles mapped onto the recovery map's names
// Personal, local use only (media © Gym visual / Lift Manual). Never publish the result.
//
//   GYM_DB=<copy> node scripts/import-liftmanual.js            # dry run: counts only
//   GYM_DB=<copy> node scripts/import-liftmanual.js --apply    # write
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../src/db');
const { regionOf } = require('../src/lib/muscles');

const LM = path.join(__dirname, '..', 'scrape', 'liftmanual');
const MEDIA = path.join(LM, 'media');

// Their "Muscle Group" tags → a dataset muscle name (first tag becomes the target).
const GROUPS = {
  abs: 'abs', core: 'abs', waist: 'abs', abdominals: 'abs', 'hip-flexors': 'hip flexors', obliques: 'obliques',
  back: 'upper back', 'upper-back': 'upper back', 'middle-back': 'upper back', 'lower-back': 'lower back', 'erector-spinae': 'lower back',
  'latissimus-dorsi': 'lats', lats: 'lats', traps: 'traps', trapezius: 'traps', neck: 'sternocleidomastoid',
  biceps: 'biceps', triceps: 'triceps', 'upper-arms': 'biceps', arms: 'biceps', forearms: 'forearms', wrist: 'forearms', wrists: 'forearms', grip: 'forearms',
  chest: 'pectorals', 'upper-chest': 'pectorals', 'lower-chest': 'pectorals', pectorals: 'pectorals',
  shoulders: 'delts', deltoids: 'delts', 'front-deltoid': 'delts', 'side-deltoid': 'delts', 'rear-deltoid': 'delts', 'rotator-cuff': 'delts',
  glutes: 'glutes', hips: 'glutes', abductors: 'abductors', adductors: 'adductors',
  hamstrings: 'hamstrings', quadriceps: 'quads', quads: 'quads', thighs: 'quads', legs: 'quads', calves: 'calves', shins: 'calves',
};
// Extra secondary muscles some tags imply (they steer the muscle-head rules).
const GROUP_EXTRA = { 'rear-deltoid': 'rear deltoids', 'upper-chest': 'upper chest', 'lower-chest': 'chest', 'rotator-cuff': 'rotator cuff' };

// "Muscles worked" free text → dataset muscle names. Order matters (first match wins).
const WORKED = [
  [/biceps femoris|hamstring|semitendinosus|semimembranosus/, 'hamstrings'],
  [/rectus femoris|vastus|quadricep|\bquads?\b/, 'quadriceps'],
  [/rectus abdominis|abdominal|\babs\b|transvers|\bcore\b|six.?pack/, 'abs'],
  [/oblique/, 'obliques'],
  [/hip flexor|iliopsoas|psoas|iliacus/, 'hip flexors'],
  [/erector|spinal|spine|quadratus lumborum|lower back|multifid/, 'lower back'],
  [/glute|gluteus/, 'glutes'],
  [/adductor|inner thigh|groin/, 'adductors'],
  [/abductor|tensor fasci|outer thigh/, 'abductors'],
  [/gastrocnemius|soleus|\bcal(f|ves)\b/, 'calves'],
  [/tibialis|\bshins?\b/, 'shins'],
  [/latissimus|\blats?\b/, 'latissimus dorsi'],
  [/rhomboid/, 'rhomboids'],
  [/teres|infraspinatus|supraspinatus|subscapularis|rotator cuff/, 'rotator cuff'],
  [/trapez|\btraps\b/, 'trapezius'],
  [/levator scap/, 'levator scapulae'],
  [/rear delt|posterior delt/, 'rear deltoids'],
  [/delt|shoulder/, 'deltoids'],
  [/serratus/, 'serratus anterior'],
  [/upper chest|clavicular/, 'upper chest'],
  [/pector|\bchest\b|\bpecs?\b/, 'chest'],
  [/tricep/, 'triceps'],
  [/brachialis/, 'brachialis'],
  [/brachioradialis|forearm|wrist|grip|finger/, 'forearms'],
  [/bicep/, 'biceps'],
  [/sternocleid|\bneck\b|splenius/, 'sternocleidomastoid'],
  [/upper back|mid(dle)? back|\bback\b/, 'upper back'],
];

// Their equipment tags → the dataset's equipment names.
const EQUIPMENT = {
  bodyweight: 'body weight', barbell: 'barbell', dumbbell: 'dumbbell', cable: 'cable', kettlebell: 'kettlebell',
  'leverage-machine': 'leverage machine', 'smith-machine': 'smith machine', 'resistance-band': 'band', band: 'band',
  'ez-curl-bar': 'ez barbell', 'ez-bar': 'ez barbell', 'medicine-ball': 'medicine ball', 'stability-ball': 'stability ball',
  'bosu-ball': 'bosu ball', 'trap-bar': 'trap bar', weights: 'weighted', weighted: 'weighted', 'wheel-roller': 'wheel roller',
  'battle-ropes': 'rope', rope: 'rope', 'foam-roller': 'roller', 'sled-machine': 'sled machine', assisted: 'assisted',
};

// Heat-map region → the dataset's body_part.
const BODY_PART = {
  chest: 'chest', shoulders: 'shoulders', biceps: 'upper arms', triceps: 'upper arms', forearms: 'lower arms',
  abs: 'waist', obliques: 'waist', traps: 'back', upper_back: 'back', lats: 'back', lower_back: 'back',
  glutes: 'upper legs', quads: 'upper legs', hamstrings: 'upper legs', adductors: 'upper legs', calves: 'lower legs',
};

const GENERIC = new Set(['back', 'core', 'legs', 'arms', 'upper-arms', 'thighs', 'hips', 'waist']);
// Dataset target names for a "muscles worked" mapping (targets use the short dataset names).
const TARGET_NAME = { quadriceps: 'quads', 'latissimus dorsi': 'lats', trapezius: 'traps', deltoids: 'delts', 'rear deltoids': 'delts', chest: 'pectorals', 'upper chest': 'pectorals', 'lower back': 'spine' };
const toTarget = (m) => TARGET_NAME[m] || m;

const mapWorked = (label) => {
  const l = label.toLowerCase();
  const hit = WORKED.find(([re]) => re.test(l));
  return hit ? hit[1] : null;
};

// Liftmanual exercise → fields for the exercises table.
function toExercise(ex) {
  const groups = ex.muscleGroups.map((g) => g.slug);
  // A vague first tag ("Back", "Core", "Legs"…) loses to the first specific "muscles worked" entry
  // (e.g. back extension: "Back" tag, but "Erector spinae" first → lower back).
  const firstWorked = ex.musclesWorked.map(mapWorked).find(Boolean);
  const target = (GENERIC.has(groups[0]) && firstWorked ? toTarget(firstWorked) : null)
    || groups.map((g) => GROUPS[g]).find(Boolean) || (firstWorked && toTarget(firstWorked)) || 'abs';
  const secondary = [];
  const add = (m) => { if (m && m !== target && !secondary.includes(m)) secondary.push(m); };
  groups.forEach((g) => { if (!GENERIC.has(g)) add(GROUPS[g]); add(GROUP_EXTRA[g]); }); // vague tags add nothing as helpers
  ex.musclesWorked.forEach((m) => add(mapWorked(m)));
  // Drop helpers that land on the target's own region (e.g. target "abs", helper "abs").
  const tRegion = regionOf(target);
  const secondaryOut = secondary.filter((m) => !regionOf(m) || regionOf(m) !== tRegion || m === 'rear deltoids' || m === 'upper chest');
  const eqSlug = (ex.equipment[0] || {}).slug;
  return {
    name: ex.name.toLowerCase(),
    body_part: BODY_PART[tRegion] || 'waist',
    equipment: EQUIPMENT[eqSlug] || (ex.equipment[0] ? ex.equipment[0].label.toLowerCase() : 'body weight'),
    target,
    muscle_group: ex.muscleGroups.map((g) => g.label).join(', ') || null,
    secondary_muscles: secondaryOut,
    steps: ex.instructions,
  };
}

function media(slug, animFile) {
  return {
    gif: { data: fs.readFileSync(path.join(MEDIA, animFile)), mime: animFile.endsWith('.gif') ? 'image/gif' : 'image/webp' },
    image: { data: fs.readFileSync(path.join(MEDIA, `${slug}.jpg`)), mime: 'image/jpeg' },
  };
}

function main() {
  const apply = process.argv.includes('--apply');
  const crawled = new Map(JSON.parse(fs.readFileSync(path.join(LM, 'exercises.json'), 'utf8')).map((e) => [e.slug, e]));
  const matches = JSON.parse(fs.readFileSync(path.join(LM, 'matches.json'), 'utf8'));
  const idsFile = path.join(LM, 'ids.json');
  const ids = fs.existsSync(idsFile) ? JSON.parse(fs.readFileSync(idsFile, 'utf8')) : {};
  let next = Math.max(0, ...Object.values(ids).map((id) => Number(id.slice(1)))) + 1;

  const repo = openDb();
  console.log(`Database: ${process.env.GYM_DB || 'db/gym.sqlite (the real one)'}${apply ? '' : '  — dry run, nothing written'}`);
  const insert = repo.db.prepare(`
    INSERT INTO exercises (id, name, body_part, equipment, target, muscle_group, secondary_muscles, instructions, instruction_steps, is_custom)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, body_part = excluded.body_part, equipment = excluded.equipment,
      target = excluded.target, muscle_group = excluded.muscle_group, secondary_muscles = excluded.secondary_muscles,
      instructions = excluded.instructions, instruction_steps = excluded.instruction_steps`);

  const counts = { sharper: 0, added: 0, skippedCustom: 0, unmapped: 0 };
  const unmappedWorked = new Map();
  repo.tx(() => {
    for (const m of matches) {
      const ex = crawled.get(m.slug);
      if (!ex || !ex.animFile) continue;
      if (m.status === 'match') {
        const local = repo.get('SELECT is_custom FROM exercises WHERE id = ?', m.id);
        if (!local || local.is_custom) { counts.skippedCustom++; continue; }
        if (apply) repo.saveMedia(m.id, media(m.slug, ex.animFile));
        counts.sharper++;
      } else if (m.status === 'new') {
        if (!ids[m.slug]) ids[m.slug] = `L${String(next++).padStart(4, '0')}`;
        const f = toExercise(ex);
        for (const w of ex.musclesWorked) if (!mapWorked(w)) unmappedWorked.set(w, (unmappedWorked.get(w) || 0) + 1);
        if (!regionOf(f.target)) counts.unmapped++;
        if (apply) {
          insert.run(ids[m.slug], f.name, f.body_part, f.equipment, f.target, f.muscle_group, JSON.stringify(f.secondary_muscles),
            JSON.stringify({ en: f.steps.join(' ') }), JSON.stringify({ en: f.steps }));
          repo.saveMedia(ids[m.slug], media(m.slug, ex.animFile));
          repo.syncExerciseMuscles(ids[m.slug]); // re-runs: refresh scores Omar hasn't edited
        }
        counts.added++;
      }
    }
  });
  if (apply) {
    fs.writeFileSync(idsFile, JSON.stringify(ids, null, 1));
    const scored = repo.ensureExerciseMuscles();
    console.log(`Muscle scores added for ${scored} new exercises.`);
  }
  console.log(counts);
  const top = [...unmappedWorked].sort((a, b) => b[1] - a[1]).slice(0, 25);
  if (top.length) console.log('Unmapped "muscles worked" labels (most common):', top.map(([l, n]) => `${l} ×${n}`).join(' · '));
  repo.close();
}

main();
