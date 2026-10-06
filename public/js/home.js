// Home: training-log view toggle (remembered per browser) and scroll the calendar to today.
(() => {
  const cal = document.getElementById('cal');
  if (!cal) return;
  const buttons = document.querySelectorAll('[data-cal-view]');
  const scroller = document.getElementById('cal-scroll');

  function setView(view) {
    cal.dataset.view = view;
    document.querySelector('.log-panel').dataset.view = view;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.calView === view)));
    scroller.scrollLeft = scroller.scrollWidth; // keep the latest weeks in view
    try { localStorage.setItem('calView', view); } catch (e) { /* private mode */ }
  }

  buttons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.calView)));
  let saved = 'levels';
  try { saved = localStorage.getItem('calView') || 'levels'; } catch (e) { /* private mode */ }
  setView(saved === 'emoji' ? 'emoji' : 'levels');
})();
