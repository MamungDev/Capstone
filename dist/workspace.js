import { STATUSES, statusLabel, explainError, getProfile, getApplication, listProjects, projectCounts, getProject, changeStatus, getNote, saveNote, referenceUrl } from './workspace-data.js';
import { renderRegistration, renderApplication } from './registration.js';

const panel = document.createElement('section');
panel.id = 'sharedWorkspace';
panel.className = 'shared-workspace';
panel.hidden = true;
document.querySelector('.shell').appendChild(panel);
const nav = document.createElement('a');
nav.className = 'workspace-nav'; nav.href = '#workspace'; nav.textContent = 'My workspace'; nav.hidden = true;
document.querySelector('.shell nav .nav').prepend(nav);

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const date = value => value ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : '—';
const statusBadge = status => `<span class="ws-status ws-status-${escape(status)}">${escape(statusLabel(status))}</span>`;
let profile = null;
let routeVersion = 0;
let searchVersion = 0;
let query = { search: '', status: '', page: 0 };
let scope = '';
let noteDirty = false;

function empty(title, description, action = '') {
  return `<div class="ws-empty"><span class="ws-empty-symbol" aria-hidden="true">✧</span><h2>${escape(title)}</h2><p>${escape(description)}</p>${action}</div>`;
}

function showError(error, retry) {
  panel.innerHTML = empty('We couldn’t open the workspace', explainError(error), '<button class="continue" id="wsRetry">Try again</button>');
  panel.querySelector('#wsRetry').onclick = retry;
}

function newBrief() {
  window.dispatchEvent(new Event('new-brief'));
  location.hash = 'builder';
}

function shellHeader(artist) {
  return `<div class="ws-heading"><div><div class="eyebrow">${artist ? 'Your creative studio' : 'Your creative projects'}</div><h1>${artist ? 'Good work starts<br>with a <em>clear brief.</em>' : 'Your ideas,<br><em>moving forward.</em>'}</h1><p>${artist ? 'A home for incoming ideas. Review, organize, and keep the work moving.' : 'Follow every brief from its first spark to the finished work.'}</p></div><div class="ws-heading-actions"><span class="ws-role">${artist ? 'Artist workspace' : 'Client workspace'}</span><button class="continue" id="wsNew">+ New brief</button></div></div>`;
}

