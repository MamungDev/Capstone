(() => {
  const modal = document.querySelector('#admin-modal');
  const trigger = document.querySelector('[data-admin-open]');
  const form = modal.querySelector('form');
  const status = modal.querySelector('[role="status"]');
  const submit = form.querySelector('[type="submit"]');
  const password = form.querySelector('[name="password"]');
  let pending = false;

  function open() {
    if (modal.dataset.authenticated === 'true') {
      location.href = 'Admin/index.php';
      return;
    }
    modal.showModal();
    document.body.classList.add('auth-open');
    password.focus({ preventScroll: true });
  }
  trigger.addEventListener('click', event => {
    event.preventDefault();
    status.hidden = true;
    open();
  });
  modal.querySelector('.auth-close').addEventListener('click', () => modal.close());
  modal.querySelector('.auth-cancel').addEventListener('click', () => modal.close());
  modal.addEventListener('close', () => {
    if (!document.querySelector('dialog[open]')) document.body.classList.remove('auth-open');
    password.value = '';
    trigger.focus({ preventScroll: true });
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || submit.disabled) return;
    pending = true;
    submit.disabled = true;
    status.hidden = true;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new URLSearchParams(new FormData(form)),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign-in failed. Please try again.');
      location.href = 'Admin/index.php';
    } catch (error) {
      status.textContent = error.message || 'Could not connect. Please try again.';
      status.hidden = false;
      submit.disabled = false;
    } finally {
      pending = false;
    }
  });
  const url = new URL(location.href);
  if (url.searchParams.get('auth') === 'admin') {
    open();
    url.searchParams.delete('auth');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
})();
