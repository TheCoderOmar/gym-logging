// "All / Workouts / Sports" filter for History and Home's recent list.
const TYPES = [
  ['all', 'All'],
  ['workouts', 'Workouts'],
  ['sports', 'Sports'],
];

const EMPTY = {
  all: 'Nothing logged yet. Start a workout or log a sport from Home.',
  workouts: 'No workouts logged yet.',
  sports: 'No sports sessions logged yet.',
};

// Query value → filter type (unknown → 'all').
const historyType = (q) => (TYPES.some(([t]) => t === q) ? q : 'all');

// Filter type → listHistory kind.
const historyKind = (type) => (type === 'workouts' ? 'workout' : type === 'sports' ? 'sport' : 'all');

// Filter links; `link(type)` returns { href, fragment } for that filter.
function historyFilters(current, link) {
  return TYPES.map(([type, label]) => ({ type, label, current: type === current, ...link(type) }));
}

module.exports = { historyType, historyKind, historyFilters, EMPTY };
