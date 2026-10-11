(() => {
  const form = document.getElementById('builder');
  const list = document.getElementById('r-list');
  const count = document.getElementById('r-count');
  const errEl = document.getElementById('builder-error');
  const items = window.ROUTINE || [];
  let dirty = false;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const UP = svg('<path d="m6 15 6-6 6 6"/>');
  const DOWN = svg('<path d="m6 9 6 6 6-6"/>');
  const X = svg('<path d="M6 6l12 12M18 6 6 18"/>');

  function render() {
    const sets = items.reduce((n, i) => n + (Number(i.target_sets) || 0), 0);
    count.textContent = items.length ? `${items.length} exercises · ${sets} sets` : '';
    if (!items.length) {
      list.innerHTML = '<li class="empty">Add the exercises for this routine. You can reorder them and set targets for each.</li>';
      return;
    }
    list.innerHTML = items
      .map(
        (it, i) => `<li class="builder-item" data-i="${i}">
        ${it.has_image ? `<img src="/media/${esc(it.exercise_id)}/image" alt="" width="56" height="56" data-anim="${esc(it.exercise_id)}">` : `<span class="ph">${esc(it.name.charAt(0).toUpperCase())}</span>`}
        <div>
          <div class="name">${esc(it.name)}</div>
          <div class="targets">
            <label><span class="sr-only">Sets</span><input type="number" min="1" max="20" data-k="target_sets" value="${esc(it.target_sets)}"></label> sets of
            <label><span class="sr-only">Reps</span><input class="reps" type="text" maxlength="20" data-k="target_reps" value="${esc(it.target_reps)}"></label> reps,
            rest <label><span class="sr-only">Rest seconds</span><input type="number" min="0" max="900" step="15" data-k="rest_seconds" value="${esc(it.rest_seconds)}"></label> s
          </div>
        </div>
        <div class="moves">
          <button type="button" class="btn btn-sm btn-quiet" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Move up">${UP}</button>
          <button type="button" class="btn btn-sm btn-quiet" data-move="1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Move down">${DOWN}</button>
          <button type="button" class="btn btn-sm btn-quiet btn-danger" data-remove aria-label="Remove ${esc(it.name)}">${X}</button>
        </div>
      </li>`,
      )
      .join('');
  }

  list.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    items[e.target.closest('[data-i]').dataset.i][k] = e.target.value;
    dirty = true;
    const sets = items.reduce((n, i) => n + (Number(i.target_sets) || 0), 0);
    count.textContent = `${items.length} exercises · ${sets} sets`;
  });

  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (!li) return;
    const i = Number(li.dataset.i);
    const move = e.target.closest('[data-move]');
    if (move) {
      const j = i + Number(move.dataset.move);
      [items[i], items[j]] = [items[j], items[i]];
      dirty = true;
      render();
      list.querySelector(`[data-i="${j}"] [data-move="${move.dataset.move}"]`)?.focus();
    } else if (e.target.closest('[data-remove]')) {
      items.splice(i, 1);
      dirty = true;
      render();
    }
  });

  document.getElementById('r-add').addEventListener('click', () => {
    ExercisePicker.open((ex) => {
      items.push({ exercise_id: ex.id, name: ex.name, target: ex.target, equipment: ex.equipment, has_image: ex.has_image, target_sets: 3, target_reps: '8-12', rest_seconds: 0 });
      dirty = true;
      render();
    });
  });

  form.addEventListener('input', () => (dirty = true));
  window.addEventListener('beforeunload', (e) => {
    if (dirty) e.preventDefault();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errEl.hidden = true;
    const res = await fetch('/api/routines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: form.dataset.id || null,
        name: document.getElementById('r-name').value,
        notes: document.getElementById('r-notes').value,
        exercises: items,
      }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : { error: 'Can’t reach the server. Is it running?' };
    if (!res || !res.ok) {
      errEl.textContent = data.error || 'Routine wasn’t saved.';
      errEl.hidden = false;
      return;
    }
    dirty = false;
    location.href = data.redirect;
  });

  render();
})();
