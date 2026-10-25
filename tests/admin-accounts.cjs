// Uses a fresh temporary database and a local PHP server; never deletes real accounts.
// Run with XAMPP MySQL available: node tests/admin-accounts.cjs
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const dbName = 'mamungkun_admin_test_' + randomBytes(8).toString('hex');
const secret = randomBytes(24).toString('hex');
const env = { ...process.env, DB_NAME: dbName, ADMIN_PASSWORD: secret, SESSION_DRIVER: 'mysql', SESSION_COOKIE_PATH: '/' };
delete env.VERCEL;
let server;
let base;

function fixture(sql) {
  execFileSync(php, ['-r', `
    $c = require 'auth/config.local.php';
    if (!in_array($c['db_host'], ['127.0.0.1', 'localhost'], true)) throw new RuntimeException('Tests require local MySQL');
    $p = new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port'] ?? 3306), $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $name = getenv('DB_NAME');
    if (!preg_match('/^mamungkun_admin_test_[a-f0-9]{16}$/D', $name)) throw new RuntimeException('Unsafe test database name');
    ${sql}
  `], { cwd: root, env, stdio: 'inherit' });
}

function session() {
  return { cookie: '', csrf: '', async request(route = 'Admin/index.php', data) {
    const headers = { Accept: 'application/json', ...(this.cookie ? { Cookie: this.cookie } : {}) };
    if (data) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    const response = await fetch(base + route, { method: data ? 'POST' : 'GET', headers, body: data ? new URLSearchParams(data) : undefined, redirect: 'manual' });
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    const text = await response.text();
    const token = text.match(/name="csrf" value="([a-f0-9]+)"/);
    if (token) this.csrf = token[1];
    return { status: response.status, text, headers: response.headers };
  }};
}

async function stopServer() {
  if (!server || server.exitCode !== null) return;
  const stopped = once(server, 'exit');
  server.kill();
  await stopped;
}

