// Drafts stay in this browser; submitted snapshots are saved to the client account.
(async () => {
  const storageKey = 'capstone-client-brief-v1:' + window.CLIENT_SESSION.id;
  const defaults = {
    flowVersion: 2, step: 1, submitted: false,
    projectName: '', projectType: '', resolution: '1920 × 1080 px', idea: '', ideaFile: null, note: '', font: '', fontFile: null, palette: [],
    audience: '', goal: '', tags: [], format: '',
    style: '', energy: '',
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
    for (const key of ['projectName', 'projectType', 'resolution', 'idea', 'note', 'font', 'audience', 'goal', 'format', 'style', 'energy']) {
      if (typeof brief[key] !== 'string') brief[key] = defaults[key];
    }
    brief.tags = [];
    brief.palette = Array.isArray(brief.palette) ? [...new Set(brief.palette.filter(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).map(color => color.toUpperCase()))].slice(0, 8) : [];
    brief.fontFile = brief.fontFile && typeof brief.fontFile.name === 'string' && /^[a-f0-9]{32}$/.test(brief.fontFile.id || '') && typeof brief.fontFile.data === 'string' && /^data:font\/(woff2?|ttf|otf);base64,[A-Za-z0-9+/]+={0,2}$/.test(brief.fontFile.data) ? brief.fontFile : null;
    brief.ideaFile = brief.ideaFile && typeof brief.ideaFile.name === 'string' && brief.ideaFile.name.length <= 255 && typeof brief.ideaFile.data === 'string' && /^data:(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,[A-Za-z0-9+/]+={0,2}$/.test(brief.ideaFile.data) ? brief.ideaFile : null;
    const resolution = parseResolution(brief.resolution);
    if (resolution) brief.resolution = resolution.label;
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
    // These choices are no longer part of the brief builder.
    brief.format = brief.style = brief.energy = '';
    if (brief.flowVersion !== 2) {
      brief = { ...defaults, ...brief, flowVersion: 2, step: 1, submitted: false };
    }
    return brief;
  }
  const briefTitle = () => brief.projectName.trim() || Array.from(brief.idea.trim().split(/\r?\n/, 1)[0]).slice(0, 120).join('') || brief.ideaFile?.name.replace(/\.(docx|pdf)$/i, '').slice(0, 120) || 'Untitled project';
  const resolutions = ['1920 × 1080 px', '1280 × 720 px', '2560 × 1440 px', '3840 × 2160 px', '1080 × 1080 px', '1080 × 1350 px', '1080 × 1920 px', '2480 × 3508 px'];
  const resolutionHint = 'Enter width × height in whole pixels, for example 1377 x 2111. Each side can be 1 to 1,000,000 px.';
  function parseResolution(value) {
    const match = /^\s*(\d{1,7})\s*(?:px)?\s*(?:x|×|by)\s*(\d{1,7})\s*(?:px)?\s*$/i.exec(value);
    if (!match) return null;
    const width = Number(match[1]), height = Number(match[2]);
    if (width < 1 || height < 1 || width > 1000000 || height > 1000000) return null;
    return { width, height, label: `${width} × ${height} px` };
  }
  const paletteTemplates = [
    { name: 'Ocean blue', colors: ['#1D355F', '#074766', '#255C76', '#0A6C9F', '#3D9ECB'] },
    { name: 'Warm sunset', colors: ['#71334A', '#B95050', '#E67E51', '#F4B36B', '#FFE0A3'] },
    { name: 'Forest greens', colors: ['#203E36', '#3C6250', '#68866A', '#A3B68A', '#E1E7C5'] },
    { name: 'Soft pastels', colors: ['#B8B8E3', '#D6C4E9', '#F0CAD6', '#F6DFCD', '#D7E7DE'] },
    { name: 'Earth & clay', colors: ['#543D35', '#91634C', '#BB8B68', '#D7BA98', '#F0E5D5'] },
    { name: 'Modern neutrals', colors: ['#24262B', '#515661', '#9297A1', '#CDD0D5', '#F3F1EC'] },
    { name: 'Lavender dusk', colors: ['#392F5A', '#665191', '#9B80BC', '#C9B6DD', '#EEE5F5'] },
    { name: 'Cherry blossom', colors: ['#703D57', '#AC6584', '#D998B1', '#F1C6D3', '#FFF0F3'] },
    { name: 'Tropical punch', colors: ['#006D77', '#19A7A0', '#F4D35E', '#F48C64', '#D94F70'] },
    { name: 'Citrus grove', colors: ['#426B32', '#8BAA42', '#D5CC55', '#F6AA35', '#FFF1B8'] },
    { name: 'Midnight neon', colors: ['#15162C', '#5534A5', '#B83DCE', '#29D9D5', '#D9F75B'] },
    { name: 'Coastal breeze', colors: ['#28666E', '#6DA8AC', '#B5D9D6', '#E9DEC8', '#FFF7E8'] },
    { name: 'Vintage rose', colors: ['#583F4A', '#926775', '#BE969A', '#DFC6BE', '#F2E8DB'] },
    { name: 'Desert dusk', colors: ['#59445F', '#9C6474', '#CF8B78', '#E8B68E', '#F5DCC0'] },
    { name: 'Golden hour', colors: ['#523C27', '#966B32', '#C8963E', '#E8BF64', '#FFF0C2'] },
    { name: 'Berry sorbet', colors: ['#5C245C', '#993568', '#CF5680', '#EC96A4', '#FAD9D7'] },
    { name: 'Arctic frost', colors: ['#30485F', '#6A8CA5', '#A7C6D5', '#D6E6ED', '#F2F8FA'] },
    { name: 'Retro pop', colors: ['#293C69', '#D85A48', '#E8AE45', '#6E9C88', '#F4E5C3'] },
  ];
  const fontChoices = [
    { name: 'Manrope', family: 'Manrope, Arial, sans-serif', type: 'Sans serif' },
    { name: 'Playfair Display', family: '"Playfair Display", Georgia, serif', type: 'Serif' },
    { name: 'Montserrat', family: 'Montserrat, Arial, sans-serif', type: 'Sans serif' },
    { name: 'Poppins', family: 'Poppins, Arial, sans-serif', type: 'Sans serif' },
    { name: 'Roboto', family: 'Roboto, Arial, sans-serif', type: 'Sans serif' },
    { name: 'DM Mono', family: '"DM Mono", monospace', type: 'Monospace' },
    { name: 'Inter', family: 'Inter, Arial, sans-serif', type: 'Sans serif' },
    { name: 'Lato', family: 'Lato, Arial, sans-serif', type: 'Sans serif' },
    { name: 'Nunito Sans', family: '"Nunito Sans", Arial, sans-serif', type: 'Sans serif' },
    { name: 'Raleway', family: 'Raleway, Arial, sans-serif', type: 'Sans serif' },
    { name: 'Oswald', family: 'Oswald, Arial, sans-serif', type: 'Display' },
    { name: 'Bebas Neue', family: '"Bebas Neue", Arial, sans-serif', type: 'Display' },
    { name: 'Fredoka', family: 'Fredoka, Arial, sans-serif', type: 'Display' },
    { name: 'Abril Fatface', family: '"Abril Fatface", Georgia, serif', type: 'Display' },
    { name: 'Merriweather', family: 'Merriweather, Georgia, serif', type: 'Serif' },
    { name: 'Lora', family: 'Lora, Georgia, serif', type: 'Serif' },
    { name: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif', type: 'Serif' },
    { name: 'Libre Baskerville', family: '"Libre Baskerville", Georgia, serif', type: 'Serif' },
    { name: 'Cinzel', family: 'Cinzel, Georgia, serif', type: 'Display' },
    { name: 'Pacifico', family: 'Pacifico, cursive', type: 'Handwriting' },
    { name: 'Caveat', family: 'Caveat, cursive', type: 'Handwriting' },
    { name: 'Space Mono', family: '"Space Mono", monospace', type: 'Monospace' },
    { name: 'Arial', family: 'Arial, sans-serif', type: 'Sans serif' },
    { name: 'Georgia', family: 'Georgia, serif', type: 'Serif' },
    { name: 'Times New Roman', family: '"Times New Roman", serif', type: 'Serif' },
  ];
  let brief = normalizeBrief(stored);
  let renderedStep = null;
  let submitting = false;
  let addingReferences = false;
  let paletteTemplatesExpanded = false;
  let loadedFontId = null;
  let loadedFontFace = null;
  let importingFont = false;
  let importingIdeaFile = false;
  let closeResolutionPicker = () => {};

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
          <div class="field resolution-field full">
            <label for="resolution">Resolution size</label>
            <div class="resolution-picker" id="resolutionPicker">
              <div class="resolution-control">
                <input id="resolution" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="resolutionOptions" aria-describedby="resolutionHelp resolutionPreviewNote" autocomplete="off" spellcheck="false" maxlength="80" placeholder="Search sizes or type your own, e.g. 1377 x 2111" value="${escape(brief.resolution)}">
                <button id="resolutionToggle" type="button" aria-label="Show resolution presets" aria-expanded="false" aria-controls="resolutionOptions" tabindex="-1"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
              </div>
              <div id="resolutionOptions" class="resolution-options" role="listbox" aria-label="Resolution sizes" hidden></div>
            </div>
            <p id="resolutionHelp" class="resolution-help">Choose a preset or type any width × height in pixels, e.g. 1377 x 2111.</p>
            <figure class="resolution-preview"><div id="resolutionPreview" aria-live="polite"></div><figcaption id="resolutionPreviewNote">Scaled to fit. The canvas keeps your selected proportions.</figcaption></figure>
          </div>
          <div class="field full">
            <label for="idea">Describe the idea</label>
            <textarea id="idea" maxlength="5000" placeholder="What should this feel like? What makes it special?">${escape(brief.idea)}</textarea>
            <div class="idea-file-actions"><input id="ideaFileInput" type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden><button class="small" id="uploadIdeaFile" type="button">Upload DOCX or PDF</button><span class="subtle">Optional · up to 5 MB</span></div>
            <div class="idea-file-selected" id="ideaFileSelected" ${brief.ideaFile ? '' : 'hidden'}><span id="ideaFileName">${escape(brief.ideaFile?.name || '')}</span><button class="small" id="removeIdeaFile" type="button">Remove</button></div>
          </div>
          <label class="field full">Additional note (optional)<textarea id="note" maxlength="2000" placeholder="Anything else your artist should know?">${escape(brief.note)}</textarea></label>
        </div>
      </section>
      ${footer(null, 'Continue to direction')}`;
    bindResolutionPicker();
    renderResolutionPreview();
    ['idea', 'note'].forEach(key => {
      const update = event => {
        brief[key] = event.target.value;
        save();
      };
      document.querySelector('#' + key).oninput = update;
      document.querySelector('#' + key).onchange = update;
    });
    bindIdeaFile();
    bindFooter(null, () => {
      if (!validateResolution()) return;
      if (importingIdeaFile) return say('Please wait for your document to finish loading.');
      if (!brief.idea.trim() && !brief.ideaFile) {
        say('Describe your idea or attach a DOCX or PDF file to continue.');
        document.querySelector('#idea').focus();
        return;
      }
      brief.step = 2; save(); render();
    });
  }

  function bindIdeaFile() {
    const input = document.querySelector('#ideaFileInput');
    const selected = document.querySelector('#ideaFileSelected');
    const name = document.querySelector('#ideaFileName');
    document.querySelector('#uploadIdeaFile').onclick = () => input.click();
    document.querySelector('#removeIdeaFile').onclick = () => {
      brief.ideaFile = null; input.value = ''; selected.hidden = true; name.textContent = ''; save();
    };
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      input.value = '';
      if (importingIdeaFile) return;
      importingIdeaFile = true;
      try {
        const extension = file.name.split('.').pop().toLowerCase();
        const types = { pdf: ['application/pdf', '%PDF-'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'PK\x03\x04'] };
        if (!types[extension]) throw new Error('Choose a DOCX or PDF document.');
        if (file.size < 12 || file.size > 5 * 1024 * 1024) throw new Error('Choose a DOCX or PDF smaller than 5 MB.');
        if (file.name.length > 255 || /[\\/\u0000-\u001f\u007f]/.test(file.name)) throw new Error('Choose a document with a valid filename.');
        const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
        if (!String.fromCharCode(...signature).startsWith(types[extension][1])) throw new Error('The selected file does not match its document format.');
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
        });
        brief.ideaFile = { name: file.name, data: `data:${types[extension][0]};base64,${data.split(',')[1]}` };
        name.textContent = file.name;
        selected.hidden = false;
        await save();
      } catch (error) { say(error.message || 'The document could not be loaded. Please try again.'); }
      finally { importingIdeaFile = false; }
    };
  }

  function updateFontPreview() {
    const name = brief.font.trim();
    const font = fontChoices.find(choice => choice.name.toLowerCase() === name.toLowerCase());
    const imported = brief.fontFile !== null;
    const family = imported && loadedFontId === brief.fontFile.id ? loadedFontFace.family : font ? font.family : 'Manrope, Arial, sans-serif';
    document.querySelector('#fontPickerValue').textContent = name || 'Choose a font';
    document.querySelector('#fontTriggerSample').style.fontFamily = family;
    document.querySelector('#fontPreview').hidden = !name;
    document.querySelector('#fontPreviewLabel').textContent = imported ? `${name} · imported font` : font ? `${font.name} preview` : 'Custom font request';
    const sample = document.querySelector('#fontPreviewSample');
    sample.style.fontFamily = family;
    sample.textContent = imported && loadedFontId !== brief.fontFile.id ? 'Loading imported font preview…' : (font || imported) ? 'The start of something beautiful.' : 'Preview unavailable for this custom font. Your artist will receive its name.';
    sample.classList.toggle('is-custom', !font && (!imported || loadedFontId !== brief.fontFile.id));
    const alphabet = document.querySelector('#fontPreviewAlphabet');
    alphabet.hidden = !font && (!imported || loadedFontId !== brief.fontFile.id);
    alphabet.style.fontFamily = family;
    app.querySelectorAll('[data-font-choice]').forEach(button => button.setAttribute('aria-pressed', String(!imported && font === fontChoices[Number(button.dataset.fontChoice)])));
  }

  function closeFontPicker(restoreFocus = false) {
    const toggle = document.querySelector('#fontPickerToggle');
    if (!toggle) return;
    toggle.setAttribute('aria-expanded', 'false');
    document.querySelector('#fontPickerPanel').hidden = true;
    if (restoreFocus) toggle.focus();
  }

  function bindFontPicker() {
    updateFontPreview();
    const picker = document.querySelector('#fontPicker');
    const toggle = document.querySelector('#fontPickerToggle');
    const fontStylesheet = document.querySelector('#fontSampleStylesheet');
    const loadFontSamples = () => { if (fontStylesheet) fontStylesheet.media = 'all'; };
    if (fontChoices.some(choice => choice.name.toLowerCase() === brief.font.trim().toLowerCase())) loadFontSamples();
    const search = document.querySelector('#fontSearch');
    const filterFonts = () => {
      const query = search.value.trim().toLowerCase();
      let shown = 0;
      picker.querySelectorAll('[data-font-choice]').forEach(button => {
        const font = fontChoices[Number(button.dataset.fontChoice)];
        button.hidden = !`${font.name} ${font.type}`.toLowerCase().includes(query);
        if (!button.hidden) shown++;
      });
      document.querySelector('#fontNoResults').hidden = shown > 0;
    };
    search.oninput = filterFonts;
    toggle.onclick = () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      document.querySelector('#fontPickerPanel').hidden = !open;
      if (open) {
        loadFontSamples();
        search.value = ''; filterFonts();
        search.focus({ preventScroll: true });
      }
    };
    picker.onkeydown = event => {
      if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        event.preventDefault(); event.stopPropagation(); closeFontPicker(true);
      }
    };
    picker.onfocusout = event => { if (!picker.contains(event.relatedTarget)) closeFontPicker(); };
    const choose = name => {
      brief.font = name;
      brief.fontFile = null;
      document.querySelector('#font').value = name;
      updateImportedFontUI(); updateFontPreview(); save(); closeFontPicker(true);
    };
    picker.querySelectorAll('[data-font-choice]').forEach(button => button.onclick = () => choose(fontChoices[Number(button.dataset.fontChoice)].name));
    document.querySelector('#clearFont').onclick = () => choose('');
  }

  function updateImportedFontUI() {
    const panel = document.querySelector('#fontImported');
    if (!panel) return;
    panel.hidden = !brief.fontFile;
    document.querySelector('#fontImportedName').textContent = brief.fontFile?.name || '';
  }

  async function loadImportedFont(file) {
    if (loadedFontId === file.id) return loadedFontFace;
    const face = new FontFace('ImportedBriefFont' + file.id, `url("${file.data}")`);
    await face.load();
    if (loadedFontFace) document.fonts.delete(loadedFontFace);
    document.fonts.add(face);
    loadedFontFace = face;
    loadedFontId = file.id;
    return face;
  }

  function bindFontImport() {
    const input = document.querySelector('#fontFileInput');
    document.querySelector('#importFontButton').onclick = () => input.click();
    document.querySelector('#removeImportedFont').onclick = () => {
      brief.fontFile = null; brief.font = '';
      document.querySelector('#font').value = '';
      updateImportedFontUI(); updateFontPreview(); save();
    };
    if (brief.fontFile && loadedFontId !== brief.fontFile.id) {
      const file = brief.fontFile;
      loadImportedFont(file).then(() => { if (brief.fontFile?.id === file.id && document.querySelector('#fontPicker')) updateFontPreview(); }).catch(() => {
        if (brief.fontFile?.id === file.id && document.querySelector('#fontPreviewSample')) document.querySelector('#fontPreviewSample').textContent = 'This imported font could not be previewed. You can replace it with another file.';
      });
    }
    input.onchange = async event => {
      const file = event.target.files?.[0];
      input.value = '';
      if (!file || importingFont) return;
      importingFont = true;
      const button = document.querySelector('#importFontButton');
      button.disabled = true;
      try {
        const types = { woff2: ['font/woff2', 'wOF2'], woff: ['font/woff', 'wOFF'], ttf: ['font/ttf', '\x00\x01\x00\x00'], otf: ['font/otf', 'OTTO'] };
        if (file.name.length > 255 || /[\\/\x00-\x1F\x7F]/.test(file.name)) throw new Error('Choose a font file with a shorter, valid name.');
        const extension = file.name.split('.').pop().toLowerCase();
        if (!types[extension]) throw new Error('Choose a WOFF2, WOFF, TTF, or OTF font file.');
        if (file.size > 2 * 1024 * 1024 || file.size < 32) throw new Error('Choose a font file smaller than 2 MB.');
        const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
        if (String.fromCharCode(...bytes) !== types[extension][1]) throw new Error('The selected file does not match its font format.');
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
        });
        const imported = { id: newId(), name: file.name.slice(0, 255), data: `data:${types[extension][0]};base64,${data.split(',')[1]}` };
        await loadImportedFont(imported);
        brief.fontFile = imported;
        brief.font = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 120);
        document.querySelector('#font').value = brief.font;
        closeFontPicker(); updateImportedFontUI(); updateFontPreview(); save();
        say('Font imported. Its file will be included with your brief.');
      } catch (error) { say(error.message || 'This font could not be imported.'); }
      finally { importingFont = false; if (button.isConnected) button.disabled = false; }
    };
  }

  document.addEventListener('pointerdown', event => {
    const picker = document.querySelector('#fontPicker');
    if (picker && !picker.contains(event.target)) closeFontPicker();
    const resolutionPicker = document.querySelector('#resolutionPicker');
    if (resolutionPicker && !resolutionPicker.contains(event.target)) closeResolutionPicker();
  });

  function bindResolutionPicker() {
    const picker = document.querySelector('#resolutionPicker');
    const field = document.querySelector('#resolution');
    const toggle = document.querySelector('#resolutionToggle');
    const menu = document.querySelector('#resolutionOptions');
    let active = -1;
    let choices = [];
    const close = () => {
      menu.hidden = true;
      field.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-expanded', 'false');
      field.removeAttribute('aria-activedescendant');
      active = -1;
    };
    closeResolutionPicker = close;
    const commit = () => {
      const size = parseResolution(field.value);
      if (size) field.value = size.label;
      brief.resolution = field.value;
      renderResolutionPreview(); save();
    };
    const choose = index => {
      if (!choices[index]) return;
      field.value = choices[index];
      commit(); field.focus(); close();
    };
    const highlight = index => {
      active = index;
      menu.querySelectorAll('[role="option"]').forEach((option, i) => option.classList.toggle('is-active', i === active));
      const option = menu.querySelectorAll('[role="option"]')[active];
      if (option) {
        field.setAttribute('aria-activedescendant', option.id);
        option.scrollIntoView({ block: 'nearest' });
      }
    };
    const open = (showAll = false) => {
      const searchable = value => value.toLowerCase().replace(/px|\s/g, '').replace(/×|by/g, 'x');
      const query = searchable(field.value);
      choices = resolutions.filter(size => showAll || searchable(size).includes(query));
      const custom = parseResolution(field.value);
      if (custom && !resolutions.includes(custom.label)) choices.unshift(custom.label);
      active = -1;
      field.removeAttribute('aria-activedescendant');
      menu.innerHTML = choices.length ? choices.map((size, index) => `<div id="resolutionOption${index}" class="resolution-option" role="option" aria-selected="${size === custom?.label}"><span>${size}</span>${!resolutions.includes(size) ? '<span class="resolution-custom">Custom size</span>' : ''}</div>`).join('') : '<p class="resolution-no-results">No matching presets. Type your own size, e.g. 1377 x 2111.</p>';
      menu.querySelectorAll('[role="option"]').forEach((option, index) => {
        option.onpointerdown = event => event.preventDefault();
        option.onpointermove = () => highlight(index);
        option.onclick = () => choose(index);
      });
      menu.hidden = false;
      field.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-expanded', 'true');
    };
    field.onfocus = () => open(true);
    field.onclick = () => { if (menu.hidden) open(true); };
    field.oninput = () => {
      brief.resolution = field.value;
      renderResolutionPreview(); save(); open();
    };
    field.onchange = commit;
    field.onblur = commit;
    field.onkeydown = event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (menu.hidden) open(true);
        if (choices.length) highlight(active < 0 ? (event.key === 'ArrowDown' ? 0 : choices.length - 1) : Math.max(0, Math.min(choices.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1))));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (!menu.hidden && active >= 0) choose(active);
        else { commit(); close(); }
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape' && !menu.hidden) event.preventDefault();
        close();
      }
    };
    toggle.onpointerdown = event => event.preventDefault();
    toggle.onclick = () => {
      if (menu.hidden) { field.focus(); open(true); } else close();
    };
    picker.onfocusout = event => { if (!picker.contains(event.relatedTarget)) close(); };
  }

  function validateResolution() {
    const size = parseResolution(brief.resolution);
    if (!size) {
      if (brief.step !== 1) { brief.step = 1; save(); render(); }
      document.querySelector('#resolution').setAttribute('aria-invalid', 'true');
      document.querySelector('#resolution').focus();
      say(resolutionHint);
      return false;
    }
    brief.resolution = size.label;
    return true;
  }

  function renderResolutionPreview() {
    const size = parseResolution(brief.resolution);
    document.querySelector('#resolution').setCustomValidity(size ? '' : resolutionHint);
    if (!size) {
      document.querySelector('#resolutionPreview').innerHTML = `<p class="resolution-empty">${resolutionHint}</p>`;
      return;
    }
    document.querySelector('#resolution').removeAttribute('aria-invalid');
    const { width, height } = size;
    const scale = Math.min(240 / width, 140 / height);
    const previewWidth = width * scale, previewHeight = height * scale;
    const x = (320 - previewWidth) / 2, y = (190 - previewHeight) / 2;
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const divisor = gcd(width, height);
    const shape = width === height ? 'Square' : width > height ? 'Landscape' : 'Portrait';
    document.querySelector('#resolutionPreview').innerHTML = `
      <svg viewBox="0 0 320 190" role="img" aria-label="Blank ${width} by ${height} pixel canvas, ${shape.toLowerCase()}">
        <rect class="resolution-canvas" x="${x}" y="${y}" width="${previewWidth}" height="${previewHeight}" />
        <text x="160" y="${y - 10}" text-anchor="middle">${width} px</text>
        <text transform="translate(${x + previewWidth + 16} 95) rotate(90)" text-anchor="middle">${height} px</text>
      </svg>
      <p class="resolution-shape">${shape} <span aria-hidden="true">·</span> ${width / divisor}:${height / divisor}</p>`;
  }

  function palettePreview(editable = false) {
    if (!brief.palette.length) return '<p class="subtle">No preferred colors selected.</p>';
    return '<div class="palette-strip palette-selected-strip" aria-hidden="true">' + brief.palette.map(color => `<span style="background-color:${color}"></span>`).join('') + '</div><div class="palette-swatches">' + brief.palette.map(color => `<span class="palette-swatch"><span class="palette-dot" style="background-color:${color}" aria-hidden="true"></span>${color}${editable ? `<button type="button" data-remove-color="${color}" aria-label="Remove ${color}">&times;</button>` : ''}</span>`).join('') + '</div>';
  }

  function bindReferenceActions() {
    app.querySelectorAll('[data-remove-reference]').forEach(button => button.onclick = () => {
      brief.references = brief.references.filter(item => item.id !== button.dataset.removeReference);
      save(); render(); say('Reference removed.');
    });
    app.querySelectorAll('[data-edit-reference]').forEach(button => button.onclick = () => openSketch(button.dataset.editReference));
  }

  function renderPreferencesCard() {
    return `
      <section class="card brief-preferences">
        <div class="row"><h2>Make it your own</h2><span class="hint">Optional</span></div>
        <p class="subtle">Share your preferred colors and font to guide your artist.</p>
        <div class="field-grid">
          <div class="field full"><span id="paletteLabel">Preferred color palette</span>
            <button class="palette-toggle" id="togglePaletteTemplates" type="button" aria-expanded="${paletteTemplatesExpanded}" aria-controls="paletteTemplatePanel"><span>Palette templates <span class="palette-toggle-count">(${paletteTemplates.length})</span></span><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div id="paletteTemplatePanel" ${paletteTemplatesExpanded ? '' : 'hidden'}>
            <p class="palette-help">Choose a template to replace your palette, then customize the colors below.</p>
            <div class="palette-templates" role="group" aria-label="Color palette templates">${paletteTemplates.map((template, index) => `<button class="palette-template" type="button" data-palette-template="${index}" aria-pressed="false" aria-label="Use ${escape(template.name)} palette: ${template.colors.join(', ')}"><span class="palette-strip" aria-hidden="true">${template.colors.map(color => `<span style="background-color:${color}"></span>`).join('')}</span><span class="palette-template-caption"><strong>${escape(template.name)}</strong><span class="palette-template-status">Use palette</span></span></button>`).join('')}</div>
            </div>
            <div class="palette-selection-heading"><strong>Your palette</strong><button class="small" type="button" id="clearPalette">Clear palette</button></div>
            <div id="paletteChoices" aria-labelledby="paletteLabel"></div>
            <div class="palette-controls"><input id="paletteColor" type="color" value="#3659E3" aria-label="Choose a palette color"><button class="small" type="button" id="addColor">Add color</button><span class="subtle">Customize with up to 8 colors</span></div>
          </div>
          <div class="field full font-picker" id="fontPicker">
            <span id="fontLabel">Preferred font</span>
            <div class="font-picker-control">
            <button class="font-picker-toggle" id="fontPickerToggle" type="button" aria-expanded="false" aria-controls="fontPickerPanel" aria-labelledby="fontLabel fontPickerValue"><span class="font-trigger-sample" id="fontTriggerSample" aria-hidden="true">Aa</span><span id="fontPickerValue">Choose a font</span><svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <div class="font-picker-panel" id="fontPickerPanel" hidden>
              <div class="font-panel-heading"><strong>Find your type</strong><button class="small" id="clearFont" type="button">No preference</button></div>
              <p class="font-help">Choose a sample to see how your text could look.</p>
              <input class="font-search" id="fontSearch" type="search" placeholder="Search fonts or styles" aria-label="Search fonts or styles" autocomplete="off">
              <div class="font-options" role="group" aria-label="Font samples">${fontChoices.map((font, index) => `<button class="font-option" type="button" data-font-choice="${index}" aria-pressed="false" aria-label="Choose ${escape(font.name)}"><span class="font-option-sample" style="font-family:${escape(font.family)}" aria-hidden="true">Aa Bb</span><span class="font-option-name">${escape(font.name)}</span><span class="font-option-type">${font.type}</span></button>`).join('')}</div>
              <p class="font-no-results" id="fontNoResults" role="status" hidden>No fonts match that search. You can still type a custom font name below.</p>
              <label class="field font-custom" for="font">Have another font in mind?<input id="font" maxlength="120" autocomplete="off" placeholder="Type a custom font name" value="${escape(brief.font)}" aria-describedby="fontCustomHelp"></label><p class="font-help" id="fontCustomHelp">Custom names are shared with your artist. Only the fonts above have a preview.</p>
            </div>
            </div>
            <div class="font-import-actions"><input id="fontFileInput" type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" hidden><button class="small" id="importFontButton" type="button">Import font file</button><span class="subtle">WOFF2, WOFF, TTF, or OTF · up to 2 MB</span></div>
            <div class="font-imported" id="fontImported" ${brief.fontFile ? '' : 'hidden'}><span id="fontImportedName">${escape(brief.fontFile?.name || '')}</span><button class="small" id="removeImportedFont" type="button">Remove</button></div>
            <div class="font-preview" id="fontPreview" hidden><span class="font-preview-label" id="fontPreviewLabel"></span><p class="font-preview-sample" id="fontPreviewSample">The start of something beautiful.</p><span class="font-preview-alphabet" id="fontPreviewAlphabet">Aa Bb Cc Dd Ee · 0123456789</span></div>
          </div>
        </div>
      </section>
    `;
  }

  function bindPreferencesCard() {
    const updateFont = event => {
      brief.font = event.target.value;
      if (brief.fontFile) { brief.fontFile = null; updateImportedFontUI(); }
      updateFontPreview(); save();
    };
    document.querySelector('#font').oninput = updateFont;
    document.querySelector('#font').onchange = updateFont;
    bindFontPicker();
    bindFontImport();
    const renderPalette = () => {
      document.querySelector('#paletteChoices').innerHTML = palettePreview(true);
      document.querySelector('#addColor').disabled = brief.palette.length >= 8;
      document.querySelector('#clearPalette').hidden = !brief.palette.length;
      app.querySelectorAll('[data-palette-template]').forEach(button => {
        const template = paletteTemplates[Number(button.dataset.paletteTemplate)];
        const selected = template.colors.length === brief.palette.length && template.colors.every((color, index) => color === brief.palette[index]);
        button.setAttribute('aria-pressed', String(selected));
        button.querySelector('.palette-template-status').textContent = selected ? 'Selected' : 'Use palette';
      });
      app.querySelectorAll('[data-remove-color]').forEach(button => button.onclick = () => {
        brief.palette = brief.palette.filter(color => color !== button.dataset.removeColor);
        save(); renderPalette(); document.querySelector('#addColor').focus();
      });
    };
    renderPalette();
    document.querySelector('#togglePaletteTemplates').onclick = event => {
      paletteTemplatesExpanded = !paletteTemplatesExpanded;
      event.currentTarget.setAttribute('aria-expanded', String(paletteTemplatesExpanded));
      document.querySelector('#paletteTemplatePanel').hidden = !paletteTemplatesExpanded;
    };
    app.querySelectorAll('[data-palette-template]').forEach(button => button.onclick = () => {
      const template = paletteTemplates[Number(button.dataset.paletteTemplate)];
      brief.palette = [...template.colors];
      save(); renderPalette(); say(template.name + ' palette selected. You can customize its colors below.');
    });
    document.querySelector('#clearPalette').onclick = () => {
      brief.palette = []; save(); renderPalette(); document.querySelector('#addColor').focus();
    };
    document.querySelector('#addColor').onclick = () => {
      const color = document.querySelector('#paletteColor').value.toUpperCase();
      if (brief.palette.includes(color)) return say('That color is already in your palette.');
      if (brief.palette.length >= 8) return;
      brief.palette = [...brief.palette, color]; save(); renderPalette();
    };
  }

  function renderDirection() {
    app.innerHTML = `
      <div class="eyebrow">Step 02 — set direction</div>
      <h1>Choose the <em>creative mood.</em></h1>
      <p class="intro">These choices shape the visual language without locking you into a final design.</p>
      ${renderPreferencesCard()}
      ${footer(1, 'Continue to references')}`;
    bindPreferencesCard();
    bindFooter(1, () => { if (addingReferences) return say('Please wait for your images to finish loading.'); if (importingFont) return say('Please wait for your font to finish loading.'); brief.step = 3; save(); render(); });
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
      <div class="source-summary"><div><strong>${escape(briefTitle())}</strong><div>${escape(brief.idea || (brief.ideaFile ? `Idea attached: ${brief.ideaFile.name}` : 'No description yet'))}</div></div><button class="summary-link" id="editDescribe">Edit description</button></div>
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
    bindReferenceActions();
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
      <section class="card brief-preferences"><div class="summary"><strong>Resolution size</strong><div>${escape(brief.resolution)}</div></div><div class="summary"><strong>Additional note</strong><div>${escape(brief.note || 'Not specified')}</div></div><div class="summary"><strong>Preferred font</strong><div>${escape(brief.font || 'No preference')}${brief.fontFile ? `<br>Imported file: ${escape(brief.fontFile.name)}` : ''}</div></div><div class="summary"><strong>Preferred color palette</strong>${palettePreview()}</div></section>
      <section class="review"><div class="card"><div class="summary"><strong>Project</strong><div>${escape(briefTitle())}</div></div><div class="summary"><strong>Idea</strong><div>${escape(brief.idea || 'Provided in the attached document')}</div></div>${brief.ideaFile ? `<div class="summary"><strong>Idea document</strong><div>${escape(brief.ideaFile.name)}</div></div>` : ''}</div><div class="card"><h2>Visual references (${brief.references.length})</h2>${referenceGallery()}</div></section>
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
      if (importingIdeaFile) return say('Please wait for your document to finish loading.');
      if (!validateResolution()) return;
      if (!brief.idea.trim() && !brief.ideaFile) {
        brief.step = 1; save(); render();
        say('Describe your idea or attach a DOCX or PDF file before saving your brief.');
        document.querySelector('#idea').focus();
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
        for (const key of ['projectName', 'projectType', 'resolution', 'idea', 'note', 'font', 'palette', 'audience', 'goal']) snapshot[key] = brief[key];
        if (brief.ideaFile) snapshot.ideaFile = { name: brief.ideaFile.name, data: brief.ideaFile.data };
        if (brief.fontFile) snapshot.fontFile = { name: brief.fontFile.name, data: brief.fontFile.data };
        snapshot.references = [];
        for (const [index, reference] of brief.references.entries()) {
          status.textContent = `Uploading reference ${index + 1} of ${brief.references.length}: ${reference.name}`;
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([window.CLIENT_SESSION.id, reference.id, reference.name, reference.kind, reference.data])));
          const id = Array.from(new Uint8Array(digest).slice(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
          const result = await post('upload-reference.php', { csrf: window.CLIENT_SESSION.csrf, id, name: reference.name, kind: reference.kind, data: reference.data });
          if (result.id !== id) throw new Error('A reference could not be confirmed. Please retry.');
          snapshot.references.push(id);
        }
        status.textContent = 'Saving your brief and attachments to your account…';
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
      <p>Your creative brief and its attachments are saved to your account. You can reopen them from My briefs.</p>
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
    getName: briefTitle,
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
