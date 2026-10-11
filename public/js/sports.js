// Log sport form: show the picked sport's "Works most" list; quick duration buttons.
(() => {
  for (const form of document.querySelectorAll('.sport-form')) {
    const works = form.querySelectorAll('[data-works]');
    form.addEventListener('change', (e) => {
      if (e.target.name !== 'sport') return;
      works.forEach((w) => { w.hidden = w.dataset.works !== e.target.value; });
    });
    form.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-minutes]');
      if (!chip) return;
      const m = Number(chip.dataset.minutes);
      form.querySelector('[name="hours"]').value = Math.floor(m / 60);
      form.querySelector('[name="minutes"]').value = m % 60;
    });
  }
})();
