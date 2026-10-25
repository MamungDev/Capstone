// Included by brief-submission.cjs, which owns and cleans up all temporary accounts.
const assert = require('node:assert/strict');

module.exports = async function checkArtistWorkspace({ owner, other, artist, anonymous, brief, png, submissionId, suffix, id, base, emails, password }) {
  const route = 'Artist/Artist%20UI.php';
  const imageRoute = 'Artist/brief-image.php?id=';
  const unescapeUrl = value => value.replaceAll('&amp;', '&');
  const projectLinks = html => Array.from(html.matchAll(/class="project-link" href="([^"]+)"/g), match => unescapeUrl(match[1]));
  const projectIds = html => projectLinks(html).map(link => new URL(link, base).searchParams.get('id'));
  const stats = html => Array.from(html.matchAll(/<div class="stat[^"]*"><span>[^<]+<\/span><strong>(\d+)<\/strong>/g), match => Number(match[1]));
  async function getPage(query = '') {
    const response = await artist.request(route + query);
    assert.equal(response.status, 200, `Artist page failed: ${query}`);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const html = await response.text();
    assert.doesNotMatch(html, /(?:Warning|Fatal error|Parse error):/);
    return html;
  }
  async function logoutForm(csrf) {
    const response = await fetch(base + 'auth/logout.php', {
      method: 'POST', redirect: 'manual', headers: { Cookie: artist.cookie },
      body: new URLSearchParams({ csrf }),
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) artist.cookie = cookie.split(';')[0];
    return response;
  }
  // Check the same form-based sign-out and password sign-in used by the UI.
  assert.equal((await logoutForm('wrong')).status, 403);
  const logout = await logoutForm(artist.csrf);
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.get('location'), '../index.php');
  assert.equal((await artist.request(route)).status, 302);
  const landing = await (await artist.request('index.php')).text();
  artist.csrf = JSON.parse(landing.match(/window\.MAMUNGKUN_AUTH\s*=\s*({[^;]+});/)[1]).csrf;
  const login = await artist.request('auth/account.php', { csrf: artist.csrf, action: 'signin', role: 'artist', email: emails[2], password });
  assert.equal(login.status, 200);
  const signedIn = await login.json();
  artist.csrf = signedIn.csrf;
  assert.equal(signedIn.redirect, route);
  // A signed-in artist must unlock the owner's private brief first.
  assert.equal((await artist.request(route + '?id=' + submissionId)).status, 404);
  const ownerPage = await (await owner.request('Client/submitted.php?id=' + submissionId)).text();
  const accessCode = ownerPage.match(/aria-label="Private project code" readonly value="([a-f0-9]+)"/)[1];
  const unlocked = await fetch(base + route, { method: 'POST', redirect: 'manual',
    headers: { Cookie: artist.cookie }, body: new URLSearchParams({ csrf: artist.csrf, access_code: accessCode }) });
  assert.equal(unlocked.status, 303);
  const inboxBefore = await getPage();
  assert.match(inboxBefore, /The brief inbox/);
  const baseline = stats(inboxBefore);
  assert.equal(baseline.length, 3);

  for (const session of [owner, other, anonymous]) {
    for (const url of [route, route + '?id=' + submissionId]) {
      const denied = await session.request(url);
      assert.equal(denied.status, 302);
      assert.equal(denied.headers.get('location'), '../index.php?auth=artist');
    }
    assert.equal((await session.request(imageRoute + submissionId)).status, session === anonymous ? 401 : 403);
  }
  const detail = await getPage('?id=' + submissionId);
  assert.match(detail, /&lt;script&gt;alert\(1\)&lt;\/script&gt; Midnight/);
  assert.ok(detail.includes('&lt;img src=x onerror=alert(1)&gt;.png'));
  assert.doesNotMatch(detail, /<script>alert\(1\)<\/script>/);
  for (const value of ['Music fans', 'Sell tickets', 'Hand-crafted', 'Warm &amp; rich', 'Editorial']) assert.ok(detail.includes(value));
  for (const invalid of ['?id=invalid', '?id[]=' + submissionId, '?id=' + id()]) {
    assert.equal((await artist.request(route + invalid)).status, 404);
  }
  for (const ending of ['', '&download=1']) {
    const image = await artist.request(imageRoute + submissionId + ending);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/png');
    assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
    assert.match(image.headers.get('cache-control'), /no-store/);
    if (ending) assert.match(image.headers.get('content-disposition'), /^attachment; filename="reference-[a-f0-9]{32}\.png"$/);
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  }
  assert.equal((await artist.request(imageRoute + id())).status, 404);
  const marker = `artist-check-${suffix}`;
  const added = [];
  // More than one inbox page, submitted by a second client, with mixed project/reference types.
  for (let index = 0; index < 13; index++) {
    const submission = id();
    const response = await other.request('Client/submit-brief.php', { csrf: other.csrf, submissionId: submission, brief: {
      ...brief, accessCode: id(), projectName: `${marker} ${index === 0 ? '%_!' : index}`, projectType: index % 2 ? 'Social post' : 'Poster',
      idea: `A second client's idea ${marker}-idea-${index}.`,
      reference: index === 0 ? brief.reference : null, sketch: index === 1 ? brief.reference : null, referenceName: index === 0 ? 'reference.png' : '',
    }});
    assert.equal(response.status, 201);
    added.push(submission);
  }
  // Seed permissions for pagination fixtures; code validation/rate limits have dedicated privacy tests.
  require('node:child_process').execFileSync(process.env.PHP_BINARY || 'C:/xampp/php/php.exe', ['-r',
    'require "auth/bootstrap.php"; $q=db()->prepare("INSERT INTO brief_artist_access (brief_id, artist_id) SELECT ?, id FROM users WHERE email=?"); foreach(array_slice($argv,2) as $id) $q->execute([$id,$argv[1]]);',
    emails[2], ...added], { cwd: require('node:path').resolve(__dirname, '..'), stdio: 'inherit' });
  const inboxAfter = await getPage();
  assert.deepEqual(stats(inboxAfter), [baseline[0] + 13, baseline[1] + 2, baseline[2] + 1]);
  const query = '?q=' + marker;
  const first = await getPage(query);
  const second = await getPage(query + '&page=2');
  assert.equal(projectIds(first).length, 12);
  assert.equal(projectIds(second).length, 1);
  assert.deepEqual(new Set([...projectIds(first), ...projectIds(second)]), new Set(added));
  const ascendingFirst = await getPage(query + '&sort=oldest');
  const ascendingSecond = await getPage(query + '&sort=oldest&page=2');
  assert.deepEqual([...projectIds(ascendingFirst), ...projectIds(ascendingSecond)], [...projectIds(first), ...projectIds(second)].reverse());
  assert.deepEqual(projectIds(await getPage(query + '&page=9999')), projectIds(second));
  assert.equal(projectIds(await getPage(query + '&type=Social+post')).length, 6);
  assert.deepEqual(new Set(projectIds(await getPage(query + '&visual=yes'))), new Set(added.slice(0, 2)));
  assert.deepEqual(projectIds(await getPage(query + '&visual=yes&type=Social+post')), [added[1]]);
  assert.deepEqual(projectIds(await getPage('?q=' + encodeURIComponent(marker + ' %_!'))), [added[0]]);
  assert.deepEqual(projectIds(await getPage('?q=' + marker + '-idea-12')), [added[12]]);
  assert.equal(projectIds(await getPage('?q=' + encodeURIComponent(`Temporary other ${suffix}`))).length, 12);
  assert.match(await getPage('?q=' + marker + '-no-match'), /No matching briefs/);
  const sketchPage = await getPage('?id=' + added[1]);
  assert.match(sketchPage, /<strong>Sketch<\/strong>/);
  const noImage = await getPage('?id=' + added[2]);
  assert.match(noImage, /No visual references were attached/);
  assert.equal((await artist.request(imageRoute + added[2])).status, 404);
  assert.deepEqual(Buffer.from(await (await artist.request(imageRoute + added[1])).arrayBuffer()), png);
  // Following a brief and returning must preserve the list position and filters.
  const selected = projectLinks(ascendingSecond)[0];
  const selectedDetail = await getPage('?' + selected.split('?')[1]);
  const backUrl = unescapeUrl(selectedDetail.match(/class="back-link" href="([^"]+)"/)[1]);
  const backParams = new URL(backUrl, base).searchParams;
  assert.equal(backParams.get('q'), marker);
  assert.equal(backParams.get('sort'), 'oldest');
  assert.equal(backParams.get('page'), '2', 'Returning from a brief must preserve the inbox page');
  assert.equal((await logoutForm(artist.csrf)).status, 303);
  assert.equal((await artist.request(route + '?id=' + submissionId)).status, 302);
  assert.equal((await artist.request(imageRoute + submissionId)).status, 401);
  console.log('PASS: artist login/logout, inbox counts/search/filter/sort/pagination, detail navigation, references/downloads, and role restrictions.');
};
