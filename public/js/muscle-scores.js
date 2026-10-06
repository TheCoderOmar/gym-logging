// Exercise page: pick 0–3 points per set for each muscle; saves immediately.
(() => {
  const box = document.getElementById('muscle-scores');
  if (!box) return;
  const exerciseId = box.dataset.exercise;
  const resetBtn = box.querySelector('[data-reset]');

  function render(muscles) {
    for (const { muscle, points } of muscles) {
      const li = box.querySelector(`li[data-muscle="${CSS.escape(muscle)}"]`);
      if (!li) continue;
      li.querySelectorAll('[data-points]').forEach((b) => {
        const on = Number(b.dataset.points) === points;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
      });
      li.querySelector('.ms-default').hidden = points === Number(li.dataset.default);
    }
    resetBtn.hidden = [...box.querySelectorAll('li[data-muscle]')].every((li) => !li.querySelector('.ms-default:not([hidden])'));
  }

  async function send(url, method, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Not saved');
    return data.muscles;
  }

  async function choose(li, points) {
    const muscle = li.dataset.muscle;
    try {
      render(await send(`/api/exercises/${encodeURIComponent(exerciseId)}/muscles`, 'PUT', { scores: [{ muscle, points }] }));
      window.toast?.(`${muscle.charAt(0).toUpperCase() + muscle.slice(1)}: ${points} ${points === 1 ? 'point' : 'points'} per set`);
    } catch (err) {
      window.toast?.(`Score not saved: ${err.message}`, { tone: 'error' });
    }
  }

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-points]');
    if (!b || b.getAttribute('aria-checked') === 'true') return;
    choose(b.closest('li'), Number(b.dataset.points));
  });

  // Radio-group keyboard: arrows move and select.
  box.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-points]');
    if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...b.parentElement.children];
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, buttons.indexOf(b) + step))];
    next.focus();
    next.click();
  });

  resetBtn.addEventListener('click', async () => {
    try {
      render(await send(`/api/exercises/${encodeURIComponent(exerciseId)}/muscles/reset`, 'POST'));
      window.toast?.('Muscle scores reset to defaults');
    } catch (err) {
      window.toast?.(`Not reset: ${err.message}`, { tone: 'error' });
    }
  });
})();
