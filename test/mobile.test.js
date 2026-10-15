const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { LIBS, wrapLib } = require('../src/routes/mobile');

test('every shared lib runs in the browser loader, and the map draws the same as on the PC', () => {
  const sandbox = { console };
  sandbox.window = sandbox; // in a browser, window is the global object
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'public', 'm', 'require.js'), 'utf8'), sandbox);
  for (const name of LIBS) vm.runInContext(wrapLib(name), sandbox);
  const lib = (n) => vm.runInContext(`window.requireLib(${JSON.stringify(n)})`, sandbox);
  const { muscleStatus } = lib('muscles');
  const { bodyMap } = lib('bodymap');
  const browserSvg = bodyMap(muscleStatus([])).front;
  const pc = require('../src/lib/bodymap').bodyMap(require('../src/lib/muscles').muscleStatus([])).front;
  assert.equal(browserSvg, pc);
  assert.equal(typeof lib('heads').headStatus, 'function');
  assert.equal(lib('sports').duration(90), '1 h 30 min');
});

test('only the shared libs are served', () => {
  assert.ok(LIBS.includes('muscles'));
  assert.throws(() => wrapLib('../db'), /Unknown lib/);
});
