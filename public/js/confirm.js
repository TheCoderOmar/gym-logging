// In-app confirmation popup.
//   await confirmDialog({ title, message, confirmLabel, danger })  → true / false
//   <form data-confirm="Message" data-confirm-title="Title" data-confirm-label="Delete">  → asks before submitting
window.confirmDialog = (() => {
  let dlg = null;

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'confirm';
    dlg.setAttribute('aria-labelledby', 'confirm-title');
    dlg.setAttribute('aria-describedby', 'confirm-msg');
    dlg.innerHTML = `
      <form method="dialog">
        <h2 id="confirm-title"></h2>
        <p id="confirm-msg"></p>
        <div class="confirm-actions">
          <button class="btn" value="cancel" data-cancel>Cancel</button>
          <button class="btn" value="ok" data-ok></button>
        </div>
      </form>`;
    // Clicking the dimmed backdrop cancels.
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close('cancel');
    });
    document.body.appendChild(dlg);
  }

  return function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Delete', danger = true } = {}) {
    if (!dlg) build();
    dlg.querySelector('#confirm-title').textContent = title;
    dlg.querySelector('#confirm-msg').textContent = message;
    const ok = dlg.querySelector('[data-ok]');
    ok.textContent = confirmLabel;
    ok.className = danger ? 'btn btn-danger-solid' : 'btn btn-go';
    dlg.returnValue = '';
    dlg.showModal();
    dlg.querySelector('[data-cancel]').focus(); // safe default for a destructive action
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    });
  };
})();

document.addEventListener('submit', async (e) => {
  const form = e.target;
  if (!form.dataset.confirm || form.dataset.confirmed) return;
  e.preventDefault();
  const yes = await window.confirmDialog({
    title: form.dataset.confirmTitle || 'Are you sure?',
    message: form.dataset.confirm,
    confirmLabel: form.dataset.confirmLabel || 'Delete',
  });
  if (!yes) return;
  form.dataset.confirmed = '1';
  form.requestSubmit ? form.requestSubmit() : form.submit();
});
