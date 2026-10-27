(() => {
  document.querySelectorAll('input[type="password"]').forEach((input, index) => {
    if (!input.id) {
      let id = `password-field-${index}`;
      while (document.getElementById(id)) id += '-toggle';
      input.id = id;
    }
    const wrapper = document.createElement('div');
    wrapper.className = 'password-control';
    input.before(wrapper);
    wrapper.append(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'password-toggle';
    button.setAttribute('aria-controls', input.id);
    const field = input.labels?.[0]?.textContent.trim().toLowerCase() || 'password';
    button.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path class="password-toggle-slash" d="m3 3 18 18"/></svg>';
    wrapper.append(button);

    function setVisible(visible) {
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-label', `${visible ? 'Hide' : 'Show'} ${field}`);
      button.title = button.getAttribute('aria-label');
      button.classList.toggle('is-visible', visible);
    }
    button.addEventListener('click', () => {
      if (!input.disabled) setVisible(input.type === 'password');
    });
    input.addEventListener('input', () => {
      if (!input.value) setVisible(false);
    });
    input.form?.addEventListener('reset', () => setVisible(false));
    input.closest('dialog')?.addEventListener('close', () => setVisible(false));
    window.addEventListener('pageshow', () => setVisible(false));
    setVisible(false);
  });
})();
