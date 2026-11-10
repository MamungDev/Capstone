// Run with Apache/MySQL running: node tests/brief-submission.cjs
// Uses temporary accounts and removes their database rows in finally.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const base = process.env.TEST_BASE_URL || 'http://localhost/Capstone/';
const bootstrap = path.resolve(__dirname, '../auth/bootstrap.php');
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const suffix = randomBytes(8).toString('hex');
const emails = ['owner', 'other', 'artist'].map(name => `brief-test-${name}-${suffix}@example.invalid`);
const password = randomBytes(18).toString('hex');
const id = () => randomBytes(16).toString('hex');
function docxFixture() {
  const entries = [
    ['[Content_Types].xml', '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Attached idea</w:t></w:r></w:p></w:body></w:document>'],
  ];
  const chunks = [], directory = [];
  let offset = 0;
  const crc32 = data => { let crc = -1; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0); } return (crc ^ -1) >>> 0; };
  for (const [filename, content] of entries) {
    const name = Buffer.from(filename), data = Buffer.from(content), crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directorySize = directory.reduce((sum, chunk) => sum + chunk.length, 0);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directorySize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, ...directory, end]);
}
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
    const fontBytes = readFileSync('C:/Windows/Fonts/FRSCRIPT.TTF');
    const fontFile = { name: 'Script <test>.ttf', data: 'data:font/ttf;base64,' + fontBytes.toString('base64') };
    const pdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
    const pdfFile = { name: 'Idea <draft>.pdf', data: 'data:application/pdf;base64,' + pdfBytes.toString('base64') };
    const docxBytes = docxFixture();
    const docxFile = { name: 'Design notes.docx', data: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + docxBytes.toString('base64') };
    const brief = { accessCode: id(), projectName: '<script>alert(1)</script> Midnight', projectType: 'Poster',
      resolution: '1920 × 1080 px', note: '<b>Keep the logo clear</b>', font: 'My custom font <test>', fontFile, ideaFile: pdfFile, palette: ['#123ABC', '#F0E1D2'],
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
    assert.equal((await submit({ ...payload, brief: { ...brief, idea: '', ideaFile: null } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, projectName: 'x'.repeat(121) } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, tags: ['Unknown'] } })).status, 422);
    for (const badFont of [
      { name: 'fake.ttf', data: 'data:font/ttf;base64,' + Buffer.alloc(64).toString('base64') },
      { name: 'fake.svg', data: fontFile.data },
      { name: '../escape.ttf', data: fontFile.data },
      { name: fontFile.name, data: fontFile.data.replace('font/ttf', 'font/woff2') },
    ]) assert.equal((await submit({ ...payload, brief: { ...brief, fontFile: badFont } })).status, 422);
    for (const badDocument of [
      { ...pdfFile, name: '../escape.pdf' },
      { ...pdfFile, name: 'fake.docx' },
      { ...pdfFile, data: pdfFile.data.replace('application/pdf', 'application/octet-stream') },
      { ...pdfFile, data: 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\nmissing end marker').toString('base64') },
      { ...docxFile, data: docxFile.data.replace('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf') },
      { ...docxFile, data: 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + Buffer.from('PK\x03\x04not a document').toString('base64') },
      { ...pdfFile, data: 'data:application/pdf;base64,' + Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5 * 1024 * 1024), Buffer.from('%%EOF')]).toString('base64') },
    ]) assert.equal((await submit({ ...payload, brief: { ...brief, ideaFile: badDocument } })).status, 422);
    for (const invalid of [{ resolution: 'Poster' }, { palette: ['red'] }, { palette: ['#123456; color:red'] }, { palette: Array(9).fill('#123456') }, { palette: 'blue' }, { note: 'x'.repeat(2001) }, { font: 'x'.repeat(121) }]) {
      assert.equal((await submit({ ...payload, brief: { ...brief, ...invalid } })).status, 422);
    }
    for (const resolution of ['0 x 1080', '-100 x 200', '1.5 x 200', '1377 x', '1000001 x 200', '200 x 300 extra']) {
      assert.equal((await submit({ ...payload, brief: { ...brief, resolution } })).status, 422, 'Invalid resolution rejected: ' + resolution);
    }
    assert.equal((await submit({ ...payload, brief: { ...brief, reference: 'data:image/png;base64,SGVsbG8=' } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, reference: 'data:image/svg+xml;base64,PHN2Zz4=' } })).status, 422);
    assert.equal((await submit({ ...payload, brief: { ...brief, reference: 'x'.repeat(17 * 1024 * 1024) } })).status, 413);
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
    for (const value of ['1920 × 1080 px', '&lt;b&gt;Keep the logo clear&lt;/b&gt;', 'My custom font &lt;test&gt;', 'Script &lt;test&gt;.ttf', 'brief-font.php?id=' + submissionId, 'Idea &lt;draft&gt;.pdf', 'brief-document.php?id=' + submissionId, '#123ABC, #F0E1D2']) assert.ok(html.includes(value), value);
    assert.ok(!html.includes('Idea <draft>.pdf'));
    const documentDownload = await owner.request('Client/brief-document.php?id=' + submissionId);
    assert.equal(documentDownload.status, 200);
    assert.deepEqual(Buffer.from(await documentDownload.arrayBuffer()), pdfBytes);
    assert.match(documentDownload.headers.get('content-disposition'), /^attachment/);
    assert.equal(documentDownload.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await other.request('Client/brief-document.php?id=' + submissionId)).status, 404);
    assert.equal((await anonymous.request('Client/brief-document.php?id=' + submissionId)).status, 401);
    assert.equal((await artist.request('Client/brief-document.php?id=' + submissionId)).status, 403);
    const fontDownload = await owner.request('Client/brief-font.php?id=' + submissionId);
    assert.equal(fontDownload.status, 200);
    assert.deepEqual(Buffer.from(await fontDownload.arrayBuffer()), fontBytes);
    assert.match(fontDownload.headers.get('content-disposition'), /attachment/);
    assert.equal((await other.request('Client/brief-font.php?id=' + submissionId)).status, 404);
    assert.equal((await anonymous.request('Client/brief-font.php?id=' + submissionId)).status, 401);
    assert.equal((await artist.request('Client/brief-font.php?id=' + submissionId)).status, 403);
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
      const anotherBrief = { ...brief, projectName: sketch ? brief.projectName : '', idea: sketch ? brief.idea : '', ideaFile: sketch ? null : docxFile, resolution: sketch ? '1 x 1000000' : '01377px BY 02111 PX', fontFile: null, accessCode: id(), reference: null, referenceName: '', sketch };
      assert.equal((await submit({ ...payload, submissionId: anotherId, brief: anotherBrief })).status, 201);
      const customPage = await (await owner.request('Client/submitted.php?id=' + anotherId)).text();
      assert.ok(customPage.includes(sketch ? '1 × 1000000 px' : '1377 × 2111 px'), 'Custom dimensions persist and display in the saved brief');
      assert.equal((await submit({ ...payload, submissionId: anotherId, brief: { ...anotherBrief, resolution: sketch ? '1 × 1000000 px' : '1377 × 2111 px' } })).status, 200, 'Equivalent dimension formats remain idempotent');
      if (!sketch) {
        const titledPage = await (await owner.request('Client/submitted.php?id=' + anotherId)).text();
        assert.ok(titledPage.includes('Design notes'), 'A document-only brief uses its filename as its title');
        const downloadedDocx = await owner.request('Client/brief-document.php?id=' + anotherId);
        assert.equal(downloadedDocx.status, 200);
        assert.deepEqual(Buffer.from(await downloadedDocx.arrayBuffer()), docxBytes);
      }
      else assert.equal((await owner.request('Client/brief-document.php?id=' + anotherId)).status, 404);
      assert.equal((await owner.request('Client/brief-font.php?id=' + anotherId)).status, 404);
      const visual = await owner.request('Client/brief-image.php?id=' + anotherId);
      assert.equal(visual.status, sketch ? 200 : 404);
    }
    // Signing out and back in uses a new session but retains saved briefs.
    const logout = await owner.request('auth/account.php', { csrf: owner.csrf, action: 'logout' });
    owner.csrf = (await logout.json()).csrf;
    assert.equal((await owner.request('Client/brief-image.php?id=' + submissionId)).status, 401);
    assert.equal((await owner.request('Client/brief-font.php?id=' + submissionId)).status, 401);
    assert.equal((await owner.request('Client/brief-document.php?id=' + submissionId)).status, 401);
    const login = await owner.request('auth/account.php', { csrf: owner.csrf, action: 'signin', role: 'client', email: emails[0], password });
    assert.equal(login.status, 200);
    owner.csrf = (await login.json()).csrf;
    assert.equal((await owner.request('Client/submitted.php?id=' + submissionId)).status, 200);
    const list = await (await owner.request('Client/submitted.php')).text();
    assert.equal((list.match(/class="card brief-list-item"/g) || []).length, 3);
    execFileSync(php, ['-r', 'session_save_path(sys_get_temp_dir()); require $argv[1]; $q=db()->prepare("SELECT COUNT(*) FROM client_briefs b JOIN users u ON u.id=b.client_id WHERE u.email=?"); $q->execute([$argv[2]]); exit((int)$q->fetchColumn() === 3 ? 0 : 1);', bootstrap, emails[0]], { stdio: 'inherit' });
    await require('./artist-workspace.cjs')({ owner, other, artist, anonymous, brief, png, pdfBytes, submissionId, suffix, id, base, emails, password });
    console.log('PASS: persistence, upload/sketch, retry deduplication, validation, CSRF, role/owner isolation, escaped HTML, sign-out/sign-in.');
  } finally {
    execFileSync(php, ['-r', 'session_save_path(sys_get_temp_dir()); require $argv[1]; foreach(array_slice($argv,2) as $email) { $q=db()->prepare("DELETE b FROM client_briefs b JOIN users u ON u.id=b.client_id WHERE u.email=?"); $q->execute([$email]); $q=db()->prepare("DELETE FROM users WHERE email=?"); $q->execute([$email]); }', bootstrap, ...emails], { stdio: 'inherit' });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
