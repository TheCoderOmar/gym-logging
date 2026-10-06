// Exercise library: live search and filters. Results are fetched and swapped in place
// (no page reload), and the URL is kept in sync so refresh/back still work.
(() => {
  const form = document.getElementById('ex-filters');
  const results = document.getElementById('results');
  if (!form || !results) return;
  const q = form.elements.q;
  let timer = null;
  let seq = 0;

  function urlFromForm() {
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (v) params.set(k, v);
    return `/exercises${params.toString() ? '?' + params : ''}`;
  }

  // Keep the form in step with a URL (used after "Only mine", "Clear filters", paging).
  function syncForm(url, { keepQuery = false } = {}) {
    const params = new URL(url, location.origin).searchParams;
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el === q && keepQuery) continue; // don't fight the user's typing
      el.value = params.get(el.name) || '';
    }
    markSet();
  }

  function markSet() {
    form.querySelectorAll('select').forEach((s) => s.classList.toggle('is-set', !!s.value));
  }

  async function load(url, { scroll = false, typing = false } = {}) {
    const mine = ++seq;
    results.setAttribute('aria-busy', 'true');
    try {
      const res = await fetch(url, { headers: { Accept: 'text/html' } });
      const html = await res.text();
      if (mine !== seq) return; // a newer search already started
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = doc.getElementById('results');
      if (!next) throw new Error('no results block');
      results.innerHTML = next.innerHTML;
      // The "Add exercise" button carries the search text as a suggested name.
      const add = doc.querySelector('.page-head .btn');
      const curAdd = document.querySelector('.page-head .btn');
      if (add && curAdd) curAdd.href = add.getAttribute('href');
      history.replaceState(null, '', url);
      syncForm(url, { keepQuery: typing });
      if (scroll) form.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (err) {
      location.href = url; // fall back to a normal page load
    } finally {
      if (mine === seq) results.removeAttribute('aria-busy');
    }
  }

  q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(urlFromForm(), { typing: true }), 250);
  });
  form.addEventListener('change', (e) => {
    if (e.target.tagName !== 'SELECT') return;
    markSet();
    load(urlFromForm());
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(timer);
    load(urlFromForm());
  });
  results.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-swap]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    load(a.getAttribute('href'), { scroll: /[?&]page=/.test(a.getAttribute('href')) });
  });
})();
