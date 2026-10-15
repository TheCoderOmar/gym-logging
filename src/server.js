const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const fmt = require('./lib/format');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
// Localhost only by default. Set HOST=0.0.0.0 to open it to your phone on the same Wi-Fi.
const HOST = process.env.HOST || '127.0.0.1';

const repo = openDb();
if (repo.exerciseCount() === 0) {
  console.log('Empty database, seeding exercises (one-time, ~10s)…');
  require('../scripts/seed').seed(repo);
}

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(ROOT, 'views'));
app.locals.fmt = fmt;
Object.assign(app.locals, require('./lib/icons'));
app.locals.sportDuration = require('./lib/sports').duration;
app.locals.activityText = require('./lib/sports').activityText;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' })); // the iPhone app's sync can carry weeks of offline workouts
app.use(express.static(path.join(ROOT, 'public')));
app.use('/vendor/chart.js', express.static(path.join(ROOT, 'node_modules', 'chart.js', 'dist')));
app.use('/fonts', express.static(path.join(ROOT, 'node_modules', '@fontsource', 'saira-semi-condensed', 'files'), { maxAge: '365d' }));
app.use('/fonts', express.static(path.join(ROOT, 'node_modules', '@fontsource', 'atkinson-hyperlegible', 'files'), { maxAge: '365d' }));

app.use((req, res, next) => {
  res.locals.unit = repo.displayUnit();
  // Capture now: inside a mounted router req.path becomes router-relative.
  const fullPath = req.path;
  res.locals.path = fullPath;
  res.locals.active = (prefix) => (prefix === '/' ? fullPath === '/' : fullPath.startsWith(prefix));
  res.locals.live = repo.inProgressWorkout();
  res.locals.flash = req.query.msg || '';
  res.locals.flashTone = req.query.tone === 'error' ? 'error' : 'ok';
  next();
});

app.use('/media', require('./routes/media')(repo));
app.use('/api', require('./routes/api')(repo));
app.use('/m', require('./routes/mobile')());
app.use('/', require('./routes/home')(repo));
app.use('/exercises', require('./routes/exercises')(repo));
app.use('/routines', require('./routes/routines')(repo));
app.use('/workouts', require('./routes/workouts')(repo));
app.use('/sports', require('./routes/sports')(repo));
app.use('/progress', require('./routes/progress')(repo));
app.use('/settings', require('./routes/settings')(repo));

app.use((req, res) => {
  res.status(404).render('error', { title: 'Not found', message: 'That page doesn’t exist.' });
});

app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api/')) return res.status(400).json({ error: err.message });
  res.status(400).render('error', { title: 'Something went wrong', message: err.message });
});

app.listen(PORT, HOST, () => {
  console.log(`Gym Log running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});

// The iPhone app needs https (Safari only allows offline web apps on secure origins).
// Listens when `node scripts/make-cert.js` has made certs/; the phone uses the LAN address.
const CERTS = path.join(ROOT, 'certs');
if (fs.existsSync(path.join(CERTS, 'server.crt'))) {
  const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 3443;
  const tls = { key: fs.readFileSync(path.join(CERTS, 'server.key')), cert: fs.readFileSync(path.join(CERTS, 'server.crt')) };
  require('node:https').createServer(tls, app).listen(HTTPS_PORT, HOST, () => {
    const lan = Object.values(require('node:os').networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal);
    const where = HOST === '0.0.0.0' && lan ? lan.address : HOST;
    console.log(`iPhone app: https://${where}:${HTTPS_PORT}/m${HOST === '0.0.0.0' ? '' : '  (start with HOST=0.0.0.0 to reach it from the phone)'}`);
  });
}

process.on('SIGINT', () => {
  repo.close();
  process.exit(0);
});
