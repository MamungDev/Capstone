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
const env = { ...process.env, DB_DRIVER: 'mysql', DB_NAME: dbName, ADMIN_ALLOWED_EMAILS: 'admin@example.com,second@example.com,disabled@example.com,regalariojayveesevilla@gmail.com', SESSION_DRIVER: 'mysql', SESSION_COOKIE_PATH: '/' };
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

async function startServer(allowed = env.ADMIN_ALLOWED_EMAILS) {
  await stopServer();
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  base = `http://127.0.0.1:${port}/`;
  server = spawn(php, ['-S', `127.0.0.1:${port}`, 'api/index.php'], { cwd: root, env: { ...env, ADMIN_ALLOWED_EMAILS: allowed }, stdio: 'ignore', windowsHide: true });
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
      $p->exec('DROP TABLE admin_access_requests'); // Exercise automatic upgrade of existing databases.
      $q = $p->prepare('INSERT INTO users (role, email, display_name, password_hash) VALUES (?, ?, ?, ?)');
      for ($i = 1; $i <= 22; $i++) $q->execute([$i % 2 ? 'client' : 'artist', 'fixture'.$i.'@example.invalid', $i === 1 ? '<script>alert(1)</script>' : 'Fixture '.$i, password_hash('fixture-password-123', PASSWORD_DEFAULT)]);
      $p->exec("INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash) VALUES ('".str_repeat('a', 32)."', 1, 'Temporary brief', '{}', '".str_repeat('b', 64)."')");
    `);
    execFileSync(php, ['tests/admin-google.php'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
    await startServer();
    const visitor = session();
    const redirect = await visitor.request();
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get('location'), 'login.php');
    assert.equal((await visitor.request('Admin/index.php', { action: 'delete_user' })).status, 403);
    assert.equal((await visitor.request('Admin/login.php', { password: secret, code: '123456' })).status, 405);
    assert.equal((await visitor.request('Admin/setup.php', { password: secret, code: '123456' })).status, 405);
    const landing = await visitor.request('index.php');
    const csrf = JSON.parse(landing.text.match(/window\.MAMUNGKUN_AUTH\s*=\s*({[^;]+});/)[1]).csrf;
    const signin = await fetch(base + 'auth/account.php', { method: 'POST', headers: { Cookie: visitor.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'signin', role: 'client', email: 'fixture1@example.invalid', password: 'fixture-password-123', csrf }) });
    assert.equal(signin.status, 200);
    visitor.cookie = signin.headers.get('set-cookie').split(';')[0];
    assert.equal((await visitor.request()).status, 302, 'Client sign-in does not grant admin access');

    // Supply a verified test identity via CLI only; no HTTP authentication bypass exists.
    const sessionId = execFileSync(php, ['-r', `
      require 'auth/admin.php';
      admin_google_signin(['email' => 'admin@example.com', 'sub' => 'google-admin-1', 'email_verified' => true]);
      echo session_id();
      session_write_close();
    `], { cwd: root, env, encoding: 'utf8', windowsHide: true }).trim();
    const admin = session();
    admin.cookie = 'mamungkun_session=' + sessionId;
    const list = await admin.request('Admin/index.php?tab=accounts');
    assert.equal(list.status, 200);
    assert.match(list.headers.get('cache-control'), /no-store/);
    assert.match((await admin.request('Admin/index.php?tab=accounts&page=2')).text, /Page 2 of 2/);
    const filtered = await admin.request('Admin/index.php?tab=accounts&q=fixture1%40example.invalid&role=client');
    assert.match(filtered.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(filtered.text, /<script>alert\(1\)/);
    const security = await admin.request('Admin/index.php?tab=security');
    assert.match(security.text, /approved Google account/);
    assert.doesNotMatch(security.text, /name="admin_password"|name="new_password"|authenticator|recovery code/i);
    assert.match(security.text, /Submit invitation for approval/);
    assert.doesNotMatch(security.text, /value="approve_admin_invite"|value="disable_admin"/);
    const loginGoogle = (email, subject) => {
      const id = execFileSync(php, ['-r', `
        require 'auth/admin.php';
        admin_google_signin(['email' => $argv[1], 'sub' => $argv[2], 'email_verified' => true]);
        echo session_id(); session_write_close();
      `, email, subject], { cwd: root, env, encoding: 'utf8', windowsHide: true }).trim();
      const user = session(); user.cookie = 'mamungkun_session=' + id; return user;
    };
    const googleDenied = email => {
      const result = execFileSync(php, ['-r', `
        require 'auth/admin.php';
        try { admin_google_signin(['email' => $argv[1], 'sub' => 'invited-google-sub', 'email_verified' => true]); echo 'UNSAFE'; }
        catch (DomainException $e) { echo $e->getMessage(); }
      `, email], { cwd: root, env, encoding: 'utf8', windowsHide: true }).trim();
      assert.equal(result, 'admin-not-allowed');
    };
    const owner = loginGoogle('regalariojayveesevilla@gmail.com', 'owner-google-sub');
    await owner.request('Admin/index.php?tab=security');
    const invitation = { action: 'invite_admin', email: '  Invited.Admin@gmail.com ', reason: 'Invite our project coordinator <script>unsafe()</script>', csrf: admin.csrf };
    assert.equal((await admin.request('Admin/index.php?tab=security', { ...invitation, csrf: 'wrong' })).status, 403);
    assert.equal((await admin.request('Admin/index.php?tab=security', { ...invitation, email: 'other@example.com' })).status, 422);
    assert.equal((await admin.request('Admin/index.php?tab=security', invitation)).status, 303);
    assert.equal((await admin.request('Admin/index.php?tab=security', invitation)).status, 409, 'Duplicate invitation rejected');
    googleDenied('invited.admin@gmail.com');
    const review = { action: 'approve_admin_invite', email: 'invited.admin@gmail.com', version: '0', reason: 'Verified this administrator', csrf: admin.csrf };
    assert.equal((await admin.request('Admin/index.php?tab=security', { ...review, reviewed_by_email: 'regalariojayveesevilla@gmail.com' })).status, 403, 'Non-owner cannot forge approval');
    assert.equal((await admin.request('Admin/index.php?tab=security', { action: 'enable_admin', admin_id: '1', reason: 'Try bypassing approval', csrf: admin.csrf })).status, 403);
    const pendingPage = await owner.request('Admin/index.php?tab=security');
    assert.match(pendingPage.text, /value="approve_admin_invite"/);
    assert.match(pendingPage.text, /&lt;script&gt;unsafe\(\)&lt;\/script&gt;/);
    assert.doesNotMatch(pendingPage.text, /<script>unsafe\(\)/);
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: 'wrong' })).status, 403);
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: owner.csrf, version: '99' })).status, 409);
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: owner.csrf, action: 'reject_admin_invite' })).status, 303);
    googleDenied('invited.admin@gmail.com');
    assert.equal((await admin.request('Admin/index.php?tab=security', invitation)).status, 303, 'Rejected invitation can be resubmitted');
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: owner.csrf })).status, 409, 'Old review form cannot approve a new request');
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: owner.csrf, version: '2' })).status, 303);
    const invited = loginGoogle('invited.admin@gmail.com', 'invited-google-sub');
    assert.equal((await invited.request()).status, 200, 'Approved Gmail signs in without an environment allowlist entry');
    const approvedPage = await admin.request('Admin/index.php?tab=security');
    assert.match(approvedPage.text, /Copy sign-in link/);
    assert.doesNotMatch(approvedPage.text, /value="approve_admin_invite"|value="revoke_admin_invite"/);
    assert.equal((await admin.request('Admin/index.php?tab=security', { ...review, action: 'revoke_admin_invite', version: '3' })).status, 403);
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: owner.csrf, action: 'revoke_admin_invite', version: '3' })).status, 303);
    assert.equal((await invited.request()).status, 302, 'Revocation ends existing sessions');
    googleDenied('invited.admin@gmail.com');
    assert.equal((await admin.request('Admin/index.php?tab=security', invitation)).status, 303, 'Revoked invitation can be requested again');
    googleDenied('invited.admin@gmail.com');
    assert.equal((await owner.request('Admin/index.php?tab=security', { ...review, csrf: owner.csrf, version: '5' })).status, 303);
    const restored = loginGoogle('invited.admin@gmail.com', 'invited-google-sub');
    assert.equal((await restored.request()).status, 200, 'Owner reapproval restores access');
    fixture(`
      $p->exec('USE '.$name);
      if ($p->query("SELECT COUNT(*) FROM admin_audit WHERE action LIKE 'admin_invitation_%'")->fetchColumn() != 7) throw new RuntimeException('Invitation audit trail missing');
    `);
    console.log('PASS: invitation migration, Gmail validation, CSRF, owner-only review, duplicate/stale requests, rejection, approval, Google access, revocation, reapproval, and audit history.');
    const deletion = { action: 'delete_user', user_id: '1', confirmation: 'fixture1@example.invalid', reason: 'Remove temporary test account', csrf: admin.csrf };
    assert.equal((await admin.request('Admin/index.php?tab=accounts', { ...deletion, csrf: 'wrong' })).status, 403);
    assert.equal((await admin.request('Admin/index.php?tab=accounts', { ...deletion, confirmation: 'wrong@example.invalid' })).status, 422);
    assert.equal((await admin.request('Admin/index.php?tab=accounts', deletion)).status, 303);
    assert.equal((await visitor.request('Client/submitted.php')).status, 302, 'Deleted client loses access');
    fixture(`
      $p->exec('USE '.$name);
      if ($p->query('SELECT COUNT(*) FROM users')->fetchColumn() != 21 || $p->query('SELECT COUNT(*) FROM client_briefs')->fetchColumn() != 0) throw new RuntimeException('Deletion affected the wrong rows');
    `);
    await startServer('second@example.com');
    assert.equal((await admin.request()).status, 302, 'Removing allowlist entry must revoke access');
    await startServer();
    await admin.request();
    const loggedOut = await admin.request('Admin/index.php', { action: 'logout', csrf: admin.csrf });
    assert.equal(loggedOut.status, 303);
    assert.equal(loggedOut.headers.get('location'), 'login.php');
    assert.equal((await admin.request()).status, 302);
    console.log('PASS: Google-only admin access, legacy endpoint rejection, role isolation, CSRF, list/search/pagination, confirmed deletion without password, allowlist revocation, and logout.');
  } finally {
    await stopServer();
    fixture("$p->exec('DROP DATABASE IF EXISTS '.$name);");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
