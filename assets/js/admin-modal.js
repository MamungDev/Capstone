(() => {
  const modal = document.querySelector('#admin-modal');
  const trigger = document.querySelector('[data-admin-open]');
  if (!modal || !trigger) return;
  const status = modal.querySelector('[role="status"]');

  function open() {
    if (modal.dataset.authenticated === 'true') {
      location.href = 'Admin/index.php';
      return;
    }
    modal.showModal();
    document.body.classList.add('auth-open');
    (modal.querySelector('a.auth-google') || modal.querySelector('.auth-close')).focus({ preventScroll: true });
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
    trigger.focus({ preventScroll: true });
  });
  const url = new URL(location.href);
  if (url.searchParams.get('auth') === 'admin') {
    open();
    url.searchParams.delete('auth');
    url.searchParams.delete('notice');
    history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
})();
