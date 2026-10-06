// Home: training-log view toggle and legend filters (both remembered per browser);
// on narrow screens the calendar scrolls to today.
(() => {
  const cal = document.getElementById('cal');
  if (!cal) return;
  const panel = document.querySelector('.log-panel');
  const scroller = document.getElementById('cal-scroll');
  const viewButtons = document.querySelectorAll('[data-cal-view]');
  const levelButtons = [...panel.querySelectorAll('[data-filter-level]')];
  const areaButtons = [...panel.querySelectorAll('[data-filter-area]')];
  const status = panel.querySelector('.filter-status');
  const countEl = document.getElementById('filter-count');
  const cells = [...cal.querySelectorAll('.cell:not(.out)')];

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

  // Each view has its own filter: levels for "Exercises", body areas for "Emoji".
  const filters = {
    levels: new Set(store.get('calFilterLevels', []).map(String)),
    emoji: new Set(store.get('calFilterAreas', [])),
  };
  const filterKey = { levels: 'calFilterLevels', emoji: 'calFilterAreas' };
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
    scroller.scrollLeft = today ? today.offsetLeft - scroller.clientWidth * 0.7 : scroller.scrollWidth;
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
  document.getElementById('filter-clear').addEventListener('click', () => {
    filters[view].clear();
    store.set(filterKey[view], []);
    applyFilter();
  });

  // Older versions stored the view as a bare string, which JSON.parse rejects.
  let saved = 'levels';
  try { saved = localStorage.getItem('calView') || 'levels'; } catch (e) { /* private mode */ }
  setView(saved.includes('emoji') ? 'emoji' : 'levels');
})();
