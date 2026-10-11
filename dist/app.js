(() => {
  const storageKey = 'makerflow-brief-v1';
  const defaults = {
    flowVersion: 2, step: 1, submitted: false,
    projectName: '', projectType: 'Poster', idea: '',
    audience: '', goal: '', tags: [], format: 'Poster · 4:5',
    style: 'Hand-crafted', energy: 'Warm & rich',
    reference: null, referenceName: '', sketch: null
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
  let brief = { ...defaults, ...stored };
  for (const key of ['projectName', 'projectType', 'idea', 'audience', 'goal', 'format', 'style', 'energy', 'referenceName']) {
    if (typeof brief[key] !== 'string') brief[key] = defaults[key];
  }
  brief.tags = Array.isArray(brief.tags) ? brief.tags.filter(tag => typeof tag === 'string') : [];
  brief.step = [1, 2, 3, 4].includes(brief.step) ? brief.step : 1;
  brief.submitted = brief.submitted === true;
  for (const key of ['reference', 'sketch']) {
    if (typeof brief[key] !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(brief[key])) brief[key] = null;
  }
  // Repair only known option values from the previous encoding bug.
  const formatMatch = /^(Poster|Square|Wide|Portrait).* (4:5|1:1|16:9|A4)$/.exec(brief.format);
  brief.format = formatMatch ? `${formatMatch[1]} \u00b7 ${formatMatch[2]}` : defaults.format;
  if (brief.flowVersion !== 2) {
    brief = { ...defaults, ...brief, flowVersion: 2, step: 1, submitted: false };
  }

  const app = document.querySelector('#app');
  const toast = document.querySelector('#toast');
  const saved = document.querySelector('#saved');
  const labels = document.querySelector('.labels');
  const progressEl = document.querySelector('#progress');

  document.head.insertAdjacentHTML('beforeend', `<style>
    .step{font:500 12px 'DM Mono';cursor:pointer}.step:focus-visible,.continue:focus-visible,.back:focus-visible,.chip:focus-visible,.color:focus-visible{outline:3px solid #ffd166;outline-offset:3px}
    .field-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{display:flex;flex-direction:column;gap:8px}.field.full{grid-column:1/-1}.field input,.field select,.field textarea{border:1px solid #cbd6e6;border-radius:10px;padding:12px;background:#fff;color:#1d2b4d;outline:0}.field input:focus,.field select:focus,.field textarea:focus{border-color:#3158c9;box-shadow:0 0 0 4px #e6edff}.field textarea{min-height:116px;resize:vertical}.question-card{padding:28px}.question-card h2{font-size:20px;margin-bottom:4px}.summary-link{color:#3158c9;font-size:13px;font-weight:800;border:0;background:none;padding:0}.source-summary{margin:0 0 20px;padding:16px;border-radius:12px;background:#f2f5fb;display:flex;justify-content:space-between;gap:16px;align-items:start}.source-summary strong{display:block;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#7b8aa4;margin-bottom:4px}@media(max-width:720px){.field-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.question-card{padding:20px}}
  </style>`);

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(brief));
      saved.textContent = 'Saved';
      return true;
    } catch {
      saved.textContent = 'Not saved';
      say('Browser storage is full or unavailable. Keep this page open; your latest changes are only in this session.');
      return false;
    }
  };
  const say = message => {
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  };
  const escape = value => String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function renderProgress() {
    progressEl.innerHTML = [1, 2, 3, 4].map((number, index) => `
      ${index ? '<span class="line"></span>' : ''}
      <button type="button" class="step ${number < brief.step ? 'done' : ''} ${number === brief.step ? 'active' : ''}" data-go="${number}" aria-label="Go to step ${number}">${number < brief.step ? '✓' : number}</button>
    `).join('');
    labels.querySelectorAll('span').forEach((label, index) => label.classList.toggle('current', index + 1 === brief.step));
    progressEl.querySelectorAll('[data-go]').forEach(button => {
      button.addEventListener('click', () => {
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
      if (!backStep) { if (save()) location.hash = 'home'; return; }
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
          <label class="field">Project name<input id="projectName" placeholder="e.g. Midnight Sessions" value="${escape(brief.projectName)}"></label>
          <label class="field">What are you making?<select id="projectType"><option>Poster</option><option>Social post</option><option>Event identity</option><option>Album cover</option><option>Presentation</option><option>Something else</option></select></label>
          <label class="field full">Describe the idea<textarea id="idea" placeholder="What should this feel like? What makes it special?">${escape(brief.idea)}</textarea></label>
          <label class="field">Who is it for?<input id="audience" placeholder="e.g. curious late-night music fans" value="${escape(brief.audience)}"></label>
          <label class="field">What should it achieve?<input id="goal" placeholder="e.g. get people to the first show" value="${escape(brief.goal)}"></label>
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
    const chip = tag => `<button class="chip ${brief.tags.includes(tag) ? 'on' : ''}" type="button" data-tag="${tag}">${tag}</button>`;
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
      <section class="review"><div class="card"><div class="summary"><strong>Project</strong><div>${escape(brief.projectName)}</div></div><div class="summary"><strong>Idea</strong><div>${escape(brief.idea)}</div></div><div class="summary"><strong>Audience & goal</strong><div>${escape(brief.audience || 'Not specified')} · ${escape(brief.goal || 'Not specified')}</div></div><div class="summary"><strong>Direction</strong><div>${escape(brief.style)} · ${escape(brief.energy)} · ${escape(brief.format)}</div></div><div class="summary"><strong>Keywords</strong><div>${brief.tags.length ? brief.tags.map(tag => `<span class="chip on" style="display:inline-block;margin:0 5px 5px 0">${tag}</span>`).join('') : 'No keywords selected'}</div></div></div><div class="card"><div class="preview">${visual ? `<img src="${visual}" alt="Your visual reference">` : '<div>No visual reference yet<br><span class="subtle">Your written direction will lead.</span></div>'}</div><div class="summary" style="padding-bottom:0"><strong>Visual reference</strong><div>${visual ? (brief.referenceName || 'Your sketch') : 'None added'}</div></div></div></section>
      ${footer(3, 'Submit brief')}`;
    bindFooter(3, () => {
      if (!brief.projectName.trim() || !brief.idea.trim()) {
        brief.step = 1; render(); say('Add a project name and description before saving your brief.'); return;
      }
      brief.submitted = true;
      if (save()) render(); else brief.submitted = false;
    });
  }

  function renderSuccess() {
    app.innerHTML = `<section class="success"><div class="successmark">✓</div><div class="eyebrow">Brief saved</div><h1>Your idea is <em>ready to share.</em></h1><p>Your creative brief is saved on this device. You can make another whenever inspiration strikes.</p><button class="continue" id="newBrief">Create another brief</button></section>`;
    document.querySelector('#newBrief').onclick = () => { brief = { ...defaults }; save(); render(); };
  }

  function render() {
    renderProgress();
    if (brief.submitted) return renderSuccess();
    if (brief.step === 1) return renderDescribe();
    if (brief.step === 2) return renderDirection();
    if (brief.step === 3) return renderReferences();
    return renderReview();
  }

  document.querySelector('#reset').onclick = () => {
    if (confirm('Start a new brief? Your current draft will be cleared from this device.')) {
      brief = { ...defaults }; save(); render(); say('Fresh canvas, ready when you are.');
    }
  };

  const sketchDialog = document.createElement('dialog');
  sketchDialog.innerHTML = `<div class="modal"><div class="modalhead"><div><h2>Sketch the feeling</h2><p class="subtle">Loose shapes and colour cues are enough.</p></div><button class="x" id="sketchClose" aria-label="Close sketchpad">×</button></div><div class="tools"><button class="color active" data-colour="#1d2b4d" style="background:#1d2b4d" aria-label="Navy pen"></button><button class="color" data-colour="#3158c9" style="background:#3158c9" aria-label="Blue pen"></button><button class="color" data-colour="#f17d67" style="background:#f17d67" aria-label="Coral pen"></button><button class="color" data-colour="#e5a72d" style="background:#e5a72d" aria-label="Yellow pen"></button><label class="subtle">Size <input id="brushSize" type="range" min="2" max="18" value="5"></label><button class="small" id="clearSketch">Clear</button></div><div class="canvaswrap"><canvas id="sketchCanvas" aria-label="Drawing canvas"></canvas></div><div class="modalactions"><span class="subtle">Your sketch stays on this device.</span><button class="continue" id="saveSketch">Use this sketch</button></div></div>`;
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
