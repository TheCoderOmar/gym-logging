// Exercise library: live search and filters. Results are fetched and swapped in place
// (no page reload), and the URL is kept in sync so refresh/back still work.
(() => {
  const form = document.getElementById('ex-filters');
  const results = document.getElementById('results');
  if (!form || !results) return;
  const q = form.elements.q;
  let timer = null;
  let seq = 0;

  function urlFromForm() {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v) params.set(k, v);
    return `/exercises${params.toString() ? '?' + params : ''}`;
  }

  // Keep the form in step with a URL (used after "Only mine", "Clear filters", paging).
  function syncForm(url, { keepQuery = false } = {}) {
    const params = new URL(url, location.origin).searchParams;
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el === q && keepQuery) continue; // don't fight the user's typing
      el.value = params.get(el.name) || '';
    }
    markSet();
  }

  function markSet() {
    form.querySelectorAll('select').forEach((s) => s.classList.toggle('is-set', !!s.value));
    document.querySelectorAll('[data-equip]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.equip === form.elements.equipment.value)));
    markPicker();
  }

  /* ---------- body figure muscle picker ---------- */

  const picker = document.getElementById('muscle-picker');
  const musclesInput = form.elements.muscles;
  const pickedEl = document.getElementById('picked');
  const clearBtn = document.getElementById('picked-clear');
  const selected = () => (musclesInput.value ? musclesInput.value.split(',') : []);
  const labelOf = (id) => picker.querySelector(`.muscle[data-region="${id}"]`)?.getAttribute('aria-label') || id;

  function markPicker() {
    if (!picker) return;
    const on = new Set(selected());
    picker.querySelectorAll('.muscle.pick').forEach((g) => {
      const yes = on.has(g.dataset.region);
      g.classList.toggle('is-on', yes);
      g.setAttribute('aria-checked', String(yes));
    });
    pickedEl.innerHTML = '';
    for (const id of on) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip picked-chip';
      chip.dataset.region = id;
      chip.setAttribute('aria-label', `Remove ${labelOf(id)}`);
      chip.innerHTML = `${labelOf(id)} <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
      pickedEl.appendChild(chip);
    }
    clearBtn.hidden = !on.size;
  }

  function setMuscles(list) {
    musclesInput.value = list.join(',');
    markPicker();
    load(urlFromForm());
  }

  function toggleMuscle(id) {
    const list = selected();
    setMuscles(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  }

  if (picker) {
    picker.addEventListener('click', (e) => {
      const g = e.target.closest('.muscle.pick');
      if (g) return toggleMuscle(g.dataset.region);
      const chip = e.target.closest('.picked-chip');
      if (chip) return toggleMuscle(chip.dataset.region);
    });
    picker.addEventListener('keydown', (e) => {
      const g = e.target.closest('.muscle.pick');
      if (g && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        toggleMuscle(g.dataset.region);
      }
    });
    clearBtn.addEventListener('click', () => setMuscles([]));

    // Front / back toggle, remembered per browser.
    const sideButtons = picker.querySelectorAll('[data-side]');
    const showSide = (side) => {
      sideButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
      picker.querySelectorAll('[data-fig]').forEach((f) => (f.hidden = f.dataset.fig !== side));
      try { localStorage.setItem('pickerSide', side); } catch (err) { /* private mode */ }
    };
    sideButtons.forEach((b) => b.addEventListener('click', () => showSide(b.dataset.side)));
    let side = 'front';
    try { side = localStorage.getItem('pickerSide') === 'back' ? 'back' : 'front'; } catch (err) { /* private mode */ }
    showSide(side);
    markPicker();
  }

  async function load(url, { scroll = false, typing = false } = {}) {
    const mine = ++seq;
    results.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' } });
      const html = await res.text();
      if (mine !== seq) return; // a newer search already started
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = doc.getElementById('results');
      if (!next) throw new Error('no results block');
      results.innerHTML = next.innerHTML;
      // The "Add exercise" button carries the search text as a suggested name.
      const add = doc.querySelector('.page-head .btn');
      const curAdd = document.querySelector('.page-head .btn');
      if (add && curAdd) curAdd.href = add.getAttribute('href');
      history.replaceState(null, '', url);
      syncForm(url, { keepQuery: typing });
      if (scroll) form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (err) {
      location.href = url; // fall back to a normal page load
    } finally {
      if (mine === seq) results.removeAttribute('aria-busy');
    }
  }

  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(urlFromForm(), { typing: true }), 250);
  });
  form.addEventListener('change', (e) => {
    if (e.target.tagName !== 'SELECT') return;
    markSet();
    load(urlFromForm());
  });
  // Equipment tiles: one at a time; tapping the active one clears it.
  document.getElementById('equip-strip')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-equip]');
    if (!b) return;
    const input = form.elements.equipment;
    input.value = input.value === b.dataset.equip ? '' : b.dataset.equip;
    markSet();
    load(urlFromForm());
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    load(urlFromForm());
  });
  results.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-swap]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    load(a.getAttribute('href'), { scroll: /[?&]page=/.test(a.getAttribute('href')) });
  });
})();
