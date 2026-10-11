# Sports days — design

Date: 2026-10-11 · Status: proposed in chat; Omar asked for the button ("the button is not there") → built as proposed.

## Goal

Log a sports session (football, padel for now) with a date and how long it lasted, see which muscles it works most, and have it count on the recovery map, muscle-head popups and training-log calendar like a workout.

## Decisions

- **Own table** `sport_sessions (id, sport, played_on, minutes, notes, created_at)`; sports and their muscles are defined in code (`src/lib/sports.js`). `played_on` is the day at local noon, like workouts.
- **Map weight:** every 30 minutes = 1 working set (rounded, minimum 1). Muscle points per "set" (0–3 scale):

| | Football ⚽ | Padel 🎾 |
|---|---|---|
| 3 | quads, hamstrings, calves | calves, quads, shoulders |
| 2 | glutes, adductors | glutes, forearms, obliques |
| 1 | abs, obliques, lower back | hamstrings, abs, triceps, chest |

- Sessions become `exerciseLog`-shaped rows (`sportRows`) and are concatenated wherever the map, head popups and training log read `exerciseLog`. Heads: sport names match no head rule, so every head of a worked region gets the region score.
- **Training log:** sport areas `football` ⚽ and `padel` 🎾 join the emoji key; a sport-only day links to that session.
- **UI:** "Log sport" button on Home next to Start/Back to workout → `/sports/new` form (sport cards, date, hours + minutes with 1 h / 1.5 h / 2 h / 3 h chips, notes, "Works most" list). Session page `/sports/:id` with a body figure shaded by points, edit (details form) and delete (confirm). History and Home's recent list mix sports with workouts by date (`listHistory`).
