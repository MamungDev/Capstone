// A fixed-resolution drawing surface; zoom and the alignment grid are view-only.
(() => {
  window.createClientSketchpad = ({ onSave, getName }) => {
    const icons = {
      pencil: '<path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4"/>',
      marker: '<path d="m5 14 9-10 6 6-10 9-5-5ZM5 14l-2 7 7-2M13 5l6 6"/>',
      eraser: '<path d="m4 12 9-9 8 8-9 9H8l-4-4v-4ZM8 8l8 8M12 20h9"/>',
      line: '<path d="m4 20 16-16"/>',
      arrow: '<path d="M4 20 20 4M9 4h11v11"/>',
      rectangle: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
      ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
      text: '<path d="M4 7V4h16v3M12 4v16M8 20h8"/>',
      picker: '<path d="m14 4 6 6M16 6 5 17l-1 4 4-1L19 9M13 5l3-3 6 6-3 3"/>',
      pan: '<path d="M8 12V5a2 2 0 0 1 4 0v7-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v9c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2"/>',
      undo: '<path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14"/>',
      redo: '<path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14"/>',
      clear: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    };
    const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
    const toolNames = { pencil: 'Pencil', marker: 'Marker', eraser: 'Eraser', line: 'Line', arrow: 'Arrow', rectangle: 'Rectangle', ellipse: 'Ellipse', text: 'Text', picker: 'Pick color', pan: 'Pan' };
    const dialog = document.createElement('dialog');
    dialog.className = 'sketch-dialog';
    dialog.setAttribute('aria-labelledby', 'sketch-title');
    dialog.innerHTML = `<div class="modal sketch-modal">
      <div class="modalhead"><div><span class="sketch-eyebrow">YOUR CREATIVE SPACE</span><h2 id="sketch-title">Sketch the feeling</h2><p class="subtle">Bring your ideas to life. Draw, add shapes, and leave notes for your artist.</p></div><button type="button" class="x" id="sketchClose" aria-label="Close sketchpad">&times;</button></div>
      <div class="sketch-toolbar">
        <div class="sketch-group sketch-tool-group"><span class="sketch-label">Tools</span><div class="sketch-controls" role="group" aria-label="Drawing tools">${Object.entries(toolNames).map(([tool, label]) => `<button type="button" class="sketch-tool" data-tool="${tool}" aria-label="${label}" title="${label}" aria-pressed="${tool === 'pencil'}">${svg(tool)}</button>`).join('')}</div></div>
        <div class="sketch-group"><span class="sketch-label">Edit</span><div class="sketch-controls"><button type="button" class="sketch-tool" id="sketchUndo" aria-label="Undo" title="Undo (Ctrl/Cmd+Z)">${svg('undo')}</button><button type="button" class="sketch-tool" id="sketchRedo" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)">${svg('redo')}</button><button type="button" class="sketch-tool" id="clearSketch" aria-label="Clear canvas" title="Clear canvas (can be undone)">${svg('clear')}</button></div></div>
        <div class="sketch-group"><span class="sketch-label">Colors</span><div class="sketch-controls sketch-colors"><input id="sketchColor" type="color" value="#1d2b4d" aria-label="Custom color" title="Choose any color">${[['#1d2b4d','Navy'],['#3158c9','Blue'],['#f17d67','Coral'],['#e5a72d','Gold'],['#20bfa9','Mint'],['#ffffff','White']].map(([color,label]) => `<button type="button" class="color" data-colour="${color}" style="background:${color}" aria-label="${label}" aria-pressed="false" title="${label}"></button>`).join('')}</div></div>
        <div class="sketch-settings">
          <label class="sketch-group"><span class="sketch-label">Stroke <output id="brushValue">5 px</output></span><input id="brushSize" type="range" min="1" max="50" value="5"></label>
          <label class="sketch-group"><span class="sketch-label">Opacity <output id="opacityValue">100%</output></span><input id="sketchOpacity" type="range" min="10" max="100" value="100" step="5"></label>
          <label class="sketch-check"><input id="sketchFill" type="checkbox"> Fill shapes</label>
          <label class="sketch-check"><input id="sketchGrid" type="checkbox"> Grid</label>
          <label class="sketch-check"><input id="sketchSnap" type="checkbox"> Snap to grid</label>
          <div class="sketch-group sketch-zoom"><span class="sketch-label">Zoom <output id="zoomValue">100%</output></span><div class="sketch-controls"><button type="button" class="sketch-tool" id="zoomOut" aria-label="Zoom out">&minus;</button><button type="button" class="sketch-tool" id="zoomIn" aria-label="Zoom in">+</button><button type="button" class="small" id="zoomFit" title="Fit the whole canvas">Fit</button></div></div>
        </div>
        <div class="sketch-text-settings" id="textSettings" hidden><button type="button" class="small" id="addTextBox" draggable="true">+ Add text box</button><label for="sketchFont">Text size</label><input id="sketchFont" type="number" min="12" max="96" value="28"><span>Add or drag a text box onto the canvas. Type inside it; drag its Move handle to reposition.</span></div>
      </div>
      <div class="sketch-workspace" id="sketchViewport"><div class="sketch-sheet"><canvas id="sketchCanvas" width="1200" height="720" aria-label="Sketch canvas. Use the drawing tools to draw with a mouse, pen, or touch."></canvas><div class="sketch-grid" hidden></div><div class="sketch-text-layer"></div></div></div>
      <div class="sketch-status"><span id="sketchHint" role="status">Pencil: draw freely on the canvas.</span><span>1200 &times; 720 px</span></div>
      <div class="modalactions"><span class="subtle" id="sketchMessage" role="status">Use this sketch to attach it to your brief.</span><div class="sketch-actions"><button type="button" class="small sketch-download" id="downloadSketch">${svg('download')} Download PNG</button><button type="button" class="continue" id="saveSketch">Use this sketch</button></div></div>
    </div>`;
    document.body.append(dialog);
    const $ = selector => dialog.querySelector(selector);
    const canvas = $('#sketchCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const viewport = $('#sketchViewport');
    const sheet = $('.sketch-sheet');
    const width = canvas.width, height = canvas.height;
    const textLayer = $('.sketch-text-layer');
    let textBoxes = [], selectedText = null, textDrag = null;
    const cloneBoxes = () => textBoxes.map(box => ({ ...box }));
    let tool = 'pencil', color = '#1d2b4d', zoom = 1, gesture = null;
    let history = [], historyIndex = -1, source, draft, loading = false, loadVersion = 0;
    const hints = {
      pencil: 'Pencil: draw freely on the canvas.', marker: 'Marker: add a soft, translucent stroke.',
      eraser: 'Eraser: brush over marks to remove them.', line: 'Drag a line. Hold Shift for 45-degree angles.',
      arrow: 'Drag an arrow to point out a detail. Hold Shift to constrain its angle.',
      rectangle: 'Drag a rectangle. Hold Shift for a square.', ellipse: 'Drag an ellipse. Hold Shift for a circle.',
      text: 'Add a text box, type inside it, and drag its Move handle. Arrow keys on the handle move it precisely.', picker: 'Click anywhere on the sketch to pick its color.',
      pan: 'Drag to move around a zoomed canvas.',
    };
    function updateHistory() {
      $('#sketchUndo').disabled = loading || historyIndex <= 0;
      $('#sketchRedo').disabled = loading || historyIndex >= history.length - 1;
    }
    function commit() {
      history.splice(historyIndex + 1);
      history.push({ pixels: ctx.getImageData(0, 0, width, height), boxes: cloneBoxes() });
      // Bound memory while retaining the latest 20 edits and their starting state.
      if (history.length > 21) history.shift();
      historyIndex = history.length - 1;
      updateHistory();
    }
    function restore() { if (historyIndex >= 0) ctx.putImageData(history[historyIndex].pixels, 0, 0); }
    function undo(direction) {
      if (loading || gesture || textDrag) return;
      finishTextEdit();
      const next = historyIndex + direction;
      if (next < 0 || next >= history.length) return;
      historyIndex = next; restore(); textBoxes = history[next].boxes.map(box => ({ ...box })); renderTextBoxes(); updateHistory();
    }
    function setColor(value) {
      color = value.toLowerCase(); $('#sketchColor').value = color;
      dialog.querySelectorAll('[data-colour]').forEach(button => {
        const selected = button.dataset.colour === color;
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected);
      });
    }
    function setTool(value) {
      tool = value;
      dialog.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tool === tool));
      $('#textSettings').hidden = tool !== 'text';
      $('#sketchHint').textContent = hints[tool];
      canvas.style.cursor = tool === 'pan' ? 'grab' : tool === 'text' ? 'text' : 'crosshair';
      textLayer.classList.toggle('is-editing', tool === 'text');
      textLayer.querySelectorAll('textarea').forEach(input => { input.readOnly = tool !== 'text'; input.tabIndex = tool === 'text' ? 0 : -1; });
      finishTextEdit();
    }
    function layout() {
      const fittedWidth = Math.min(width, Math.max(1, viewport.clientWidth - 32), Math.max(1, viewport.clientHeight - 32) * width / height);
      sheet.style.width = `${fittedWidth * zoom}px`;
      sheet.style.height = `${fittedWidth * zoom * height / width}px`;
      sheet.style.setProperty('--grid-size', `${24 * fittedWidth * zoom / width}px`);
      $('#zoomValue').textContent = `${Math.round(zoom * 100)}%`;
      $('#zoomOut').disabled = zoom <= .5; $('#zoomIn').disabled = zoom >= 3;
      textBoxes.forEach(positionTextBox);
    }
    function setZoom(value) {
      const previous = zoom;
      const centerX = viewport.scrollLeft + viewport.clientWidth / 2;
      const centerY = viewport.scrollTop + viewport.clientHeight / 2;
      zoom = Math.max(.5, Math.min(3, value)); layout();
      viewport.scrollLeft = centerX * zoom / previous - viewport.clientWidth / 2;
      viewport.scrollTop = centerY * zoom / previous - viewport.clientHeight / 2;
    }
    new ResizeObserver(() => { if (dialog.open) layout(); }).observe(viewport);
    function point(event, snap = false) {
      const rect = canvas.getBoundingClientRect();
      const p = { x: Math.max(0, Math.min(width, (event.clientX - rect.left) * width / rect.width)), y: Math.max(0, Math.min(height, (event.clientY - rect.top) * height / rect.height)) };
      if (snap && $('#sketchSnap').checked) { p.x = Math.round(p.x / 24) * 24; p.y = Math.round(p.y / 24) * 24; }
      return p;
    }
    // Text stays separate from the drawing until export, so moving a label never
    // erases artwork underneath it. Drafts keep this editable layer as well.
    function textLines(box) {
      ctx.save(); ctx.font = `600 ${box.size}px Arial, sans-serif`;
      const lines = [];
      for (const paragraph of box.text.split('\n')) {
        let line = '';
        for (const word of paragraph.split(/(\s+)/)) {
          if (line && ctx.measureText(line + word).width > box.width - 16) { lines.push(line); line = ''; }
          for (const char of word) {
            if (line && ctx.measureText(line + char).width > box.width - 16) { lines.push(line); line = ''; }
            line += char;
          }
        }
        lines.push(line);
      }
      ctx.restore(); return lines;
    }
    function boxHeight(box) { return Math.min(height, Math.max(box.size * 1.25 + 16, textLines(box).length * box.size * 1.25 + 16)); }
    function constrainBox(box) {
      box.x = Math.max(0, Math.min(width - box.width, box.x));
      box.y = Math.max(0, Math.min(height - boxHeight(box), box.y));
    }
    function positionTextBox(box) {
      const element = textLayer.querySelector(`[data-text-id="${box.id}"]`);
      if (!element) return;
      const scale = sheet.getBoundingClientRect().width / width;
      element.style.left = `${box.x / width * 100}%`; element.style.top = `${box.y / height * 100}%`;
      element.style.width = `${box.width * scale}px`; element.style.height = `${boxHeight(box) * scale}px`;
      element.classList.toggle('is-selected', selectedText === box.id);
      element.classList.toggle('is-near-top', box.y * scale < 30);
      const input = element.querySelector('textarea');
      input.style.fontSize = `${box.size * scale}px`; input.style.padding = `${8 * scale}px`;
      input.style.color = box.color; input.style.opacity = box.opacity;
    }
    function selectTextBox(box) {
      selectedText = box.id; $('#sketchFont').value = box.size;
      setColor(box.color); $('#sketchOpacity').value = box.opacity * 100;
      $('#opacityValue').textContent = `${Math.round(box.opacity * 100)}%`;
      textBoxes.forEach(positionTextBox);
    }
    function finishTextEdit() {
      if (loading || historyIndex < 0 || textDrag) return;
      if (JSON.stringify(textBoxes) !== JSON.stringify(history[historyIndex].boxes)) commit();
    }
    function renderTextBoxes(focusId = null) {
      textLayer.replaceChildren();
      textBoxes.forEach(box => {
        const element = document.createElement('div'); element.className = 'sketch-text-box'; element.dataset.textId = box.id;
        const input = document.createElement('textarea');
        input.className = 'sketch-text-input'; input.value = box.text; input.maxLength = 500;
        input.readOnly = tool !== 'text'; input.tabIndex = tool === 'text' ? 0 : -1;
        input.setAttribute('aria-label', 'Sketch text box'); input.spellcheck = false;
        input.onfocus = () => selectTextBox(box);
        input.oninput = () => { box.text = input.value; constrainBox(box); positionTextBox(box); };
        input.onblur = finishTextEdit;
        const actions = document.createElement('div'); actions.className = 'sketch-text-handles';
        const move = document.createElement('button'); move.type = 'button'; move.textContent = '✥ Move';
        move.className = 'sketch-text-move'; move.setAttribute('aria-label', 'Move text box');
        move.title = 'Drag to move. Arrow keys move 1 px; Shift moves 10 px.';
        move.onpointerdown = event => {
          if (event.button !== 0 || loading || gesture || textDrag) return;
          event.preventDefault(); finishTextEdit(); input.blur(); selectTextBox(box); move.focus({ preventScroll: true });
          textDrag = { id: event.pointerId, box, start: point(event), x: box.x, y: box.y, handle: move };
          move.setPointerCapture(event.pointerId);
        };
        move.onpointermove = event => {
          if (!textDrag || textDrag.id !== event.pointerId) return;
          event.preventDefault(); const p = point(event);
          box.x = textDrag.x + p.x - textDrag.start.x; box.y = textDrag.y + p.y - textDrag.start.y;
          if ($('#sketchSnap').checked) { box.x = Math.round(box.x / 24) * 24; box.y = Math.round(box.y / 24) * 24; }
          constrainBox(box); positionTextBox(box);
        };
        move.onpointerup = event => finishTextDrag(event);
        move.onpointercancel = event => finishTextDrag(event, true);
        move.onlostpointercapture = event => finishTextDrag(event, true);
        move.onkeydown = event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const amount = event.shiftKey ? 10 : 1;
          box.x += event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
          box.y += event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
          constrainBox(box); positionTextBox(box); commit();
        };
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×';
        remove.setAttribute('aria-label', 'Delete text box'); remove.title = 'Delete text box';
        remove.onclick = () => { finishTextEdit(); textBoxes = textBoxes.filter(item => item.id !== box.id); selectedText = null; renderTextBoxes(); commit(); $('#addTextBox').focus(); };
        actions.append(move, remove); element.append(input, actions); textLayer.append(element); positionTextBox(box);
        if (focusId === box.id) { input.focus({ preventScroll: true }); input.select(); }
      });
    }
    function finishTextDrag(event, cancel = false) {
      if (!textDrag || (event && event.pointerId !== textDrag.id)) return;
      const drag = textDrag; textDrag = null;
      if (cancel) { drag.box.x = drag.x; drag.box.y = drag.y; positionTextBox(drag.box); }
      else if (drag.box.x !== drag.x || drag.box.y !== drag.y) commit();
      if (drag.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id);
    }
    function addTextBox(p) {
      if (loading) return;
      finishTextEdit();
      if (textBoxes.length >= 30) { $('#sketchHint').textContent = 'You can add up to 30 text boxes. Edit or remove an existing box.'; return; }
      const box = { id: crypto.randomUUID(), x: p.x, y: p.y, width: 340, size: Math.max(12, Math.min(96, Number($('#sketchFont').value) || 28)), color, opacity: Number($('#sketchOpacity').value) / 100, text: 'Your text' };
      constrainBox(box); textBoxes.push(box); selectedText = box.id; commit(); renderTextBoxes(box.id);
    }
    function changeSelectedText(update) {
      const box = tool === 'text' && textBoxes.find(item => item.id === selectedText);
      if (!box) return;
      finishTextEdit(); update(box); constrainBox(box); positionTextBox(box); commit();
    }
    function exportCanvas() {
      finishTextEdit();
      const output = document.createElement('canvas'); output.width = width; output.height = height;
      const outputContext = output.getContext('2d'); outputContext.drawImage(canvas, 0, 0);
      for (const box of textBoxes) {
        outputContext.save(); outputContext.beginPath(); outputContext.rect(box.x, box.y, box.width, boxHeight(box)); outputContext.clip();
        outputContext.font = `600 ${box.size}px Arial, sans-serif`; outputContext.textBaseline = 'top';
        outputContext.fillStyle = box.color; outputContext.globalAlpha = box.opacity;
        textLines(box).forEach((line, index) => outputContext.fillText(line, box.x + 8, box.y + 8 + index * box.size * 1.25));
        outputContext.restore();
      }
      return output;
    }
    function readDocument(value) {
      if (!value || value.version !== 1 || typeof value.background !== 'string' || !/^data:image\/png;base64,/.test(value.background) || !Array.isArray(value.textBoxes) || value.textBoxes.length > 30) return null;
      const boxes = value.textBoxes;
      if (!boxes.every(box => box && typeof box.text === 'string' && box.text.length <= 500 && /^#[a-f0-9]{6}$/i.test(box.color) && ['x', 'y', 'width', 'size', 'opacity'].every(key => Number.isFinite(box[key])) && box.width >= 100 && box.width <= width && box.size >= 12 && box.size <= 96 && box.opacity >= .1 && box.opacity <= 1)) return null;
      return { background: value.background, textBoxes: boxes.map(box => ({ id: crypto.randomUUID(), text: box.text, x: box.x, y: box.y, width: box.width, size: box.size, color: box.color, opacity: box.opacity })) };
    }
    function paint(event) {
      const g = gesture;
      const end = point(event, !['pencil', 'marker', 'eraser'].includes(g.tool));
      restore();
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle = g.tool === 'eraser' ? '#ffffff' : color;
      ctx.lineWidth = Number($('#brushSize').value);
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.globalAlpha = g.tool === 'eraser' ? 1 : Number($('#sketchOpacity').value) / 100 * (g.tool === 'marker' ? .3 : 1);
      if (g.tool === 'marker') ctx.lineWidth *= 3;
      if (['pencil', 'marker', 'eraser'].includes(g.tool)) {
        g.points.push(end);
        ctx.beginPath(); ctx.moveTo(g.start.x, g.start.y);
        g.points.forEach(p => ctx.lineTo(p.x, p.y));
        if (g.points.every(p => p.x === g.start.x && p.y === g.start.y)) {
          ctx.arc(g.start.x, g.start.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
        } else ctx.stroke();
      } else {
        let dx = end.x - g.start.x, dy = end.y - g.start.y;
        if (event.shiftKey) {
          if (g.tool === 'line' || g.tool === 'arrow') {
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
            const length = Math.hypot(dx, dy); dx = Math.cos(angle) * length; dy = Math.sin(angle) * length;
          } else { const side = Math.max(Math.abs(dx), Math.abs(dy)); dx = (Math.sign(dx) || 1) * side; dy = (Math.sign(dy) || 1) * side; }
        }
        const x = g.start.x, y = g.start.y;
        ctx.beginPath();
        if (g.tool === 'rectangle') ctx.rect(x, y, dx, dy);
        else if (g.tool === 'ellipse') ctx.ellipse(x + dx / 2, y + dy / 2, Math.abs(dx / 2), Math.abs(dy / 2), 0, 0, Math.PI * 2);
        else {
          ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy);
          if (g.tool === 'arrow' && Math.hypot(dx, dy) > 0) {
            const angle = Math.atan2(dy, dx), head = Math.min(Math.hypot(dx, dy) / 2, Math.max(16, ctx.lineWidth * 3));
            for (const direction of [-1, 1]) { ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + dx - head * Math.cos(angle + direction * Math.PI / 6), y + dy - head * Math.sin(angle + direction * Math.PI / 6)); }
          }
        }
        if ($('#sketchFill').checked && ['rectangle', 'ellipse'].includes(g.tool)) ctx.fill();
        else ctx.stroke();
      }
      ctx.restore();
    }
    canvas.addEventListener('pointerdown', event => {
      if (loading || gesture || event.button !== 0) return;
      event.preventDefault();
      finishTextEdit();
      const start = point(event, !['pencil', 'marker', 'eraser', 'picker'].includes(tool));
      if (tool === 'picker') {
        const pixel = ctx.getImageData(Math.min(width - 1, Math.floor(start.x)), Math.min(height - 1, Math.floor(start.y)), 1, 1).data;
        setColor('#' + Array.from(pixel.slice(0, 3), channel => channel.toString(16).padStart(2, '0')).join('')); return;
      }
      if (tool === 'text') {
        addTextBox(start); return;
      }
      gesture = { id: event.pointerId, tool, start, points: [], clientX: event.clientX, clientY: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      canvas.setPointerCapture(event.pointerId);
      if (tool === 'pan') canvas.style.cursor = 'grabbing';
      else paint(event);
    });
    canvas.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      event.preventDefault();
      if (gesture.tool === 'pan') {
        viewport.scrollLeft = gesture.left - (event.clientX - gesture.clientX);
        viewport.scrollTop = gesture.top - (event.clientY - gesture.clientY);
      } else paint(event);
    });
    function finish(event, cancel = false) {
      if (!gesture || (event && event.pointerId !== gesture.id)) return;
      const g = gesture;
      if (g.tool !== 'pan') { if (cancel) restore(); else { if (event) paint(event); commit(); } }
      gesture = null;
      if (canvas.hasPointerCapture(g.id)) canvas.releasePointerCapture(g.id);
      canvas.style.cursor = tool === 'pan' ? 'grab' : tool === 'text' ? 'text' : 'crosshair';
    }
    canvas.addEventListener('pointerup', event => finish(event));
    canvas.addEventListener('pointercancel', event => finish(event, true));
    canvas.addEventListener('lostpointercapture', event => finish(event, true));
    dialog.addEventListener('close', () => { finish(null, true); finishTextDrag(null, true); finishTextEdit(); });
    dialog.addEventListener('keydown', event => {
      if (event.target.matches('input, textarea, select')) return;
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); undo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1);
      }
    });
    dialog.querySelectorAll('[data-tool]').forEach(button => button.onclick = () => setTool(button.dataset.tool));
    dialog.querySelectorAll('[data-colour]').forEach(button => button.onclick = () => { setColor(button.dataset.colour); changeSelectedText(box => { box.color = color; }); });
    $('#sketchColor').oninput = event => setColor(event.target.value);
    $('#sketchColor').onchange = () => changeSelectedText(box => { box.color = color; });
    $('#brushSize').oninput = event => { $('#brushValue').textContent = `${event.target.value} px`; };
    $('#sketchOpacity').oninput = event => { $('#opacityValue').textContent = `${event.target.value}%`; };
    $('#sketchOpacity').onchange = event => changeSelectedText(box => { box.opacity = Number(event.target.value) / 100; });
    $('#sketchFont').onchange = event => {
      const size = Math.max(12, Math.min(96, Number(event.target.value) || 28)); event.target.value = size;
      changeSelectedText(box => { box.size = size; });
    };
    $('#addTextBox').onclick = () => {
      const rect = viewport.getBoundingClientRect();
      addTextBox(point({ clientX: rect.left + viewport.clientWidth / 2, clientY: rect.top + viewport.clientHeight / 2 }, true));
    };
    for (const button of [$('#addTextBox'), $('[data-tool="text"]')]) {
      button.draggable = true;
      button.ondragstart = event => { setTool('text'); event.dataTransfer.setData('application/x-sketch-text', 'new'); event.dataTransfer.effectAllowed = 'copy'; };
    }
    viewport.ondragover = event => {
      if (event.dataTransfer.types.includes('application/x-sketch-text')) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }
    };
    viewport.ondrop = event => {
      if (!event.dataTransfer.types.includes('application/x-sketch-text')) return;
      event.preventDefault(); setTool('text'); addTextBox(point(event, true));
    };
    $('#sketchGrid').onchange = event => { $('.sketch-grid').hidden = !event.target.checked; };
    $('#sketchSnap').onchange = event => { if (event.target.checked) { $('#sketchGrid').checked = true; $('.sketch-grid').hidden = false; } };
    $('#sketchUndo').onclick = () => undo(-1); $('#sketchRedo').onclick = () => undo(1);
    $('#clearSketch').onclick = () => { if (loading) return; finishTextEdit(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); textBoxes = []; selectedText = null; renderTextBoxes(); commit(); $('#sketchMessage').textContent = 'Canvas cleared. Use Undo to restore your sketch.'; };
    $('#zoomIn').onclick = () => setZoom(zoom + .25); $('#zoomOut').onclick = () => setZoom(zoom - .25);
    $('#zoomFit').onclick = () => { setZoom(1); viewport.scrollTo(0, 0); };
    $('#sketchClose').onclick = () => dialog.close();
    $('#saveSketch').onclick = () => {
      if (loading) return;
      source = exportCanvas().toDataURL('image/png');
      onSave(source, textBoxes.length ? { version: 1, background: canvas.toDataURL('image/png'), textBoxes: cloneBoxes() } : null); dialog.close();
    };
    $('#downloadSketch').onclick = () => {
      if (loading) return;
      exportCanvas().toBlob(blob => {
        if (!blob) { $('#sketchMessage').textContent = 'Could not export the sketch. Please try again.'; return; }
        const url = URL.createObjectURL(blob), link = document.createElement('a');
        link.href = url; link.download = `${(getName() || 'My sketch').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').slice(0, 80)}-sketch.png`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        $('#sketchMessage').textContent = 'PNG download started. Use this sketch to attach it to your brief.';
      }, 'image/png');
    };
    setColor(color); updateHistory();
    return {
      open(brief) {
        dialog.showModal();
        if (draft === brief && source === brief.sketch) { layout(); return; }
        draft = brief; source = brief.sketch;
        const version = ++loadVersion;
        history = []; historyIndex = -1; zoom = 1;
        const documentData = source ? readDocument(brief.sketchDocument) : null;
        textBoxes = documentData ? documentData.textBoxes : []; selectedText = null;
        textBoxes.forEach(constrainBox); renderTextBoxes();
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
        loading = !!source;
        $('#saveSketch').disabled = $('#downloadSketch').disabled = $('#clearSketch').disabled = loading;
        $('#sketchMessage').textContent = loading ? 'Opening your saved sketch...' : 'Use this sketch to attach it to your brief.';
        const ready = () => { loading = false; commit(); $('#saveSketch').disabled = $('#downloadSketch').disabled = $('#clearSketch').disabled = false; };
        if (source) {
          const image = new Image();
          image.onload = () => {
            if (version !== loadVersion) return;
            const scale = Math.min(width / image.width, height / image.height);
            const w = image.width * scale, h = image.height * scale;
            ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
            ready(); $('#sketchMessage').textContent = 'Use this sketch to attach it to your brief.';
          };
          image.onerror = () => {
            if (version !== loadVersion) return;
            if (documentData && textBoxes.length) { textBoxes = []; renderTextBoxes(); image.src = source; return; }
            ready(); $('#sketchMessage').textContent = 'The saved sketch could not be opened. You can draw a new one.';
          };
          image.src = documentData ? documentData.background : source;
        } else ready();
        updateHistory(); layout(); viewport.scrollTo(0, 0);
      },
    };
  };
})();
