(() => {
  const config = window.MAKERFLOW_AUTH_CONFIG || {};
  const configured = Boolean(config.url && config.publishableKey);
  let clientPromise;
  let user = null;
  let busy = false;
  let selectedRole = null;
  let mode = 'choose';
  let returnFocus;
  let recovery = false;
  let resendAfter = 0;
  const intentKey = 'mamungkun-auth-intent-v1';
  let intent = null;
  try { intent = JSON.parse(sessionStorage.getItem(intentKey)); } catch { /* optional preference */ }
  function validIntent() {
    return intent && ['artist', 'client'].includes(intent.role)
      && Date.now() - intent.createdAt < 60 * 60 * 1000
      && (!intent.userId || intent.userId === user?.id) ? intent : null;
  }
  function saveIntent(value) {
    intent = value;
    try {
      if (value) sessionStorage.setItem(intentKey, JSON.stringify(value));
      else sessionStorage.removeItem(intentKey);
    } catch { /* The registration form can ask again. */ }
  }
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = 'auth.css'; document.head.appendChild(stylesheet);
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
      <p id="auth-description">How would you like to join Mamungkun?</p>
      <div class="auth-roles" aria-label="Choose your workspace">
        <button class="auth-role" type="button" data-auth-role="artist"><span class="auth-role-symbol" aria-hidden="true">✧</span><strong>Artist</strong><span>Bring ideas to life.</span><span class="auth-role-arrow" aria-hidden="true">→</span></button>
        <button class="auth-role" type="button" data-auth-role="client"><span class="auth-role-symbol" aria-hidden="true">✦</span><strong>Client</strong><span>Find a home for your idea.</span><span class="auth-role-arrow" aria-hidden="true">→</span></button>
      </div>
      <div class="auth-methods" hidden>
        <button class="auth-back" type="button">← Choose Artist or Client</button>
        <form id="authEmailForm" class="auth-email-form">
          <div id="authNameField" class="auth-field" hidden><label for="authName">Your name</label><input id="authName" name="name" autocomplete="name" maxlength="100"></div>
          <div id="authEmailField" class="auth-field"><label for="authEmail">Email address</label><input id="authEmail" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></div>
          <div id="authPasswordField" class="auth-field"><label for="authPassword">Password</label><input id="authPassword" name="password" type="password" autocomplete="current-password" required><small id="authPasswordHint" hidden>Use at least 8 characters.</small></div>
          <div id="authConfirmField" class="auth-field" hidden><label for="authConfirm">Confirm password</label><input id="authConfirm" name="confirm" type="password" autocomplete="new-password"></div>
          <button class="auth-forgot" type="button">Forgot password?</button>
          <button class="auth-submit" type="submit">Sign in</button>
        </form>
        <button class="auth-resend" type="button" hidden>Resend confirmation email</button>
        <div class="auth-divider"><span>New here?</span></div>
        <button class="auth-create" type="button">Create an account</button>
      </div>
      <p class="auth-status" role="status" aria-live="polite" hidden></p>
      <p class="auth-note">A space for your ideas and the people who bring them to life.</p>
      <button class="auth-cancel" type="button">Back to exploring</button>
    </div>`;
  document.body.appendChild(modal);
  const find = selector => modal.querySelector(selector);
  const form = find('#authEmailForm');
  const email = find('#authEmail');
  const password = find('#authPassword');
  const confirm = find('#authConfirm');
  const name = find('#authName');
  const status = find('.auth-status');
  const signOut = document.createElement('button');
  signOut.type = 'button'; signOut.className = 'plain'; signOut.textContent = 'Sign out'; signOut.hidden = true;
  document.querySelector('.shell nav .nav').appendChild(signOut);
  function message(text, error = false) {
    status.textContent = text; status.hidden = !text;
    status.setAttribute('role', error ? 'alert' : 'status');
  }
  function paint() {
    const choosing = mode === 'choose';
    const signup = mode === 'signup';
    const resetting = mode === 'recovery';
    find('.auth-roles').hidden = !choosing;
    find('.auth-methods').hidden = choosing;
    find('.auth-back').hidden = resetting;
    form.hidden = mode === 'verify';
    const showEmail = ['signin','signup','forgot'].includes(mode);
    const showPassword = ['signin','signup','recovery'].includes(mode);
    const showConfirm = signup || resetting;
    for (const [field, input, shown] of [
      ['#authNameField',name,signup], ['#authEmailField',email,showEmail],
      ['#authPasswordField',password,showPassword], ['#authConfirmField',confirm,showConfirm]
    ]) {
      find(field).hidden = !shown; input.disabled = !shown || busy; input.required = shown;
    }
    password.minLength = signup || resetting ? 8 : 1;
    password.autocomplete = signup || resetting ? 'new-password' : 'current-password';
    find('#authPasswordHint').hidden = !showConfirm;
    find('.auth-forgot').hidden = mode !== 'signin';
    find('.auth-resend').hidden = mode !== 'verify';
    find('.auth-divider').hidden = resetting;
    find('.auth-create').hidden = resetting;
    find('.auth-divider span').textContent = mode === 'signin' ? 'New here?' : 'Already have an account?';
    find('.auth-create').textContent = mode === 'signin' ? `Create ${selectedRole === 'artist' ? 'an artist' : 'a client'} account` : 'Back to sign in';
    const label = {signin:'Sign in',signup:`Create ${selectedRole === 'artist' ? 'artist' : 'client'} account`,forgot:'Send reset link',recovery:'Save new password'};
    find('.auth-submit').textContent = busy ? 'Please wait...' : label[mode] || 'Continue';
    find('#auth-title').innerHTML = choosing ? 'A little spark.<br>A place to begin.'
      : mode === 'forgot' ? 'Let’s get you<br>back in.' : resetting ? 'A fresh start.<br>A new password.'
      : mode === 'verify' ? 'Check your inbox.' : signup ? `Create your<br>${selectedRole} account.`
      : selectedRole === 'artist' ? 'Your next<br>creative chapter.' : 'Give your idea<br>a place to begin.';
    find('#auth-description').textContent = choosing ? 'How would you like to join Mamungkun?'
      : mode === 'forgot' ? 'Enter your account email and we’ll send a password reset link.'
      : resetting ? 'Choose a new password for your account.'
      : mode === 'verify' ? 'Follow the confirmation link in your email, then sign in to finish your profile.'
      : signup ? 'Start with your name, email, and a password.' : `Sign in to your ${selectedRole} workspace with your email and password.`;
    find('.auth-note').textContent = selectedRole === 'artist' && !['forgot','recovery'].includes(mode)
      ? 'New artist accounts need studio approval before opening client briefs.'
      : 'A space for your ideas and the people who bring them to life.';
    modal.querySelectorAll('button').forEach(button => {
      if (!button.matches('.auth-close, .auth-cancel')) button.disabled = busy;
    });
  }
  function setMode(next) {
    mode = next; password.value = ''; confirm.value = ''; message(''); paint();
    if (modal.open) (mode === 'choose' ? find('[data-auth-role="artist"]') : mode === 'recovery' ? password : mode === 'signup' ? name : email).focus();
  }
  function setBusy(value) { busy = value; paint(); }
  function show(next = 'choose') {
    returnFocus = document.activeElement;
    if (!busy) {
      if (next === 'choose') { selectedRole = null; saveIntent(null); }
      setMode(next);
    }
    if (!modal.open) modal.showModal();
    document.body.classList.add('auth-open');
    (mode === 'choose' ? find('[data-auth-role="artist"]') : mode === 'recovery' ? password : email).focus();
  }
  function enterWorkspace() {
    recovery = false;
    if (modal.open) modal.close();
    location.hash = 'workspace';
  }
  function updateAccount(nextUser) {
    user = nextUser;
    if (user && validIntent() && !intent.userId) saveIntent({ ...intent, userId:user.id });
    const avatar = document.querySelector('.shell .avatar');
    if (avatar) {
      const display = user?.user_metadata?.full_name || user?.email || '';
      avatar.textContent = display ? display.slice(0,2).toUpperCase() : '--';
      avatar.title = display || 'Not signed in';
    }
    signOut.hidden = !user;
    window.dispatchEvent(new CustomEvent('account-changed'));
  }
  function redirectURL(kind) {
    if (!['http:','https:'].includes(location.protocol)) return undefined;
    const redirect = new URL(location.pathname,location.origin);
    redirect.searchParams.set('auth',kind);
    return redirect.href;
  }
  function friendlyError(error) {
    if (error?.code === 'email_not_confirmed' || error?.message === 'Email not confirmed') return 'Please confirm your email before signing in. You can resend the confirmation below.';
    if (error?.status === 429) return 'Too many attempts. Please wait a little before trying again.';
    if (error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials') return 'That email or password doesn’t match. Please try again.';
    return error?.message || 'We couldn’t connect. Please try again.';
  }
  modal.querySelectorAll('[data-auth-role]').forEach(button => {
    button.onclick = () => { selectedRole = button.dataset.authRole; setMode('signin'); };
  });
  find('.auth-back').onclick = () => { if (!busy) { selectedRole = null; saveIntent(null); setMode('choose'); } };
  find('.auth-create').onclick = () => { if (!busy) setMode(mode === 'signin' ? 'signup' : 'signin'); };
  find('.auth-forgot').onclick = () => { if (!busy) setMode('forgot'); };
  find('.auth-close').onclick = () => modal.close();
  find('.auth-cancel').onclick = () => modal.close();
  modal.addEventListener('click',event => {
    const rect=modal.getBoundingClientRect();
    if (event.target===modal && (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom)) modal.close();
  });
  modal.addEventListener('close',() => {
    document.body.classList.remove('auth-open'); password.value=''; confirm.value='';
    if (returnFocus?.isConnected) returnFocus.focus();
  });
  signOut.onclick = async () => {
    signOut.disabled=true;
    try {
      const { error }=await (await getClient()).auth.signOut({scope:'local'});
      if (error) throw error;
      saveIntent(null); recovery=false; updateAccount(null); location.hash='home';
    } catch (error) { show(); message(friendlyError(error),true); }
    finally { signOut.disabled=false; }
  };
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    if (!configured) { message('Sign-in is not connected yet. Please contact the app owner.',true); return; }
    const action=mode;
    const address=email.value.trim();
    const secret=password.value;
    const displayName=name.value.trim();
    if (['signup','recovery'].includes(action) && secret!==confirm.value) {
      message('The passwords don’t match.',true); confirm.focus(); return;
    }
    if (action==='signup' && !displayName) { message('Please enter your name.',true); name.focus(); return; }
    setBusy(true); message('');
    try {
      const client=await getClient();
      if (action==='forgot') {
        const {error}=await client.auth.resetPasswordForEmail(address,{redirectTo:redirectURL('recovery')});
        if (error) throw error;
        message('If an account uses that email, a password reset link will arrive shortly.');
      } else if (action==='recovery') {
        if (!user || !recovery) throw new Error('Please open a fresh password reset link from your email.');
        const {error}=await client.auth.updateUser({password:secret});
        if (error) throw error;
        recovery=false; password.value=''; confirm.value=''; enterWorkspace();
      } else {
        saveIntent({role:selectedRole,createdAt:Date.now(),userId:null});
        const result=action==='signup'
          ? await client.auth.signUp({email:address,password:secret,options:{emailRedirectTo:redirectURL('confirm'),data:{full_name:displayName,requested_account_type:selectedRole}}})
          : await client.auth.signInWithPassword({email:address,password:secret});
        if (result.error) throw result.error;
        password.value=''; confirm.value='';
        if (result.data.session && result.data.user) {
          updateAccount(result.data.user); enterWorkspace();
        } else if (action==='signup') {
          resendAfter=Date.now()+60000; setMode('verify');
          message('Check your email for a confirmation link. If you already have an account, sign in or reset your password.');
        } else throw new Error('Sign-in did not complete. Please try again.');
      }
    } catch (error) {
      if (error?.code==='email_not_confirmed' || error?.message==='Email not confirmed') setMode('verify');
      message(friendlyError(error),true);
    } finally { setBusy(false); }
  };
  find('.auth-resend').onclick = async () => {
    if (busy) return;
    if (Date.now()<resendAfter) { message('Please wait a minute before requesting another email.'); return; }
    setBusy(true); message('');
    try {
      const {error}=await (await getClient()).auth.resend({type:'signup',email:email.value.trim(),options:{emailRedirectTo:redirectURL('confirm')}});
      if(error) throw error;
      resendAfter=Date.now()+60000; message('If confirmation is needed, a new email will arrive shortly.');
    } catch(error) { message(friendlyError(error),true); }
    finally { setBusy(false); }
  };
  updateAccount(null); paint();
  window.makerflowAuth={
    isSignedIn:()=>Boolean(user), currentUser:()=>user, getClient,
    open:()=>recovery ? show('recovery') : user ? enterWorkspace() : show(),
    registrationIntent:()=>validIntent()?.role || null,
    clearRegistrationIntent:()=>saveIntent(null)
  };
  function getClient() {
    if(!clientPromise) {
      clientPromise=import('./supabase-client.js').then(({createClient})=>{
        const client=createClient(config.url,config.publishableKey,{auth:{flowType:'implicit',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
        client.auth.onAuthStateChange((event,session)=>{
          updateAccount(session?.user || null);
          if(event==='PASSWORD_RECOVERY') { recovery=true; setTimeout(()=>show('recovery'),0); }
          if(!session && /^#(workspace|artist|client|project|register|application)(\/|$)/.test(location.hash)) location.hash='home';
        });
        return client;
      }).catch(error=>{clientPromise=null;throw error;});
    }
    return clientPromise;
  }
  async function restoreSession() {
    if(!configured) return;
    const params=new URLSearchParams(location.search);
    const fragment=new URLSearchParams(location.hash.slice(1));
    const code=params.get('code');
    const accessToken=fragment.get('access_token');
    const refreshToken=fragment.get('refresh_token');
    const callback=params.has('auth') || Boolean(code || accessToken || fragment.has('error'));
    const resetLink=params.get('auth')==='recovery' || fragment.get('type')==='recovery';
    const rejected=params.has('error') || fragment.has('error');
    // Remove callback tokens from the address bar before any asynchronous work.
    if(callback) history.replaceState(null,'',location.pathname+'#home');
    try {
      const client=await getClient();
      if(rejected) throw new Error('This email link is invalid or expired. Please request a new one.');
      if(accessToken && refreshToken) {
        const {error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});
        if(error) throw error;
      } else if(code) {
        const {error}=await client.auth.exchangeCodeForSession(code);
        if(error) throw error;
      }
      const {data,error}=await client.auth.getUser();
      if(error || !data.user) {
        if([401,403,404].includes(error?.status) || error?.code==='user_not_found') {
          await client.auth.signOut({scope:'local'}); updateAccount(null);
        }
        if(callback) throw new Error('Please sign in after confirming your email, or request a new reset link.');
        return;
      }
      updateAccount(data.user);
      if(callback && resetLink) { recovery=true; show('recovery'); }
      else if(callback) enterWorkspace();
    } catch(error) {
      if(callback) { show(); message(friendlyError(error),true); }
    } finally {
      if(callback) window.dispatchEvent(new Event('hashchange'));
    }
  }
  window.makerflowAuth.ready=restoreSession();
})();