async function renderList(artist, version) {
  const own = !artist;
  panel.innerHTML = `${shellHeader(artist)}
    <div class="ws-stats" id="wsStats" aria-label="Project overview"><span class="ws-loading" role="status">Loading your overview…</span></div>
    <section class="ws-inbox"><div class="ws-inbox-heading"><div><h2>${artist ? 'The brief inbox' : 'My briefs'}</h2><p>${artist ? 'Every new idea has a place here.' : 'Updates from the studio, all in one place.'}</p></div><button class="small" id="wsRefresh">↻ Refresh</button></div>
      <div class="ws-filters"><label class="ws-search"><span aria-hidden="true">⌕</span><input id="wsSearch" type="search" placeholder="Search names or brief details" aria-label="Search briefs" value="${escape(query.search)}"></label><label class="ws-select">Status<select id="wsFilter"><option value="">All statuses</option>${STATUSES.map(([key, label]) => `<option value="${key}" ${query.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
      <div id="wsResults" aria-live="polite"><p class="ws-loading">Loading briefs…</p></div>
    </section><p class="ws-footnote">${artist ? 'Private notes stay in the studio. Clients can see project status updates.' : 'Your briefs are visible to you and the studio team.'}</p>`;
  panel.querySelector('#wsNew').onclick = newBrief;
  if (!artist && profile.role !== 'artist') {
    const applicationLink = document.createElement('a');
    applicationLink.className = 'reg-account-link'; applicationLink.href = '#application';
    applicationLink.textContent = 'Artist application';
    panel.querySelector('.ws-heading-actions').append(applicationLink);
  }
  const refresh = () => { loadResults(); loadCounts(); };
  panel.querySelector('#wsRefresh').onclick = refresh;
  let timer;
  panel.querySelector('#wsSearch').oninput = event => {
    query.search = event.target.value; query.page = 0;
    clearTimeout(timer); timer = setTimeout(loadResults, 250);
  };
  panel.querySelector('#wsFilter').onchange = event => { query.status = event.target.value; query.page = 0; loadResults(); };

  async function loadCounts() {
    try {
      const counts = await projectCounts(own);
      if (version !== routeVersion) return;
      const totals = [
        ['All briefs', Object.values(counts).reduce((sum, count) => sum + count, 0), 'A little perspective', ''],
        ['New arrivals', counts.new, 'Ready for a first look', 'new'],
        ['In progress', counts.reviewing + counts.in_progress, 'Ideas becoming real', 'active'],
        ['Ready for review', counts.ready_for_review, 'The next conversation', 'ready'],
      ];
      panel.querySelector('#wsStats').innerHTML = totals.map(([label, count, hint, tone]) => `<div class="ws-stat ${tone}"><span>${label}</span><strong>${count}</strong><small>${hint}</small></div>`).join('');
    } catch (error) {
      if (version === routeVersion) panel.querySelector('#wsStats').textContent = explainError(error);
    }
  }
  async function loadResults() {
    const requestVersion = ++searchVersion;
    try {
      const { projects, count } = await listProjects({ ...query, own });
      if (version !== routeVersion || requestVersion !== searchVersion) return;
      const result = panel.querySelector('#wsResults');
      if (!projects.length) {
        result.innerHTML = empty(query.search || query.status ? 'No matching briefs' : 'A little room for your next idea', query.search || query.status ? 'Try a different search or status.' : artist ? 'Client submissions will appear here as soon as they arrive.' : 'Start a brief and share your idea with the studio.');
      } else {
        result.innerHTML = `<div class="ws-table-wrap"><table class="ws-table"><thead><tr><th>Project</th>${artist ? '<th>Client</th>' : ''}<th>Status</th><th>Submitted</th><th><span class="ws-sr">Open brief</span></th></tr></thead><tbody>${projects.map(project => `<tr><td><a class="ws-project-link" href="#project/${encodeURIComponent(project.id)}"><span class="ws-file-icon" aria-hidden="true">${project.image_path || project.image_url ? '▧' : '≡'}</span><span><strong>${escape(project.name)}</strong><small>${escape(project.brief_details?.projectType || (project.mode === 'upload' ? 'Image reference' : 'Creative brief'))}</small></span></a></td>${artist ? `<td><span class="ws-client-name">${escape(project.client?.display_name || project.client?.email || 'Earlier submission')}</span><small class="ws-muted">${escape(project.client?.email || 'No client account linked')}</small></td>` : ''}<td>${statusBadge(project.status)}</td><td class="ws-date">${date(project.created_at)}</td><td><a class="ws-open" href="#project/${encodeURIComponent(project.id)}" aria-label="Open ${escape(project.name)}">↗</a></td></tr>`).join('')}</tbody></table></div>
          <div class="ws-pagination"><span>${query.page * 12 + 1}–${query.page * 12 + projects.length} of ${count} briefs</span><div><button class="small" id="wsPrevious" ${query.page === 0 ? 'disabled' : ''}>← Previous</button><button class="small" id="wsNext" ${(query.page + 1) * 12 >= count ? 'disabled' : ''}>Next →</button></div></div>`;
        result.querySelector('#wsPrevious').onclick = () => { query.page--; loadResults(); };
        result.querySelector('#wsNext').onclick = () => { query.page++; loadResults(); };
      }
    } catch (error) {
      if (version === routeVersion && requestVersion === searchVersion) panel.querySelector('#wsResults').innerHTML = `<p class="ws-error" role="alert">${escape(explainError(error))}</p>`;
    }
  }
  await Promise.all([loadCounts(), loadResults()]);
}

async function renderDetail(id, version) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('This brief link is invalid.');
  const artist = profile.role === 'artist';
  const project = await getProject(id);
  if (version !== routeVersion) return;
  const details = project.brief_details || {};
  const detail = (label, value) => `<div class="ws-detail-field"><dt>${label}</dt><dd>${escape(value || 'Not specified')}</dd></div>`;
  panel.innerHTML = `<a class="ws-back" href="#${artist ? 'artist' : 'client'}">← Back to ${artist ? 'the inbox' : 'my briefs'}</a>
    <div class="ws-detail-heading"><div><div class="eyebrow">${escape(details.projectType || 'Creative brief')}</div><h1>${escape(project.name)}</h1><p>Submitted ${date(project.created_at)}${project.client ? ` · ${escape(project.client.display_name || project.client.email)}` : ' · Earlier submission'}</p></div><div id="wsDetailBadge">${statusBadge(project.status)}</div></div>
    <div class="ws-detail-grid"><div><section class="ws-card"><div class="ws-section-label">01 / The idea</div><h2>The starting point</h2><p class="ws-description">${escape(details.idea || project.description)}</p>${Object.keys(details).length ? `<dl class="ws-detail-fields">${detail('Audience', details.audience)}${detail('Goal', details.goal)}${detail('Format', details.format)}${detail('Visual style', details.style)}${detail('Colour energy', details.energy)}${detail('Keywords', Array.isArray(details.tags) ? details.tags.join(' · ') : '')}</dl>` : ''}</section>
    <section class="ws-card"><div class="ws-section-label">02 / Visual direction</div><div class="ws-card-title"><h2>Reference & inspiration</h2><button class="small" id="wsDownload" hidden>Download reference ↓</button></div><div id="wsReference" class="ws-reference"><p>${project.image_path || project.image_url ? 'Loading reference…' : 'This idea starts with words. No image was attached.'}</p></div><p class="ws-muted">${escape(details.referenceName || '')}</p><p id="wsDownloadMessage" role="status"></p></section></div>
    <aside><section class="ws-card ws-progress-card"><div class="ws-section-label">Project progress</div><h2>${artist ? 'Keep things moving' : 'From spark to finish'}</h2><ol class="ws-timeline">${STATUSES.map(([key, label], index) => `<li class="${index <= STATUSES.findIndex(([value]) => value === project.status) ? 'reached' : ''}"><span>${index + 1}</span>${label}</li>`).join('')}</ol>${artist ? `<label class="ws-form-label" for="wsStatus">Update status</label><select class="ws-control" id="wsStatus">${STATUSES.map(([key, label]) => `<option value="${key}" ${key === project.status ? 'selected' : ''}>${label}</option>`).join('')}</select><button class="continue ws-full" id="wsSaveStatus">Save status</button><p id="wsStatusMessage" role="status"></p>` : '<p class="ws-muted">The studio updates this status as work progresses.</p><button class="small" id="wsReloadDetail">Refresh status</button>'}</section>
    ${artist ? `<section class="ws-card"><div class="ws-section-label">Studio only</div><h2>Private notes</h2><p class="ws-muted">Shared with artists. Never shown to clients.</p><textarea id="wsNote" maxlength="10000" aria-label="Private artist notes" placeholder="First impressions, follow-ups, things to explore…" disabled></textarea><button class="small ws-full" id="wsSaveNote" disabled>Save notes</button><p id="wsNoteMessage" role="status">Loading notes…</p></section><section class="ws-card ws-contact"><div class="ws-section-label">Client</div><h2>${escape(project.client?.display_name || 'Earlier submission')}</h2><p>${escape(project.client?.email || 'This brief was submitted before accounts were linked.')}</p></section>` : ''}
    <p class="ws-id">Brief ID<br>${escape(project.id)}</p></aside></div>`;
  if (!artist) panel.querySelector('#wsReloadDetail').onclick = () => route();
  if (artist) {
    const statusButton = panel.querySelector('#wsSaveStatus');
    statusButton.onclick = async () => {
      statusButton.disabled = true;
      const message = panel.querySelector('#wsStatusMessage');
      message.textContent = 'Saving…';
      try {
        const updated = await changeStatus(id, panel.querySelector('#wsStatus').value);
        if (version !== routeVersion) return;
        panel.querySelector('#wsDetailBadge').innerHTML = statusBadge(updated.status);
        const step = STATUSES.findIndex(([key]) => key === updated.status);
        panel.querySelectorAll('.ws-timeline li').forEach((item, index) => item.classList.toggle('reached', index <= step));
        message.textContent = 'Status saved. Your client can see this update.';
      } catch (error) { message.textContent = explainError(error); } finally { statusButton.disabled = false; }
    };
    const note = panel.querySelector('#wsNote');
    const noteButton = panel.querySelector('#wsSaveNote');
    const message = panel.querySelector('#wsNoteMessage');
    try {
      const existing = await getNote(id);
      if (version !== routeVersion) return;
      note.value = existing?.body || ''; note.disabled = false; noteButton.disabled = false;
      message.textContent = existing ? `Last saved ${date(existing.updated_at)}` : '';
    } catch (error) { message.textContent = explainError(error); }
    note.oninput = () => { noteDirty = true; message.textContent = 'Unsaved changes'; };
    noteButton.onclick = async () => {
      const body = note.value; noteButton.disabled = true; message.textContent = 'Saving…';
      try {
        await saveNote(id, body);
        if (version !== routeVersion) return;
        noteDirty = note.value !== body;
        message.textContent = noteDirty ? 'Saved. You have newer unsaved changes.' : 'Notes saved. Visible only to artists.';
      } catch (error) { message.textContent = explainError(error); } finally { noteButton.disabled = false; }
    };
  }
  if (project.image_path || project.image_url) {
    try {
      const url = await referenceUrl(project);
      if (version !== routeVersion) return;
      const reference = panel.querySelector('#wsReference');
      if (!url) throw new Error('This older reference link is unavailable.');
      const image = document.createElement('img'); image.src = url; image.alt = 'Reference for ' + project.name;
      image.onerror = () => { reference.textContent = 'The reference could not load. Refresh this page to try again.'; };
      reference.replaceChildren(image);
      const download = panel.querySelector('#wsDownload'); download.hidden = false;
      download.onclick = async () => {
        download.disabled = true;
        const message = panel.querySelector('#wsDownloadMessage');
        try {
          const link = await referenceUrl(project, true);
          const response = await fetch(link);
          if (!response.ok) throw new Error('The reference could not be downloaded. Please try again.');
          const blob = await response.blob();
          const href = URL.createObjectURL(blob); const anchor = document.createElement('a');
          anchor.href = href; anchor.download = (details.referenceName || 'reference').replace(/[\\/:*?"<>|]/g, '-');
          document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(href), 10000);
          message.textContent = 'Reference downloaded.';
        } catch (error) { message.textContent = explainError(error); } finally { download.disabled = false; }
      };
    } catch (error) { if (version === routeVersion) panel.querySelector('#wsReference').textContent = explainError(error); }
  }
}

async function route() {
  const version = ++routeVersion;
  await window.makerflowAuth.ready;
  if (version !== routeVersion) return;
  const hash = location.hash.slice(1);
  const dashboard = /^(workspace|artist|client|project|register|application|builder)(\/|$)/.test(hash);
  const signedIn = window.makerflowAuth.isSignedIn();
  nav.hidden = !signedIn;
  panel.hidden = !dashboard || !signedIn;
  document.querySelector('.shell').classList.toggle('workspace-view', dashboard && signedIn);
  if (!signedIn) { profile = null; panel.replaceChildren(); return; }
  if (!dashboard) return;
  noteDirty = false;
  panel.innerHTML = '<div class="ws-loading" role="status">Opening your workspace…</div>';
  try {
    profile = await getProfile();
    if (version !== routeVersion) return;
    const artist = profile.role === 'artist';
    nav.textContent = artist ? 'Artist workspace' : 'My briefs';
    if (!profile.onboarded_at) {
      if (hash !== 'register') history.replaceState(null, '', '#register');
      renderRegistration(panel, profile, null, () => version === routeVersion);
      return;
    }
    if (hash === 'builder') {
      panel.hidden = true;
      document.querySelector('.shell').classList.remove('workspace-view');
      return;
    }
    const application = !artist || hash === 'application' ? await getApplication() : null;
    if (version !== routeVersion) return;
    let target = hash;
    if (hash === 'workspace') {
      const requestedRole = window.makerflowAuth.registrationIntent?.();
      target = requestedRole === 'client' ? 'client' : artist ? 'artist'
        : requestedRole === 'artist' ? (application ? 'application' : 'register')
        : application ? 'application' : 'client';
      window.makerflowAuth.clearRegistrationIntent?.();
      history.replaceState(null, '', '#' + target);
    }
    if (target === 'register' || target === 'application') {
      if (artist || application && (target === 'application' || application.status !== 'rejected')) {
        renderApplication(panel, profile, application, route);
      } else {
        if (target !== 'register') history.replaceState(null, '', '#register');
        renderRegistration(panel, profile, application, () => version === routeVersion);
      }
      return;
    }
    if (target === 'artist' && !artist) {
      panel.innerHTML = empty('This is the artist workspace', 'Your account has client access. Your submitted briefs are in My briefs.', '<a class="continue" href="#client">Go to my briefs</a>');
      return;
    }
    if (target.startsWith('project/')) await renderDetail(target.slice(8), version);
    else {
      if (scope !== target) { query = { search: '', status: '', page: 0 }; scope = target; }
      await renderList(target === 'artist', version);
    }
  } catch (error) { if (version === routeVersion) showError(error, route); }
}

document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (noteDirty && link && link.hash !== location.hash && !confirm('Leave without saving your private notes?')) {
    event.preventDefault(); event.stopImmediatePropagation();
  }
}, true);
window.addEventListener('beforeunload', event => { if (noteDirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('hashchange', route);
// SDK auth callbacks stay synchronous; query the profile after they complete.
let activeAccount = null;
window.addEventListener('account-changed', () => {
  const id = window.makerflowAuth?.currentUser()?.id || null;
  if (activeAccount !== id) { activeAccount = id; setTimeout(route, 0); }
});
route();
