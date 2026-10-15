// Gym Log on iPhone: works offline from a snapshot of the PC's data, logs workouts and sports
// on the phone, and sends them to the PC on "Sync" (home Wi-Fi, PC app running).
// All numbers come from the same code as the PC (src/lib via /m/lib).
(function () {
  var L = function (n) { return window.requireLib(n); };
  var M = L('muscles'), H = L('heads'), B = L('bodymap'), SP = L('sports'), F = L('format'), U = L('units'), I = L('icons');
  var icon = I.icon;
  var DEFAULT_REPS = 12; // same as src/db.js
  var DAY = 24 * 60 * 60 * 1000;

  var S = { snap: null, pending: { workouts: [], sports: [] }, live: null, lastSync: null };
  var exById = new Map();
  var view = document.getElementById('view');

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Same forgiving search as the PC (src/db.js searchStems): case, punctuation and a plural "s"
  // don't matter, so "Pull ups" finds "pull-up".
  function squeeze(name) { return String(name).toLowerCase().replace(/[\s\-'()]/g, ''); }
  function stems(q) {
    return String(q || '').toLowerCase().split(/\s+/).map(function (w) {
      return w.replace(/[^a-z0-9.]/g, '').replace(/([a-z]{2})s$/, '$1');
    }).filter(Boolean);
  }
  function matches(e, words) { var n = squeeze(e.name); return words.every(function (w) { return n.indexOf(w) >= 0; }); }
  function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function uuid() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }
  function today() { return F.dayInput(new Date()); }
  function unit() { return (S.snap && S.snap.settings.display_unit) || 'kg'; }
  function toast(msg, tone) {
    document.querySelectorAll('.m-toast').forEach(function (old) { old.remove(); }); // newest replaces the last
    var t = document.createElement('div');
    t.className = 'm-toast' + (tone === 'error' ? ' is-error' : '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }
  function save(key) { return window.Store.set(key, S[key]); }
  function thumb(id, cls) {
    var ex = exById.get(id);
    var letter = esc(cap(ex ? ex.name : '?').charAt(0));
    return '<img class="' + (cls || '') + '" src="/m/media/' + encodeURIComponent(id) + '.webp" alt="" loading="lazy" onerror="this.outerHTML=\'<span class=&quot;ph ' + (cls || '') + '&quot;>' + letter + '</span>\'">';
  }

  /* ---------- data: workouts + sports as the PC's exerciseLog rows ---------- */

  function workouts() {
    var pc = (S.snap ? S.snap.workouts : []).map(function (w) { return Object.assign({ pending: false }, w); });
    var mine = S.pending.workouts.map(function (w) { return Object.assign({ pending: true, started_at: F.dayIso(w.date) }, w); });
    return pc.concat(mine).sort(function (a, b) { return a.started_at < b.started_at ? 1 : -1; });
  }
  function sports() {
    var pc = (S.snap ? S.snap.sports : []).map(function (s) { return Object.assign({ pending: false }, s); });
    var mine = S.pending.sports.map(function (s) { return Object.assign({ pending: true, played_on: F.dayIso(s.date) }, s); });
    return pc.concat(mine).sort(function (a, b) { return a.played_on < b.played_on ? 1 : -1; });
  }
  var working = function (s) { return s.done && !s.is_warmup && s.reps > 0; };

  // Same shape as repo.exerciseLog rows + sportRows, so the shared map/heads/sets code works.
  function activityRows(sinceIso) {
    var rows = [];
    workouts().forEach(function (w, wi) {
      if (sinceIso && w.started_at < sinceIso) return;
      w.exercises.forEach(function (we) {
        var ex = exById.get(we.exercise_id);
        var n = we.sets.filter(working).length;
        if (!ex || !n) return;
        rows.push({ workout_id: w.id || 'p' + wi, started_at: w.started_at, exercise_id: ex.id, name: ex.name, body_part: ex.body_part,
          target: ex.target, secondary_muscles: ex.secondary_muscles, muscles: ex.muscles, heads: ex.heads, sets: n });
      });
    });
    var sp = sports().filter(function (s) { return !sinceIso || s.played_on >= sinceIso; })
      .map(function (s, i) { return { id: s.id || 'ps' + i, sport: s.sport, played_on: s.played_on, minutes: s.minutes }; });
    return rows.concat(SP.sportRows(sp));
  }
  function volumeOf(w) {
    var u = unit();
    return w.exercises.reduce(function (sum, we) {
      return sum + we.sets.filter(working).reduce(function (s, x) { return s + (x.weight ? U.convert(x.weight, x.unit, u) * x.reps : 0); }, 0);
    }, 0);
  }
  function setCount(w) { return w.exercises.reduce(function (n, we) { return n + we.sets.filter(working).length; }, 0); }

  // Last time's sets for an exercise (another workout, newest first) — hints in the logger.
  function previousSets(exId, exceptClientId) {
    var list = workouts();
    for (var i = 0; i < list.length; i++) {
      if (list[i].client_id === exceptClientId) continue;
      var we = list[i].exercises.find(function (e) { return e.exercise_id === exId && e.sets.some(function (s) { return s.done; }); });
      if (we) return { date: list[i].started_at, sets: we.sets.filter(function (s) { return s.done; }) };
    }
    return null;
  }

  /* ---------- views ---------- */

  function setNav(name) {
    document.querySelectorAll('.tabbar a').forEach(function (a) {
      a.setAttribute('aria-current', a.dataset.nav === name ? 'page' : 'false');
    });
  }

  function needsSync() {
    return '<div class="empty"><h3>Sync once at home first</h3><p>Open this app on your home Wi-Fi with Gym Log running on your PC, then tap Sync. After that it works anywhere.</p>' +
      '<div class="btn-row"><a class="btn btn-go" href="#/sync">Go to Sync</a></div></div>';
  }

  function renderHome() {
    setNav('home');
    if (!S.snap) { view.innerHTML = needsSync(); return; }
    var now = new Date();
    var rows = activityRows(new Date(now.getTime() - 365 * DAY).toISOString());
    var status = M.muscleStatus(rows, now);
    var figs = B.bodyMap(status);
    var weekStart = M.startOfTrainingWeek(now).toISOString();
    var weekW = workouts().filter(function (w) { return w.started_at >= weekStart; });
    var weekSets = M.weeklySets(activityRows(M.startOfLastDays(7, now).toISOString()));
    var LOW = 10, HIGH = 20, SCALE = Math.max.apply(null, [25].concat(weekSets.map(function (w) { return w.total; })));
    var pct = function (n) { return Math.min(100, (n / SCALE) * 100).toFixed(1); };
    var count = function (n) { return n > 0 && n < 1 ? '<1' : String(Math.round(n)); };
    var bars = weekSets.map(function (w) {
      var shown = Math.round(w.total);
      var tone = w.total === 0 ? 'none' : shown < LOW ? 'low' : shown > HIGH ? 'high' : 'ok';
      return '<li class="ws-' + tone + '"><span class="ws-name">' + esc(w.label) + '</span>' +
        '<span class="ws-track" aria-hidden="true" style="--fill:' + pct(w.total) + '%"><span class="ws-fill" style="width:' + pct(w.sets) + '%"></span>' +
        '<span class="ws-fill ws-sport" style="left:' + pct(w.sets) + '%;width:' + pct(w.sport) + '%"></span></span>' +
        '<span class="ws-num">' + (tone === 'ok' ? I.flame : '') + count(w.total) + '</span></li>';
    }).join('');
    var live = S.live;
    var greet = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
    view.innerHTML =
      '<section class="home-top"><div><h1>' + (live ? 'You’re mid-workout' : greet) + '</h1>' + syncLine() + '</div>' +
      '<div class="btn-row home-actions"><a class="btn btn-lg" href="#/sport">Log sport</a>' +
      '<a class="btn btn-go btn-lg" href="#/log">' + icon(live ? 'play' : 'plus') + (live ? ' Back to workout' : ' Start workout') + '</a></div></section>' +
      '<div class="home-grid"><section class="panel body-panel"><div class="panel-head"><h2>Muscle recovery</h2>' +
      '<p class="muted small">Tap a muscle to see its heads.</p></div>' +
      '<div class="figures"><figure>' + figs.front + '<figcaption>Front</figcaption></figure><figure>' + figs.back + '<figcaption>Back</figcaption></figure></div>' +
      '<ul class="recency-key">' + M.BUCKETS.map(function (b) { return '<li><span class="swatch b-' + b.id + '"></span>' + b.label + '</li>'; }).join('') + '</ul></section>' +
      '<aside class="side-col"><section class="week"><h2>This week</h2><div class="week-stats">' +
      '<div><b class="num">' + weekW.length + '</b><span>' + (weekW.length === 1 ? 'workout' : 'workouts') + '</span></div>' +
      '<div><b class="num">' + weekW.reduce(function (n, w) { return n + setCount(w); }, 0) + '</b><span>working sets</span></div>' +
      '<div><b class="num">' + F.num(weekW.reduce(function (n, w) { return n + volumeOf(w); }, 0)) + '</b><span>' + unit() + ' lifted</span></div></div></section>' +
      '<section class="panel week-sets"><h2>Sets per muscle</h2><p class="muted small">Working sets in the last 7 days. Sports add a bonus: every 30 minutes counts like a set.</p>' +
      '<ul class="ws-list" style="--lo:' + pct(LOW) + '%;--hi:' + pct(HIGH) + '%">' + bars + '</ul>' +
      '<ul class="ws-key"><li><span class="k k-gym"></span>Gym</li><li><span class="k k-sport"></span>Sports</li><li><span class="k k-band"></span>10–20 sets: a good target for 7 days</li></ul></section></aside></div>';
  }

  function syncLine() {
    var n = S.pending.workouts.length + S.pending.sports.length;
    var when = S.lastSync ? 'Synced ' + F.relDay(S.lastSync).toLowerCase() : 'Not synced yet';
    return '<p class="muted"><a href="#/sync" class="m-sync-link">' + esc(when) + (n ? ' · ' + n + ' to send' : '') + '</a></p>';
  }

  // Muscle heads popup (same drawing and wording as the PC).
  function openHeads(region) {
    var now = new Date();
    var heads = H.headStatus(activityRows(new Date(now.getTime() - 365 * DAY).toISOString()), region, now);
    var dlg = document.getElementById('dlg');
    dlg.innerHTML = '<div class="heads-card"><div class="heads-top"><h2>' + esc(H.regionLabel(region)) + '</h2>' +
      '<button type="button" class="btn btn-sm btn-quiet" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="heads-fig">' + B.headFigure(region, heads) + '</div><ul class="heads-list">' +
      heads.map(function (h) {
        var when = h.days == null ? 'Not trained yet' : h.days === 0 ? 'Today' : h.days === 1 ? 'Yesterday' : h.days + ' days ago';
        return '<li><span class="swatch b-' + h.bucket + '"></span><strong>' + esc(h.label) + '</strong><span class="muted">' + when + (h.days == null ? '' : ' · ' + esc(SP.activityText(h))) + '</span></li>';
      }).join('') + '</ul></div>';
    dlg.className = 'heads-dialog';
    dlg.showModal();
  }

  /* ----- logger ----- */

  function newWorkout() {
    S.live = { client_id: uuid(), name: 'Workout', date: today(), notes: '', exercises: [] };
    save('live');
  }

  function renderLog() {
    setNav('log');
    if (!S.snap) { view.innerHTML = needsSync(); return; }
    var fresh = !S.live;
    if (fresh) newWorkout();
    var w = S.live;
    view.innerHTML =
      '<div class="log-head"><input class="log-title" id="w-name" value="' + esc(w.name) + '" maxlength="80" aria-label="Workout name">' +
      '<div class="log-meta"><input type="date" id="w-date" value="' + esc(w.date) + '" max="' + today() + '" aria-label="Workout date"></div></div>' +
      '<div class="log-list" id="lifts">' + (w.exercises.length ? w.exercises.map(liftCard).join('') : '<div class="empty"><h3>No exercises yet</h3><p>Add your first exercise to start logging sets.</p></div>') + '</div>' +
      '<button type="button" class="btn add-lift" data-act="add-ex" style="margin-top:18px">' + icon('plus') + ' Add exercise</button>' +
      '<div class="field" style="margin-top:24px"><label for="w-notes">Notes</label><textarea id="w-notes" placeholder="How did it feel?">' + esc(w.notes) + '</textarea></div>' +
      '<div class="log-actions"><button type="button" class="btn btn-go btn-lg" data-act="finish">' + icon('check') + ' Finish workout</button>' +
      '<button type="button" class="btn btn-danger btn-lg" data-act="discard">' + icon('trash') + ' Discard</button></div>';
    if (fresh) openPicker();
  }

  function liftCard(we, i) {
    var ex = exById.get(we.exercise_id) || { name: we.exercise_id };
    var prev = previousSets(we.exercise_id, S.live.client_id);
    var u = (we.sets[0] && we.sets[0].unit) || unit();
    var n = 0;
    var rows = we.sets.map(function (s, si) {
      var p = prev && prev.sets[si];
      var hintW = p && p.weight != null ? Math.round(U.convert(p.weight, p.unit, u) * 4) / 4 : '';
      var hintR = p && p.reps > 0 ? p.reps : DEFAULT_REPS;
      var label = s.is_warmup ? 'W' : ++n;
      return '<tr data-set="' + si + '" class="' + (s.done ? 'is-done' : '') + '">' +
        '<td><button type="button" class="set-no' + (s.is_warmup ? ' warm' : '') + '" data-act="warm">' + label + '</button></td>' +
        '<td class="prev-cell">' + (p ? esc((p.weight == null ? 'BW' : U.round1(U.convert(p.weight, p.unit, u))) + ' × ' + (p.reps || '—')) : '—') + '</td>' +
        '<td><input type="number" inputmode="decimal" step="any" min="0" data-field="weight" value="' + (s.weight == null ? '' : s.weight) + '" placeholder="' + hintW + '" aria-label="Weight in ' + u + '"></td>' +
        '<td><input type="number" inputmode="numeric" step="1" min="0" data-field="reps" value="' + (s.reps == null ? '' : s.reps) + '" placeholder="' + hintR + '" aria-label="Reps"></td>' +
        '<td><button type="button" class="check" data-act="done" aria-pressed="' + !!s.done + '" aria-label="Mark set done">' + icon('check') + '</button></td>' +
        '<td><button type="button" class="del-set" data-act="del-set" aria-label="Delete set">' + icon('x') + '</button></td></tr>';
    }).join('');
    return '<article class="lift" data-we="' + i + '"><header class="lift-head">' + thumb(we.exercise_id) +
      '<div><h2><a href="#/ex/' + encodeURIComponent(we.exercise_id) + '">' + esc(ex.name) + '</a></h2><p class="prev">' +
      (prev ? 'Last time (' + F.date(prev.date) + '): ' + esc(prev.sets.filter(function (s) { return !s.is_warmup; }).map(function (s) { return (s.weight == null ? 'BW' : U.round1(s.weight)) + '×' + s.reps; }).join(', ')) : 'First time logging this') + '</p></div>' +
      '<div class="lift-tools"><span class="unit-toggle" role="group" aria-label="Weight unit"><button type="button" data-act="unit" data-unit="kg" aria-pressed="' + (u === 'kg') + '">kg</button><button type="button" data-act="unit" data-unit="lb" aria-pressed="' + (u === 'lb') + '">lb</button></span></div></header>' +
      '<table class="set-table"><colgroup><col class="c-no"><col class="c-prev"><col><col><col class="c-done"><col class="c-del"></colgroup>' +
      '<thead><tr><th>Set</th><th class="prev-head">Previous</th><th>' + u + '</th><th>Reps</th><th><span class="sr-only">Done</span></th><th><span class="sr-only">Delete</span></th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<footer class="lift-foot"><button type="button" class="btn btn-sm" data-act="add-set">' + icon('plus') + ' Add set</button>' +
      '<span class="btn-row" style="gap:4px"><button type="button" class="btn btn-sm btn-quiet btn-danger" data-act="remove" aria-label="Remove exercise">' + icon('trash') + '</button></span></footer></article>';
  }

  var liveSaveTimer = null;
  function saveLiveSoon() { clearTimeout(liveSaveTimer); liveSaveTimer = setTimeout(function () { save('live'); }, 300); }

  function rerenderLifts() {
    var box = document.getElementById('lifts');
    if (box) box.innerHTML = S.live.exercises.length ? S.live.exercises.map(liftCard).join('') : '';
    save('live');
  }

  // Same rules as finishing on the PC: weight-only sets take the reps hint, sets with reps count
  // as done, empty sets and exercises are dropped.
  function finishLive() {
    var w = S.live;
    w.exercises.forEach(function (we) {
      var prev = previousSets(we.exercise_id, w.client_id);
      we.sets.forEach(function (s, i) {
        if (s.weight != null && s.reps == null) {
          var p = prev && prev.sets[i];
          s.reps = p && p.reps > 0 ? p.reps : DEFAULT_REPS;
        }
        if (s.reps > 0) s.done = 1;
      });
      we.sets = we.sets.filter(function (s) { return s.done || s.weight != null || s.reps != null; });
    });
    w.exercises = w.exercises.filter(function (we) { return we.sets.length; });
    S.pending.workouts.push(w);
    S.live = null;
    return Promise.all([save('pending'), window.Store.del('live')]).then(function () {
      toast('Workout saved on the phone. Sync at home to send it to your PC.');
      location.hash = '#/';
    });
  }

  /* ----- exercise picker ----- */

  function openPicker() {
    var dlg = document.getElementById('dlg');
    var parts = Array.from(new Set(S.snap.exercises.map(function (e) { return e.body_part; }))).sort();
    dlg.className = 'picker';
    dlg.innerHTML = '<div class="picker-head"><div class="top"><h2>Add exercise</h2><button type="button" class="btn btn-sm btn-quiet" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<input id="pk-q" type="search" enterkeyhint="search" placeholder="Search ' + S.snap.exercises.length.toLocaleString() + ' exercises" autocomplete="off">' +
      '<select id="pk-part" aria-label="Body part"><option value="">Any body part</option>' + parts.map(function (p) { return '<option>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
      '<ul class="picker-results" id="pk-list"></ul>';
    var done = new Map();
    workouts().forEach(function (w) { w.exercises.forEach(function (we) { done.set(we.exercise_id, (done.get(we.exercise_id) || 0) + 1); }); });
    function search() {
      var words = stems(document.getElementById('pk-q').value);
      var part = document.getElementById('pk-part').value;
      var hits = S.snap.exercises.filter(function (e) {
        return (!part || e.body_part === part) && matches(e, words);
      }).sort(function (a, b) { return (done.get(b.id) || 0) - (done.get(a.id) || 0) || (a.name < b.name ? -1 : 1); }).slice(0, 60);
      document.getElementById('pk-list').innerHTML = hits.map(function (e) {
        return '<li><button type="button" data-pick="' + esc(e.id) + '">' + thumb(e.id) + '<span><strong>' + esc(e.name) + '</strong><span>' + esc(e.target) + ' · ' + esc(e.equipment) + (done.get(e.id) ? ' · done ' + done.get(e.id) + '×' : '') + '</span></span></button></li>';
      }).join('') || '<li class="muted" style="padding:12px">Nothing matches.</li>';
    }
    dlg.querySelector('#pk-q').addEventListener('input', search);
    dlg.querySelector('#pk-part').addEventListener('change', search);
    search();
    dlg.showModal();
  }

  function addExercise(id) {
    var prev = previousSets(id, S.live.client_id);
    var u = prev && prev.sets[0] ? prev.sets[0].unit : unit();
    S.live.exercises.push({ exercise_id: id, rest_seconds: 0, sets: [{ weight: null, unit: u, reps: null, is_warmup: 0, done: 0 }] });
    document.getElementById('dlg').close();
    renderLog();
    var cards = document.querySelectorAll('.lift');
    if (cards.length) cards[cards.length - 1].scrollIntoView({ block: 'center' });
  }

  /* ----- sports ----- */

  function renderSport() {
    setNav('home');
    var works = function (key) {
      return SP.SPORTS[key].muscles.slice().sort(function (a, b) { return b.points - a.points; }).map(function (m) {
        return '<li><span class="dots">' + [1, 2, 3].map(function (i) { return '<i class="' + (i <= m.points ? 'on' : '') + '"></i>'; }).join('') + '</span>' + esc(M.regionLabelOf(m.muscle)) + '</li>';
      }).join('');
    };
    view.innerHTML = '<div class="page-head"><div><h1>Log sport</h1><p class="muted">How long you played; it counts on your recovery map.</p></div></div>' +
      '<form class="form-grid sport-form" id="sport-form"><fieldset class="sport-pick"><legend>Sport</legend>' +
      Object.keys(SP.SPORTS).map(function (k, i) { return '<label class="sport-card"><input type="radio" name="sport" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><span>' + SP.SPORTS[k].label + '</span></label>'; }).join('') + '</fieldset>' +
      '<div class="field"><label for="sp-date">Date</label><input id="sp-date" type="date" name="date" value="' + today() + '" max="' + today() + '"></div>' +
      '<div class="field"><span class="label">How long</span><div class="dur"><label><input type="number" name="hours" min="0" max="24" value="1" inputmode="numeric"> h</label><label><input type="number" name="minutes" min="0" max="59" step="5" value="30" inputmode="numeric"> min</label></div>' +
      '<div class="dur-chips">' + [60, 90, 120, 180].map(function (m) { return '<button type="button" class="chip-btn" data-minutes="' + m + '">' + SP.duration(m) + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><label for="sp-notes">Notes <small>(optional)</small></label><textarea id="sp-notes" name="notes"></textarea></div>' +
      '<div class="works-most">' + Object.keys(SP.SPORTS).map(function (k, i) { return '<div data-works="' + k + '"' + (i ? ' hidden' : '') + '><h3>Works most</h3><ul>' + works(k) + '</ul></div>'; }).join('') + '</div>' +
      '<div class="btn-row"><button class="btn btn-go btn-lg">' + icon('check') + ' Save session</button><a class="btn btn-quiet" href="#/">Cancel</a></div></form>';
  }

  /* ----- history ----- */

  var histFilter = 'all';
  function renderHistory() {
    setNav('history');
    if (!S.snap) { view.innerHTML = needsSync(); return; }
    var items = [];
    if (histFilter !== 'sports') workouts().forEach(function (w) { items.push({ kind: 'w', day: w.started_at, w: w }); });
    if (histFilter !== 'workouts') sports().forEach(function (s) { items.push({ kind: 's', day: s.played_on, s: s }); });
    items.sort(function (a, b) { return a.day < b.day ? 1 : -1; });
    var tabs = [['all', 'All'], ['workouts', 'Workouts'], ['sports', 'Sports']].map(function (t) {
      return '<a href="#/history" data-filter="' + t[0] + '" aria-current="' + (histFilter === t[0]) + '">' + t[1] + '</a>';
    }).join('');
    view.innerHTML = '<div class="page-head"><div><h1>History</h1><p class="muted">Last year from your PC, plus what you logged on the phone.</p></div></div>' +
      '<div class="history-list"><nav class="chart-tabs history-filter">' + tabs + '</nav><ul class="rows">' + items.map(function (it) {
        var d = it.day;
        var when = '<span class="when">' + F.relDay(d) + '<small>' + (F.relDay(d) === F.date(d) ? F.weekday(d).slice(0, 3) : F.date(d)) + '</small></span>';
        var badge = (it.w || it.s).pending ? ' <span class="chip">Not synced</span>' : '';
        if (it.kind === 's') {
          return '<li><a class="row-link history-row" href="#/s/' + encodeURIComponent(it.s.client_id) + '">' + when +
            '<span class="what"><strong>' + esc(SP.SPORTS[it.s.sport].label) + badge + '</strong><p>' + esc(it.s.notes || 'Sports session') + '</p></span>' +
            '<span class="row-figures"><span class="num">' + SP.duration(it.s.minutes) + '</span>played</span></a></li>';
        }
        var names = it.w.exercises.map(function (we) { return (exById.get(we.exercise_id) || {}).name; }).filter(Boolean).join(' · ');
        var sets = setCount(it.w);
        return '<li><a class="row-link history-row" href="#/w/' + encodeURIComponent(it.w.client_id) + '">' + when +
          '<span class="what"><strong>' + esc(it.w.name) + badge + '</strong><p>' + esc(names || 'No exercises') + '</p></span>' +
          '<span class="row-figures"><span class="num">' + F.num(volumeOf(it.w)) + ' ' + unit() + '</span>' + sets + (sets === 1 ? ' set' : ' sets') + '</span></a></li>';
      }).join('') + '</ul>' + (items.length ? '' : '<div class="empty"><p>Nothing logged yet.</p></div>') + '</div>';
  }

  function renderWorkout(cid) {
    setNav('history');
    var w = workouts().find(function (x) { return x.client_id === cid; });
    if (!w) { location.hash = '#/history'; return; }
    view.innerHTML = '<a class="back-btn" href="#/history">' + icon('left') + ' History</a>' +
      '<div class="page-head"><div><h1>' + esc(w.name) + '</h1><p class="muted">' + F.weekday(w.started_at) + ' ' + F.date(w.started_at, { year: 'numeric' }) + (w.pending ? ' · not synced yet' : '') + '</p></div></div>' +
      '<div class="detail-figures"><div><b class="num">' + w.exercises.length + '</b><span>exercises</span></div><div><b class="num">' + setCount(w) + '</b><span>working sets</span></div><div><b class="num">' + F.num(volumeOf(w)) + ' ' + unit() + '</b><span>volume</span></div></div>' +
      (w.notes ? '<p class="notes" style="margin-bottom:24px">' + esc(w.notes) + '</p>' : '') +
      '<div class="detail-lifts">' + w.exercises.map(function (we) {
        var ex = exById.get(we.exercise_id) || { name: we.exercise_id };
        var n = 0;
        return '<section class="detail-lift"><h3><a class="detail-lift-name" href="#/ex/' + encodeURIComponent(we.exercise_id) + '">' + thumb(we.exercise_id, 'detail-lift-gif') + '<span>' + esc(ex.name) + '</span></a></h3>' +
          '<table><thead><tr><th>Set</th><th>Weight</th><th>Reps</th></tr></thead><tbody>' + we.sets.map(function (s) {
            return '<tr class="' + (s.is_warmup ? 'warm' : '') + '"><td class="num">' + (s.is_warmup ? 'W' : ++n) + '</td><td class="num">' + (s.weight == null ? 'Bodyweight' : U.round1(s.weight) + ' ' + s.unit) + '</td><td class="num">' + (s.reps == null ? '—' : s.reps) + '</td></tr>';
          }).join('') + '</tbody></table></section>';
      }).join('') + '</div>' +
      (w.pending ? '<div class="log-actions"><button type="button" class="btn btn-danger" data-act="del-pending" data-kind="workouts" data-cid="' + esc(cid) + '">' + icon('trash') + ' Delete workout</button></div>' : '');
  }

  function renderSportSession(cid) {
    setNav('history');
    var s = sports().find(function (x) { return x.client_id === cid; });
    if (!s) { location.hash = '#/history'; return; }
    var figs = B.workMap(M.regionPoints(SP.SPORTS[s.sport].muscles), Object.fromEntries(M.REGIONS.map(function (r) { return [r.id, r.label]; })));
    view.innerHTML = '<a class="back-btn" href="#/history">' + icon('left') + ' History</a>' +
      '<div class="page-head"><div><h1>' + esc(SP.SPORTS[s.sport].label) + '</h1><p class="muted">' + F.weekday(s.played_on) + ' ' + F.date(s.played_on, { year: 'numeric' }) + ' · ' + SP.duration(s.minutes) + (s.pending ? ' · not synced yet' : '') + '</p></div></div>' +
      (s.notes ? '<p class="notes">' + esc(s.notes) + '</p>' : '') +
      '<section class="panel sport-body"><h2>Muscles it works</h2><div class="figures"><figure>' + figs.front + '<figcaption>Front</figcaption></figure><figure>' + figs.back + '<figcaption>Back</figcaption></figure></div></section>' +
      (s.pending ? '<div class="log-actions"><button type="button" class="btn btn-danger" data-act="del-pending" data-kind="sports" data-cid="' + esc(cid) + '">' + icon('trash') + ' Delete session</button></div>' : '');
  }

  /* ----- exercises ----- */

  function renderExercise(id) {
    var ex = exById.get(id);
    if (!ex) { history.back(); return; }
    view.innerHTML = '<a class="back-btn" href="javascript:history.back()">' + icon('left') + ' Back</a>' +
      '<div class="m-ex">' + thumb(id, 'm-ex-anim') + '<div><h1>' + esc(cap(ex.name)) + '</h1><dl class="m-facts">' +
      '<dt>Target</dt><dd>' + esc(cap(ex.target)) + '</dd><dt>Equipment</dt><dd>' + esc(cap(ex.equipment)) + '</dd>' +
      (ex.secondary_muscles.length ? '<dt>Also works</dt><dd>' + esc(cap(ex.secondary_muscles.join(', '))) + '</dd>' : '') + '</dl></div></div>' +
      (ex.steps.length ? '<section class="section"><h2 style="margin-bottom:12px">How to do it</h2><ol class="steps">' + ex.steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></section>' : '');
  }

  function renderExercises() {
    setNav('exercises');
    if (!S.snap) { view.innerHTML = needsSync(); return; }
    view.innerHTML = '<div class="page-head"><div><h1>Exercises</h1></div></div><input id="ex-q" type="search" enterkeyhint="search" placeholder="Search ' + S.snap.exercises.length.toLocaleString() + ' exercises" autocomplete="off"><ul class="picker-results m-ex-list" id="ex-list"></ul>';
    function search() {
      var hits = S.snap.exercises.filter(function (e) { return matches(e, stems(document.getElementById('ex-q').value)); }).slice(0, 80);
      document.getElementById('ex-list').innerHTML = hits.map(function (e) {
        return '<li><a class="m-ex-row" href="#/ex/' + encodeURIComponent(e.id) + '">' + thumb(e.id) + '<span><strong>' + esc(e.name) + '</strong><span>' + esc(e.target) + ' · ' + esc(e.equipment) + '</span></span></a></li>';
      }).join('');
    }
    document.getElementById('ex-q').addEventListener('input', search);
    search();
  }

  /* ----- sync ----- */

  var mediaState = { running: false, done: 0, total: 0 };
  function renderSync() {
    setNav('sync');
    var n = S.pending.workouts.length + S.pending.sports.length;
    view.innerHTML = '<div class="page-head"><div><h1>Sync</h1><p class="muted">On your home Wi-Fi, with Gym Log running on your PC.</p></div></div>' +
      '<section class="panel m-sync"><p><strong>' + (S.lastSync ? 'Last synced ' + F.relDay(S.lastSync).toLowerCase() + ', ' + new Date(S.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Not synced yet') + '</strong></p>' +
      '<p class="muted">' + (n ? n + ' to send: ' + S.pending.workouts.length + ' workout(s), ' + S.pending.sports.length + ' sports session(s).' : 'Nothing waiting to be sent.') + '</p>' +
      '<button type="button" class="btn btn-go btn-lg" data-act="sync">' + icon('download') + ' Sync now</button></section>' +
      '<section class="panel m-sync"><h2>Exercise animations</h2><p class="muted" id="media-status">' + mediaText() + '</p>' +
      '<div class="m-progress"><span id="media-bar" style="width:' + (mediaState.total ? (mediaState.done / mediaState.total) * 100 : 0) + '%"></span></div></section>';
  }
  function mediaText() {
    if (mediaState.running) return 'Downloading ' + mediaState.done + ' of ' + mediaState.total + '… keep the app open.';
    if (mediaState.total && mediaState.done >= mediaState.total) return 'All ' + mediaState.total + ' animations are saved on this phone.';
    return 'They download after a sync, while the app is open (about 100 MB).';
  }

  function sync() {
    var btn = document.querySelector('[data-act="sync"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
    var sent = { workouts: S.pending.workouts.slice(), sports: S.pending.sports.slice() };
    return fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sent) })
      .then(function (res) { return res.json().then(function (body) { if (!res.ok) throw new Error(body.error || 'Sync failed'); return body; }); })
      .then(function (body) {
        // Only clear what was sent (anything logged meanwhile stays pending).
        S.pending.workouts = S.pending.workouts.filter(function (w) { return sent.workouts.indexOf(w) < 0; });
        S.pending.sports = S.pending.sports.filter(function (s) { return sent.sports.indexOf(s) < 0; });
        S.snap = body.snapshot;
        S.lastSync = new Date().toISOString();
        indexExercises();
        return Promise.all([save('snap'), save('pending'), save('lastSync')]).then(function () {
          var got = body.imported;
          toast('Synced. Sent ' + got.workouts + ' workout(s) and ' + got.sports + ' sports session(s).');
          route();
          downloadMedia();
        });
      })
      .catch(function (err) {
        toast(err.message === 'Failed to fetch' || err.name === 'TypeError' ? 'Can’t reach your PC. Are you on home Wi-Fi with Gym Log running?' : 'Sync failed: ' + err.message, 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Sync now'; }
      });
  }

  // Compressed animations into the offline cache: exercises you've done first, resumable.
  function downloadMedia() {
    if (mediaState.running || !('caches' in window)) return;
    mediaState.running = true;
    Promise.all([fetch('/m/media-manifest').then(function (r) { return r.json(); }), caches.open('gymlog-media')])
      .then(function (r) {
        var manifest = r[0], cache = r[1];
        var doneIds = new Set();
        workouts().forEach(function (w) { w.exercises.forEach(function (we) { doneIds.add(we.exercise_id); }); });
        var ids = Object.keys(manifest).sort(function (a, b) { return (doneIds.has(b) ? 1 : 0) - (doneIds.has(a) ? 1 : 0); });
        mediaState.total = ids.length;
        return cache.keys().then(function (keys) {
          var have = new Set(keys.map(function (k) { return new URL(k.url).pathname; }));
          var todo = ids.filter(function (id) { return !have.has('/m/media/' + id + '.webp'); });
          mediaState.done = ids.length - todo.length;
          function next(i) {
            updateMedia();
            if (i >= todo.length) return null;
            var batch = todo.slice(i, i + 6).map(function (id) { return cache.add('/m/media/' + encodeURIComponent(id) + '.webp').catch(function () {}); });
            return Promise.all(batch).then(function () { mediaState.done += batch.length; return next(i + 6); });
          }
          return next(0);
        });
      })
      .catch(function () { /* offline or no media yet: try again next sync */ })
      .then(function () { mediaState.running = false; updateMedia(); });
  }
  function updateMedia() {
    var st = document.getElementById('media-status');
    var bar = document.getElementById('media-bar');
    if (st) st.textContent = mediaText();
    if (bar) bar.style.width = (mediaState.total ? (mediaState.done / mediaState.total) * 100 : 0) + '%';
  }

  /* ---------- events ---------- */

  view.addEventListener('input', function (e) {
    var t = e.target;
    if (!S.live) return;
    if (t.id === 'w-name') S.live.name = t.value;
    else if (t.id === 'w-notes') S.live.notes = t.value;
    else if (t.id === 'w-date') S.live.date = t.value || today();
    else if (t.dataset.field) {
      var we = S.live.exercises[t.closest('.lift').dataset.we];
      var s = we.sets[t.closest('tr').dataset.set];
      var v = t.value.trim() === '' ? null : Number(t.value);
      if (v != null && (!isFinite(v) || v < 0)) return;
      s[t.dataset.field] = t.dataset.field === 'reps' && v != null ? Math.round(v) : v;
    } else return;
    saveLiveSoon();
  });

  view.addEventListener('click', function (e) {
    var filter = e.target.closest('[data-filter]');
    if (filter) { e.preventDefault(); histFilter = filter.dataset.filter; renderHistory(); return; }
    var chip = e.target.closest('[data-minutes]');
    if (chip) {
      var form = chip.closest('form');
      form.hours.value = Math.floor(chip.dataset.minutes / 60);
      form.minutes.value = chip.dataset.minutes % 60;
      return;
    }
    var muscle = e.target.closest('.muscle[data-heads]');
    if (muscle) { openHeads(muscle.dataset.region); return; }
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.dataset.act;
    if (act === 'sync') { sync(); return; }
    if (act === 'del-pending') {
      window.confirmDialog({ title: 'Delete this?', message: 'It hasn’t been synced, so it’s only on this phone. This can’t be undone.' }).then(function (yes) {
        if (!yes) return;
        S.pending[b.dataset.kind] = S.pending[b.dataset.kind].filter(function (x) { return x.client_id !== b.dataset.cid; });
        save('pending').then(function () { toast('Deleted.'); location.hash = '#/history'; });
      });
      return;
    }
    if (act === 'discard' && S.live) {
      window.confirmDialog({ title: 'Discard this workout?', message: 'Everything logged in it is deleted. This can’t be undone.', confirmLabel: 'Discard' }).then(function (yes) {
        if (!yes) return;
        S.live = null;
        window.Store.del('live').then(function () { toast('Workout discarded.'); location.hash = '#/'; });
      });
      return;
    }
    if (!S.live) return;
    if (act === 'add-ex') { openPicker(); return; }
    if (act === 'finish') { finishLive(); return; }
    var card = b.closest('.lift');
    if (!card) return;
    var we = S.live.exercises[card.dataset.we];
    var row = b.closest('tr');
    var s = row ? we.sets[row.dataset.set] : null;
    if (act === 'done') {
      if (!s.done) {
        var prev = previousSets(we.exercise_id, S.live.client_id);
        var p = prev && prev.sets[row.dataset.set];
        if (s.weight == null && p && p.weight != null) s.weight = Math.round(U.convert(p.weight, p.unit, s.unit) * 4) / 4;
        if (s.reps == null) s.reps = p && p.reps > 0 ? p.reps : DEFAULT_REPS;
      }
      s.done = s.done ? 0 : 1;
    } else if (act === 'warm') s.is_warmup = s.is_warmup ? 0 : 1;
    else if (act === 'del-set') we.sets.splice(row.dataset.set, 1);
    else if (act === 'add-set') {
      var last = we.sets[we.sets.length - 1];
      we.sets.push({ weight: last ? last.weight : null, unit: last ? last.unit : unit(), reps: last ? last.reps : null, is_warmup: 0, done: 0 });
    } else if (act === 'unit') {
      var to = b.dataset.unit;
      we.sets.forEach(function (x) { if (x.unit !== to) { if (x.weight != null) x.weight = Math.round(U.convert(x.weight, x.unit, to) * 4) / 4; x.unit = to; } });
    } else if (act === 'remove') S.live.exercises.splice(card.dataset.we, 1);
    rerenderLifts();
  });

  view.addEventListener('change', function (e) {
    if (e.target.name === 'sport') {
      view.querySelectorAll('[data-works]').forEach(function (w) { w.hidden = w.dataset.works !== e.target.value; });
    }
  });

  view.addEventListener('submit', function (e) {
    if (e.target.id !== 'sport-form') return;
    e.preventDefault();
    var f = e.target;
    var minutes = (parseInt(f.hours.value, 10) || 0) * 60 + (parseInt(f.minutes.value, 10) || 0);
    if (minutes <= 0) { toast('How long did you play? Enter hours and minutes.', 'error'); return; }
    S.pending.sports.push({ client_id: uuid(), sport: f.sport.value, date: f.date.value || today(), minutes: minutes, notes: f.notes.value.trim() });
    save('pending').then(function () { toast(SP.SPORTS[f.sport.value].label + ' logged: ' + SP.duration(minutes)); location.hash = '#/'; });
  });

  var dlg = document.getElementById('dlg');
  dlg.addEventListener('click', function (e) {
    if (e.target === dlg || e.target.closest('[data-close]')) { dlg.close(); return; }
    var pick = e.target.closest('[data-pick]');
    if (pick) addExercise(pick.dataset.pick);
  });

  // Search fields: the keyboard's Search/Return key closes the keyboard so the results show.
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.matches && e.target.matches('input[type="search"]')) {
      e.preventDefault();
      e.target.blur();
    }
  });

  /* ---------- routing + start ---------- */

  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var parts = h.split('/');
    window.scrollTo(0, 0);
    if (parts[0] === 'log') renderLog();
    else if (parts[0] === 'sport') renderSport();
    else if (parts[0] === 'history') renderHistory();
    else if (parts[0] === 'w') renderWorkout(decodeURIComponent(parts[1] || ''));
    else if (parts[0] === 's') renderSportSession(decodeURIComponent(parts[1] || ''));
    else if (parts[0] === 'ex' && parts[1]) renderExercise(decodeURIComponent(parts[1]));
    else if (parts[0] === 'exercises') renderExercises();
    else if (parts[0] === 'sync') renderSync();
    else renderHome();
  }
  function indexExercises() {
    exById = new Map((S.snap ? S.snap.exercises : []).map(function (e) { return [e.id, e]; }));
  }

  window.addEventListener('hashchange', route);
  Promise.all(['snap', 'pending', 'live', 'lastSync'].map(function (k) { return window.Store.get(k); })).then(function (v) {
    S.snap = v[0] || null;
    S.pending = v[1] || { workouts: [], sports: [] };
    S.live = v[2] || null;
    S.lastSync = v[3] || null;
    indexExercises();
    route();
    if (S.snap) downloadMedia(); // resume an unfinished download (works only when the PC is reachable)
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/m/sw.js', { scope: '/m/' });
})();
