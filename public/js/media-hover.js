// Exercise animations on hover (mouse only — phones have no hover).
//   <img data-anim="0025" data-anim-mode="swap">  plays the GIF in place, back to the still on leave
//   <img data-anim="0025">                         grows into a big floating preview playing the GIF
// Uses event delegation, so thumbnails added later (picker results, live search) work too.
(() => {
  if (!window.matchMedia('(hover: hover)').matches) return;
  const gifUrl = (id) => `/media/${encodeURIComponent(id)}/gif`;
  const SIZE = 240;
  let pop = null;
  let current = null;

  function showPop(el) {
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'anim-pop';
      pop.setAttribute('aria-hidden', 'true');
      pop.innerHTML = '<img alt="">';
    }
    // Inside a modal dialog only the dialog's own layer is painted on top.
    (el.closest('dialog') || document.body).appendChild(pop);
    const img = pop.querySelector('img');
    img.onerror = () => { img.onerror = null; img.src = el.currentSrc || el.src; }; // no GIF: show the still
    img.src = gifUrl(el.dataset.anim);
    const r = el.getBoundingClientRect();
    // Grow out of the thumbnail, kept inside the window.
    const left = Math.min(Math.max(8, r.left), window.innerWidth - SIZE - 8);
    const top = Math.min(Math.max(8, r.top + r.height / 2 - SIZE / 2), window.innerHeight - SIZE - 8);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.transformOrigin = `${r.left - left + r.width / 2}px ${r.top - top + r.height / 2}px`;
    pop.classList.remove('is-open');
    void pop.offsetWidth; // restart the grow transition
    pop.classList.add('is-open');
  }

  function hidePop() {
    if (pop) {
      pop.classList.remove('is-open');
      pop.remove();
    }
  }

  function enter(el) {
    if (el.dataset.animMode === 'swap') {
      el.dataset.still = el.dataset.still || el.currentSrc || el.src;
      el.onerror = () => { el.onerror = null; el.src = el.dataset.still; };
      el.src = gifUrl(el.dataset.anim);
    } else {
      showPop(el);
    }
  }

  function leave(el) {
    if (el.dataset.animMode === 'swap') {
      if (el.dataset.still) el.src = el.dataset.still;
    } else {
      hidePop();
    }
  }

  // Swap targets play while the pointer is anywhere on their card; pop targets only on the thumbnail.
  const targetOf = (node) => {
    if (!(node instanceof Element)) return null;
    const card = node.closest('[data-anim-card]');
    if (card) return card.querySelector('[data-anim]');
    return node.closest('[data-anim]');
  };

  document.addEventListener('mouseover', (e) => {
    const el = targetOf(e.target);
    if (el === current) return;
    if (current) leave(current);
    current = el;
    if (el) enter(el);
  });
  document.addEventListener('mouseout', (e) => {
    if (current && !targetOf(e.relatedTarget)) {
      leave(current);
      current = null;
    }
  });
  // Lists get re-rendered under the pointer (search, picking an exercise): don't leave a preview behind.
  document.addEventListener('click', () => { hidePop(); current = null; }, true);
  window.addEventListener('scroll', hidePop, true);
})();
