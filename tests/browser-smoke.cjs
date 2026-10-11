const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');

(async () => {
  const root = path.resolve('dist');
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    if (name === '/auth-config.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end('window.MAKERFLOW_AUTH_CONFIG = {};');
      return;
    }
    const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (error, content) => {
      if (error) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css'})[path.extname(file)] + '; charset=utf-8');
      res.end(content);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mamungkun-browser-'));
  const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--remote-debugging-port=0',
    '--user-data-dir=' + profile, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let socket;
  try {
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Browser startup timeout')), 20000);
      browser.on('error', reject);
      browser.stderr.on('data', data => {
        output += data;
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
    });
    const base = endpoint.replace('ws:', 'http:').split('/devtools/')[0];
    const tabs = await (await fetch(base + '/json/list')).json();
    socket = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolve => socket.addEventListener('open', resolve, {once:true}));
    let id = 0; const waiting = new Map(); const errors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + message.params.exceptionDetails.exception?.description);
      if (waiting.has(message.id)) { const {resolve, reject, timer} = waiting.get(message.id); clearTimeout(timer); waiting.delete(message.id); message.error ? reject(message.error) : resolve(message.result); }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const next = ++id; const timer = setTimeout(() => { waiting.delete(next); reject(new Error(method + ' timed out (possible page freeze)')); }, 6000);
      waiting.set(next, {resolve,reject,timer}); socket.send(JSON.stringify({id:next,method,params}));
    });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {expression, awaitPromise:true, returnByValue:true});
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Evaluation failed');
      return result.result.value;
    };
    const pause = () => new Promise(resolve => setTimeout(resolve, 300));
    const load = async () => {
      await send('Page.navigate', {url:'http://127.0.0.1:' + server.address().port});
      for (let attempt = 0; attempt < 30; attempt++) {
        await pause();
        if (await evaluate("Boolean(document.querySelector('.home-brand') && window.makerflowAuth)")) return;
      }
      throw new Error('App did not initialize: ' + JSON.stringify(errors));
    };
    await send('Runtime.enable'); await load();
    assert.equal(await evaluate("document.querySelector('.home-brand').textContent"), '✦Mamungkun');
    assert.equal(await evaluate("document.body.classList.contains('home-view')"), true);
    for (let i = 0; i < 4; i++) {
      await evaluate(`document.querySelectorAll('#landing a[href="#builder"]')[${i}].click()`);
      assert.equal(await evaluate("document.querySelector('.auth-modal').open"), true);
      await evaluate("document.querySelector('.auth-google').click()");
      assert.match(await evaluate("document.querySelector('.auth-status').textContent"), /is not connected/);
      await send('Input.dispatchKeyEvent', {type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await send('Input.dispatchKeyEvent', {type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      assert.equal(await evaluate("document.querySelector('.auth-modal').open"), false);
    }
    // Simulated UI session only: real Google OAuth still requires configuration.
    await evaluate("window.makerflowAuth.isSignedIn = () => true; location.hash = 'builder'"); await pause();
    await evaluate("for (const [id,value] of Object.entries({projectName:'Browser test',idea:'A music poster',audience:'Music fans',goal:'Promote a show'})) { const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('input')); } document.getElementById('nextButton').click()");
    assert.equal(await evaluate("document.getElementById('format').value"), 'Poster · 4:5');
    await evaluate("document.querySelector('[data-tag]').click(); document.getElementById('nextButton').click(); document.getElementById('draw').click()"); await pause();
    await evaluate("const c=document.getElementById('sketchCanvas');const x=c.getContext('2d');x.fillStyle='red';x.fillRect(10,10,20,20);document.getElementById('saveSketch').click()");
    const sketch = await evaluate("JSON.parse(localStorage.getItem('makerflow-brief-v1')).sketch");
    assert.ok(sketch.startsWith('data:image/png;base64,'));
    await evaluate("document.getElementById('draw').click()"); await pause();
    await evaluate("document.getElementById('clearSketch').click(); document.getElementById('sketchClose').click(); document.getElementById('nextButton').click()");
    assert.equal(await evaluate("document.querySelector('.preview img').getAttribute('src')"), sketch);
    await evaluate("document.getElementById('nextButton').click()");
    assert.match(await evaluate("document.querySelector('#app').textContent"), /Brief saved/);
    await load();
    assert.match(await evaluate("document.querySelector('#app').textContent"), /Brief saved/);
    await evaluate("localStorage.setItem('makerflow-brief-v1','broken json')"); await load();
    assert.ok(await evaluate("Boolean(document.getElementById('projectName'))"));
    await evaluate("Storage.prototype.setItem = () => {throw new Error('QuotaExceededError')};document.getElementById('projectName').value='Still works';document.getElementById('projectName').dispatchEvent(new Event('input'))");
    assert.equal(await evaluate("document.getElementById('saved').textContent"), 'Not saved');
    await send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:true});
    assert.ok(await evaluate('document.documentElement.scrollWidth <= window.innerWidth'));
    assert.deepEqual(errors, []);
    console.log('PASS: responsive landing, all 4 auth links, Escape, missing-config feedback, four-step flow, sketch save/cancel, draft restoration, corrupted storage and storage failure. No browser exceptions or freeze.');
  } finally {
    socket?.close(); browser.kill(); server.close();
    // The isolated browser profile stays in the system temp directory.
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
