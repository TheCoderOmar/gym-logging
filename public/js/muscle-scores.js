// Exercise page: pick 0–3 points per set for each muscle, and for the heads of muscles
// that have them (biceps, chest, …). Saves immediately.
(() => {
  const box = document.getElementById('muscle-scores');
  if (!box) return;
  const exerciseId = box.dataset.exercise;
  const resetBtn = box.querySelector('[data-reset]');
  const headsEl = document.getElementById('ms-heads');
  const regionLabels = JSON.parse(headsEl.dataset.labels || '{}');
  const MAX = 3;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const api = (path) => `/api/exercises/${encodeURIComponent(exerciseId)}${path}`;

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

  // Heads: one block per muscle that has heads. A head can't score more than its muscle.
  function renderHeads(heads) {
    headsEl.innerHTML = Object.entries(heads)
      .map(([region, list]) => {
        const cap = list[0].max;
        const rows = list
          .map((h) => {
            const buttons = Array.from({ length: MAX + 1 }, (_, p) => {
              const on = p === h.points;
              const over = p > cap;
              return `<button type="button" role="radio" aria-checked="${on}" data-points="${p}" tabindex="${on ? 0 : -1}"${over ? ` disabled title="Can’t be higher than the ${esc(regionLabels[region]).toLowerCase()} score"` : ''}>${p}</button>`;
            }).join('');
            const note = h.edited && h.points !== h.defaultPoints ? ` · automatic ${h.defaultPoints}` : '';
            return `<li data-head="${esc(h.head)}" data-region="${esc(region)}">
              <div class="ms-name"><strong>${esc(h.label)}</strong><span>${h.edited ? 'Edited' : 'Automatic'}${note}</span></div>
              <div class="ms-pick" role="radiogroup" aria-label="Points per set for ${esc(h.label)}">${buttons}</div>
            </li>`;
          })
          .join('');
        const edited = list.some((h) => h.edited);
        return `<div class="ms-heads-group">
          <div class="ms-head"><h3>${esc(regionLabels[region])} heads</h3>
            <button type="button" class="btn btn-sm btn-quiet" data-reset-heads="${esc(region)}"${edited ? '' : ' hidden'}>Reset to automatic</button></div>
          <ul class="ms-list">${rows}</ul>
        </div>`;
      })
      .join('');
  }

  async function send(url, method, body) {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Not saved');
    return data;
  }

  // Muscle scores cap the head scores, so refresh the heads after any muscle change.
  const refreshHeads = async () => renderHeads((await send(api('/heads'), 'GET')).heads);

  async function chooseMuscle(li, points) {
    const muscle = li.dataset.muscle;
    try {
      render((await send(api('/muscles'), 'PUT', { scores: [{ muscle, points }] })).muscles);
      window.toast?.(`${muscle.charAt(0).toUpperCase() + muscle.slice(1)}: ${points} ${points === 1 ? 'point' : 'points'} per set`);
      await refreshHeads();
    } catch (err) {
      window.toast?.(`Score not saved: ${err.message}`, { tone: 'error' });
    }
  }

  async function chooseHead(li, points) {
    const label = li.querySelector('strong').textContent;
    try {
      renderHeads((await send(api('/heads'), 'PUT', { region: li.dataset.region, scores: [{ head: li.dataset.head, points }] })).heads);
      window.toast?.(`${label}: ${points} ${points === 1 ? 'point' : 'points'} per set`);
      headsEl.querySelector(`li[data-head="${CSS.escape(li.dataset.head)}"] [aria-checked="true"]`)?.focus();
    } catch (err) {
      window.toast?.(`Score not saved: ${err.message}`, { tone: 'error' });
    }
  }

  box.addEventListener('click', async (e) => {
    const resetHeads = e.target.closest('[data-reset-heads]');
    if (resetHeads) {
      const region = resetHeads.dataset.resetHeads;
      try {
        renderHeads((await send(api('/heads/reset'), 'POST', { region })).heads);
        window.toast?.(`${regionLabels[region]} heads reset to automatic`);
      } catch (err) {
        window.toast?.(`Not reset: ${err.message}`, { tone: 'error' });
      }
      return;
    }
    const b = e.target.closest('[data-points]');
    if (!b || b.disabled || b.getAttribute('aria-checked') === 'true') return;
    const li = b.closest('li');
    if (li.dataset.head) chooseHead(li, Number(b.dataset.points));
    else chooseMuscle(li, Number(b.dataset.points));
  });

  // Radio-group keyboard: arrows move and select (skipping scores above the cap).
  box.addEventListener('keydown', (e) => {
    const b = e.target.closest('[data-points]');
    if (!b || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const buttons = [...b.parentElement.children].filter((x) => !x.disabled);
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, buttons.indexOf(b) + step))];
    next.focus();
    next.click();
  });

  resetBtn.addEventListener('click', async () => {
    try {
      render((await send(api('/muscles/reset'), 'POST')).muscles);
      window.toast?.('Muscle scores reset to defaults');
      await refreshHeads();
    } catch (err) {
      window.toast?.(`Not reset: ${err.message}`, { tone: 'error' });
    }
  });

  renderHeads(JSON.parse(headsEl.dataset.heads || '{}'));
})();
