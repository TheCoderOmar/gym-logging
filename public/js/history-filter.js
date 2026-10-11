// History and Home's recent list: the All / Workouts / Sports filter and the pager
// swap the list in place (no page reload) and keep the address bar in sync.
(() => {
  document.addEventListener('click', async (e) => {
    const link = e.target.closest('.history-list a[data-fragment]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    const list = link.closest('.history-list');
    try {
      const res = await fetch(link.dataset.fragment);
      if (!res.ok) throw new Error(res.status);
      const tmp = document.createElement('div');
      tmp.innerHTML = (await res.text()).trim();
      const next = tmp.firstElementChild;
      list.replaceWith(next);
      history.replaceState(null, '', link.getAttribute('href'));
      next.querySelector('[aria-current="true"]')?.focus();
    } catch (err) {
      location.href = link.href; // fall back to a normal page load
    }
  });
})();
