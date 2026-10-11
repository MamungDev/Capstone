(() => {
  const config = window.MAKERFLOW_AUTH_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  let client;
  let user = null;
  let busy = false;
  let returnFocus;

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'auth.css';
  document.head.appendChild(stylesheet);

  const modal = document.createElement('dialog');
  modal.className = 'auth-modal';
  modal.setAttribute('aria-labelledby', 'auth-title');
  modal.setAttribute('aria-describedby', 'auth-description');
  modal.innerHTML = `
    <div class="auth-content">
      <button class="auth-close" type="button" aria-label="Close sign-in dialog">×</button>
      <div class="auth-brand" aria-hidden="true">✦</div>
      <p class="auth-eyebrow">YOUR CREATIVE SPACE</p>
      <h2 id="auth-title">A little spark.<br>A place to begin.</h2>
      <p id="auth-description">Sign in to Mamungkun with your Google account to open your creative workspace.</p>
      <button class="auth-google" type="button">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        <span>Continue with Google</span>
      </button>
      <p class="auth-status" role="status" aria-live="polite" hidden></p>
      <p class="auth-note">Use the same button to sign up or sign in.<br>Your briefs are currently saved on this device.</p>
      <button class="auth-cancel" type="button">Back to exploring</button>
    </div>`;
  document.body.appendChild(modal);
  const google = modal.querySelector('.auth-google');
  const status = modal.querySelector('.auth-status');
  const close = () => modal.close();
  modal.querySelector('.auth-close').onclick = close;
  modal.querySelector('.auth-cancel').onclick = close;
  modal.addEventListener('click', event => {
    const rect = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close();
  });
  modal.addEventListener('close', () => {
    document.body.classList.remove('auth-open');
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  });
  function message(text) {
    status.textContent = text;
    status.hidden = !text;
  }
  function setBusy(value) {
    busy = value;
    google.disabled = value;
    google.querySelector('span').textContent = value ? 'Connecting to Google…' : 'Continue with Google';
  }
  function show() {
    returnFocus = document.activeElement;
    message('');
    if (!modal.open) modal.showModal();
    document.body.classList.add('auth-open');
    google.focus();
  }
  function enterWorkspace() {
    if (modal.open) modal.close();
    location.hash = 'builder';
  }
  function updateAccount(nextUser) {
    user = nextUser;
    const avatar = document.querySelector('.shell .avatar');
    if (avatar) {
      const name = user?.user_metadata?.full_name || user?.email || '';
      avatar.textContent = name ? name.slice(0, 2).toUpperCase() : '—';
      avatar.title = name || 'Not signed in';
    }
    signOut.hidden = !user;
  }
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'plain';
  signOut.textContent = 'Sign out';
  signOut.hidden = true;
  document.querySelector('.shell nav .nav').appendChild(signOut);
  signOut.onclick = async () => {
    signOut.disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      updateAccount(null);
      location.hash = 'home';
    } catch {
      show();
      message('We couldn’t sign you out. Please try again.');
    } finally { signOut.disabled = false; }
  };
  updateAccount(null);

  // This controls the interface, not server authorization. Future cloud data
  // must use Supabase row-level security to enforce ownership.
  window.makerflowAuth = {
    isSignedIn: () => Boolean(user),
    open: () => user ? enterWorkspace() : show()
  };

  let clientPromise;
  function getClient() {
    if (!clientPromise) {
      clientPromise = import('https://esm.sh/@supabase/supabase-js@2.57.4').then(({ createClient }) => {
        client = createClient(config.url, config.publishableKey, {
          auth: { flowType: 'pkce', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
        });
        client.auth.onAuthStateChange((_event, session) => {
          updateAccount(session?.user || null);
          if (!session && location.hash === '#builder') location.hash = 'home';
        });
        return client;
      }).catch(error => { clientPromise = null; throw error; });
    }
    return clientPromise;
  }
  google.onclick = async () => {
    if (busy) return;
    if (!configured) {
      message('Google sign-in isn’t connected yet. Please try again once Mamungkun’s sign-in setup is complete.');
      return;
    }
    if (!['http:', 'https:'].includes(location.protocol)) {
      message('Open Mamungkun through localhost or its website address to use Google sign-in.');
      return;
    }
    setBusy(true);
    message('');
    try {
      const authClient = await getClient();
      const redirect = new URL(location.pathname, location.origin);
      redirect.searchParams.set('auth', 'callback');
      const { error } = await authClient.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: redirect.href }
      });
      if (error) throw error;
    } catch {
      message('Couldn’t connect to Google. Check your connection and try again.');
      setBusy(false);
    }
  };

  async function restoreSession() {
    if (!configured || !['http:', 'https:'].includes(location.protocol)) return;
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const code = params.get('code');
    const callback = params.get('auth') === 'callback' || Boolean(code);
    const rejected = params.has('error') || fragment.has('error');
    try {
      const authClient = await getClient();
      if (rejected) throw new Error('Sign-in cancelled');
      if (code) {
        const { error } = await authClient.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }
      const { data, error } = await authClient.auth.getUser();
      if (error || !data.user) {
        if (callback) throw error || new Error('No user returned');
        return;
      }
      updateAccount(data.user);
      if (callback || modal.open) enterWorkspace();
    } catch {
      if (callback || rejected) {
        show();
        message('Sign-in was cancelled or could not be completed. Please try again.');
      }
    } finally {
      if (callback || rejected) {
        history.replaceState(null, '', location.pathname + (user ? '#builder' : '#home'));
        window.dispatchEvent(new Event('hashchange'));
      }
    }
  }
  restoreSession();
})();
