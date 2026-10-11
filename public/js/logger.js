// Live workout logger. All state lives in the DB; every change autosaves through /api.
(() => {
  const root = document.getElementById('logger');
  const workoutId = root.dataset.workout;
  const finished = root.dataset.finished === '1';
  const liftsEl = document.getElementById('lifts');
  const saveEl = document.getElementById('save-state');
  const KG_PER_LB = 0.45359237;
  const PLATES = { kg: [25, 20, 15, 10, 5, 2.5, 1.25, 0.5], lb: [45, 35, 25, 10, 5, 2.5] };
  const REST_OPTIONS = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300];
  const DEFAULT_REPS = 12; // same as DEFAULT_REPS in src/db.js

  const ICON = {
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const round = (n, step = 0.1) => Math.round(n / step) * step;
  const fmtW = (n) => String(Math.round(n * 100) / 100);
  const convert = (w, from, to) => (w == null || from === to ? w : from === 'lb' ? w * KG_PER_LB : w / KG_PER_LB);

  let state = null;

  /* ---------- server calls ---------- */

  let inflight = 0;
  function setSaveState(text, err = false) {
    saveEl.textContent = text;
    saveEl.classList.toggle('err', err);
  }

  async function api(method, url, body) {
    inflight++;
    setSaveState('Saving…');
    try {
      const res = await fetch('/api' + url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      if (--inflight === 0) setSaveState('All changes saved');
      return data;
    } catch (err) {
      inflight--;
      setSaveState(`Not saved: ${err.message === 'Failed to fetch' ? 'is the server running?' : err.message}`, true);
      throw err;
    }
  }

  // Debounced per-set saves so typing doesn't send a request per keystroke.
  const pending = new Map();
  function queueSetSave(setId, patch) {
    const p = pending.get(setId) || { patch: {}, timer: null };
    Object.assign(p.patch, patch);
    clearTimeout(p.timer);
    p.timer = setTimeout(() => flushSet(setId), 500);
    pending.set(setId, p);
  }
  function flushSet(setId) {
    const p = pending.get(setId);
    if (!p) return Promise.resolve();
    clearTimeout(p.timer);
    pending.delete(setId);
    return api('PATCH', `/sets/${setId}`, p.patch);
  }
  const flushAll = () => Promise.all([...pending.keys()].map(flushSet));
  window.addEventListener('beforeunload', (e) => {
    if (pending.size) {
      flushAll();
      e.preventDefault();
    }
  });

  async function load() {
    state = await api('GET', `/workouts/${workoutId}`);
    setSaveState('');
    render();
  }

  /* ---------- helpers ---------- */

  const findWe = (weId) => state.workout.exercises.find((we) => we.id === Number(weId));
  const findSet = (setId) => {
    for (const we of state.workout.exercises) {
      const s = we.sets.find((x) => x.id === Number(setId));
      if (s) return { we, s };
    }
    return {};
  };
  const unitOf = (we) => (we.sets[0] && we.sets[0].unit) || state.unit;
  const isBarbell = (we) => /barbell|olympic|ez barbell|smith/.test(we.equipment) || /^barbell /.test(we.name);

  function prevFor(we, index) {
    const p = we.previous && we.previous.sets[index];
    if (!p) return null;
    return { weight: p.weight == null ? null : round(convert(p.weight, p.unit, unitOf(we)), 0.25), reps: p.reps, unit: p.unit, raw: p };
  }

  // Reps shown as a grey hint: last time's reps for this set, else the default.
  // Finishing (server side) fills a weight-only set with the same number.
  function repsHint(we, index) {
    const prev = prevFor(we, index);
    return prev && prev.reps > 0 ? prev.reps : DEFAULT_REPS;
  }

  function prevSummary(we) {
    if (!we.previous) return 'First time logging this';
    const sets = we.previous.sets.filter((s) => !s.is_warmup);
    const parts = sets.map((s) => (s.weight == null ? `BW × ${s.reps}` : `${fmtW(s.weight)}×${s.reps}`));
    const units = [...new Set(sets.map((s) => s.unit))].join('/');
    return `Last time (${new Date(we.previous.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}): ${parts.join(', ')} ${units}`;
  }

  /* ---------- plate math ---------- */

  function plateLoad(total, unit) {
    const bar = state.bar[unit];
    if (!total || total < bar) return null;
    let side = (total - bar) / 2;
    const plates = [];
    for (const p of PLATES[unit]) {
      while (side >= p - 1e-9) {
        plates.push(p);
        side -= p;
      }
    }
    return { bar, plates, leftover: Math.round(side * 2 * 100) / 100 };
  }

  function platesHtml(we, weight) {
    const unit = unitOf(we);
    const load = plateLoad(weight, unit);
    if (!load) {
      return `<span class="plates-text">${weight ? `Lighter than the ${state.bar[unit]} ${unit} bar.` : `Enter a weight to see the plates per side (${state.bar[unit]} ${unit} bar).`}</span>`;
    }
    const cls = (p) => (unit === 'kg' ? 'p' : 'lb') + String(p).replace('.', '_');
    const plateEls = load.plates.map((p) => `<span class="plate ${cls(p)}" title="${p} ${unit}"></span>`).join('');
    const counts = load.plates.reduce((m, p) => ((m[p] = (m[p] || 0) + 1), m), {});
    const text = load.plates.length
      ? Object.entries(counts).sort((a, b) => b[0] - a[0]).map(([p, n]) => (n > 1 ? `${n}×${p}` : p)).join(' + ')
      : 'Just the bar';
    return `<span class="bar" aria-hidden="true"><span class="shaft"></span><span class="collar"></span>${plateEls}<span class="sleeve"></span></span>
      <span class="plates-text"><strong>${fmtW(weight)} ${unit}</strong><br>${text}${load.plates.length ? ' per side' : ''}${load.leftover ? ` (${load.leftover} ${unit} can’t be loaded)` : ''}</span>`;
  }

  // The weight the plate strip should show: the focused set, else the first unfinished one,
  // else the last one; an empty set falls back to last session's weight (its placeholder).
  function plateWeight(we, focusedSetId) {
    const s = we.sets.find((x) => x.id === focusedSetId) || we.sets.find((x) => !x.done) || we.sets[we.sets.length - 1];
    if (!s) return null;
    if (s.weight != null) return s.weight;
    const prev = prevFor(we, we.sets.indexOf(s));
    return prev ? prev.weight : null;
  }

  function updatePlates(we, focusedSetId) {
    const el = liftsEl.querySelector(`.lift[data-we="${we.id}"] .plates`);
    if (el) el.innerHTML = platesHtml(we, plateWeight(we, focusedSetId));
  }

  /* ---------- rendering ---------- */

  function setRow(we, s, index, workingNo) {
    const unit = s.unit;
    const prev = prevFor(we, index);
    const prevText = prev ? (prev.weight == null ? `BW × ${prev.reps ?? '—'}` : `${fmtW(prev.weight)} × ${prev.reps ?? '—'}`) : '—';
    return `<tr data-set="${s.id}" class="${s.done ? 'is-done' : ''}">
      <td><button type="button" class="set-no ${s.is_warmup ? 'warm' : ''}" data-act="warmup" title="${s.is_warmup ? 'Warm-up set. Tap to make it a working set' : 'Tap to mark as warm-up'}" aria-label="Set ${s.is_warmup ? 'warm-up' : workingNo}, toggle warm-up">${s.is_warmup ? 'W' : workingNo}</button></td>
      <td class="prev-cell">${esc(prevText)}</td>
      <td><input type="number" inputmode="decimal" step="any" min="0" data-field="weight" value="${s.weight ?? ''}" placeholder="${prev && prev.weight != null ? fmtW(prev.weight) : ''}" aria-label="Weight in ${unit}"></td>
      <td><input type="number" inputmode="numeric" step="1" min="0" data-field="reps" value="${s.reps ?? ''}" placeholder="${repsHint(we, index)}" aria-label="Reps"></td>
      <td><button type="button" class="check" data-act="done" aria-pressed="${s.done ? 'true' : 'false'}" aria-label="Mark set done">${icon('check')}</button></td>
      <td><button type="button" class="del-set" data-act="del-set" aria-label="Delete set">${icon('x')}</button></td>
    </tr>`;
  }

  function liftCard(we, i, count) {
    const unit = unitOf(we);
    let working = 0;
    const rows = we.sets.map((s, idx) => setRow(we, s, idx, s.is_warmup ? 0 : ++working)).join('');
    const thumb = we.has_image ? `<img src="/media/${esc(we.exercise_id)}/image" alt="" width="52" height="52" data-anim="${esc(we.exercise_id)}">` : `<span class="ph">${esc(we.name.charAt(0).toUpperCase())}</span>`;
    return `<article class="lift" data-we="${we.id}">
      <header class="lift-head">
        ${thumb}
        <div>
          <h2><a href="/exercises/${esc(we.exercise_id)}" target="_blank" rel="noopener">${esc(we.name)}</a></h2>
          <p class="prev">${esc(prevSummary(we))}</p>
        </div>
        <div class="lift-tools">
          <span class="unit-toggle" role="group" aria-label="Weight unit">
            <button type="button" data-act="unit" data-unit="kg" aria-pressed="${unit === 'kg'}">kg</button>
            <button type="button" data-act="unit" data-unit="lb" aria-pressed="${unit === 'lb'}">lb</button>
          </span>
        </div>
      </header>
      <table class="set-table">
        <colgroup><col class="c-no"><col class="c-prev"><col><col><col class="c-done"><col class="c-del"></colgroup>
        <thead><tr><th>Set</th><th class="prev-head">Previous</th><th>${unit}</th><th>Reps</th><th><span class="sr-only">Done</span></th><th><span class="sr-only">Delete</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${isBarbell(we) ? `<div class="plates">${platesHtml(we, plateWeight(we))}</div>` : ''}
      <footer class="lift-foot">
        <button type="button" class="btn btn-sm" data-act="add-set">${icon('plus')} Add set</button>
        <span class="btn-row" style="gap:4px">
          <label class="sr-only" for="rest-${we.id}">Rest between sets</label>
          <select id="rest-${we.id}" data-act="rest" style="width:auto;min-height:34px;padding:4px 8px;font-size:.875rem" title="Rest timer after each set">
            ${REST_OPTIONS.map((r) => `<option value="${r}" ${r === we.rest_seconds ? 'selected' : ''}>${r ? `Rest ${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}` : 'No rest timer'}</option>`).join('')}
          </select>
          <button type="button" class="btn btn-sm btn-quiet" data-act="move" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${icon('up')}</button>
          <button type="button" class="btn btn-sm btn-quiet" data-act="move" data-dir="1" ${i === count - 1 ? 'disabled' : ''} aria-label="Move down">${icon('down')}</button>
          <button type="button" class="btn btn-sm btn-quiet btn-danger" data-act="remove" aria-label="Remove exercise">${icon('trash')}</button>
        </span>
      </footer>
    </article>`;
  }

  function render() {
    const list = state.workout.exercises;
    if (!list.length) {
      liftsEl.innerHTML = `<div class="empty"><h3>No exercises yet</h3><p>Add your first exercise to start logging sets.</p></div>`;
      return;
    }
    liftsEl.innerHTML = list.map((we, i) => liftCard(we, i, list.length)).join('');
  }

  function rerenderCard(we) {
    const el = liftsEl.querySelector(`.lift[data-we="${we.id}"]`);
    const i = state.workout.exercises.indexOf(we);
    const tmp = document.createElement('div');
    tmp.innerHTML = liftCard(we, i, state.workout.exercises.length);
    el.replaceWith(tmp.firstElementChild);
  }

  /* ---------- events ---------- */

  liftsEl.addEventListener('input', (e) => {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const { we, s } = findSet(input.closest('tr').dataset.set);
    const raw = input.value.trim();
    const val = raw === '' ? null : Number(raw);
    if (raw !== '' && (!Number.isFinite(val) || val < 0)) return;
    if (input.dataset.field === 'reps' && val != null && !Number.isInteger(val)) return;
    s[input.dataset.field] = val;
    queueSetSave(s.id, { [input.dataset.field]: val });
    if (input.dataset.field === 'weight') updatePlates(we, s.id);
  });

  liftsEl.addEventListener('focusin', (e) => {
    const input = e.target.closest('input[data-field="weight"]');
    if (!input) return;
    const { we, s } = findSet(input.closest('tr').dataset.set);
    updatePlates(we, s.id);
  });

  liftsEl.addEventListener('keydown', (e) => {
    // Enter in reps = tick the set off.
    if (e.key === 'Enter' && e.target.matches('input[data-field="reps"]')) {
      e.preventDefault();
      e.target.closest('tr').querySelector('[data-act="done"]').click();
    }
  });

  liftsEl.addEventListener('change', async (e) => {
    if (e.target.matches('select[data-act="rest"]')) {
      const we = findWe(e.target.closest('.lift').dataset.we);
      we.rest_seconds = Number(e.target.value);
      await api('PATCH', `/workout-exercises/${we.id}`, { rest_seconds: we.rest_seconds });
    }
  });

  liftsEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn || btn.tagName === 'SELECT') return;
    const card = btn.closest('.lift');
    const we = findWe(card.dataset.we);
    const row = btn.closest('tr');
    const act = btn.dataset.act;

    if (act === 'done') {
      const { s } = findSet(row.dataset.set);
      const idx = we.sets.indexOf(s);
      const patch = { done: !s.done };
      // Ticking an empty set accepts the "previous" placeholder values.
      if (!s.done) {
        const prev = prevFor(we, idx);
        if (s.weight == null && prev && prev.weight != null) patch.weight = prev.weight;
        if (s.reps == null) patch.reps = repsHint(we, idx);
      }
      await flushSet(s.id);
      const { set } = await api('PATCH', `/sets/${s.id}`, patch);
      Object.assign(s, set);
      row.outerHTML = setRow(we, s, idx, s.is_warmup ? 0 : we.sets.slice(0, idx + 1).filter((x) => !x.is_warmup).length);
      updatePlates(we);
      if (s.done && !finished && we.rest_seconds) Rest.start(we.rest_seconds);
      if (s.done) {
        // Move focus to the next set's weight so logging flows top to bottom.
        const next = liftsEl.querySelector(`tr[data-set="${s.id}"]`)?.nextElementSibling?.querySelector('input[data-field="weight"]');
        if (next) next.focus({ preventScroll: true });
      }
    } else if (act === 'warmup') {
      const { s } = findSet(row.dataset.set);
      const { set } = await api('PATCH', `/sets/${s.id}`, { is_warmup: !s.is_warmup });
      Object.assign(s, set);
      rerenderCard(we);
    } else if (act === 'del-set') {
      const { s } = findSet(row.dataset.set);
      pending.delete(s.id);
      await api('DELETE', `/sets/${s.id}`);
      we.sets.splice(we.sets.indexOf(s), 1);
      we.sets.forEach((x, i) => (x.set_number = i + 1));
      rerenderCard(we);
    } else if (act === 'add-set') {
      await flushAll();
      const { set } = await api('POST', `/workout-exercises/${we.id}/sets`);
      we.sets.push(set);
      rerenderCard(we);
      const inputs = liftsEl.querySelectorAll(`.lift[data-we="${we.id}"] tbody tr:last-child input`);
      inputs[0]?.focus();
    } else if (act === 'unit') {
      if (btn.dataset.unit === unitOf(we)) return;
      await flushAll();
      const { sets } = await api('POST', `/workout-exercises/${we.id}/unit`, { unit: btn.dataset.unit });
      we.sets = sets;
      rerenderCard(we);
    } else if (act === 'move') {
      await api('POST', `/workout-exercises/${we.id}/move`, { direction: Number(btn.dataset.dir) });
      const list = state.workout.exercises;
      const i = list.indexOf(we);
      const j = i + Number(btn.dataset.dir);
      [list[i], list[j]] = [list[j], list[i]];
      render();
      liftsEl.querySelector(`.lift[data-we="${we.id}"]`).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else if (act === 'remove') {
      const logged = we.sets.filter((s) => s.done).length;
      if (logged && !(await confirmDialog({ title: `Remove ${we.name}?`, message: `Its ${logged} logged ${logged === 1 ? 'set is' : 'sets are'} deleted too.`, confirmLabel: 'Remove' }))) return;
      await api('DELETE', `/workout-exercises/${we.id}`);
      state.workout.exercises.splice(state.workout.exercises.indexOf(we), 1);
      render();
    }
  });

  const openPicker = () =>
    ExercisePicker.open(async (ex) => {
      await flushAll();
      state = await api('POST', `/workouts/${workoutId}/exercises`, { exercise_id: ex.id });
      render();
      const cards = liftsEl.querySelectorAll('.lift');
      const last = cards[cards.length - 1];
      last.scrollIntoView({ block: 'center', behavior: 'smooth' });
      last.querySelector('input[data-field="weight"]')?.focus({ preventScroll: true });
    });
  document.getElementById('add-lift').addEventListener('click', openPicker);

  // Workout name, date + notes
  const titleEl = document.getElementById('log-title');
  const dateEl = document.getElementById('log-date');
  const notesEl = document.getElementById('log-notes');
  let metaTimer = null;
  const saveMeta = () => api('PATCH', `/workouts/${workoutId}`, { name: titleEl.value, notes: notesEl.value, date: dateEl.value || undefined });
  for (const el of [titleEl, notesEl]) {
    el.addEventListener('input', () => {
      clearTimeout(metaTimer);
      metaTimer = setTimeout(saveMeta, 600);
    });
  }
  dateEl.addEventListener('change', () => {
    if (!dateEl.value) return;
    clearTimeout(metaTimer);
    saveMeta();
  });

  const finishBtn = document.getElementById('finish');
  if (finishBtn) {
    finishBtn.addEventListener('click', async () => {
      const done = state.workout.exercises.reduce((n, we) => n + we.sets.filter((s) => s.done || s.reps > 0 || s.weight != null).length, 0);
      const ok = await confirmDialog({
        title: 'Finish this workout?',
        message: done
          ? `${done} ${done === 1 ? 'set is' : 'sets are'} logged. Sets you left empty are removed.`
          : 'No sets have reps yet. Sets you left empty are removed.',
        confirmLabel: 'Finish workout',
        danger: false,
      });
      if (!ok) return;
      clearTimeout(metaTimer);
      await Promise.all([flushAll(), saveMeta()]);
      const res = await api('POST', `/workouts/${workoutId}/finish`);
      location.href = res.redirect;
    });
  }

  // Editing a finished workout: save, count filled-in sets, drop empty ones.
  const doneEditingBtn = document.getElementById('done-editing');
  if (doneEditingBtn) {
    doneEditingBtn.addEventListener('click', async () => {
      clearTimeout(metaTimer);
      await Promise.all([flushAll(), saveMeta()]);
      const res = await api('POST', `/workouts/${workoutId}/finish`);
      location.href = res.redirect;
    });
  }

  /* ---------- rest timer ---------- */

  const Rest = (() => {
    const el = document.getElementById('rest');
    const t = document.getElementById('rest-t');
    let end = 0;
    let iv = null;
    let beeped = false;

    function beep() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        [0, 0.25].forEach((delay) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          g.gain.setValueAtTime(0.18, ctx.currentTime + delay);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
          o.connect(g).connect(ctx.destination);
          o.start(ctx.currentTime + delay);
          o.stop(ctx.currentTime + delay + 0.2);
        });
      } catch (e) { /* no audio, that's fine */ }
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    }

    function draw() {
      const left = Math.round((end - Date.now()) / 1000);
      const a = Math.abs(left);
      t.textContent = `${left < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
      el.classList.toggle('over', left <= 0);
      if (left <= 0 && !beeped) {
        beeped = true;
        beep();
      }
      if (left < -120) stop(); // forgotten timer
    }
    function start(seconds) {
      end = Date.now() + seconds * 1000;
      beeped = false;
      el.hidden = false;
      clearInterval(iv);
      iv = setInterval(draw, 250);
      draw();
    }
    function stop() {
      clearInterval(iv);
      el.hidden = true;
    }
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rest]');
      if (!b) return;
      if (b.dataset.rest === 'skip') return stop();
      end += Number(b.dataset.rest) * 1000;
      if (end - Date.now() > 0) beeped = false;
      draw();
    });
    return { start, stop };
  })();

  load()
    .then(() => {
      // Fresh freestyle workout: go straight to picking the first exercise.
      const url = new URL(location.href);
      if (!url.searchParams.has('add')) return;
      url.searchParams.delete('add');
      history.replaceState(null, '', url);
      if (!state.workout.exercises.length) openPicker();
    })
    .catch(() => {
      liftsEl.innerHTML = '<div class="error-box">Couldn’t load this workout. Check the server is running, then reload.</div>';
    });
})();
