// Run through tests/run.cjs, which supplies a local PHP server.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { once } = require('node:events');
const base = process.env.TEST_BASE_URL;
if (!base) throw new Error('Run through node tests/run.cjs');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const profile = mkdtempSync(join(tmpdir(), 'capstone-loading-test-'));
  let browser, socket;
  try {
    const executable = process.env.CHROMIUM_BINARY || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    browser = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profile, '--remote-debugging-port=0', 'about:blank'],
    { stdio: 'ignore', windowsHide: true });
    await once(browser, 'spawn');
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
      if (!port) await delay(100);
    }
    assert.ok(port, 'Browser started');
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const page = pages.find(item => item.type === 'page');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const waiting = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
    };
    const send = (method, params = {}) => new Promise(resolve => {
      const id = ++sequence;
      waiting.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
    await send('Network.enable');
    await send('Network.emulateNetworkConditions', { offline: false, latency: 1100, downloadThroughput: 100000, uploadThroughput: 100000 });
    await send('Page.navigate', { url: base + 'index.php' });
    let appeared = false;
    for (let i = 0; i < 60; i++) {
      appeared = await evaluate("!!document.getElementById('page-loading')") === true;
      if (appeared) break;
      await delay(100);
    }
    assert.ok(appeared, 'Skeleton appears while resources load');
    assert.equal(await evaluate("document.getElementById('page-loading').getAttribute('aria-label')"), 'Loading page');
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    let cleared = false;
    for (let i = 0; i < 100; i++) {
      cleared = await evaluate("document.readyState === 'complete' && !document.getElementById('page-loading')") === true;
      if (cleared) break;
      await delay(100);
    }
    assert.ok(cleared, 'Skeleton clears after page load');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Network.emulateNetworkConditions', { offline: false, latency: 1100, downloadThroughput: 100000, uploadThroughput: 100000 });
    await send('Page.reload', { ignoreCache: true });
    for (let i = 0; i < 60; i++) {
      appeared = await evaluate("!!document.getElementById('page-loading')") === true;
      if (appeared) break;
      await delay(100);
    }
    assert.ok(appeared, 'Mobile skeleton appears');
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true, 'Mobile skeleton has no horizontal overflow');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#page-loading .load-block')).animationName"), 'none', 'Reduced-motion setting disables shimmer');
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    console.log('PASS: delayed desktop/mobile skeleton appears, has a loading label, clears after load, fits mobile width, and respects reduced motion.');
  } finally {
    socket?.close();
    if (browser && browser.exitCode === null) { const stopped = once(browser, 'exit'); browser.kill(); await stopped; }
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
