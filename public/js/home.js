// Home: training-log view toggle (remembered per browser); on narrow screens scroll to today.
(() => {
  const cal = document.getElementById('cal');
  if (!cal) return;
  const buttons = document.querySelectorAll('[data-cal-view]');
  const scroller = document.getElementById('cal-scroll');

  function setView(view) {
    cal.dataset.view = view;
    document.querySelector('.log-panel').dataset.view = view;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calView === view)));
    // When the year doesn't fit (phones), keep today in view.
    const today = cal.querySelector('.is-today');
    scroller.scrollLeft = today ? today.offsetLeft - scroller.clientWidth * 0.7 : scroller.scrollWidth;
    try { localStorage.setItem('calView', view); } catch (e) { /* private mode */ }
  }

  buttons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.calView)));
  let saved = 'levels';
  try { saved = localStorage.getItem('calView') || 'levels'; } catch (e) { /* private mode */ }
  setView(saved === 'emoji' ? 'emoji' : 'levels');
})();
