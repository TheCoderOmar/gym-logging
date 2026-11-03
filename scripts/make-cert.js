// Local https for the iPhone app: makes certs/ca.crt (a private "Gym Log local" authority the
// iPhone trusts once) and certs/server.crt/.key for this PC's network addresses.
// Uses the openssl that ships with Git for Windows. Re-run when the PC's IP changes or after
// ~13 months (iOS rejects server certs valid longer than 398 days); the CA is kept, so the
// iPhone doesn't need to trust anything new.
//
//   node scripts/make-cert.js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DIR = path.join(__dirname, '..', 'certs');

function findOpenssl() {
  const candidates = [
    'openssl',
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\ucrt64\\bin\\openssl.exe',
  ];
  for (const c of candidates) {
    try {
      execFileSync(c, ['version'], { stdio: 'ignore' });
      return c;
    } catch (e) { /* try the next one */ }
  }
  throw new Error('openssl not found — install Git for Windows or put openssl on PATH');
}

function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
}

function main() {
  const openssl = findOpenssl();
  fs.mkdirSync(DIR, { recursive: true });
  const f = (name) => path.join(DIR, name);
  const ssl = (...args) => execFileSync(openssl, args, { stdio: ['ignore', 'ignore', 'inherit'] });

  if (!fs.existsSync(f('ca.crt'))) {
    ssl('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '3650',
      '-keyout', f('ca.key'), '-out', f('ca.crt'), '-subj', '/CN=Gym Log local',
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
    console.log('Created the local authority (certs/ca.crt).');
  }

  const host = os.hostname();
  const ips = lanAddresses();
  const san = ['DNS:localhost', `DNS:${host}`, `DNS:${host}.local`, 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',');
  fs.writeFileSync(f('server.ext'), [
    'basicConstraints=CA:FALSE',
    'keyUsage=critical,digitalSignature,keyEncipherment',
    'extendedKeyUsage=serverAuth',
    `subjectAltName=${san}`,
  ].join('\n'));
  ssl('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', f('server.key'), '-out', f('server.csr'), '-subj', `/CN=${host}`);
  ssl('x509', '-req', '-in', f('server.csr'), '-CA', f('ca.crt'), '-CAkey', f('ca.key'), '-CAcreateserial',
    '-days', '397', '-sha256', '-extfile', f('server.ext'), '-out', f('server.crt'));
  fs.rmSync(f('server.csr'));
  fs.rmSync(f('server.ext'));
  console.log(`Server certificate for ${host} and ${ips.join(', ') || 'no network address'} (valid 397 days).`);
}

main();
