// Top-right notifications.
//   toast('Saved')                     → green, closes after 15 s
//   toast('Not saved', { tone: 'error' })
// Server-side messages arrive as ?msg=…(&tone=error) and are shown once on load.
window.toast = (() => {
  const DURATION = 15000;
  const host = document.getElementById('toasts');

  const ICON = {
    ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    error: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
  };
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  return function toast(message, { tone = 'ok', duration = DURATION } = {}) {
    if (!host || !message) return;
    const el = document.createElement('div');
    el.className = `toast toast-${tone === 'error' ? 'error' : 'ok'}`;
    el.style.setProperty('--life', `${duration}ms`);
    el.innerHTML = `${svg(ICON[tone] || ICON.ok)}<p></p>
      <button type="button" class="toast-close" aria-label="Dismiss">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
      <span class="toast-life" aria-hidden="true"></span>`;
    el.querySelector('p').textContent = message;
    host.appendChild(el);

    // Countdown that pauses while hovered or focused, so it never vanishes mid-read.
    let left = duration;
    let started = Date.now();
    let timer = setTimeout(close, left);
    const pause = () => {
      clearTimeout(timer);
      left -= Date.now() - started;
      el.classList.add('paused');
    };
    const resume = () => {
      started = Date.now();
      timer = setTimeout(close, left);
      el.classList.remove('paused');
    };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);

    function close() {
      clearTimeout(timer);
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }
    el.querySelector('.toast-close').addEventListener('click', close);
    return close;
  };
})();

(() => {
  const host = document.getElementById('toasts');
  if (!host || !host.dataset.flash) return;
  window.toast(host.dataset.flash, { tone: host.dataset.tone });
  // Drop ?msg from the address bar so a refresh doesn't show it again.
  const url = new URL(location.href);
  url.searchParams.delete('msg');
  url.searchParams.delete('tone');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
})();
