// Shared exercise-picker dialog. Usage: ExercisePicker.open((exercise) => { ... })
window.ExercisePicker = (() => {
  const dlg = document.getElementById('picker');
  if (!dlg) return { open() {} };
  const q = dlg.querySelector('#picker-q');
  const body = dlg.querySelector('#picker-body');
  const equip = dlg.querySelector('#picker-equip');
  const list = dlg.querySelector('#picker-results');
  const foot = dlg.querySelector('#picker-foot');
  let onPick = null;
  let timer = null;
  let seq = 0;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  async function search() {
    const mine = ++seq;
    const params = new URLSearchParams({ q: q.value, body_part: body.value, equipment: equip.value, limit: 60 });
    const res = await fetch('/api/exercises?' + params);
    const data = await res.json();
    if (mine !== seq) return; // a newer search already started
    list.innerHTML = data.rows
      .map(
        (ex) => `<li><button type="button" data-id="${esc(ex.id)}">
          ${ex.has_image ? `<img src="/media/${esc(ex.id)}/image" alt="" loading="lazy" width="48" height="48" data-anim="${esc(ex.id)}">` : `<span class="ph">${esc(ex.name.charAt(0).toUpperCase())}</span>`}
          <span><strong>${esc(ex.name)}</strong><span>${esc(ex.target)} · ${esc(ex.equipment)}${ex.times_done ? ` · done ${ex.times_done}×` : ''}</span></span>
          ${ex.is_custom ? '<span class="chip chip-custom">Yours</span>' : ''}
        </button></li>`,
      )
      .join('');
    list._rows = data.rows;
    const newLink = `<a href="/exercises/new?name=${encodeURIComponent(q.value)}">add it as a new exercise</a>`;
    foot.innerHTML = data.rows.length
      ? `Showing ${data.rows.length} of ${data.total}. Can’t find it? You can ${newLink}.`
      : `Nothing matches. Try fewer words, or ${newLink}.`;
  }

  function debounced() {
    clearTimeout(timer);
    timer = setTimeout(search, 160);
  }

  q.addEventListener('input', debounced);
  body.addEventListener('change', search);
  equip.addEventListener('change', search);
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const ex = list._rows.find((r) => r.id === btn.dataset.id);
    dlg.close();
    if (onPick) onPick(ex);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      search();
      q.blur(); // phones: Search/Return hides the keyboard so the results show
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      list.querySelector('button')?.focus();
    }
  });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...list.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    const next = items[i + (e.key === 'ArrowDown' ? 1 : -1)];
    (next || (e.key === 'ArrowUp' ? q : null))?.focus();
  });
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) dlg.close(); // backdrop click
  });

  return {
    open(cb) {
      onPick = cb;
      dlg.showModal();
      q.select();
      search();
    },
  };
})();
