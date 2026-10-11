// Sports days (football, padel): which muscles each sport works, and how a session
// turns into rows the recovery map, head popups and training log already understand.

// Points per 30 minutes on the same 0–3 scale as exercise muscle scores.
// Muscle names are dataset names, so they map to heat-map regions (muscles.js).
const SPORTS = {
  football: {
    label: 'Football',
    emoji: '⚽',
    muscles: [
      { muscle: 'quads', points: 3 },
      { muscle: 'hamstrings', points: 3 },
      { muscle: 'calves', points: 3 },
      { muscle: 'glutes', points: 2 },
      { muscle: 'adductors', points: 2 },
      { muscle: 'abs', points: 1 },
      { muscle: 'obliques', points: 1 },
      { muscle: 'lower back', points: 1 },
    ],
  },
  padel: {
    label: 'Padel',
    emoji: '🎾',
    muscles: [
      { muscle: 'calves', points: 3 },
      { muscle: 'quads', points: 3 },
      { muscle: 'shoulders', points: 3 },
      { muscle: 'glutes', points: 2 },
      { muscle: 'forearms', points: 2 },
      { muscle: 'obliques', points: 2 },
      { muscle: 'hamstrings', points: 1 },
      { muscle: 'abs', points: 1 },
      { muscle: 'triceps', points: 1 },
      { muscle: 'chest', points: 1 },
    ],
  },
};

const MINUTES_PER_SET = 30;

const isSport = (key) => Object.prototype.hasOwnProperty.call(SPORTS, key);

// How many working sets a session counts as on the map: one per 30 minutes, at least one.
function sportSets(minutes) {
  return Math.max(1, Math.round(Number(minutes || 0) / MINUTES_PER_SET));
}

// Sessions ({ id, sport, played_on, minutes }) → rows shaped like repo.exerciseLog rows.
function sportRows(sessions) {
  return sessions
    .filter((s) => isSport(s.sport))
    .map((s) => ({
      workout_id: null,
      sport_id: s.id,
      started_at: s.played_on,
      exercise_id: `sport:${s.sport}`,
      name: SPORTS[s.sport].label,
      body_part: s.sport,
      target: '',
      secondary_muscles: [],
      muscles: SPORTS[s.sport].muscles,
      heads: [],
      sets: sportSets(s.minutes), // map weight only; shown to Omar as time played (activityText)
      minutes: s.minutes,
    }));
}

// "3 h", "1 h 30 min", "45 min"
function duration(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// What a muscle's last training day was, for tooltips and the head popup:
// "6 sets", "Football 3 h", "4 sets + Football 3 h". `st` has { sets, sports: [{ label, minutes }] }.
function activityText(st) {
  const parts = [];
  if (st.sets) parts.push(`${st.sets} ${st.sets === 1 ? 'set' : 'sets'}`);
  for (const sp of st.sports || []) parts.push(`${sp.label} ${duration(sp.minutes)}`);
  return parts.join(' + ');
}

module.exports = { SPORTS, MINUTES_PER_SET, isSport, sportSets, sportRows, duration, activityText };
