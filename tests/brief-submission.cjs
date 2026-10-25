// Run with Apache/MySQL running: node tests/brief-submission.cjs
// Uses temporary accounts and removes their database rows in finally.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://localhost/Capstone/';
const bootstrap = path.resolve(__dirname, '../auth/bootstrap.php');
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const suffix = randomBytes(8).toString('hex');
const emails = ['owner', 'other', 'artist'].map(name => `brief-test-${name}-${suffix}@example.invalid`);
const password = randomBytes(18).toString('hex');
const id = () => randomBytes(16).toString('hex');
function session() {
  return { cookie: '', csrf: '', async request(url, data, method) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (data !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(base + url, { method: method || (data === undefined ? 'GET' : 'POST'),
      headers, body: data === undefined ? undefined : JSON.stringify(data), redirect: 'manual' });
    const cookie = response.headers.get('set-cookie');
    if (cookie) this.cookie = cookie.split(';')[0];
    return response;
  }};
}
async function signup(index, role) {
  const client = session();
  const landing = await (await client.request('index.php')).text();
  client.csrf = JSON.parse(landing.match(/window\.MAMUNGKUN_AUTH\s*=\s*({[^;]+});/)[1]).csrf;
  const response = await client.request('auth/account.php', { csrf: client.csrf, action: 'signup',
    role, name: `Temporary ${index === 0 ? 'owner' : index === 1 ? 'other' : 'artist'} ${suffix}`, email: emails[index], password });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.redirect, role === 'artist' ? 'Artist/Artist%20UI.php' : 'Client/Client%20UI.php');
  client.csrf = result.csrf;
  return client;
}
(async () => {
  try {
    const owner = await signup(0, 'client');
    const other = await signup(1, 'client');
    const artist = await signup(2, 'artist');
    const anonymous = session();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA3sAAAAASUVORK5CYII=', 'base64');
    const brief = { accessCode: id(), projectName: '<script>alert(1)</script> Midnight', projectType: 'Poster',
      idea: 'A warm jazz poster.\nA second line.', audience: 'Music fans', goal: 'Sell tickets',
      format: 'Poster \u00b7 4:5', style: 'Hand-crafted', energy: 'Warm & rich', tags: ['Warm', 'Editorial'],
      referenceName: '<img src=x onerror=alert(1)>.png', reference: 'data:image/png;base64,' + png.toString('base64'), sketch: null };
    const submissionId = id();
    const payload = { csrf: owner.csrf, submissionId, brief };
    const submit = data => owner.request('Client/submit-brief.php', data);
    assert.equal((await anonymous.request('Client/submit-brief.php', payload)).status, 401);
    assert.equal((await artist.request('Client/submit-brief.php', { ...payload, csrf: artist.csrf })).status, 403);
    assert.equal((await owner.request('Client/submit-brief.php')).status, 405);
    assert.equal((await submit({ ...payload, csrf: 'wrong' })).status, 403);
    assert.equal((await submit({ ...payload, brief: { ...brief, idea: '' } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, projectName: 'x'.repeat(121) } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, tags: ['Unknown'] } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, reference: 'data:image/png;base64,SGVsbG8=' } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, reference: 'data:image/svg+xml;base64,PHN2Zz4=' } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, reference: 'x'.repeat(7 * 1024 * 1024) } })).status, 413);
    const created = await submit(payload);
    assert.equal(created.status, 201, await created.clone().text());
    assert.equal((await created.json()).id, submissionId);
    assert.equal((await submit(payload)).status, 200, 'Retry must be idempotent');
    assert.equal((await submit({ ...payload, brief: { ...brief, idea: 'Changed' } })).status, 409);
    assert.equal((await other.request('Client/submit-brief.php', { ...payload, csrf: other.csrf })).status, 409);
    const page = await owner.request('Client/submitted.php?id=' + submissionId);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt; Midnight'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;.png'));
    assert.equal((await other.request('Client/submitted.php?id=' + submissionId)).status, 404);
    assert.equal((await artist.request('Client/submitted.php?id=' + submissionId)).status, 302);
    assert.equal((await anonymous.request('Client/submitted.php?id=' + submissionId)).status, 302);
    const image = await owner.request('Client/brief-image.php?id=' + submissionId);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
    assert.equal((await other.request('Client/brief-image.php?id=' + submissionId)).status, 404);
    assert.equal((await artist.request('Client/brief-image.php?id=' + submissionId)).status, 403);
    assert.equal((await anonymous.request('Client/brief-image.php?id=' + submissionId)).status, 401);
    const otherList = await (await other.request('Client/submitted.php')).text();
    assert.ok(!otherList.includes(submissionId));
    assert.ok(otherList.includes('No submitted briefs here yet'));
    for (const sketch of [null, brief.reference]) {
      const anotherId = id();
      assert.equal((await submit({ ...payload, submissionId: anotherId, brief: { ...brief, accessCode: id(), reference: null, referenceName: '', sketch } })).status, 201);
      const visual = await owner.request('Client/brief-image.php?id=' + anotherId);
      assert.equal(visual.status, sketch ? 200 : 404);
    }
    // Signing out and back in uses a new session but retains saved briefs.
    const logout = await owner.request('auth/account.php', { csrf: owner.csrf, action: 'logout' });
    owner.csrf = (await logout.json()).csrf;
    assert.equal((await owner.request('Client/brief-image.php?id=' + submissionId)).status, 401);
    const login = await owner.request('auth/account.php', { csrf: owner.csrf, action: 'signin', role: 'client', email: emails[0], password });
    assert.equal(login.status, 200);
    owner.csrf = (await login.json()).csrf;
    assert.equal((await owner.request('Client/submitted.php?id=' + submissionId)).status, 200);
    const list = await (await owner.request('Client/submitted.php')).text();
    assert.equal((list.match(/class="card brief-list-item"/g) || []).length, 3);
    execFileSync(php, ['-r', 'session_save_path(sys_get_temp_dir()); require $argv[1]; $q=db()->prepare("SELECT COUNT(*) FROM client_briefs b JOIN users u ON u.id=b.client_id WHERE u.email=?"); $q->execute([$argv[2]]); exit((int)$q->fetchColumn() === 3 ? 0 : 1);', bootstrap, emails[0]], { stdio: 'inherit' });
    await require('./artist-workspace.cjs')({ owner, other, artist, anonymous, brief, png, submissionId, suffix, id, base, emails, password });
    console.log('PASS: persistence, upload/sketch, retry deduplication, validation, CSRF, role/owner isolation, escaped HTML, sign-out/sign-in.');
  } finally {
    execFileSync(php, ['-r', 'session_save_path(sys_get_temp_dir()); require $argv[1]; foreach(array_slice($argv,2) as $email) { $q=db()->prepare("DELETE b FROM client_briefs b JOIN users u ON u.id=b.client_id WHERE u.email=?"); $q->execute([$email]); $q=db()->prepare("DELETE FROM users WHERE email=?"); $q->execute([$email]); }', bootstrap, ...emails], { stdio: 'inherit' });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
