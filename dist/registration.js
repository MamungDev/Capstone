import { completeRegistration, explainError } from './workspace-data.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function renderRegistration(panel, profile, application, isCurrent) {
  const applying = Boolean(profile.onboarded_at);
  const approvedArtist = profile.role === 'artist';
  const signupChoice = window.makerflowAuth.currentUser()?.user_metadata?.requested_account_type;
  const initialRole = approvedArtist || applying ? 'artist' : window.makerflowAuth.registrationIntent?.()
    || (['artist','client'].includes(signupChoice) ? signupChoice : 'client');
  const artistFields = initialRole === 'artist' && !approvedArtist;
  const submitLabel = type => approvedArtist ? 'Open my artist workspace' : type === 'artist' ? 'Submit artist application' : 'Open my client workspace';
  panel.innerHTML = `<div class="reg-layout"><header class="reg-intro"><div class="eyebrow">A little introduction</div>
    <h1>${applying ? 'Bring your<br><em>creative perspective.</em>' : 'Your next chapter<br><em>starts here.</em>'}</h1>
    <p>${applying ? 'Apply to join the studio. You can keep using your client workspace while we review your application.' : 'Tell us a little about yourself so we can open the right workspace for you.'}</p>
    <div class="reg-note">${approvedArtist ? 'Your artist account is already approved. Confirm your name to continue.' : 'Artist access is reviewed by the app owner. Choosing artist does not immediately unlock client briefs.'}</div>
    ${applying ? '<a class="ws-back" href="#client">Back to my briefs</a>' : ''}</header>
    <form class="ws-card reg-form" id="registrationForm"><label for="regName">What should we call you?</label>
      <input class="ws-control" id="regName" name="display_name" autocomplete="name" required maxlength="100" value="${escape(profile.display_name)}">
      <p class="reg-email">Signed in as ${escape(profile.email || 'your account')}</p>
      <fieldset class="reg-choices"><legend>I'm here as a...</legend>
        <label class="reg-choice"><input type="radio" name="account_type" value="client" ${initialRole === 'client' ? 'checked' : ''} ${applying || approvedArtist ? 'disabled' : ''}><span><strong>Client</strong><small>I have an idea and need an artist.</small></span></label>
        <label class="reg-choice"><input type="radio" name="account_type" value="artist" ${initialRole === 'artist' ? 'checked' : ''}><span><strong>Artist</strong><small>I want to help bring ideas to life.</small></span></label>
      </fieldset>
      <div id="regArtistFields" ${artistFields ? '' : 'hidden'}>
        <label for="regPortfolio">Portfolio link <span>(optional)</span></label>
        <input class="ws-control" id="regPortfolio" name="portfolio" type="url" maxlength="2000" placeholder="https://your-portfolio.com" value="${escape(application?.portfolio_url)}" ${artistFields ? '' : 'disabled'}>
        <label for="regIntroduction">Introduce your work <span>(optional)</span></label>
        <textarea class="ws-control" id="regIntroduction" name="introduction" maxlength="2000" placeholder="Your creative interests, experience, or favorite kinds of projects." ${artistFields ? '' : 'disabled'}>${escape(application?.introduction)}</textarea>
        <p class="reg-hint">Approved studio artists can view all submitted briefs, client contact details, and studio notes.</p>
      </div>
      <p id="regError" class="reg-error" role="alert"></p>
      <button type="submit" class="continue ws-full" id="regSubmit">${submitLabel(initialRole)}</button>
      <p class="reg-hint">Your choice and profile are saved to your account, not just this device.</p>
    </form></div>`;
  const form = panel.querySelector('#registrationForm');
  const button = panel.querySelector('#regSubmit');
  const errorBox = panel.querySelector('#regError');
  form.addEventListener('change', () => {
    const artist = form.elements.account_type.value === 'artist' && !approvedArtist;
    panel.querySelector('#regArtistFields').hidden = !artist;
    form.elements.portfolio.disabled = !artist;
    form.elements.introduction.disabled = !artist;
    button.textContent = submitLabel(form.elements.account_type.value);
  });
  let saving = false;
  form.onsubmit = async event => {
    event.preventDefault();
    if (saving) return;
    const name = form.elements.display_name.value.trim();
    const type = form.elements.account_type.value;
    const portfolio = type === 'artist' ? form.elements.portfolio.value.trim() : '';
    if (!name) { errorBox.textContent = 'Please enter your display name.'; form.elements.display_name.focus(); return; }
    if (portfolio) {
      try {
        const url = new URL(portfolio);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
      } catch { errorBox.textContent = 'Use a full http:// or https:// portfolio URL.'; form.elements.portfolio.focus(); return; }
    }
    saving = true; button.disabled = true; errorBox.textContent = ''; button.textContent = 'Saving your profile...';
    try {
      await completeRegistration({p_display_name:name,p_account_type:type,p_portfolio_url:portfolio || null,
        p_introduction:type === 'artist' ? form.elements.introduction.value.trim() : ''});
      if (isCurrent()) {
        window.makerflowAuth.clearRegistrationIntent?.();
        location.hash = approvedArtist ? 'artist' : type === 'artist' ? 'application' : 'client';
      }
    } catch (error) {
      if (isCurrent()) errorBox.textContent = explainError(error);
    } finally {
      saving = false; button.disabled = false;
      button.textContent = submitLabel(type);
    }
  };
}

export function renderApplication(panel, profile, application, refresh) {
  const approved = profile.role === 'artist';
  const rejected = application?.status === 'rejected';
  const title = approved ? 'Welcome to the studio.' : rejected ? 'An update on your application.' : 'Your application is with us.';
  const copy = approved ? 'Your artist access is ready. Open the studio to review incoming briefs.' : rejected
    ? 'Your application was not approved this time. You can update your details and apply again, or continue as a client.'
    : 'The app owner will review your artist application. You can still create and track your own briefs while you wait.';
  panel.innerHTML = `<div class="ws-empty reg-status"><span class="ws-role">${approved ? 'Approved artist' : rejected ? 'Application not approved' : 'Pending review'}</span>
    <h1>${title}</h1><p>${copy}</p>
    ${application?.review_message ? `<blockquote class="reg-review">${escape(application.review_message)}</blockquote>` : ''}
    <div class="reg-actions"><a class="continue" href="#${approved ? 'artist' : 'client'}">${approved ? 'Open artist workspace' : 'Continue to my briefs'}</a>
      ${rejected ? '<a class="small" href="#register">Update and apply again</a>' : ''}
      ${!approved ? '<button class="small" id="regRefresh">Check application status</button>' : ''}</div>
    ${!approved ? '<p class="reg-hint">Approval is not automatic. Check back here for updates.</p>' : ''}</div>`;
  panel.querySelector('#regRefresh')?.addEventListener('click', refresh);
}
