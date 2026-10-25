// HTTP checks with dummy OAuth credentials. No Google calls or app database writes.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { createHash } = require('node:crypto');

(async () => {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const root = path.resolve(__dirname, '..');
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'capstone-google-'));
  const base = `http://127.0.0.1:${port}/`;
  const env = { ...process.env, SESSION_DRIVER: 'files', SESSION_COOKIE_PATH: '/',
    GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'test-only-secret',
    GOOGLE_REDIRECT_URI: base + 'auth/google-callback.php' };
  delete env.VERCEL;
  let server;
  let serverLog = '';
  let cookie = '';
  const request = async (route, extra = {}) => {
    const response = await fetch(base + route, { redirect: 'manual', ...extra, headers: { Cookie: cookie, ...extra.headers } });
    if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
    return response;
  };
  try {
    server = spawn(process.env.PHP_BINARY || 'C:/xampp/php/php.exe',
      ['-d', 'session.save_path="' + sessionDir.replace(/\\/g, '/') + '"', '-S', `127.0.0.1:${port}`, '-t', root],
      { cwd: root, env, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('PHP server startup timed out.')), 5000);
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.stderr.on('data', data => {
        serverLog += data.toString();
        if (data.toString().includes('Development Server')) { clearTimeout(timer); resolve(); }
      });
    });
    const home = await request('index.php');
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /Continue with Google/);
    assert.ok(!html.includes(env.GOOGLE_CLIENT_SECRET));
    const invalid = await request('auth/google-start.php?role=admin');
    assert.equal(invalid.headers.get('location'), '../index.php');
    // Node fetch normalizes Host; use a raw HTTP request to simulate another deployment hostname.
    const alternate = await new Promise((resolve, reject) => {
      http.get(base + 'auth/google-start.php?role=artist', { headers: { Host: 'preview.invalid' } }, response => {
        response.resume();
        resolve(response.headers.location);
      }).on('error', reject);
    });
    assert.equal(alternate, base + 'auth/google-start.php?role=artist');
    for (const role of ['client', 'artist']) {
      const start = await request('auth/google-start.php?role=' + role);
      assert.equal(start.status, 302);
      const location = new URL(start.headers.get('location'));
      assert.equal(location.origin, 'https://accounts.google.com');
      assert.equal(location.searchParams.get('redirect_uri'), env.GOOGLE_REDIRECT_URI);
      assert.equal(location.searchParams.get('scope'), 'openid email profile');
      assert.equal(location.searchParams.get('code_challenge_method'), 'S256');
      assert.ok(!location.searchParams.has('client_secret'));
      const state = location.searchParams.get('state');
      assert.match(state, /^[a-f0-9]{64}$/);
      const session = fs.readFileSync(path.join(sessionDir, 'sess_' + cookie.split('=')[1]), 'utf8');
      const verifier = session.match(/code_verifier";s:64:"([a-f0-9]{64})"/)[1];
      assert.equal(location.searchParams.get('code_challenge'), createHash('sha256').update(verifier).digest('base64url'));
      const wrong = await request('auth/google-callback.php?state=wrong&code=unused');
      assert.equal(wrong.headers.get('location'), `../index.php?auth=${role}&notice=google-expired`);
      const cancel = await request('auth/google-callback.php?state=' + state + '&error=access_denied');
      assert.equal(cancel.headers.get('location'), `../index.php?auth=${role}&notice=google-cancelled`);
      const replay = await request('auth/google-callback.php?state=' + state + '&code=unused');
      assert.match(replay.headers.get('location'), /notice=google-expired$/);
    }
    assert.doesNotMatch(serverLog, /PHP Warning|Fatal error|Parse error|syntax error/);
    console.log('PASS: Google button, canonical redirect, role selection, PKCE, cancellation, invalid state and replay rejection.');
  } catch (error) {
    error.message += '\nLocal PHP server output:\n' + serverLog;
    throw error;
  } finally {
    if (server && server.pid && server.exitCode === null) {
      const stopped = once(server, 'exit');
      server.kill();
      await stopped;
    }
    // Only remove files in the unique directory created above; no recursive deletion.
    for (const file of fs.readdirSync(sessionDir)) fs.unlinkSync(path.join(sessionDir, file));
    fs.rmdirSync(sessionDir);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
