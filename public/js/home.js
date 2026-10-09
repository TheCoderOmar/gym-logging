// Home: training-log view toggle and legend filters (both remembered per browser),
// year paging without a page reload, and on narrow screens the calendar scrolls to today.
// Also: clicking a muscle with heads on the recovery map opens its close-up.
(() => {
  const dlg = document.getElementById('heads-dialog');
  if (!dlg) return;
  let opener = null;

  async function open(muscle) {
    try {
      const res = await fetch(`/muscles/${encodeURIComponent(muscle.dataset.region)}`);
      if (!res.ok) throw new Error(res.status);
      dlg.innerHTML = await res.text();
    } catch (err) {
      window.toast?.('Couldn’t load that muscle', { tone: 'error' });
      return;
    }
    opener = muscle;
    dlg.showModal();
    dlg.querySelector('[data-close]')?.focus();
  }

  document.addEventListener('click', (e) => {
    const muscle = e.target.closest('.muscle[data-heads]');
    if (muscle) open(muscle);
  });
  document.addEventListener('keydown', (e) => {
    const muscle = e.target.closest?.('.muscle[data-heads]');
    if (muscle && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      open(muscle);
    }
  });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); // backdrop or ×
  });
  dlg.addEventListener('close', () => opener?.focus());
})();

(() => {
  if (!document.getElementById('training-log')) return;

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
  };
  const filterKey = { levels: 'calFilterLevels', emoji: 'calFilterAreas' };

  // Wire up one training-log panel. Runs again each time a new year is swapped in.
  function init(panel) {
    const cal = panel.querySelector('#cal');
    const scroller = panel.querySelector('#cal-scroll');
    const viewButtons = panel.querySelectorAll('[data-cal-view]');
    const levelButtons = [...panel.querySelectorAll('[data-filter-level]')];
    const areaButtons = [...panel.querySelectorAll('[data-filter-area]')];
    const status = panel.querySelector('.filter-status');
    const countEl = panel.querySelector('#filter-count');
    const cells = [...cal.querySelectorAll('.cell:not(.out)')];

    // Each view has its own filter: levels for "Exercises", body areas for "Emoji".
    const filters = {
      levels: new Set(store.get(filterKey.levels, []).map(String)),
      emoji: new Set(store.get(filterKey.emoji, [])),
    };
    let view = 'levels';

    function matches(cell) {
      if (view === 'levels') return filters.levels.has(cell.dataset.level);
      return (cell.dataset.areas || '').split(' ').some((a) => filters.emoji.has(a));
    }

    function applyFilter() {
      levelButtons.forEach((b) => b.setAttribute('aria-pressed', String(filters.levels.has(b.dataset.filterLevel))));
      areaButtons.forEach((b) => b.setAttribute('aria-pressed', String(filters.emoji.has(b.dataset.filterArea))));
      if (!filters[view].size) {
        cells.forEach((c) => c.classList.remove('dim'));
        status.hidden = true;
        return;
      }
      let n = 0;
      for (const c of cells) {
        const hit = c.tagName === 'A' && matches(c);
        c.classList.toggle('dim', !hit);
        if (hit) n++;
      }
      countEl.textContent = `${n} ${n === 1 ? 'day matches' : 'days match'}`;
      status.hidden = false;
    }

    function setView(v) {
      view = v;
      cal.dataset.view = v;
      panel.dataset.view = v;
      viewButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calView === v)));
      // When the year doesn't fit (phones), keep today in view.
      const today = cal.querySelector('.is-today');
      scroller.scrollLeft = today ? today.offsetLeft - scroller.clientWidth * 0.7 : 0;
      store.set('calView', v);
      applyFilter();
    }

    function toggle(value) {
      const set = filters[view];
      set.has(value) ? set.delete(value) : set.add(value);
      store.set(filterKey[view], [...set]);
      applyFilter();
    }

    viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.calView)));
    levelButtons.forEach((b) => b.addEventListener('click', () => toggle(b.dataset.filterLevel)));
    areaButtons.forEach((b) => b.addEventListener('click', () => toggle(b.dataset.filterArea)));
    panel.querySelector('#filter-clear').addEventListener('click', () => {
      filters[view].clear();
      store.set(filterKey[view], []);
      applyFilter();
    });

    // Older versions stored the view as a bare string, which JSON.parse rejects.
    let saved = 'levels';
    try { saved = localStorage.getItem('calView') || 'levels'; } catch (e) { /* private mode */ }
    setView(saved.includes('emoji') ? 'emoji' : 'levels');
  }

  // Year arrows: fetch just the panel for that year and swap it in place.
  let loading = null;
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('#training-log [data-year]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    const year = link.dataset.year;
    const which = link.getAttribute('aria-label'); // keep focus on the same arrow
    const mine = (loading = year);
    try {
      const res = await fetch(`/training-log?year=${encodeURIComponent(year)}`);
      if (!res.ok) throw new Error(res.status);
      const html = await res.text();
      if (mine !== loading) return; // a newer click won
      const tmp = document.createElement('div');
      tmp.innerHTML = html.trim();
      const next = tmp.firstElementChild;
      document.getElementById('training-log').replaceWith(next);
      init(next);
      history.replaceState(null, '', year === String(new Date().getFullYear()) ? '/' : `/?year=${year}`);
      (next.querySelector(`[aria-label="${which}"]`) || next.querySelector('.year-nav a'))?.focus();
    } catch (err) {
      location.href = link.href; // fall back to a normal page load
    }
  });

  init(document.getElementById('training-log'));
})();
