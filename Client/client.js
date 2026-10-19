// Drafts stay in this browser; submitted snapshots are saved to the client account.
(() => {
  const storageKey = 'capstone-client-brief-v1:' + window.CLIENT_SESSION.id;
  const defaults = {
    flowVersion: 2, step: 1, submitted: false,
    projectName: '', projectType: 'Poster', idea: '',
    audience: '', goal: '', tags: [], format: 'Poster · 4:5',
    style: 'Hand-crafted', energy: 'Warm & rich',
    reference: null, referenceName: '', sketch: null,
    submissionId: null, pendingId: null, pendingSignature: null
  };
  let stored = {};
  let loadWarning = '';
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) stored = parsed;
  } catch {
    loadWarning = 'Your saved draft could not be read. You can still work in this session.';
  }
  function normalizeBrief(stored) {
    let brief = { ...defaults, ...stored };
    for (const key of ['projectName', 'projectType', 'idea', 'audience', 'goal', 'format', 'style', 'energy', 'referenceName']) {
      if (typeof brief[key] !== 'string') brief[key] = defaults[key];
    }
    brief.tags = Array.isArray(brief.tags) ? brief.tags.filter(tag => typeof tag === 'string') : [];
    brief.step = [1, 2, 3, 4].includes(brief.step) ? brief.step : 1;
    brief.submitted = brief.submitted === true && /^[a-f0-9]{32}$/.test(brief.submissionId || '');
    for (const key of ['reference', 'sketch']) {
      if (typeof brief[key] !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(brief[key])) brief[key] = null;
    }
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

  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  const saved = document.querySelector('#saved');
  const labels = document.querySelector('.labels');
  const progressEl = document.querySelector('#progress');

  

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(brief));
      saved.textContent = brief.submitted ? 'Brief submitted' : 'Draft saved';
      return true;
    } catch {
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
    document.querySelector('#backButton').onclick = () => {
      if (submitting) return;
      if (!backStep) { if (save()) location.href = '../index.php'; return; }
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

  function renderReferences() {
    app.innerHTML = `
      <div class="eyebrow">Step 03 — visual reference</div>
      <h1>Give your idea <em>a point of view.</em></h1>
      <p class="intro">An image or a rough sketch can help make your direction unmistakably yours. This step is optional.</p>
      <div class="source-summary"><div><strong>${escape(brief.projectName || 'Untitled project')}</strong><div>${escape(brief.idea || 'No description yet')}</div></div><button class="summary-link" id="editDescribe">Edit description</button></div>
      <section class="card sources"><div class="row"><div><h2>Add a visual starting point</h2><p>Use an image you love—or sketch the feeling in seconds.</p></div><span class="hint">Optional</span></div>
        <div class="sourcegrid">
          <div class="source"><div><div class="icon">&uarr;</div><h3>Upload an image</h3><p>Photo, moodboard, texture, or an existing design.</p></div><label><input id="file" type="file" accept="image/*" hidden><button type="button" id="upload">Choose a file</button></label>${brief.reference ? `<div class="file">✓ ${escape(brief.referenceName)}</div>` : ''}</div>
          <div class="source"><div><div class="icon">✎</div><h3>Draw a quick sketch</h3><p>Rough shapes are perfect. You can refine it later.</p></div><button type="button" id="draw">${brief.sketch ? 'Edit sketch' : 'Open sketchpad'}</button>${brief.sketch ? '<div class="file">✓ Sketch added</div>' : ''}</div>
        </div>
      </section>
      ${footer(2, 'Continue to review')}`;
    document.querySelector('#editDescribe').onclick = () => { brief.step = 1; save(); render(); };
    document.querySelector('#upload').onclick = () => document.querySelector('#file').click();
    document.querySelector('#file').onchange = handleFile;
    document.querySelector('#draw').onclick = openSketch;
    bindFooter(2, () => { brief.step = 4; save(); render(); });
  }

  function handleFile(event) {
    const image = event.target.files[0];
    if (!image) return;
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(image.type)) return say('Choose a PNG, JPEG, WebP, or GIF image.');
    if (image.size > 2 * 1024 * 1024) return say('Choose an image smaller than 2 MB so your draft can be saved.');
    const reader = new FileReader();
    reader.onerror = () => say('This image could not be read. Please try another file.');
    reader.onload = () => {
      brief.reference = reader.result; brief.referenceName = image.name; brief.sketch = null;
      const persisted = save(); render(); if (persisted) say('Reference added.');
    };
    reader.readAsDataURL(image);
  }

  function renderReview() {
    const visual = brief.reference || brief.sketch;
    app.innerHTML = `
      <div class="eyebrow">Step 04 — review your brief</div>
      <h1>Your brief is <em>taking shape.</em></h1>
      <p class="intro">Review the essentials and submit when it feels right.</p>
      <section class="review"><div class="card"><div class="summary"><strong>Project</strong><div>${escape(brief.projectName)}</div></div><div class="summary"><strong>Idea</strong><div>${escape(brief.idea)}</div></div><div class="summary"><strong>Audience & goal</strong><div>${escape(brief.audience || 'Not specified')} · ${escape(brief.goal || 'Not specified')}</div></div><div class="summary"><strong>Direction</strong><div>${escape(brief.style)} · ${escape(brief.energy)} · ${escape(brief.format)}</div></div><div class="summary"><strong>Keywords</strong><div>${brief.tags.length ? brief.tags.map(tag => `<span class="chip on" style="display:inline-block;margin:0 5px 5px 0">${escape(tag)}</span>`).join('') : 'No keywords selected'}</div></div></div><div class="card"><div class="preview">${visual ? `<img src="${escape(visual)}" alt="Your visual reference">` : '<div>No visual reference yet<br><span class="subtle">Your written direction will lead.</span></div>'}</div><div class="summary" style="padding-bottom:0"><strong>Visual reference</strong><div>${visual ? escape(brief.referenceName || 'Your sketch') : 'None added'}</div></div></div></section>
      <p id="submissionStatus" role="status" aria-live="polite"></p>
      ${footer(3, 'Submit brief')}`;
    bindFooter(3, async () => {
      if (submitting) return;
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const snapshot = {};
        for (const key of ['projectName', 'projectType', 'idea', 'audience', 'goal', 'format', 'style', 'energy', 'tags', 'referenceName', 'reference', 'sketch']) snapshot[key] = brief[key];
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(snapshot)));
        const signature = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (brief.pendingSignature !== signature || !/^[a-f0-9]{32}$/.test(brief.pendingId || '')) {
          brief.pendingId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
          brief.pendingSignature = signature;
        }
        save();
        const response = await fetch('submit-brief.php', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({ csrf: window.CLIENT_SESSION.csrf, submissionId: brief.pendingId, brief: snapshot }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok || !/^[a-f0-9]{32}$/.test(result.id || '')) {
          throw new Error(result.error || 'Your brief could not be saved. Please try again.');
        }
        brief.submissionId = result.id;
        brief.submitted = true;
        save();
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
        clearTimeout(timeout);
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
      <p>Your creative brief and any visual reference are saved to your account. You can reopen them from My briefs.</p>
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

  const sketchDialog = document.createElement('dialog');
  sketchDialog.setAttribute('aria-labelledby', 'sketch-title');
  sketchDialog.innerHTML = `<div class="modal"><div class="modalhead"><div><h2 id="sketch-title">Sketch the feeling</h2><p class="subtle">Loose shapes and colour cues are enough.</p></div><button class="x" id="sketchClose" aria-label="Close sketchpad">×</button></div><div class="tools"><button class="color active" data-colour="#1d2b4d" style="background:#1d2b4d" aria-label="Navy pen"></button><button class="color" data-colour="#3158c9" style="background:#3158c9" aria-label="Blue pen"></button><button class="color" data-colour="#f17d67" style="background:#f17d67" aria-label="Coral pen"></button><button class="color" data-colour="#e5a72d" style="background:#e5a72d" aria-label="Yellow pen"></button><label class="subtle">Size <input id="brushSize" type="range" min="2" max="18" value="5"></label><button class="small" id="clearSketch">Clear</button></div><div class="canvaswrap"><canvas id="sketchCanvas" aria-label="Drawing canvas"></canvas></div><div class="modalactions"><span class="subtle">Your sketch will be included when you submit.</span><button class="continue" id="saveSketch">Use this sketch</button></div></div>`;
  document.body.appendChild(sketchDialog);
  const canvas = sketchDialog.querySelector('#sketchCanvas');
  const context = canvas.getContext('2d');
  let drawing = false, lastPoint, pen = '#1d2b4d';
  const position = event => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const prior = brief.sketch;
    canvas.width = rect.width * devicePixelRatio; canvas.height = rect.height * devicePixelRatio;
    context.scale(devicePixelRatio, devicePixelRatio); context.fillStyle = '#fff'; context.fillRect(0, 0, rect.width, rect.height);
    if (prior) { const image = new Image(); image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height); image.src = prior; }
  }
  function openSketch() { sketchDialog.showModal(); requestAnimationFrame(sizeCanvas); }
  canvas.addEventListener('pointerdown', event => {
    drawing = true; lastPoint = position(event); canvas.setPointerCapture(event.pointerId);
    context.beginPath(); context.fillStyle = pen;
    context.arc(lastPoint.x, lastPoint.y, Number(sketchDialog.querySelector('#brushSize').value) / 2, 0, Math.PI * 2); context.fill();
  });
  canvas.addEventListener('pointermove', event => {
    if (!drawing) return;
    event.preventDefault();
    const point = position(event); context.beginPath(); context.strokeStyle = pen;
    context.lineWidth = sketchDialog.querySelector('#brushSize').value; context.lineCap = 'round';
    context.moveTo(lastPoint.x, lastPoint.y); context.lineTo(point.x, point.y); context.stroke(); lastPoint = point;
  });
  window.addEventListener('pointerup', () => drawing = false);
  canvas.addEventListener('pointercancel', () => drawing = false);
  sketchDialog.addEventListener('close', () => drawing = false);
  sketchDialog.querySelectorAll('[data-colour]').forEach(button => button.onclick = () => {
    pen = button.dataset.colour;
    sketchDialog.querySelectorAll('[data-colour]').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
  });
  sketchDialog.querySelector('#sketchClose').onclick = () => sketchDialog.close();
  sketchDialog.querySelector('#clearSketch').onclick = () => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  };
  sketchDialog.querySelector('#saveSketch').onclick = () => {
    brief.sketch = canvas.toDataURL('image/png'); brief.reference = null; brief.referenceName = '';
    const persisted = save(); sketchDialog.close(); render(); if (persisted) say('Sketch added.');
  };

  render();
  if (loadWarning) { saved.textContent = 'Not saved'; say(loadWarning); }
})();
