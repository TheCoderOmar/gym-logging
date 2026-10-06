// Top-right notifications that stack, newest on top.
//   toast('Saved')                     → green, closes after 15 s
//   toast('Not saved', { tone: 'error' })
// Server-side messages arrive as ?msg=…(&tone=error). Toasts that are still running are kept
// in sessionStorage, so they carry over to the next page with their remaining time.
window.toast = (() => {
  const DURATION = 15000;
  const MAX = 5;
  const KEY = 'toasts';
  const host = document.getElementById('toasts');
  const live = new Map(); // id → { message, tone, endsAt, close }

  const ICON = {
    ok: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    error: '<path d="M12 8v5M12 16.5v.5"/><circle cx="12" cy="12" r="9"/>',
  };
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

  function save() {
    const list = [...live.entries()].map(([id, t]) => ({ id, message: t.message, tone: t.tone, endsAt: t.endsAt, duration: t.duration }));
    try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ }
  }

  function show({ restored = false, id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, message, tone = 'ok', duration = DURATION, endsAt = Date.now() + duration }) {
    if (!host || !message) return () => {};
    tone = tone === 'error' ? 'error' : 'ok';
    const el = document.createElement('div');
    el.className = `toast toast-${tone}${restored ? ' restored' : ''}`;
    el.style.setProperty('--life', `${duration}ms`);
    el.innerHTML = `${svg(ICON[tone])}<p></p>
      <button type="button" class="toast-close" aria-label="Dismiss">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button>
      <span class="toast-life" aria-hidden="true"></span>`;
    el.querySelector('p').textContent = message;
    // A restored toast resumes its countdown bar where it left off.
    el.querySelector('.toast-life').style.animationDelay = `${-(duration - (endsAt - Date.now()))}ms`;
    host.prepend(el);

    // Countdown that pauses while hovered or focused, so it never vanishes mid-read.
    let timer = setTimeout(close, endsAt - Date.now());
    let pausedLeft = null;
    const pause = () => {
      if (pausedLeft !== null) return;
      clearTimeout(timer);
      pausedLeft = live.get(id).endsAt - Date.now();
      el.classList.add('paused');
    };
    const resume = () => {
      if (pausedLeft === null) return;
      live.get(id).endsAt = Date.now() + pausedLeft;
      timer = setTimeout(close, pausedLeft);
      pausedLeft = null;
      el.classList.remove('paused');
      save();
    };
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', resume);

    function close() {
      clearTimeout(timer);
      live.delete(id);
      save();
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 200);
    }
    el.querySelector('.toast-close').addEventListener('click', close);

    live.set(id, { message, tone, endsAt, duration, close });
    // Too many at once: the oldest goes first.
    while (live.size > MAX) live.values().next().value.close();
    save();
    return close;
  }

  // Restore toasts still running from the previous page (oldest first, so the newest ends on top).
  let saved = [];
  try { saved = JSON.parse(sessionStorage.getItem(KEY)) || []; } catch (e) { /* nothing saved */ }
  for (const t of saved) if (t.endsAt - Date.now() > 300) show({ ...t, restored: true });

  return (message, opts = {}) => show({ message, ...opts });
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