async function startServer(password) {
  await stopServer();
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/`;
  server = spawn(php, ['-S', `127.0.0.1:${port}`, 'api/index.php'], { cwd: root, env: { ...env, ADMIN_PASSWORD: password }, stdio: 'ignore', windowsHide: true });
  await once(server, 'spawn');
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await fetch(base + 'Admin/admin.css'); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error('Local PHP server did not start');
}

(async () => {
  try {
    fixture(`
      $p->exec('CREATE DATABASE '.$name);
      $p->exec('USE '.$name);
      foreach (explode(';', preg_replace('/^\\s*--[^\\r\\n]*$/m', '', file_get_contents('auth/schema.sql'))) as $sql) if (trim($sql) !== '') $p->exec($sql);
      $q = $p->prepare('INSERT INTO users (role, email, display_name, password_hash) VALUES (?, ?, ?, ?)');
      for ($i = 1; $i <= 22; $i++) $q->execute([$i % 2 ? 'client' : 'artist', 'fixture'.$i.'@example.invalid', $i === 1 ? '<script>alert(1)</script>' : 'Fixture '.$i, password_hash('fixture-password-123', PASSWORD_DEFAULT)]);
      $p->exec("INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash) VALUES ('".str_repeat('a', 32)."', 1, 'Temporary brief', '{}', '".str_repeat('b', 64)."')");
    `);
    await startServer('');
    const disabled = session();
    const entry = await disabled.request('Admin/login.php');
    assert.equal(entry.status, 303);
    assert.equal(entry.headers.get('location'), '../index.php?auth=admin');
    assert.match((await disabled.request('index.php?auth=admin')).text, /This deployment has no ADMIN_PASSWORD/);
    assert.equal((await disabled.request('Admin/login.php', { csrf: disabled.csrf, password: secret })).status, 403);

    await startServer('short-password');
    const short = session();
    const shortPage = await short.request('index.php?auth=admin');
    assert.match(shortPage.text, /saved admin password is shorter than 16 characters/);
    assert.match(shortPage.text, /name="password"/);
    assert.equal((await short.request('Admin/login.php', { csrf: short.csrf, password: 'short-password' })).status, 403);

    await startServer(secret);
    const admin = session();
    const visitor = session();
    const redirect = await visitor.request();
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'login.php');
    assert.doesNotMatch(redirect.text, /fixture1@example.invalid/);
    await visitor.request('index.php?auth=admin');
    assert.equal((await visitor.request('Admin/index.php', { csrf: visitor.csrf, action: 'delete', user_id: 1, confirm_email: 'fixture1@example.invalid' })).status, 403);
    // A valid client login still must not grant admin access.
    const landing = await visitor.request('index.php');
    const csrf = JSON.parse(landing.text.match(/window\.MAMUNGKUN_AUTH\s*=\s*({[^;]+});/)[1]).csrf;
    const signin = await fetch(base + 'auth/account.php', { method: 'POST', headers: { Cookie: visitor.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signin', role: 'client', email: 'fixture1@example.invalid', password: 'fixture-password-123', csrf }) });
    assert.equal(signin.status, 200);
    visitor.cookie = signin.headers.get('set-cookie').split(';')[0];
    assert.equal((await visitor.request()).status, 302, 'Client sign-in does not grant admin access');

    await admin.request('index.php?auth=admin');
    assert.equal((await admin.request('Admin/login.php', { csrf: 'wrong', password: secret })).status, 403);
    assert.equal((await admin.request('Admin/login.php', { csrf: admin.csrf, password: 'wrong' })).status, 403);
    const loggedIn = await admin.request('Admin/login.php', { csrf: admin.csrf, password: secret });
    assert.equal(loggedIn.status, 200);
    assert.deepEqual(JSON.parse(loggedIn.text), { ok: true });

    assert.equal((await admin.request('Admin/login.php')).status, 303, 'Signed-in admins go straight to accounts');
    const list = await admin.request();
    assert.match(list.text, /22 matching account/);
    assert.match(list.headers.get('cache-control'), /no-store/);
    assert.match((await admin.request('Admin/index.php?page=2')).text, /Page 2 of 2/);
    const filtered = await admin.request('Admin/index.php?q=fixture1%40example.invalid&role=client');
    assert.match(filtered.text, /1 matching account/);
    assert.match(filtered.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(filtered.text, /<script>alert\(1\)/);
    assert.match((await admin.request('Admin/index.php?q=fixture1%40example.invalid&role=artist')).text, /0 matching account/);
    const confirmation = await admin.request('Admin/index.php?delete=1');
    assert.match(confirmation.text, /<strong>1 submitted brief\(s\)<\/strong>/);
    assert.equal((await admin.request('Admin/index.php', { action: 'delete', user_id: 1, confirm_email: 'fixture1@example.invalid', csrf: 'wrong' })).status, 403);
    assert.match((await admin.request('Admin/index.php', { action: 'delete', user_id: 1, confirm_email: 'wrong@example.invalid', csrf: admin.csrf })).text, /Enter the account email exactly/);
    assert.match((await admin.request('Admin/index.php?q=fixture1%40example.invalid')).text, /1 matching account/);
    assert.equal((await admin.request('Admin/index.php', { action: 'delete', user_id: 1, confirm_email: 'fixture1@example.invalid', csrf: admin.csrf })).status, 303);
    assert.equal((await visitor.request('Client/submitted.php')).status, 302, 'Deleted client loses access');
    fixture(`
      $p->exec('USE '.$name);
      if ($p->query('SELECT COUNT(*) FROM users')->fetchColumn() != 21 || $p->query('SELECT COUNT(*) FROM client_briefs')->fetchColumn() != 0) throw new RuntimeException('Deletion affected the wrong rows');
    `);
    await admin.request();
    const loggedOut = await admin.request('Admin/index.php', { action: 'logout', csrf: admin.csrf });
    assert.equal(loggedOut.status, 303);
    assert.equal(loggedOut.headers.get('location'), 'login.php');
    assert.equal((await admin.request()).status, 302);
    for (let attempt = 0; attempt < 10; attempt++) {
      const attacker = session();
      await attacker.request('index.php?auth=admin');
      assert.equal((await attacker.request('Admin/login.php', { csrf: attacker.csrf, password: 'wrong' })).status, 403);
    }
    const locked = session();
    await locked.request('index.php?auth=admin');
    assert.equal((await locked.request('Admin/login.php', { csrf: locked.csrf, password: secret })).status, 429);
    const rotated = randomBytes(24).toString('hex');
    await startServer(rotated);
    await admin.request('index.php?auth=admin');
    assert.equal((await admin.request('Admin/login.php', { csrf: admin.csrf, password: rotated })).status, 200);
    await startServer(secret);
    assert.equal((await admin.request()).status, 302, 'Password rotation revokes admin session');
    console.log('PASS: disabled/unauthorized access, CSRF, login/logout, search/filter/pagination, escaping, confirmed deletion, client access revocation, shared rate limit, and password rotation.');
  } finally {
    await stopServer();
    fixture("$p->exec('DROP DATABASE IF EXISTS '.$name);");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
