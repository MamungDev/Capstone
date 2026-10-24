// Run with: node tests/run-sketchpad.cjs [path-to-Chromium-browser]
// Uses a dedicated headless browser profile and waits for asynchronous IndexedDB tests.
const { spawn } = require('node:child_process');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { once } = require('node:events');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const profile = mkdtempSync(join(tmpdir(), 'capstone-sketch-test-'));
  let browser, socket;
  try {
    const executable = process.argv[2] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const pageUrl = pathToFileURL(resolve(__dirname, 'sketchpad.html')).href;
    browser = spawn(executable, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
      '--user-data-dir=' + profile, '--allow-file-access-from-files', '--remote-debugging-port=0', pageUrl],
      { stdio: 'ignore', windowsHide: true });
    await once(browser, 'spawn');
    let port;
    for (let i = 0; i < 100 && !port; i++) {
      try { port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch {}
      if (!port) await delay(100);
    }
    if (!port) throw new Error('Test browser did not start');
    const pages = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const page = pages.find(page => page.url === pageUrl);
    if (!page) throw new Error('Regression page did not open');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0;
    const waiting = new Map();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (waiting.has(message.id)) { waiting.get(message.id)(message); waiting.delete(message.id); }
    };
    const evaluate = expression => new Promise(resolve => {
      const id = ++sequence; waiting.set(id, resolve);
      socket.send(JSON.stringify({id, method:'Runtime.evaluate', params:{expression, returnByValue:true}}));
    });
    let output = '';
    for (let i = 0; i < 200; i++) {
      const response = await evaluate("document.querySelector('#results')?.textContent");
      output = response.result?.result?.value || '';
      if (/^(PASS:|FAIL)/.test(output)) break;
      await delay(100);
    }
    console.log(output);
    if (!output.startsWith('PASS:')) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally {
    socket?.close();
    if (browser && browser.exitCode === null) { const stopped = once(browser, 'exit'); browser.kill(); await stopped; }
    rmSync(profile, {recursive:true, force:true, maxRetries:5, retryDelay:200});
  }
})();
