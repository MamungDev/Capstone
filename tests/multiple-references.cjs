// Uses a fresh temporary database and a local PHP server; never deletes real accounts.
// Run with XAMPP MySQL available: node tests/multiple-references.cjs
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const net = require('node:net');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const dbName = 'mamungkun_references_test_' + randomBytes(8).toString('hex');
const secret = randomBytes(24).toString('hex');
const env = { ...process.env, DB_NAME: dbName, ADMIN_PASSWORD: secret, SESSION_DRIVER: 'mysql', SESSION_COOKIE_PATH: '/' };
delete env.VERCEL;
let server;
let base;

function fixture(sql) {
  execFileSync(php, ['-r', `
    $c = require 'auth/config.local.php';
    $p = new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port'] ?? 3306), $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $name = getenv('DB_NAME');
    if (!in_array($c['db_host'], ['127.0.0.1', 'localhost'], true)) throw new RuntimeException('Tests require local MySQL');
    if (!preg_match('/^mamungkun_references_test_[a-f0-9]{16}$/D', $name)) throw new RuntimeException('Unsafe test database name');
    ${sql}
  `], { cwd: root, env, stdio: 'inherit' });
}

function session() {
  return { cookie: '', csrf: '', async request(route, data, form = false) {
    const headers = {Connection:'close', ...(this.cookie ? {Cookie:this.cookie} : {})};
    if (data !== undefined) headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
    const response = await fetch(base + route, {method:data === undefined ? 'GET' : 'POST', headers,
      body:data === undefined ? undefined : form ? new URLSearchParams(data) : JSON.stringify(data), redirect:'manual'});
    const cookie = response.headers.get('set-cookie'); if (cookie) this.cookie = cookie.split(';')[0];
    return new Response(await response.arrayBuffer(), {status:response.status, headers:response.headers});
  }};
}
async function login(number, role) {
  const client = session();
  const landing = await (await client.request('index.php')).text();
  client.csrf = JSON.parse(landing.match(/window\.MAMUNGKUN_AUTH\s*=\s*({[^;]+});/)[1]).csrf;
  const response = await client.request('auth/account.php', {csrf:client.csrf, action:'signin', role, email:'reference-test-' + number + '@example.invalid', password:secret});
  assert.equal(response.status, 200, await response.clone().text());
  client.csrf = (await response.json()).csrf; return client;
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
  const id = () => randomBytes(16).toString('hex');
  let createdDatabase = false;
  try {
    fixture(`
      $p->exec('CREATE DATABASE '.$name);
      $p->exec('USE '.$name);
      foreach (explode(';', preg_replace('/^\\s*--[^\\r\\n]*$/m', '', file_get_contents('auth/schema.sql'))) as $sql) if (trim($sql) !== '') $p->exec($sql);
      $q = $p->prepare('INSERT INTO users (role, email, display_name, password_hash) VALUES (?, ?, ?, ?)');
      for ($i = 1; $i <= 4; $i++) $q->execute([$i <= 2 ? 'client' : 'artist', 'reference-test-'.$i.'@example.invalid', 'Reference test '.$i, password_hash(getenv('ADMIN_PASSWORD'), PASSWORD_DEFAULT)]);
    `);
    createdDatabase = true;
    await startServer(secret);
    const owner = await login(1, 'client'), other = await login(2, 'client');
    const artist = await login(3, 'artist'), lockedArtist = await login(4, 'artist'), anonymous = session();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA3sAAAAASUVORK5CYII=', 'base64');
    const data = 'data:image/png;base64,' + png.toString('base64');
    const upload = {csrf:owner.csrf, id:id(), name:'<script>mood</script>.png', kind:'reference', data};
    assert.equal((await anonymous.request('Client/upload-reference.php', upload)).status, 401);
    assert.equal((await artist.request('Client/upload-reference.php', {...upload, csrf:artist.csrf})).status, 403);
    assert.equal((await owner.request('Client/upload-reference.php')).status, 405);
    assert.equal((await owner.request('Client/upload-reference.php', {...upload, csrf:'invalid'})).status, 403);
    assert.equal((await owner.request('Client/upload-reference.php', {...upload, data:'data:image/png;base64,SGVsbG8='})).status, 422);
    const oversized = await owner.request('Client/upload-reference.php', {...upload, data:'x'.repeat(3 * 1024 * 1024)});
    assert.equal(oversized.status, 413, await oversized.text());
    let result = await owner.request('Client/upload-reference.php', upload);
    assert.equal(result.status, 200, await result.clone().text());
    assert.equal((await owner.request('Client/upload-reference.php', upload)).status, 200, 'Upload retry is idempotent');
    assert.equal((await owner.request('Client/upload-reference.php', {...upload, name:'Changed.png'})).status, 409);
    assert.equal((await other.request('Client/upload-reference.php', {...upload, csrf:other.csrf})).status, 409);
    const references = [upload.id];
    // Exercise a collection well beyond the original single reference.
    for (let i = 1; i < 25; i++) {
      const referenceId = id(); references.push(referenceId);
      result = await owner.request('Client/upload-reference.php', {...upload, id:referenceId, name:'Reference ' + i + '.png', kind:i % 2 ? 'sketch' : 'reference'});
      assert.equal(result.status, 200, await result.clone().text());
    }
    const submissionId = id(), accessCode = id();
    const brief = {projectName:'Many references', projectType:'Poster', idea:'Images and sketches together', audience:'Clients', goal:'Explain an idea', tags:['Warm'], format:'Poster', style:'Expressive', energy:'Warm', references, accessCode};
    const payload = {csrf:owner.csrf, submissionId, brief};
    const submit = value => owner.request('Client/submit-brief.php', value);
    assert.equal((await owner.request('Client/brief-image.php?id=' + submissionId + '&reference=' + upload.id)).status, 404, 'Staged reference is not public');
    assert.equal((await other.request('Client/submit-brief.php', {...payload, csrf:other.csrf})).status, 422, 'Cannot claim another owner’s uploads');
    assert.equal((await submit({...payload, brief:{...brief, references:[references[0], references[0]]}})).status, 422);
    assert.equal((await submit({...payload, brief:{...brief, references:[...references, id()]}})).status, 422);
    assert.equal((await owner.request('Client/submitted.php?id=' + submissionId)).status, 404, 'Invalid collection creates no partial brief');
    result = await submit(payload);
    assert.equal(result.status, 201, await result.clone().text());
    assert.equal((await submit(payload)).status, 200, 'Brief retry does not duplicate attachments');
    assert.equal((await submit({...payload, brief:{...brief, references:[...references].reverse()}})).status, 409, 'Changed collection cannot overwrite a submission');
    assert.equal((await submit({...payload, submissionId:id()})).status, 422, 'References cannot be reassigned from a submitted brief');
    const clientHtml = await (await owner.request('Client/submitted.php?id=' + submissionId)).text();
    assert.equal((clientHtml.match(/class="reference-item"/g) || []).length, 25);
    assert.match(clientHtml, /&lt;script&gt;mood&lt;\/script&gt;.png/);
    assert.doesNotMatch(clientHtml, /<script>mood<\/script>/);
    assert.equal((await other.request('Client/submitted.php?id=' + submissionId)).status, 404);
    const imageUrl = 'brief-image.php?id=' + submissionId + '&reference=' + references[24];
    assert.equal((await artist.request('Artist/' + imageUrl)).status, 404);
    result = await artist.request('Artist/Artist%20UI.php', {csrf:artist.csrf, access_code:accessCode}, true);
    assert.equal(result.status, 303);
    const artistHtml = await (await artist.request('Artist/Artist%20UI.php?id=' + submissionId)).text();
    assert.equal((artistHtml.match(/class="reference-item"/g) || []).length, 25);
    assert.match(await (await artist.request('Artist/Artist%20UI.php')).text(), /25 references/);
    for (const reference of references) {
      const url = 'brief-image.php?id=' + submissionId + '&reference=' + reference;
      for (const [account, role] of [[owner,'Client'], [artist,'Artist']]) {
        const image = await account.request(role + '/' + url + '&download=1');
        assert.equal(image.status, 200);
        assert.equal(image.headers.get('content-type'), 'image/png');
        assert.match(image.headers.get('content-disposition'), /attachment/);
        assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
      }
    }
    assert.equal((await other.request('Client/' + imageUrl)).status, 404);
    assert.equal((await lockedArtist.request('Artist/' + imageUrl)).status, 404);
    assert.equal((await anonymous.request('Client/' + imageUrl)).status, 401);
    assert.equal((await owner.request('Client/brief-image.php?id=' + submissionId + '&reference=' + id())).status, 404);
    assert.equal((await artist.request('Artist/brief-image.php?id=' + submissionId + '&reference[]=bad')).status, 404);
    const emptyId = id();
    assert.equal((await submit({...payload, submissionId:emptyId, brief:{...brief, references:[], accessCode:id()}})).status, 201);
    assert.equal((await owner.request('Client/brief-image.php?id=' + emptyId + '&reference=' + references[0])).status, 404, 'Cannot use an attachment with a different brief ID');
    const legacyId = id();
    const legacyBrief = {...brief, reference:data, referenceName:'Legacy.png', accessCode:id()}; delete legacyBrief.references;
    assert.equal((await submit({...payload, submissionId:legacyId, brief:legacyBrief})).status, 201);
    assert.deepEqual(Buffer.from(await (await owner.request('Client/brief-image.php?id=' + legacyId)).arrayBuffer()), png);
    assert.match(await (await owner.request('Client/submitted.php?id=' + legacyId)).text(), /Legacy.png/);
    for (const asset of ['sketchpad.js', 'draft-store.js']) assert.equal((await anonymous.request('Client/' + asset)).status, 200, 'Router serves new client assets');
    console.log('PASS: 25 mixed references; upload and submit retries; atomic submission; owner and artist isolation; all downloads; invalid images, IDs and CSRF; legacy briefs; router assets.');
  } finally {
    await stopServer();
    if (createdDatabase) fixture("$p->exec('DROP DATABASE IF EXISTS '.$name);");
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

