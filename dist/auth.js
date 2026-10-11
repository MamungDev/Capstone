(() => {
  const config = window.MAKERFLOW_AUTH_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  const desktop = Boolean(window.__TAURI__?.core?.invoke);
  const desktopRedirect = 'http://127.0.0.1:18765/?auth=callback';
  let client;
  let clientPromise;
  let user = null;
  let busy = false;
  let returnFocus;
  let cancelDesktopFlow = null;

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
      <button class="auth-close" type="button" aria-label="Close sign-in dialog">&times;</button>
      <div class="auth-brand" aria-hidden="true">&#10022;</div>
      <p class="auth-eyebrow">YOUR CREATIVE SPACE</p>
      <h2 id="auth-title">A little spark.<br>A place to begin.</h2>
      <p id="auth-description">Sign in to Mamungkun with your Google account to open your creative workspace.</p>
      <button class="auth-google" type="button">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.88 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        <span>Continue with Google</span>
      </button>
      <p class="auth-status" role="status" aria-live="polite" hidden></p>
      <p class="auth-note">Use the same button to sign up or sign in.<br>Your briefs are saved on this device.</p>
      <button class="auth-cancel" type="button">Back to exploring</button>
    </div>`;
  document.body.appendChild(modal);
  const google = modal.querySelector('.auth-google');
  const status = modal.querySelector('.auth-status');
  const signOut = document.createElement('button');
  signOut.type = 'button';
  signOut.className = 'plain';
  signOut.textContent = 'Sign out';
  signOut.hidden = true;
  document.querySelector('.shell nav .nav').appendChild(signOut);

  function message(value) {
    status.textContent = value;
    status.hidden = !value;
  }
  function setBusy(value) {
    busy = value;
    google.disabled = value;
    google.querySelector('span').textContent = value ? 'Connecting to Google...' : 'Continue with Google';
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
      avatar.textContent = name ? name.slice(0, 2).toUpperCase() : '--';
      avatar.title = name || 'Not signed in';
    }
    signOut.hidden = !user;
  }

  modal.querySelector('.auth-close').onclick = () => modal.close();
  modal.querySelector('.auth-cancel').onclick = () => modal.close();
  modal.addEventListener('click', event => {
    const rect = modal.getBoundingClientRect();
    if (event.target === modal && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) modal.close();
  });
  modal.addEventListener('close', () => {
    document.body.classList.remove('auth-open');
    if (cancelDesktopFlow) cancelDesktopFlow();
    if (returnFocus && returnFocus.isConnected) returnFocus.focus();
  });
  signOut.onclick = async () => {
    signOut.disabled = true;
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      updateAccount(null);
      location.hash = 'home';
    } catch {
      show();
      message('We could not sign you out. Please try again.');
    } finally {
      signOut.disabled = false;
    }
  };
  updateAccount(null);
  window.makerflowAuth = {
    isSignedIn: () => Boolean(user),
    open: () => user ? enterWorkspace() : show()
  };

  function getClient() {
    if (!clientPromise) {
      clientPromise = import('./supabase-client.js').then(({ createClient }) => {
        client = createClient(config.url, config.publishableKey, {
          auth: {
            flowType: 'pkce',
            detectSessionInUrl: false,
            persistSession: true,
            autoRefreshToken: true
          }
        });
        client.auth.onAuthStateChange((_event, session) => {
          updateAccount(session?.user || null);
          if (!session && location.hash === '#builder') location.hash = 'home';
        });
        return client;
      }).catch(error => {
        clientPromise = null;
        throw error;
      });
    }
    return clientPromise;
  }

  async function startDesktopSignIn(authClient) {
    const tauri = window.__TAURI__;
    let port = null;
    let unlisten = null;
    let active = true;
    const cleanup = async () => {
      if (!active) return;
      active = false;
      cancelDesktopFlow = null;
      if (unlisten) unlisten();
      if (port) {
        try { await tauri.core.invoke('cancel_oauth', { port }); } catch { /* callback already closed it */ }
      }
      setBusy(false);
    };
    cancelDesktopFlow = cleanup;
    try {
      unlisten = await tauri.event.listen('mamungkun-oauth-callback', async event => {
        if (!active) return;
        try {
          const callback = new URL(event.payload);
          if (callback.origin !== `http://127.0.0.1:${port}` || callback.pathname !== '/' || callback.searchParams.get('auth') !== 'callback') return;
          if (callback.searchParams.has('error')) throw new Error('Google sign-in was cancelled.');
          const code = callback.searchParams.get('code');
          if (!code) throw new Error('Google did not return a sign-in code.');
          const { error } = await authClient.auth.exchangeCodeForSession(code);
          if (!active) return;
          if (error) throw error;
          const { data, error: userError } = await authClient.auth.getUser();
          if (!active) return;
          if (userError || !data.user) throw userError || new Error('No user returned');
          updateAccount(data.user);
          await cleanup();
          enterWorkspace();
        } catch {
          await cleanup();
          message('Sign-in could not be completed. Check Supabase redirect settings and try again.');
        }
      });
      port = await tauri.core.invoke('start_oauth');
      if (!active) {
        try { await tauri.core.invoke('cancel_oauth', { port }); } catch { /* already stopped */ }
        return;
      }
      const { data, error } = await authClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: desktopRedirect, skipBrowserRedirect: true }
      });
      if (!active) return;
      if (error || !data?.url) throw error || new Error('No sign-in URL returned');
      await tauri.core.invoke('open_login_url', { url: data.url });
      message('Finish signing in in your browser, then return to Mamungkun.');
    } catch {
      await cleanup();
      message('Could not start Google sign-in. Check your connection and try again.');
    }
  }

  google.onclick = async () => {
    if (busy) return;
    if (!configured) {
      message('Google sign-in is not connected yet. Add your Supabase project URL and publishable key.');
      return;
    }
    if (!desktop && !['http:', 'https:'].includes(location.protocol)) {
      message('Open Mamungkun through localhost to use Google sign-in.');
      return;
    }
    setBusy(true);
    message('');
    try {
      const authClient = await getClient();
      if (!modal.open) { setBusy(false); return; }
      if (desktop) {
        await startDesktopSignIn(authClient);
        return;
      }
      const redirect = new URL(location.pathname, location.origin);
      redirect.searchParams.set('auth', 'callback');
      const { error } = await authClient.auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: redirect.href }
      });
      if (error) throw error;
    } catch {
      message('Could not connect to Google. Check your connection and try again.');
      setBusy(false);
    }
  };

  async function restoreSession() {
    if (!configured) return;
    if (!desktop && !['http:', 'https:'].includes(location.protocol)) return;
    const params = new URLSearchParams(location.search);
    const fragment = new URLSearchParams(location.hash.slice(1));
    const code = params.get('code');
    const callback = !desktop && (params.get('auth') === 'callback' || Boolean(code));
    const rejected = !desktop && (params.has('error') || fragment.has('error'));
    try {
      const authClient = await getClient();
      if (rejected) throw new Error('Sign-in cancelled');
      if (code && callback) {
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
