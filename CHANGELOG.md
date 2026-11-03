# Changelog

All notable changes to Gym Log.

## [1.1.0] - 2026-11-03

The iPhone app joins the main app: one Gym Log for laptop and phone.

- Offline home-screen iPhone app at `/m`: log workouts and sports with no connection, recovery map, muscle heads, sets per muscle and history from a local snapshot
- Sync with the PC over home Wi-Fi (`/api/sync`), all-or-nothing and safe to repeat
- Edit finished workouts on the phone; history search
- Local https for the phone (`scripts/make-cert.js`)
- Forgiving exercise search on PC and phone; the Search key closes the keyboard
- Exercise picker list no longer collapses in iPhone Safari
- Sync errors come back as readable messages

## [1.0.0] - 2026-11-03

First release. Everything built so far, oldest first:

- Initial commit: exercise dataset, README and gitignore
- Add SQLite data layer, seed script and tests
- Add Express app shell, layout, styles and media routes
- Add exercise library with search, filters and custom exercises
- Add routines with a builder and starting workouts from them
- Add live workout logger with autosave, kg/lb, plate calculator and rest timer
- Add home page and workout history
- Add progress charts and personal records
- Add settings: display unit, bar weight, theme and DB backup
- Document pages, Node requirement and phone access in README
- Redesign home: muscle recovery heat map and training log calendar
- Training log: calendar year, Saturday-first weeks, fill panel width
- Training log: clickable legend filters and five years ahead
- Training log: switch years in place instead of reloading the page
- Routines: tidy card buttons, add delete with an in-app confirm popup
- Show flash messages as top-right toasts that close after 15 seconds
- Stack toasts across page loads, newest on top
- Exercise library: consistent filter controls and live search
- Per-exercise muscle scores, shown and editable on each exercise page
- Smarter default muscle scores: 2 for prime movers in compound lifts
- Exercise library: filter by clicking muscles on a body figure
- Add CLAUDE.md project guide and session log for the initial build
- Muscle heads close-up, date-only workouts, quicker freestyle logging
- Sports days, sets-per-muscle card, hover previews, logging defaults
- Liftmanual import: sharper media for 890 exercises, 1,674 new ones
