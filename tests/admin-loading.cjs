// Browser checks with isolated, deliberately slow pages; no database or admin credentials.
// Run: node tests/admin-loading.cjs
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const root = join(__dirname, '..');
const profile = mkdtempSync(join(tmpdir(), 'capstone-admin-loading-'));
const assets = {
  '/assets/css/admin-loading.css': ['text/css', readFileSync(join(root, 'assets/css/admin-loading.css'))],
  '/assets/js/admin-loading.js': ['text/javascript', readFileSync(join(root, 'assets/js/admin-loading.js'))],
};
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  response.setHeader('Cache-Control', 'no-store');
  if (assets[url.pathname]) {
    response.setHeader('Content-Type', assets[url.pathname][0]);
    return response.end(assets[url.pathname][1]);
  }
  if (url.pathname === '/slow.css') {
    response.setHeader('Content-Type', 'text/css');
    return setTimeout(() => response.end('body { margin: 0; }'), 1000);
  }
  if (!['/Admin/index.php', '/Admin/setup.php'].includes(url.pathname)) { response.writeHead(404); return response.end(); }
  const setup = url.pathname.endsWith('setup.php');
  // Use the actual PHP pages' asset tags and the setup page's restrictive CSP.
  const php = readFileSync(join(root, setup ? 'Admin/setup.php' : 'Admin/index.php'), 'utf8');
  const tags = php.match(/<(?:link|script)[^\n]*admin-loading\.(?:css|js)[^\n]*/g).join('\n').replace(/<\?=.*?\?>/g, 'test');
  response.setHeader('Content-Type', 'text/html');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  setTimeout(() => response.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">' + tags +
    '<link rel="stylesheet" href="/slow.css"></head><body><main><h1>Loaded admin</h1><a id="accounts" href="?tab=accounts">Accounts</a>' +
    '<a id="activity" href="?tab=activity">Activity</a><form method="get"><input name="tab" value="projects" type="hidden">' +
    '<input name="q" required><button>Search</button></form><form id="save" method="post"><input name="action" value="edit_user" type="hidden"><button>Save</button></form>' +
    '</main></body></html>'), 500);
});

(async () => {
  let browser, socket;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = 'http://127.0.0.1:' + server.address().port;
    browser = spawn(process.env.CHROMIUM_BINARY || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'],
      { stdio: 'ignore', windowsHide: true });
    await once(browser, 'spawn');
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
      if (!port) await delay(100);
    }
    assert.ok(port, 'Browser started');
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    socket = new WebSocket(pages.find(item => item.type === 'page').webSocketDebuggerUrl);
    await once(socket, 'open');
    let sequence = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
    };
    const send = (method, params = {}) => new Promise(resolve => {
      const id = ++sequence; pending.set(id, resolve); socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    const until = async (expression, label) => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
      assert.fail(label);
    };
    const visible = "!!document.getElementById('admin-loading')";
    const settled = "document.readyState === 'complete' && !document.getElementById('admin-loading')";
    for (const tab of ['overview', 'accounts', 'projects', 'activity', 'security']) {
      await send('Page.navigate', { url: base + '/Admin/index.php?tab=' + tab });
      await until(visible, tab + ' skeleton appears during load');
      assert.equal(await evaluate("document.getElementById('admin-loading').getAttribute('role')"), 'status');
      assert.equal(await evaluate("!!document.querySelector('#admin-loading .admin-skeleton-tabs')"), true);
      await until(settled, tab + ' skeleton clears');
      assert.equal(await evaluate('document.body.inert'), false, 'Controls are usable after load');
    }
    await evaluate("document.getElementById('accounts').click()");
    await until(visible + " && document.querySelector('.admin-skeleton-status').textContent === 'Loading accounts…'", 'Tab click shows destination skeleton');
    await until(settled + " && location.search === '?tab=accounts'", 'Tab navigation completes');
    await evaluate("document.querySelector('form button').click()");
    await delay(250);
    assert.equal(await evaluate(visible), false, 'Invalid forms do not show skeleton');
    await evaluate("document.querySelector('input[name=q]').value = 'test'; document.querySelector('form button').click()");
    await until(visible + " && document.querySelector('.admin-skeleton-status').textContent === 'Loading projects…'", 'Search shows destination skeleton');
    await until(settled + " && location.search.includes('q=test')", 'Search completes');
    await evaluate("document.getElementById('save').requestSubmit()");
    await until(visible + " && document.querySelector('.admin-skeleton-status').textContent === 'Saving changes…'", 'POST shows saving state');
    await until(settled, 'POST completes');
    await evaluate("document.getElementById('activity').addEventListener('click', e => e.preventDefault()); document.getElementById('activity').click()");
    await delay(250);
    assert.equal(await evaluate(visible), false, 'Cancelled navigation does not cover page');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const route of ['index.php?tab=overview', 'index.php?tab=accounts', 'setup.php']) {
      await send('Page.navigate', { url: base + '/Admin/' + route });
      await until(visible, 'Mobile skeleton appears');
      assert.equal(await evaluate("document.getElementById('admin-loading').scrollWidth <= innerWidth"), true, 'Fits mobile');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.admin-skeleton-block')).animationName"), 'none', 'Respects reduced motion');
      if (route === 'setup.php') assert.equal(await evaluate("document.getElementById('admin-loading').className"), 'admin-skeleton-setup');
      await until(settled, 'Mobile skeleton clears');
    }
    console.log('PASS: admin tabs, setup CSP, initial load, navigation, GET/POST forms, validation, cancelled navigation, mobile layout, reduced motion, and cleanup.');
  } finally {
    socket?.close();
    if (browser && browser.exitCode === null) { const stopped = once(browser, 'exit'); browser.kill(); await stopped; }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
