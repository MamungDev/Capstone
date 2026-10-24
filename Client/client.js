// Drafts stay in this browser; submitted snapshots are saved to the client account.
(async () => {
  const storageKey = 'capstone-client-brief-v1:' + window.CLIENT_SESSION.id;
  const defaults = {
    flowVersion: 2, step: 1, submitted: false,
    projectName: '', projectType: 'Poster', idea: '',
    audience: '', goal: '', tags: [], format: 'Poster · 4:5',
    style: 'Hand-crafted', energy: 'Warm & rich',
    references: [],
    submissionId: null, pendingId: null, pendingSignature: null, accessCode: null
  };
  let stored = {};
  let loadWarning = '';
  const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  try {
    const persisted = await window.clientDraftStore.load(storageKey);
    const raw = persisted ? null : localStorage.getItem(storageKey);
    const parsed = persisted || (raw ? JSON.parse(raw) : {});
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch {
    loadWarning = 'Your saved draft could not be read. You can still work in this session.';
    try { stored = JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { stored = {}; }
  }
  function normalizeBrief(stored) {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
    let brief = { ...defaults, ...stored };
    for (const key of ['projectName', 'projectType', 'idea', 'audience', 'goal', 'format', 'style', 'energy']) {
      if (typeof brief[key] !== 'string') brief[key] = defaults[key];
    }
    brief.tags = Array.isArray(brief.tags) ? brief.tags.filter(tag => typeof tag === 'string') : [];
    brief.step = [1, 2, 3, 4].includes(brief.step) ? brief.step : 1;
    brief.submitted = brief.submitted === true && /^[a-f0-9]{32}$/.test(brief.submissionId || '');
    const validImage = value => typeof value === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(value);
    const legacy = [];
    if (validImage(stored.reference)) legacy.push({ kind: 'reference', name: stored.referenceName || 'Reference', data: stored.reference });
    if (validImage(stored.sketch)) legacy.push({ kind: 'sketch', name: 'Sketch 1', data: stored.sketch, sketchDocument: stored.sketchDocument });
    const ids = new Set();
    brief.references = (Array.isArray(stored.references) ? stored.references : legacy)
      .filter(item => item && validImage(item.data)).map(item => {
        const id = /^[a-f0-9]{32}$/.test(item.id || '') && !ids.has(item.id) ? item.id : newId(); ids.add(id);
        return { id, name: typeof item.name === 'string' ? item.name.slice(0, 255) : 'Reference', kind: item.kind === 'sketch' ? 'sketch' : 'reference', data: item.data, sketchDocument: item.kind === 'sketch' ? item.sketchDocument : null };
      });
    for (const key of ['reference', 'referenceName', 'sketch', 'sketchDocument']) delete brief[key];
    // Repair only known option values from the previous encoding bug.
    const formatMatch = /^(Poster|Square|Wide|Portrait).* (4:5|1:1|16:9|A4)$/.exec(brief.format);
    brief.format = formatMatch ? `${formatMatch[1]} \u00b7 ${formatMatch[2]}` : defaults.format;
    if (brief.flowVersion !== 2) {
      brief = { ...defaults, ...brief, flowVersion: 2, step: 1, submitted: false };
    }
    return brief;
  }
  let brief = normalizeBrief(stored);
  let renderedStep = null;
  let submitting = false;
  let addingReferences = false;

  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  const saved = document.querySelector('#saved');
  const labels = document.querySelector('.labels');
  const progressEl = document.querySelector('#progress');

  

  let saveRevision = 0;
  const save = async () => {
    const revision = ++saveRevision;
    try {
      saved.textContent = 'Saving draft…';
      await window.clientDraftStore.save(storageKey, brief);
      try { localStorage.removeItem(storageKey); } catch { /* Migration already saved safely. */ }
      if (revision === saveRevision) saved.textContent = brief.submitted ? 'Brief submitted' : 'Draft saved';
      return true;
    } catch {
      if (revision !== saveRevision) return false;
      saved.textContent = 'Not saved';
      say('Browser storage is full or unavailable. Keep this page open; your latest changes are only in this session.');
      return false;
    }
  };
  let toastTimeout;
  const say = message => {
    clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add('show');
    toastTimeout = setTimeout(() => toast.classList.remove('show'), 5000);
  };
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function renderProgress() {
    progressEl.innerHTML = [1, 2, 3, 4].map((number, index) => `
      ${index ? '<span class="line"></span>' : ''}
      <button type="button" class="step ${number < brief.step ? 'done' : ''} ${number === brief.step ? 'active' : ''}" data-go="${number}" aria-label="Go to step ${number}" ${number === brief.step ? 'aria-current="step"' : ''}>${number < brief.step ? '✓' : number}</button>
    `).join('');
    labels.querySelectorAll('span').forEach((label, index) => label.classList.toggle('current', index + 1 === brief.step));
    progressEl.querySelectorAll('[data-go]').forEach(button => {
      button.addEventListener('click', () => {
        if (submitting) return;
        brief.step = Number(button.dataset.go);
        brief.submitted = false;
        save();
        render();
      });
    });
  }

  function footer(backStep, nextText, next) {
    return `<div class="footer">
      <button class="back" id="backButton">${backStep ? '&larr; Back' : 'Save draft & exit'}</button>
      <span class="hint note">Changes save automatically</span>
      <button class="continue" id="nextButton">${nextText}</button>
    </div>`;
  }

  function bindFooter(backStep, next) {
    document.querySelector('#backButton').onclick = async () => {
      if (submitting) return;
      if (!backStep) { if (await save()) location.href = '../index.php'; return; }
      brief.step = backStep; save(); render();
    };
    document.querySelector('#nextButton').onclick = next;
  }

  function renderDescribe() {
    app.innerHTML = `
      <div class="eyebrow">Step 01 — describe</div>
      <h1>Start with <em>the spark.</em></h1>
      <p class="intro">Answer a few quick questions. They give the rest of your brief a clear creative foundation.</p>
      <section class="card question-card">
        <h2>Tell us about the project</h2>
        <p class="subtle" style="margin:0 0 22px">You can keep this rough—plain language is perfect.</p>
        <div class="field-grid">
          <label class="field">Project name<input id="projectName" maxlength="120" placeholder="e.g. Midnight Sessions" value="${escape(brief.projectName)}"></label>
          <label class="field">What are you making?<select id="projectType"><option>Poster</option><option>Social post</option><option>Event identity</option><option>Album cover</option><option>Presentation</option><option>Something else</option></select></label>
          <label class="field full">Describe the idea<textarea id="idea" maxlength="5000" placeholder="What should this feel like? What makes it special?">${escape(brief.idea)}</textarea></label>
          <label class="field">Who is it for?<input id="audience" maxlength="1000" placeholder="e.g. curious late-night music fans" value="${escape(brief.audience)}"></label>
          <label class="field">What should it achieve?<input id="goal" maxlength="1000" placeholder="e.g. get people to the first show" value="${escape(brief.goal)}"></label>
        </div>
      </section>
      ${footer(null, 'Continue to direction')}`;
    document.querySelector('#projectType').value = brief.projectType;
    ['projectName', 'projectType', 'idea', 'audience', 'goal'].forEach(key => {
      document.querySelector('#' + key).oninput = event => { brief[key] = event.target.value; save(); };
      document.querySelector('#' + key).onchange = event => { brief[key] = event.target.value; save(); };
    });
    bindFooter(null, () => {
      if (!brief.projectName.trim() || !brief.idea.trim()) {
        say('Add a project name and a short description to continue.');
        document.querySelector(!brief.projectName.trim() ? '#projectName' : '#idea').focus();
        return;
      }
      brief.step = 2; save(); render();
    });
  }

  function renderDirection() {
    const chip = tag => `<button class="chip ${brief.tags.includes(tag) ? 'on' : ''}" type="button" aria-pressed="${brief.tags.includes(tag)}" data-tag="${tag}">${tag}</button>`;
    app.innerHTML = `
      <div class="eyebrow">Step 02 — set direction</div>
      <h1>Choose the <em>creative mood.</em></h1>
      <p class="intro">These choices shape the visual language without locking you into a final design.</p>
      <section class="grid">
        <div class="card question-card">
          <h2>Creative settings</h2>
          <div class="field-grid">
            <label class="field full">Format<select id="format"><option>Poster · 4:5</option><option>Square · 1:1</option><option>Wide · 16:9</option><option>Portrait · A4</option></select></label>
            <label class="field">Style<select id="style"><option>Hand-crafted</option><option>Clean & modern</option><option>Expressive</option><option>Classic & editorial</option></select></label>
            <label class="field">Colour energy<select id="energy"><option>Warm & rich</option><option>Quiet & soft</option><option>High contrast</option><option>Bright & playful</option></select></label>
          </div>
        </div>
        <aside class="card settings"><h2>Quick reminder</h2><p class="subtle" style="position:relative;z-index:1;line-height:1.6">You can come back and adjust any of these choices before you submit the brief.</p></aside>
      </section>
      <section class="card sources" style="margin-top:20px"><h2>Choose a few keywords</h2><p>Pick the words that should come through in the finished work.</p><div class="chips">${['Warm','Playful','Editorial','Minimal','Surprising','Bold','Elegant','Experimental'].map(chip).join('')}</div></section>
      ${footer(1, 'Continue to references')}`;
    ['format', 'style', 'energy'].forEach(key => {
      document.querySelector('#' + key).value = brief[key];
      document.querySelector('#' + key).onchange = event => { brief[key] = event.target.value; save(); };
    });
    document.querySelectorAll('[data-tag]').forEach(button => button.onclick = () => {
      const tag = button.dataset.tag;
      brief.tags = brief.tags.includes(tag) ? brief.tags.filter(item => item !== tag) : [...brief.tags, tag];
      save(); render();
      app.querySelectorAll('[data-tag]').forEach(item => { if (item.dataset.tag === tag) item.focus(); });
    });
    bindFooter(1, () => { brief.step = 3; save(); render(); });
  }

  function referenceGallery(editable = false) {
    if (!brief.references.length) return '<p class="subtle">No references added yet. Images and sketches will appear here.</p>';
    return '<div class="reference-gallery">' + brief.references.map(item => `<figure class="reference-item">
      <a href="${escape(item.data)}" download="${escape(item.name)}"><img src="${escape(item.data)}" alt="${escape(item.name)}" loading="lazy"></a>
      <figcaption><strong>${escape(item.name)}</strong><span>${item.kind === 'sketch' ? 'Sketch' : 'Image'}</span></figcaption>
      <div class="reference-actions"><a class="small" href="${escape(item.data)}" download="${escape(item.name)}">Download</a>${editable ? `${item.kind === 'sketch' ? `<button class="small" data-edit-reference="${item.id}" type="button">Edit sketch</button>` : ''}<button class="small" data-remove-reference="${item.id}" type="button" aria-label="Remove ${escape(item.name)}">Remove</button>` : ''}</div>
    </figure>`).join('') + '</div>';
  }

  function renderReferences() {
    app.innerHTML = `
      <div class="eyebrow">Step 03 ? visual references</div>
      <h1>Give your idea <em>a point of view.</em></h1>
      <p class="intro">Collect images and sketches that explain your idea. Add as many references as you need.</p>
      <div class="source-summary"><div><strong>${escape(brief.projectName || 'Untitled project')}</strong><div>${escape(brief.idea || 'No description yet')}</div></div><button class="summary-link" id="editDescribe">Edit description</button></div>
      <section class="card sources"><div class="row"><div><h2>Add visual references</h2><p>Combine photos, moodboards, textures, and your own sketches.</p></div><span class="hint">Optional</span></div>
        <div class="sourcegrid">
          <div class="source"><div><div class="icon">&uarr;</div><h3>Upload images</h3><p>Select several files at once, or keep adding more. PNG, JPEG, WebP, or GIF; up to 2 MB each.</p></div><input id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden><button type="button" id="upload" ${addingReferences ? 'disabled' : ''}>${addingReferences ? 'Adding images?' : 'Choose images'}</button></div>
          <div class="source"><div><div class="icon">?</div><h3>Add a sketch</h3><p>Draw another idea without replacing your other references.</p></div><button type="button" id="draw">Open sketchpad</button></div>
        </div>
      </section>
      <section class="card reference-collection"><div class="row"><h2>Your references</h2><div class="reference-collection-actions"><span class="hint">${brief.references.length} added</span>${brief.references.length ? `<button class="small" id="removeAllReferences" type="button" ${addingReferences ? 'disabled' : ''}>Remove all</button>` : ''}</div></div>${referenceGallery(true)}</section>
      ${footer(2, 'Continue to review')}`;
    document.querySelector('#editDescribe').onclick = () => { brief.step = 1; save(); render(); };
    document.querySelector('#upload').onclick = () => document.querySelector('#file').click();
    document.querySelector('#file').onchange = handleFile;
    document.querySelector('#draw').onclick = () => openSketch();
    const removeAll = document.querySelector('#removeAllReferences');
    if (removeAll) removeAll.onclick = () => {
      if (addingReferences || !brief.references.length) return;
      if (!confirm(`Remove all ${brief.references.length} references from this draft, including sketches?`)) return;
      brief.references = [];
      activeSketch = null;
      sketchOwner = null;
      save(); render(); say('All references removed.');
    };
    app.querySelectorAll('[data-remove-reference]').forEach(button => button.onclick = () => {
      brief.references = brief.references.filter(item => item.id !== button.dataset.removeReference);
      save(); render(); say('Reference removed.');
    });
    app.querySelectorAll('[data-edit-reference]').forEach(button => button.onclick = () => openSketch(button.dataset.editReference));
    bindFooter(2, () => { if (addingReferences) return say('Please wait for your images to finish loading.'); brief.step = 4; save(); render(); });
  }

  async function handleFile(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length || addingReferences) return;
    const targetBrief = brief;
    addingReferences = true; render();
    let added = 0; const errors = [];
    try {
      for (const image of files) {
        if (brief !== targetBrief) break;
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.type)) { errors.push(image.name + ': unsupported image type'); continue; }
        if (image.size > 2 * 1024 * 1024) { errors.push(image.name + ': larger than 2 MB'); continue; }
        try {
          const data = await new Promise((resolve, reject) => {
            const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(image);
          });
          await new Promise((resolve, reject) => {
            const preview = new Image(); preview.onload = () => preview.width * preview.height <= 40000000 ? resolve() : reject(); preview.onerror = reject; preview.src = data;
          });
          if (brief !== targetBrief) break;
          brief.references = [...brief.references, { id: newId(), kind: 'reference', name: image.name.slice(0, 255), data }]; added++;
        } catch { errors.push(image.name + ': could not read this image'); }
      }
    } finally {
      addingReferences = false;
      if (brief === targetBrief) {
        const persisted = await save(); render();
        if (errors.length) say(added + ' added. ' + errors.join('; '));
        else if (persisted) say(added + (added === 1 ? ' reference added.' : ' references added.'));
      }
    }
  }

  function renderReview() {
    if (!/^[a-f0-9]{32}$/.test(brief.accessCode || '')) {
      brief.accessCode = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      save();
    }

    app.innerHTML = `
      <div class="eyebrow">Step 04 — review your brief</div>
      <h1>Your brief is <em>taking shape.</em></h1>
      <p class="intro">Review the essentials and submit when it feels right.</p>
      <section class="review"><div class="card"><div class="summary"><strong>Project</strong><div>${escape(brief.projectName)}</div></div><div class="summary"><strong>Idea</strong><div>${escape(brief.idea)}</div></div><div class="summary"><strong>Audience & goal</strong><div>${escape(brief.audience || 'Not specified')} · ${escape(brief.goal || 'Not specified')}</div></div><div class="summary"><strong>Direction</strong><div>${escape(brief.style)} · ${escape(brief.energy)} · ${escape(brief.format)}</div></div><div class="summary"><strong>Keywords</strong><div>${brief.tags.length ? brief.tags.map(tag => `<span class="chip on" style="display:inline-block;margin:0 5px 5px 0">${escape(tag)}</span>`).join('') : 'No keywords selected'}</div></div></div><div class="card"><h2>Visual references (${brief.references.length})</h2>${referenceGallery()}</div></section>
      <section class="card private-code"><h2>Private project code</h2><p class="subtle">After submitting, share this code only with your chosen artist. They must enter it to receive your brief and references.</p><label for="accessCode">Your unique code</label><div class="code-actions"><input id="accessCode" readonly value="${escape(brief.accessCode)}" spellcheck="false"><button class="small" type="button" id="copyCode">Copy code</button></div><p class="subtle">You can find this code again in My briefs.</p></section>
      <p id="submissionStatus" role="status" aria-live="polite"></p>
      ${footer(3, 'Submit brief')}`;
    document.querySelector('#accessCode').onclick = event => event.target.select();
    document.querySelector('#copyCode').onclick = async () => {
      try { await navigator.clipboard.writeText(brief.accessCode); say('Project code copied.'); }
      catch { document.querySelector('#accessCode').select(); say('Select and copy your project code.'); }
    };
    bindFooter(3, async () => {
      if (submitting) return;
      if (addingReferences) return say('Please wait for your images to finish loading.');
      if (!brief.projectName.trim() || !brief.idea.trim()) {
        brief.step = 1; save(); render();
        say('Add a project name and description before saving your brief.');
        document.querySelector(!brief.projectName.trim() ? '#projectName' : '#idea').focus();
        return;
      }
      const status = document.querySelector('#submissionStatus');
      const button = document.querySelector('#nextButton');
      submitting = true;
      button.disabled = true;
      document.querySelector('#backButton').disabled = true;
      button.textContent = 'Submitting…';
      status.textContent = 'Saving your brief to your account…';
      status.style.color = '';
      app.setAttribute('aria-busy', 'true');
      const post = async (url, body) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 45000);
        try {
          const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify(body) });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.ok) throw new Error(result.error || 'Your brief could not be saved. Please try again.');
          return result;
        } finally { clearTimeout(timeout); }
      };
      try {
        const snapshot = {};
        snapshot.accessCode = brief.accessCode;
        for (const key of ['projectName', 'projectType', 'idea', 'audience', 'goal', 'format', 'style', 'energy', 'tags']) snapshot[key] = brief[key];
        snapshot.references = [];
        for (const [index, reference] of brief.references.entries()) {
          status.textContent = `Uploading reference ${index + 1} of ${brief.references.length}: ${reference.name}`;
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([window.CLIENT_SESSION.id, reference.id, reference.name, reference.kind, reference.data])));
          const id = Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
          const result = await post('upload-reference.php', { csrf: window.CLIENT_SESSION.csrf, id, name: reference.name, kind: reference.kind, data: reference.data });
          if (result.id !== id) throw new Error('A reference could not be confirmed. Please retry.');
          snapshot.references.push(id);
        }
        status.textContent = 'Saving your brief and references to your account…';
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
        const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (brief.pendingSignature !== signature || !/^[a-f0-9]{32}$/.test(brief.pendingId || '')) {
          brief.pendingId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
          brief.pendingSignature = signature;
        }
        await save();
        const result = await post('submit-brief.php', { csrf: window.CLIENT_SESSION.csrf, submissionId: brief.pendingId, brief: snapshot });
        if (!/^[a-f0-9]{32}$/.test(result.id || '')) {
          throw new Error(result.error || 'Your brief could not be saved. Please try again.');
        }
        brief.submissionId = result.id;
        brief.submitted = true;
        await save();
        render();
        app.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      } catch (error) {
        status.textContent = error.name === 'AbortError'
          ? 'The request timed out. Retry to confirm your submission without creating a duplicate.'
          : (error.message || 'Connection failed. Your draft is retained; please try again.');
        status.style.color = '#a33b2b';
        button.disabled = false;
        document.querySelector('#backButton').disabled = false;
        button.textContent = 'Retry submission';
      } finally {
        submitting = false;
        app.removeAttribute('aria-busy');
      }
    });
  }

  function renderSuccess() {
    saved.textContent = 'Brief submitted';
    app.innerHTML = `<section class="success"><div class="successmark" aria-hidden="true">&#10003;</div>
      <div class="eyebrow">Brief submitted</div>
      <h1>Your idea is <em>ready to share.</em></h1>
      <p>Your creative brief and all its visual references are saved to your account. You can reopen them from My briefs.</p>
      <p class="subtle submission-id">Submission ID: ${escape(brief.submissionId)}</p>
      <div class="success-actions"><a class="continue" href="submitted.php?id=${escape(brief.submissionId)}">View submitted brief</a>
      <button class="continue" id="newBrief">Create another brief</button></div></section>`;
    document.querySelector('#newBrief').onclick = () => { brief = { ...defaults }; save(); render(); };
  }

  function render() {
    const stepChanged = renderedStep !== null && renderedStep !== brief.step;
    renderedStep = brief.step;
    if (stepChanged) requestAnimationFrame(() => {
      app.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    renderProgress();
    progressEl.hidden = brief.submitted;
    labels.hidden = brief.submitted;
    if (brief.submitted) return renderSuccess();
    if (brief.step === 1) return renderDescribe();
    if (brief.step === 2) return renderDirection();
    if (brief.step === 3) return renderReferences();
    return renderReview();
  }

  document.querySelector('#reset').onclick = () => {
    if (submitting) return say('Please wait for your submission to finish.');
    if (confirm('Start a new brief? Your current draft will be cleared from this device.')) {
      brief = { ...defaults }; save(); render(); say('Fresh canvas, ready when you are.');
    }
  };

  document.querySelector('#logout').onclick = async () => {
    if (submitting) return say('Please wait for your submission to finish.');
    const button = document.querySelector('#logout');
    button.disabled = true;
    try {
      const response = await fetch('../auth/account.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout', csrf: window.CLIENT_SESSION.csrf }),
      });
      if (!response.ok) throw new Error('Sign-out failed. Please try again.');
      location.href = '../index.php';
    } catch (error) {
      button.disabled = false;
      say(error.message);
    }
  };

  let activeSketch = null;
  let sketchOwner = null;
  const sketchpad = window.createClientSketchpad({
    getName: () => brief.projectName,
    onSave: async (image, documentData) => {
      if (!activeSketch || sketchOwner !== brief) return;
      const existing = brief.references.find(item => item.id === activeSketch.id);
      const item = { id: activeSketch.id, kind: 'sketch', name: existing?.name || 'Sketch ' + (brief.references.filter(item => item.kind === 'sketch').length + 1) + '.png', data: image, sketchDocument: documentData };
      brief.references = existing ? brief.references.map(reference => reference.id === item.id ? item : reference) : [...brief.references, item];
      activeSketch.sketch = image; activeSketch.sketchDocument = documentData;
      const persisted = await save(); render(); if (persisted) say(existing ? 'Sketch updated.' : 'Sketch added.');
    },
  });
  function openSketch(id = null) {
    const existing = id && brief.references.find(item => item.id === id && item.kind === 'sketch');
    if (id && !existing) return;
    if (existing) {
      if (!activeSketch || activeSketch.id !== id || sketchOwner !== brief) activeSketch = { id, sketch: existing.data, sketchDocument: existing.sketchDocument };
    } else if (!activeSketch || sketchOwner !== brief || brief.references.some(item => item.id === activeSketch.id)) {
      activeSketch = { id: newId(), sketch: null, sketchDocument: null };
    }
    sketchOwner = brief; sketchpad.open(activeSketch);
  }

  render();
  if (loadWarning) { saved.textContent = 'Not saved'; say(loadWarning); }
})();
