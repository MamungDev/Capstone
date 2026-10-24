// A fixed-resolution drawing surface; zoom and the alignment grid are view-only.
(() => {
  window.createClientSketchpad = ({ onSave, getName }) => {
    const icons = {
      select: '<path d="M4 3v17l5-5 4 7 4-2-4-7 7-1L4 3Z"/>',
      pencil: '<path d="m4 16 12-12 4 4L8 20H4v-4ZM14 6l4 4"/>',
      marker: '<path d="m5 14 9-10 6 6-10 9-5-5ZM5 14l-2 7 7-2M13 5l6 6"/>',
      eraser: '<path d="m4 12 9-9 8 8-9 9H8l-4-4v-4ZM8 8l8 8M12 20h9"/>',
      line: '<path d="m4 20 16-16"/>',
      arrow: '<path d="M4 20 20 4M9 4h11v11"/>',
      rectangle: '<rect x="4" y="5" width="16" height="14" rx="1"/>',
      ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
      text: '<path d="M4 7V4h16v3M12 4v16M8 20h8"/>',
      picker: '<path d="m14 4 6 6M16 6 5 17l-1 4 4-1L19 9M13 5l3-3 6 6-3 3"/>',
      move: '<path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
      undo: '<path d="m8 4-5 5 5 5M3 9h11a7 7 0 0 1 0 14"/>',
      redo: '<path d="m16 4 5 5-5 5M21 9H10a7 7 0 0 0 0 14"/>',
      clear: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    };
    const svg = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
    const toolNames = { select: 'Select', pencil: 'Pencil', marker: 'Marker', eraser: 'Eraser', line: 'Line', arrow: 'Arrow', rectangle: 'Rectangle', ellipse: 'Ellipse', text: 'Text', picker: 'Pick color', move: 'Move' };
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
      <div class="sketch-workspace" id="sketchViewport"><div class="sketch-sheet"><canvas id="sketchCanvas" width="1200" height="720" tabindex="0" aria-label="Sketch canvas. Press V for Select or G for Move. Drag a selection box or Shift-click to select multiple elements. Arrow keys move the selection."></canvas><div class="sketch-grid" hidden></div><div class="sketch-text-layer"></div><div class="sketch-selection" hidden></div></div></div>
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
    let elements = [];
    let selectedIds = new Set();
    const imageCache = new Map();
    const cloneElements = () => structuredClone(elements);
    const cloneBoxes = () => textBoxes.map(box => ({ ...box }));
    let tool = 'pencil', color = '#1d2b4d', zoom = 1, gesture = null;
    let history = [], historyIndex = -1, source, draft, loading = false, loadVersion = 0;
    const hints = {
      select: 'Select (V): click an element or drag a box around several. Shift-click adds or removes; drag selected elements to move.',
      pencil: 'Pencil: draw freely on the canvas.', marker: 'Marker: add a soft, translucent stroke.',
      eraser: 'Eraser: brush over marks to remove them.', line: 'Drag a line. Hold Shift for 45-degree angles.',
      arrow: 'Drag an arrow to point out a detail. Hold Shift to constrain its angle.',
      rectangle: 'Drag a rectangle. Hold Shift for a square.', ellipse: 'Drag an ellipse. Hold Shift for a circle.',
      text: 'Add a text box, type inside it, and drag its Move handle. Arrow keys on the handle move it precisely.', picker: 'Click anywhere on the sketch to pick its color.',
      move: 'Move (G): click and drag a stroke, shape, arrow, or text box. Arrow keys nudge; Shift moves 10 px.',
    };
    function updateHistory() {
      $('#sketchUndo').disabled = loading || historyIndex <= 0;
      $('#sketchRedo').disabled = loading || historyIndex >= history.length - 1;
    }
    function commit() {
      history.splice(historyIndex + 1);
      history.push({ elements: cloneElements(), boxes: cloneBoxes() });
      // Bound memory while retaining the latest 20 edits and their starting state.
      if (history.length > 21) history.shift();
      historyIndex = history.length - 1;
      updateHistory();
    }
    function undo(direction) {
      if (loading || gesture || textDrag) return;
      finishTextEdit();
      const next = historyIndex + direction;
      if (next < 0 || next >= history.length) return;
      historyIndex = next; elements = structuredClone(history[next].elements); textBoxes = history[next].boxes.map(box => ({ ...box }));
      selectedIds.clear(); selectedText = null; renderDrawing(); renderTextBoxes(); updateHistory();
    }
    function setColor(value) {
      color = value.toLowerCase(); $('#sketchColor').value = color;
      dialog.querySelectorAll('[data-colour]').forEach(button => {
        const selected = button.dataset.colour === color;
        button.classList.toggle('active', selected); button.setAttribute('aria-pressed', selected);
      });
    }
    function setTool(value) {
      if (gesture || textDrag) return;
      tool = value;
      dialog.querySelectorAll('[data-tool]').forEach(button => button.setAttribute('aria-pressed', button.dataset.tool === tool));
      $('#textSettings').hidden = tool !== 'text';
      $('#sketchHint').textContent = hints[tool];
      canvas.style.cursor = tool === 'move' ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
      textLayer.classList.toggle('is-editing', tool === 'text');
      textLayer.classList.toggle('is-moving', ['move', 'select'].includes(tool));
      textLayer.querySelectorAll('textarea').forEach(input => { input.readOnly = tool !== 'text'; input.tabIndex = tool === 'text' ? 0 : -1; });
      finishTextEdit();
      if (!['move', 'select'].includes(tool)) selectedIds.clear();
      else if (!selectedIds.size && selectedText) selectedIds.add(selectedText);
      textBoxes.forEach(positionTextBox);
      updateSelection();
    }
    function layout() {
      const fittedWidth = Math.min(width, Math.max(1, viewport.clientWidth - 32), Math.max(1, viewport.clientHeight - 32) * width / height);
      sheet.style.width = `${fittedWidth * zoom}px`;
      sheet.style.height = `${fittedWidth * zoom * height / width}px`;
      sheet.style.setProperty('--grid-size', `${24 * fittedWidth * zoom / width}px`);
      $('#zoomValue').textContent = `${Math.round(zoom * 100)}%`;
      $('#zoomOut').disabled = zoom <= .5; $('#zoomIn').disabled = zoom >= 3;
      textBoxes.forEach(positionTextBox);
      updateSelection();
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
      element.classList.toggle('is-selected', ['move', 'select'].includes(tool) ? selectedIds.has(box.id) : selectedText === box.id);
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
    const freehandTools = ['pencil', 'marker', 'eraser'];
    const shapeTools = ['line', 'arrow', 'rectangle', 'ellipse'];
    function elementPath(element) {
      const path = new Path2D();
      if (freehandTools.includes(element.tool)) {
        const [start] = element.points;
        if (element.points.every(p => p.x === start.x && p.y === start.y)) {
          path.arc(start.x, start.y, element.lineWidth / 2, 0, Math.PI * 2);
          return { path, fill: true };
        }
        path.moveTo(start.x, start.y);
        element.points.slice(1).forEach(p => path.lineTo(p.x, p.y));
      } else {
        const { start, end } = element, dx = end.x - start.x, dy = end.y - start.y;
        if (element.tool === 'rectangle') path.rect(start.x, start.y, dx, dy);
        else if (element.tool === 'ellipse') path.ellipse(start.x + dx / 2, start.y + dy / 2, Math.abs(dx / 2), Math.abs(dy / 2), 0, 0, Math.PI * 2);
        else {
          path.moveTo(start.x, start.y); path.lineTo(end.x, end.y);
          if (element.tool === 'arrow' && Math.hypot(dx, dy) > 0) {
            const angle = Math.atan2(dy, dx), head = Math.min(Math.hypot(dx, dy) / 2, Math.max(16, element.lineWidth * 3));
            for (const direction of [-1, 1]) { path.moveTo(end.x, end.y); path.lineTo(end.x - head * Math.cos(angle + direction * Math.PI / 6), end.y - head * Math.sin(angle + direction * Math.PI / 6)); }
          }
        }
      }
      return { path, fill: element.fill && ['rectangle', 'ellipse'].includes(element.tool) };
    }
    function drawElement(element) {
      ctx.save(); ctx.translate(element.x, element.y);
      if (element.tool === 'image') {
        const image = imageCache.get(element.data);
        if (image) ctx.drawImage(image, 0, 0, element.width, element.height);
      } else {
        ctx.strokeStyle = ctx.fillStyle = element.color; ctx.globalAlpha = element.opacity;
        ctx.lineWidth = element.lineWidth; ctx.lineCap = ctx.lineJoin = 'round';
        const { path, fill } = elementPath(element);
        if (fill) ctx.fill(path); else ctx.stroke(path);
      }
      ctx.restore();
    }
    function renderDrawing(preview = null) {
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
      elements.forEach(drawElement);
      if (preview) drawElement(preview);
      updateSelection();
    }
    function bounds(element) {
      if (element.tool === 'image') return { x: element.x, y: element.y, width: element.width, height: element.height };
      const points = element.points || [element.start, element.end];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
      // Arrowheads can extend beyond the line's bounds.
      const pad = element.lineWidth / 2 + (element.tool === 'arrow' ? Math.min(Math.hypot(element.end.x - element.start.x, element.end.y - element.start.y) / 2, Math.max(16, element.lineWidth * 3)) : 0);
      return { x: minX + element.x - pad, y: minY + element.y - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
    }
    function selectableItems() {
      return [...elements.map(target => ({ target, isText: false, box: bounds(target) })), ...textBoxes.map(target => ({ target, isText: true, box: { x: target.x, y: target.y, width: target.width, height: boxHeight(target) } }))];
    }
    function selectionItems() { return selectableItems().filter(item => selectedIds.has(item.target.id)); }
    function setSelection(ids) {
      selectedIds = new Set(ids);
      const boxes = textBoxes.filter(box => selectedIds.has(box.id));
      selectedText = boxes.length === 1 ? boxes[0].id : null;
      textBoxes.forEach(positionTextBox); updateSelection();
    }
    function selectionBounds(items) {
      const x = Math.min(...items.map(item => item.box.x)), y = Math.min(...items.map(item => item.box.y));
      return { x, y, width: Math.max(...items.map(item => item.box.x + item.box.width)) - x, height: Math.max(...items.map(item => item.box.y + item.box.height)) - y };
    }
    function updateSelection() {
      const selection = $('.sketch-selection'), items = selectionItems();
      const marquee = gesture?.tool === 'marquee' ? gesture.box : null;
      selection.hidden = !['move', 'select'].includes(tool) || (!items.length && !marquee);
      selection.classList.toggle('is-marquee', !!marquee);
      selection.dataset.count = items.length;
      if (selection.hidden) return;
      const box = marquee || selectionBounds(items);
      selection.style.left = (box.x / width * 100) + '%'; selection.style.top = (box.y / height * 100) + '%';
      selection.style.width = (box.width / width * 100) + '%'; selection.style.height = (box.height / height * 100) + '%';
    }
    function selectMarquee(event) {
      const end = point(event), g = gesture;
      g.box = { x: Math.min(g.start.x, end.x), y: Math.min(g.start.y, end.y), width: Math.abs(end.x - g.start.x), height: Math.abs(end.y - g.start.y) };
      const box = g.box;
      const hits = box.width > 0 && box.height > 0 ? selectableItems().filter(item => item.box.x >= box.x && item.box.y >= box.y && item.box.x + item.box.width <= box.x + box.width && item.box.y + item.box.height <= box.y + box.height).map(item => item.target.id) : [];
      setSelection([...g.base, ...hits]);
    }
    function hitElement(p) {
      const tolerance = 6 * width / canvas.getBoundingClientRect().width;
      for (let i = elements.length - 1; i >= 0; i--) {
        const element = elements[i], x = p.x - element.x, y = p.y - element.y;
        if (element.tool === 'image') {
          if (x >= 0 && y >= 0 && x <= element.width && y <= element.height) return element;
          continue;
        }
        const { path, fill } = elementPath(element);
        ctx.save(); ctx.lineWidth = Math.max(element.lineWidth, tolerance * 2); ctx.lineCap = ctx.lineJoin = 'round';
        const hit = (fill && ctx.isPointInPath(path, x, y)) || ctx.isPointInStroke(path, x, y);
        ctx.restore(); if (hit) return element;
      }
      return null;
    }
    function placeMoved(target, x, y, isText) {
      target.x = x; target.y = y;
      if (isText) { constrainBox(target); positionTextBox(target); }
      else {
        const box = bounds(target), visible = 12;
        // Keep a small part accessible when moving a large image off-canvas.
        target.x += Math.max(visible - box.x - box.width, Math.min(0, width - visible - box.x));
        target.y += Math.max(visible - box.y - box.height, Math.min(0, height - visible - box.y));
        renderDrawing();
      }
    }
    function readDocument(value) {
      if (!value || ![1, 2].includes(value.version) || !Array.isArray(value.textBoxes) || value.textBoxes.length > 30) return null;
      const boxes = value.textBoxes;
      if (!boxes.every(box => box && typeof box.text === 'string' && box.text.length <= 500 && /^#[a-f0-9]{6}$/i.test(box.color) && ['x', 'y', 'width', 'size', 'opacity'].every(key => Number.isFinite(box[key])) && box.width >= 100 && box.width <= width && box.size >= 12 && box.size <= 96 && box.opacity >= .1 && box.opacity <= 1)) return null;
      const result = { textBoxes: boxes.map(box => ({ id: crypto.randomUUID(), text: box.text, x: box.x, y: box.y, width: box.width, size: box.size, color: box.color, opacity: box.opacity })) };
      const imageData = data => typeof data === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(data);
      if (value.version === 1) return imageData(value.background) ? { ...result, background: value.background } : null;
      const validPoint = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= width * 2 && Math.abs(p.y) <= Math.max(width, height) * 2;
      if (!Array.isArray(value.elements) || !value.elements.every(element => {
        if (!element || !Number.isFinite(element.x) || !Number.isFinite(element.y) || Math.abs(element.x) > width * 4 || Math.abs(element.y) > height * 4) return false;
        if (element.tool === 'image') return imageData(element.data) && Number.isFinite(element.width) && Number.isFinite(element.height) && element.width > 0 && element.width <= width && element.height > 0 && element.height <= height;
        if (!/^#[a-f0-9]{6}$/i.test(element.color) || !Number.isFinite(element.lineWidth) || element.lineWidth < 1 || element.lineWidth > 150 || !Number.isFinite(element.opacity) || element.opacity < .03 || element.opacity > 1) return false;
        return freehandTools.includes(element.tool) ? Array.isArray(element.points) && element.points.length > 0 && element.points.every(validPoint) : shapeTools.includes(element.tool) && validPoint(element.start) && validPoint(element.end);
      })) return null;
      return { ...result, elements: value.elements.map(element => ({ ...structuredClone(element), id: crypto.randomUUID() })) };
    }
    function paint(event) {
      const element = gesture.element, start = gesture.start;
      const end = point(event, !freehandTools.includes(element.tool));
      if (freehandTools.includes(element.tool)) {
        const last = element.points.at(-1);
        if (last.x !== end.x || last.y !== end.y) element.points.push(end);
      } else {
        let dx = end.x - start.x, dy = end.y - start.y;
        if (event.shiftKey) {
          if (element.tool === 'line' || element.tool === 'arrow') {
            const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4;
            const length = Math.hypot(dx, dy); dx = Math.cos(angle) * length; dy = Math.sin(angle) * length;
          } else { const side = Math.max(Math.abs(dx), Math.abs(dy)); dx = (Math.sign(dx) || 1) * side; dy = (Math.sign(dy) || 1) * side; }
        }
        element.end = { x: start.x + dx, y: start.y + dy };
      }
      renderDrawing(element);
    }
    function moveItems(items, dx, dy) {
      if (items.length === 1) {
        const item = items[0]; placeMoved(item.target, item.x + dx, item.y + dy, item.isText); updateSelection(); return;
      }
      // Apply one shared delta so group spacing is preserved at the canvas edges.
      const box = selectionBounds(items);
      dx = Math.max(Math.min(0, -box.x), Math.min(Math.max(0, width - box.x - box.width), dx));
      dy = Math.max(Math.min(0, -box.y), Math.min(Math.max(0, height - box.y - box.height), dy));
      for (const item of items) { item.target.x = item.x + dx; item.target.y = item.y + dy; if (item.isText) positionTextBox(item.target); }
      renderDrawing();
    }
    function moveGesture(event) {
      const g = gesture, p = point(event);
      if (p.x === g.start.x && p.y === g.start.y) { resetMove(g); return; }
      let dx = p.x - g.start.x, dy = p.y - g.start.y;
      if ($('#sketchSnap').checked) {
        const anchor = g.items.length === 1 ? g.items[0] : selectionBounds(g.items);
        dx = Math.round((anchor.x + dx) / 24) * 24 - anchor.x; dy = Math.round((anchor.y + dy) / 24) * 24 - anchor.y;
      }
      moveItems(g.items, dx, dy);
    }
    function resetMove(g) {
      for (const item of g.items) { item.target.x = item.x; item.target.y = item.y; if (item.isText) positionTextBox(item.target); }
      renderDrawing();
    }
    function captureSelection() { return selectionItems().map(item => ({ ...item, x: item.target.x, y: item.target.y })); }
    canvas.addEventListener('pointerdown', event => {
      if (loading || gesture || textDrag || event.button !== 0) return;
      event.preventDefault(); finishTextEdit(); canvas.focus({ preventScroll: true });
      const start = point(event, ![...freehandTools, 'picker', 'move', 'select'].includes(tool));
      if (tool === 'picker') {
        const pixel = ctx.getImageData(Math.min(width - 1, Math.floor(start.x)), Math.min(height - 1, Math.floor(start.y)), 1, 1).data;
        setColor('#' + Array.from(pixel.slice(0, 3), channel => channel.toString(16).padStart(2, '0')).join('')); return;
      }
      if (tool === 'text') { addTextBox(start); return; }
      if (['move', 'select'].includes(tool)) {
        const box = [...textBoxes].reverse().find(box => start.x >= box.x && start.x <= box.x + box.width && start.y >= box.y && start.y <= box.y + boxHeight(box));
        const target = box || hitElement(start);
        if (target) {
          if (event.shiftKey) {
            const ids = new Set(selectedIds); if (ids.has(target.id)) ids.delete(target.id); else ids.add(target.id);
            setSelection(ids); return;
          }
          if (!selectedIds.has(target.id)) setSelection([target.id]);
          gesture = { id: event.pointerId, tool: 'move', start, items: captureSelection() };
          canvas.style.cursor = 'grabbing';
        } else if (tool === 'select') {
          const previous = [...selectedIds], base = event.shiftKey ? previous : [];
          gesture = { id: event.pointerId, tool: 'marquee', start, previous, base, box: { ...start, width: 0, height: 0 } };
          setSelection(base);
        } else { setSelection([]); return; }
      } else {
        const element = { id: crypto.randomUUID(), tool, x: 0, y: 0, color: tool === 'eraser' ? '#ffffff' : color, lineWidth: Number($('#brushSize').value) * (tool === 'marker' ? 3 : 1), opacity: tool === 'eraser' ? 1 : Number($('#sketchOpacity').value) / 100 * (tool === 'marker' ? .3 : 1), fill: $('#sketchFill').checked };
        if (freehandTools.includes(tool)) element.points = [start];
        else { element.start = start; element.end = start; }
        gesture = { id: event.pointerId, tool, start, element }; paint(event);
      }
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (!gesture || event.pointerId !== gesture.id) return;
      event.preventDefault();
      if (gesture.tool === 'move') moveGesture(event); else if (gesture.tool === 'marquee') selectMarquee(event); else paint(event);
    });
    function finish(event, cancel = false) {
      if (!gesture || (event && event.pointerId !== gesture.id)) return;
      const g = gesture;
      if (g.tool === 'move') {
        if (cancel) resetMove(g);
        else {
          if (event) moveGesture(event);
          if (g.items.some(item => item.target.x !== item.x || item.target.y !== item.y)) commit();
        }
      } else if (g.tool === 'marquee') {
        if (cancel) setSelection(g.previous); else if (event) selectMarquee(event);
      } else if (!cancel) { if (event) paint(event); elements.push(g.element); commit(); }
      gesture = null; renderDrawing();
      if (canvas.hasPointerCapture(g.id)) canvas.releasePointerCapture(g.id);
      canvas.style.cursor = tool === 'move' ? 'grab' : tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair';
    }
    canvas.addEventListener('pointerup', event => finish(event));
    canvas.addEventListener('pointercancel', event => finish(event, true));
    canvas.addEventListener('lostpointercapture', event => finish(event, true));
    dialog.addEventListener('close', () => { finish(null, true); finishTextDrag(null, true); finishTextEdit(); });
    dialog.addEventListener('keydown', event => {
      if (event.target.matches('input, textarea, select') || event.target.isContentEditable || event.isComposing) return;
      if (!event.ctrlKey && !event.metaKey && !event.altKey && ['g', 'v'].includes(event.key.toLowerCase())) {
        event.preventDefault(); setTool(event.key.toLowerCase() === 'g' ? 'move' : 'select'); return;
      }
      if (gesture || textDrag) {
        if (event.key === 'Escape') { event.preventDefault(); finish(null, true); finishTextDrag(null, true); }
        return;
      }
      if (['move', 'select'].includes(tool) && event.key === 'Escape' && selectedIds.size) {
        event.preventDefault(); setSelection([]); return;
      }
      if (['move', 'select'].includes(tool) && !loading && !event.ctrlKey && !event.metaKey && !event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const items = captureSelection();
        if (items.length) {
          event.preventDefault(); const amount = event.shiftKey ? 10 : 1;
          moveItems(items, event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0, event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0);
          if (items.some(item => item.target.x !== item.x || item.target.y !== item.y)) commit();
        }
        return;
      }
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault(); undo(event.key.toLowerCase() === 'y' || event.shiftKey ? 1 : -1);
      }
    });
    $('[data-tool="select"]').title = 'Select (V)';
    $('[data-tool="select"]').setAttribute('aria-keyshortcuts', 'v');
    $('[data-tool="move"]').title = 'Move (G)';
    $('[data-tool="move"]').setAttribute('aria-keyshortcuts', 'g');
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
    $('#clearSketch').onclick = () => { if (loading || gesture || textDrag) return; finishTextEdit(); elements = []; textBoxes = []; selectedText = null; selectedIds.clear(); renderDrawing(); renderTextBoxes(); commit(); $('#sketchMessage').textContent = 'Canvas cleared. Use Undo to restore your sketch.'; };
    $('#zoomIn').onclick = () => setZoom(zoom + .25); $('#zoomOut').onclick = () => setZoom(zoom - .25);
    $('#zoomFit').onclick = () => { setZoom(1); viewport.scrollTo(0, 0); };
    $('#sketchClose').onclick = () => dialog.close();
    $('#saveSketch').onclick = () => {
      if (loading || gesture || textDrag) return;
      source = exportCanvas().toDataURL('image/png');
      onSave(source, { version: 2, elements: cloneElements(), textBoxes: cloneBoxes() }); dialog.close();
    };
    $('#downloadSketch').onclick = () => {
      if (loading || gesture || textDrag) return;
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
        elements = documentData?.elements || []; imageCache.clear();
        textBoxes = documentData ? documentData.textBoxes : []; selectedText = null; selectedIds.clear();
        textBoxes.forEach(constrainBox); renderTextBoxes(); renderDrawing();
        loading = !!source;
        $('#saveSketch').disabled = $('#downloadSketch').disabled = $('#clearSketch').disabled = loading;
        $('#sketchMessage').textContent = loading ? 'Opening your saved sketch...' : 'Use this sketch to attach it to your brief.';
        const ready = () => { renderDrawing(); loading = false; commit(); $('#saveSketch').disabled = $('#downloadSketch').disabled = $('#clearSketch').disabled = false; };
        const decode = data => new Promise((resolve, reject) => {
          const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = data;
        });
        const loadImageLayer = async data => {
          const image = await decode(data);
          if (version !== loadVersion) return;
          const scale = Math.min(width / image.width, height / image.height), w = image.width * scale, h = image.height * scale;
          imageCache.set(data, image);
          elements = [{ id: crypto.randomUUID(), tool: 'image', x: (width - w) / 2, y: (height - h) / 2, width: w, height: h, data }];
        };
        if (source) {
          (async () => {
            let failed = false;
            try {
              if (documentData?.elements) {
                await Promise.all(elements.filter(element => element.tool === 'image').map(async element => {
                  const image = await decode(element.data);
                  if (version === loadVersion) imageCache.set(element.data, image);
                }));
              } else await loadImageLayer(documentData?.background || source);
            } catch {
              if (version !== loadVersion) return;
              elements = []; textBoxes = []; renderTextBoxes();
              try { await loadImageLayer(source); } catch { failed = true; }
            }
            if (version !== loadVersion) return;
            ready(); $('#sketchMessage').textContent = failed ? 'The saved sketch could not be opened. You can draw a new one.' : 'Use this sketch to attach it to your brief.';
          })();
        } else ready();
        updateHistory(); layout(); viewport.scrollTo(0, 0);
      },
    };
  };
})();
