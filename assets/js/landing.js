// Client and Artist sign-in use separate roles in the same PHP session system.
(() => {
  const auth = window.MAMUNGKUN_AUTH;
  const modal = document.querySelector('#auth-modal');
  const find = (selector) => modal.querySelector(selector);
  const form = find('#authEmailForm');
  const name = find('#authName');
  const email = find('#authEmail');
  const password = find('#authPassword');
  const confirm = find('#authConfirm');
  const status = find('.auth-status');
  let selectedRole = null;
  let mode = 'choose';
  let returnFocus;

  function setMode(next) {
    mode = next;
    const choosing = mode === 'choose';
    const signup = mode === 'signup';
    const signin = mode === 'signin';
    password.value = '';
    confirm.value = '';
    confirm.setCustomValidity('');
    status.hidden = true;
    status.textContent = '';
    find('.auth-roles').hidden = !choosing;
    find('.auth-methods').hidden = choosing;

    for (const [field, input, shown] of [
      ['#authNameField', name, signup],
      ['#authEmailField', email, !choosing],
      ['#authPasswordField', password, signin || signup],
      ['#authConfirmField', confirm, signup],
    ]) {
      find(field).hidden = !shown;
      input.disabled = !shown;
      input.required = shown;
    }

    password.minLength = signup ? 8 : 1;
    password.autocomplete = signup ? 'new-password' : 'current-password';
    find('#authPasswordHint').hidden = !signup;
    find('.auth-forgot').hidden = !signin;
    find('.auth-divider span').textContent = signin ? 'New here?' : 'Already have an account?';
    find('.auth-create').textContent = signin
      ? `Create ${selectedRole === 'artist' ? 'an artist' : 'a client'} account`
      : 'Back to sign in';
    find('.auth-submit').textContent = signup
      ? `Create ${selectedRole} account`
      : mode === 'forgot' ? 'Send reset link' : 'Sign in';
    find('#auth-title').innerHTML = choosing ? 'A little spark.<br>A place to begin.'
      : mode === 'forgot' ? 'Let’s get you<br>back in.'
      : signup ? `Create your<br>${selectedRole} account.`
      : selectedRole === 'artist' ? 'Your next<br>creative chapter.' : 'Give your idea<br>a place to begin.';
    find('#auth-description').textContent = choosing ? 'How would you like to join Mamungkun?'
      : mode === 'forgot' ? 'Enter your account email and we’ll send a password reset link.'
      : signup ? 'Start with your name, email, and a password.'
      : `Sign in to your ${selectedRole} workspace with your email and password.`;
    find('.auth-note').textContent = selectedRole === 'artist' && mode !== 'forgot'
      ? 'A space for artists and the ideas they bring to life.'
      : 'A space for your ideas and the people who bring them to life.';

    modal.scrollTop = 0;
    if (modal.open) focusCurrentView();
  }

  function focusCurrentView() {
    (mode === 'choose' ? find('[data-auth-role="artist"]') : mode === 'signup' ? name : email).focus({ preventScroll: true });
  }

  document.querySelectorAll('[data-auth-open]').forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      if (auth.user?.role === 'client' || auth.user?.role === 'artist') {
        location.href = auth.user.role === 'client'
          ? 'Client/Client%20UI.php' : 'Artist/Artist%20UI.php';
        return;
      }
      returnFocus = link;
      selectedRole = null;
      form.reset();
      setMode('choose');
      modal.showModal();
      document.body.classList.add('auth-open');
      focusCurrentView();
    });
  });

  modal.querySelectorAll('[data-auth-role]').forEach((button) => {
    button.addEventListener('click', () => {
      selectedRole = button.dataset.authRole;
      setMode('signin');
    });
  });
  find('.auth-back').addEventListener('click', () => {
    selectedRole = null;
    setMode('choose');
  });
  find('.auth-create').addEventListener('click', () => setMode(mode === 'signin' ? 'signup' : 'signin'));
  find('.auth-forgot').addEventListener('click', () => setMode('forgot'));
  find('.auth-close').addEventListener('click', () => modal.close());
  find('.auth-cancel').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => {
    const rect = modal.getBoundingClientRect();
    if (event.target === modal && (
      event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom
    )) modal.close();
  });
  modal.addEventListener('close', () => {
    document.body.classList.remove('auth-open');
    form.reset();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });

  [password, confirm].forEach((input) => {
    input.addEventListener('input', () => confirm.setCustomValidity(''));
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (mode === 'signup' && password.value !== confirm.value) {
      confirm.setCustomValidity('The passwords don’t match.');
      confirm.reportValidity();
      return;
    }
    if (mode === 'forgot') {
      status.textContent = 'Password reset email is not configured yet. Please contact the app owner.';
      status.hidden = false;
      return;
    }

    const submit = find('.auth-submit');
    submit.disabled = true;
    status.hidden = true;
    try {
      const response = await fetch('auth/account.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: mode,
          role: selectedRole,
          csrf: auth.csrf,
          name: name.value.trim(),
          email: email.value.trim(),
          password: password.value,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Sign-in failed. Please try again.');
      location.href = result.redirect;
    } catch (error) {
      status.textContent = error.message || 'Could not connect. Please try again.';
      status.hidden = false;
      submit.disabled = false;
    }
  });

  setMode('choose');
  const params = new URLSearchParams(location.search);
  if (params.get('auth') === 'client' || params.get('auth') === 'artist') {
    const notices = {
      'google-not-configured': 'Google sign-in needs an OAuth client ID and secret first.',
      'google-expired': 'Google sign-in expired. Please try again.',
      'google-cancelled': 'Google sign-in was cancelled.',
      'google-failed': 'Google sign-in could not finish. Please try again.',
      'client-only': 'That Google account belongs to another role.',
      'email-exists': 'An account already uses that email. Please sign in with its password.',
    };
    selectedRole = params.get('auth');
    setMode('signin');
    if (notices[params.get('notice')]) {
      status.textContent = notices[params.get('notice')];
      status.hidden = false;
    }
    modal.showModal();
    document.body.classList.add('auth-open');
    focusCurrentView();
    history.replaceState(null, '', location.pathname + location.hash);
  }
})();
