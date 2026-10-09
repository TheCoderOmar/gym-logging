// View helpers exposed to every EJS template as `fmt`.
const { round1, convert } = require('./units');

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Monday 00:00 local time of the week containing `d`.
function startOfWeek(d = new Date()) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function date(iso, opts = {}) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), ...opts });
}

function weekday(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long' });
}

// "Today", "Yesterday", "Tuesday" (this week), otherwise "12 Mar"
function relDay(iso) {
  if (!iso) return '';
  const days = Math.round((startOfDay(new Date()) - startOfDay(iso)) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days > 1 && days < 7) return weekday(iso);
  return date(iso);
}

function num(n) {
  return n == null ? '—' : Math.round(n).toLocaleString('en-GB');
}

// Weight from its stored unit into the display unit, e.g. "102.5"
function weight(w, from, to) {
  if (w == null) return '—';
  return String(round1(convert(w, from, to)));
}

// A set as logged: "100 kg × 5"
function set(s) {
  const w = s.weight == null ? 'BW' : `${round1(s.weight)} ${s.unit}`;
  return `${w} × ${s.reps ?? '—'}`;
}

// For <input type="date">: local "YYYY-MM-DD"
function dayInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Workouts are dated, not timed: a day is stored as local noon (safe from midnight DST jumps).
function dayIso(value = new Date()) {
  let d = value instanceof Date ? value : null;
  const m = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (!d || Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).toISOString();
}

function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

module.exports = { DAY, startOfDay, startOfWeek, date, weekday, relDay, num, weight, set, dayInput, dayIso, cap };
