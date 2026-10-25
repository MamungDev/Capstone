// Isolated local MySQL database; no Google requests or real user records.
// Run: node tests/onboarding.cjs
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const dbName = 'mamungkun_onboarding_test_' + randomBytes(8).toString('hex');
const env = { ...process.env, DB_DRIVER: 'mysql', DB_NAME: dbName, SESSION_DRIVER: 'mysql', SESSION_COOKIE_PATH: '/' };
delete env.VERCEL;
let server, base, created = false;

function fixture(code) {
  execFileSync(php, ['-r', `
    $c = require 'auth/config.local.php';
    if (!in_array($c['db_host'], ['127.0.0.1', 'localhost'], true)) throw new RuntimeException('Local MySQL required');
    $name = getenv('DB_NAME');
    if (!preg_match('/^mamungkun_onboarding_test_[a-f0-9]{16}$/D', $name)) throw new RuntimeException('Unsafe database');
    $p = new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port'] ?? 3306), $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    ${code}
  `], { cwd: root, env, stdio: 'inherit' });
}

function client(cookie = '') {
  return { cookie, async request(route, data) {
    const response = await fetch(base + route, { redirect: 'manual', method: data ? 'POST' : 'GET',
      headers: { Cookie: this.cookie, ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
      body: data ? new URLSearchParams(data) : undefined });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, location: response.headers.get('location'), text: await response.text() };
  }, async requestJson(route, data) {
    const response = await fetch(base + route, { method: 'POST', redirect: 'manual',
      headers: { Cookie: this.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (response.headers.get('set-cookie')) this.cookie = response.headers.get('set-cookie').split(';')[0];
    return { status: response.status, body: await response.json() };
  }};
}

(async () => {
  try {
    fixture("$p->exec('CREATE DATABASE '.$name);");
    created = true;
    fixture(`
      $p->exec('USE '.$name);
      foreach (explode(';', preg_replace('/^\\s*--[^\\r\\n]*$/m', '', file_get_contents('auth/schema.sql'))) as $sql) if (trim($sql) !== '') $p->exec($sql);
      // Simulate an older installation; current_user must safely add profile columns.
      $p->exec('ALTER TABLE users DROP COLUMN onboarding_pending, DROP COLUMN bio, DROP COLUMN photo_mime, DROP COLUMN photo_data');
      $p->exec("INSERT INTO users (role, email, display_name) VALUES ('client', 'legacy@example.invalid', 'Legacy')");
      $p->prepare('INSERT INTO app_sessions VALUES (?, ?, ?)')->execute(['legacytestsession', 'user_id|i:1;', time() + 3600]);
    `);
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1');
    await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    base = `http://127.0.0.1:${port}/`;
    server = spawn(php, ['-S', `127.0.0.1:${port}`, 'api/index.php'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
    await once(server, 'spawn');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await fetch(base + 'assets/css/complete-profile.css'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, 'PHP server startup');
    const legacy = client('mamungkun_session=legacytestsession');
    assert.equal((await legacy.request('Client/Client%20UI.php')).status, 200, 'Legacy accounts remain usable');
    assert.equal((await legacy.request('auth/complete-profile.php')).location, '../Client/Client%20UI.php');
    assert.equal((await client().request('auth/complete-profile.php')).location, '../index.php');

    for (const role of ['client', 'artist']) {
      const sid = randomBytes(16).toString('hex');
      fixture(`
        $p->exec('USE '.$name);
        require 'auth/google.php';
        $id = google_account($p, ['sub' => '${sid}', 'email' => '${role}@example.invalid', 'name' => 'Google Name'], '${role}');
        $p->prepare('INSERT INTO app_sessions VALUES (?, ?, ?)')->execute(['${sid}', 'user_id|i:'.$id.';', time() + 3600]);
      `);
      const user = client('mamungkun_session=' + sid);
      const workspace = role === 'client' ? 'Client/Client%20UI.php' : 'Artist/Artist%20UI.php';
      const other = role === 'client' ? 'Artist/Artist%20UI.php' : 'Client/Client%20UI.php';
      assert.equal((await user.request(workspace)).location, '../auth/complete-profile.php');
      assert.match((await user.request(other)).location, /index.php\?auth=/);
      const page = await user.request('auth/complete-profile.php');
      assert.equal(page.status, 200);
      assert.match(page.text, /Google Name/);
      assert.match(page.text, /name="password"/);
      assert.match(page.text, /name="password_confirmation"/);
      const csrf = page.text.match(/name="csrf" value="([a-f0-9]+)"/)[1];
      const password = 'A preferred password ' + role + ' 123';
      const submit = data => user.request('auth/complete-profile.php', { csrf, name: 'Updated Name', bio: 'Creative work', password, password_confirmation: password, ...data });
      assert.equal((await submit({ csrf: 'wrong' })).status, 403);
      for (const name of ['', 'x'.repeat(101), 'bad\nname']) {
        assert.match((await submit({ name })).text, /Enter a display name/);
      }
      assert.match((await submit({ bio: 'x'.repeat(501) })).text, /Keep your bio/);
      assert.equal((await submit({ bio: 'x'.repeat(9000) })).status, 413);
      assert.match((await submit({ password: '' })).text, /Choose a password of at least 8 characters/);
      assert.match((await submit({ password: 'short' })).text, /Choose a password of at least 8 characters/);
      assert.match((await submit({ password: 'x'.repeat(4097) })).text, /Choose a password of at least 8 characters/);
      assert.match((await submit({ password_confirmation: '' })).text, /Your passwords do not match/);
      assert.match((await submit({ password_confirmation: 'different password' })).text, /Your passwords do not match/);
      assert.equal((await user.request(workspace)).location, '../auth/complete-profile.php', 'Rejected submissions must not complete onboarding');
      const saved = await submit({});
      assert.equal(saved.status, 303);
      assert.equal(saved.location, '../' + workspace);
      assert.equal((await user.request(workspace)).status, 200);
      assert.match((await user.request(other)).location, /index.php\?auth=/);
      assert.equal((await user.request('auth/complete-profile.php')).location, '../' + workspace);
      fixture(`
        $p->exec('USE '.$name);
        $row = $p->query("SELECT display_name, bio, onboarding_pending, password_hash, google_sub FROM users WHERE email = '${role}@example.invalid'")->fetch(PDO::FETCH_ASSOC);
        if ($row['display_name'] !== 'Updated Name' || $row['bio'] !== 'Creative work' || (int) $row['onboarding_pending'] !== 0 || $row['google_sub'] !== '${sid}' || !password_verify('A preferred password ${role} 123', $row['password_hash'])) throw new RuntimeException('Profile or password was not persisted');
      `);
      assert.equal((await user.request('auth/logout.php', { csrf })).status, 303);
      assert.equal((await user.request(workspace)).status, 302);
      const landing = await user.request('index.php');
      const signinCsrf = JSON.parse(landing.text.match(/window\.MAMUNGKUN_AUTH\s*=\s*({[^;]+});/)[1]).csrf;
      const wrongRole = role === 'client' ? 'artist' : 'client';
      assert.equal((await user.requestJson('auth/account.php', { csrf: signinCsrf, action: 'signin', role: wrongRole, email: role + '@example.invalid', password })).status, 401);
      const signedIn = await user.requestJson('auth/account.php', { csrf: signinCsrf, action: 'signin', role, email: role + '@example.invalid', password });
      assert.equal(signedIn.status, 200);
      assert.equal(signedIn.body.redirect, workspace);
      assert.equal((await user.request(workspace)).status, 200);
    }
    console.log('PASS: legacy profile migration, anonymous access, new client/artist onboarding, password validation and sign-in, CSRF, persistence, workspace redirects, role isolation, and sign-out.');
  } finally {
    if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    if (created) fixture("$p->exec('DROP DATABASE '.$name);");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
