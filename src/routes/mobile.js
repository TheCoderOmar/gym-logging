// The iPhone offline app (/m). The shell, scripts and service worker are static files in
// public/m/; this router adds the shared libs, the compressed media and the certificate.
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');

const ROOT = path.join(__dirname, '..', '..');
const LIB_DIR = path.join(ROOT, 'src', 'lib');
const MEDIA_DIR = path.join(ROOT, 'mobile-media'); // made by scripts/make-mobile-media.py (gitignored)

// Pure modules the phone runs exactly as the server does (no db, no node APIs).
const LIBS = ['units', 'format', 'muscles', 'heads', 'sports', 'bodymap', 'stats', 'icons'];

function wrapLib(name) {
  if (!LIBS.includes(name)) throw new Error(`Unknown lib: ${name}`);
  const src = fs.readFileSync(path.join(LIB_DIR, `${name}.js`), 'utf8');
  return `define(${JSON.stringify(name)}, function (module, exports, require) {\n${src}\n});\n`;
}

function mobileRouter() {
  const router = express.Router();

  router.get('/lib/:name.js', (req, res, next) => {
    if (!LIBS.includes(req.params.name)) return next();
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(wrapLib(req.params.name));
  });

  // The iPhone installs this once (Settings → Profile) to trust the PC's https certificate.
  router.get('/ca.crt', (req, res, next) => {
    const file = path.join(ROOT, 'certs', 'ca.crt');
    if (!fs.existsSync(file)) return next();
    res.type('application/x-x509-ca-cert').set('Content-Disposition', 'attachment; filename="gym-log-local.crt"').sendFile(file);
  });

  // Compressed animations: which exist (id → bytes), and the files themselves.
  router.get('/media-manifest', (req, res) => {
    const files = fs.existsSync(MEDIA_DIR) ? fs.readdirSync(MEDIA_DIR).filter((f) => f.endsWith('.webp')) : [];
    const manifest = {};
    for (const f of files) manifest[f.slice(0, -5)] = fs.statSync(path.join(MEDIA_DIR, f)).size;
    res.json(manifest);
  });
  router.get('/media/:id.webp', (req, res, next) => {
    const file = path.join(MEDIA_DIR, `${path.basename(req.params.id)}.webp`);
    if (!fs.existsSync(file)) return next();
    res.type('image/webp').set('Cache-Control', 'no-cache').sendFile(file);
  });

  return router;
}

module.exports = mobileRouter;
module.exports.LIBS = LIBS;
module.exports.wrapLib = wrapLib;
