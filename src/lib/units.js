const KG_PER_LB = 0.45359237;
const UNITS = ['kg', 'lb'];

function isUnit(u) {
  return UNITS.includes(u);
}

function convert(weight, from, to) {
  if (weight == null) return null;
  if (from === to) return weight;
  return from === 'lb' ? weight * KG_PER_LB : weight / KG_PER_LB;
}

function toKg(weight, unit) {
  return convert(weight, unit, 'kg');
}

// Round to 1 decimal and drop a trailing ".0" — 102.5, 100, 72.6
function round1(n) {
  return Math.round(n * 10) / 10;
}

function format(weight, unit) {
  if (weight == null) return '—';
  return `${round1(weight)} ${unit}`;
}

module.exports = { KG_PER_LB, UNITS, isUnit, convert, toKg, round1, format };
