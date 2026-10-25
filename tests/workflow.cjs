// Run through tests/run.cjs: requires its isolated database and PHP server.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const base = process.env.TEST_BASE_URL;
if (!base || !/^mamungkun_suite_test_[a-f0-9]{16}$/.test(process.env.DB_NAME || '')) throw new Error('Run node tests/run.cjs for isolated workflow tests');
const id = randomBytes(16).toString('hex');
const tokens = Array.from({ length: 5 }, () => randomBytes(16).toString('hex'));
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
function fixture(code) {
  return execFileSync(php, ['-r', 'require "auth/bootstrap.php"; require "auth/workflow.php"; ' + code], { cwd: require('node:path').resolve(__dirname, '..'), encoding: 'utf8', windowsHide: true });
}
const users = JSON.parse(fixture(`
  $ids = [];
  foreach (json_decode('${JSON.stringify(tokens)}') as $index => $token) {
    $role = $index < 2 ? 'client' : 'artist';
    db()->prepare('INSERT INTO users (role, email, display_name) VALUES (?, ?, ?)')->execute([$role, $token.'@workflow.invalid', 'Workflow '.$index]);
    $uid = (int) db()->lastInsertId(); $ids[] = $uid;
    db()->prepare('INSERT INTO app_sessions VALUES (?, ?, ?)')->execute([$token, 'user_id|i:'.$uid.';csrf_token|s:32:"'.$token.'";', time()+3600]);
  }
  $details = ['projectName'=>'Workflow project','projectType'=>'Poster','idea'=>'Test idea','audience'=>'','goal'=>'','format'=>'','style'=>'','energy'=>'','tags'=>[]];
  db()->prepare('INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash) VALUES (?, ?, ?, ?, ?)')->execute(['${id}', $ids[0], 'Workflow project', json_encode($details), str_repeat('a',64)]);
  foreach ([$ids[2], $ids[3]] as $artist) db()->prepare('INSERT INTO brief_artist_access VALUES (?, ?)')->execute(['${id}', $artist]);
  echo json_encode($ids);
`));
async function request(who, route, data) {
  const response = await fetch(base + route, { redirect: 'manual', method: data ? 'POST' : 'GET',
    headers: { ...(who === null ? {} : { Cookie: 'mamungkun_session=' + tokens[who] }), ...(data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) },
    body: data ? new URLSearchParams(data) : undefined });
  return { status: response.status, text: await response.text(), location: response.headers.get('location') };
}
const update = (who, action, version, extra = {}) => request(who, 'auth/project-update.php', { csrf: tokens[who], id, action, version, ...extra });
const state = () => JSON.parse(fixture(`echo json_encode(workflow_read('${id}'));`));
(async () => {
  try {
    assert.equal(state().status, 'submitted', 'Legacy brief defaults to Submitted');
    assert.equal((await request(0, 'auth/project-update.php')).status, 405);
    assert.equal((await update(null, 'assign', 0)).status, 401);
    assert.equal((await update(0, 'assign', 0, { csrf: 'wrong' })).status, 403);
    assert.equal((await update(1, 'assign', 0, { artist_id: users[2] })).status, 404);
    assert.equal((await update(4, 'accept', 0)).status, 404);
    assert.equal((await update(2, 'assign', 0, { artist_id: users[2] })).status, 403);
    assert.equal((await update(0, 'assign', 0, { artist_id: users[4] })).status, 422);
    assert.equal((await update(0, 'assign', 0, { artist_id: users[1] })).status, 422);
    assert.equal((await update(0, 'assign', 0, { artist_id: users[2] })).status, 303);
    assert.equal((await update(3, 'accept', 1)).status, 403);
    assert.equal((await update(2, 'review', 1)).status, 409, 'Stages cannot be skipped');
    assert.equal((await update(2, 'accept', 0)).status, 409, 'Stale tab rejected');
    assert.equal((await update(2, 'accept', 1)).status, 303);
    assert.equal((await update(2, 'start', 2)).status, 303);
    assert.equal((await update(2, 'review', 3)).status, 303);
    assert.equal((await update(2, 'complete', 4)).status, 403);
    assert.match((await request(0, 'Client/submitted.php?id=' + id)).text, /Approve and complete/);
    assert.equal((await update(0, 'revise', 4)).status, 303);
    assert.equal(state().status, 'in_progress');
    // Reassignment resets progress and removes the former artist's update rights.
    assert.equal((await update(0, 'assign', 5, { artist_id: users[3] })).status, 303);
    assert.equal(state().status, 'submitted');
    assert.equal((await update(2, 'accept', 6)).status, 403);
    assert.equal((await update(3, 'accept', 6)).status, 303);
    assert.equal((await update(3, 'start', 7)).status, 303);
    assert.equal((await update(3, 'review', 8)).status, 303);
    assert.equal((await update(0, 'complete', 9)).status, 303);
    assert.equal(state().status, 'completed');
    assert.equal((await update(0, 'assign', 10, { artist_id: users[2] })).status, 409);
    assert.equal((await update(0, 'revise', 10)).status, 409);
    for (const [who, route] of [[0, 'Client/submitted.php'], [3, 'Artist/Artist%20UI.php']]) {
      assert.match((await request(who, route)).text, /Completed/);
      const detail = await request(who, route + '?id=' + id);
      assert.equal(detail.status, 200);
      assert.match(detail.text, /Workflow 3/);
      assert.doesNotMatch(detail.text, /name="action"/);
    }
    // Deleting an artist preserves the brief and allows an owner to reassign unfinished work.
    fixture(`db()->prepare("UPDATE brief_workflow SET status = 'in_progress' WHERE brief_id = ?")->execute(['${id}']); db()->prepare('DELETE FROM users WHERE id = ?')->execute([${users[3]}]);`);
    assert.equal(state().artist_id, null);
    assert.equal((await update(0, 'assign', 10, { artist_id: users[2] })).status, 303);
    assert.equal(state().status, 'submitted');
    console.log('PASS: workflow defaults, assignment, role/owner isolation, CSRF, stale forms, valid transitions, revisions, completion, dashboard labels, reassignment, and artist deletion.');
  } finally {
    fixture(`db()->prepare('DELETE FROM client_briefs WHERE id = ?')->execute(['${id}']); foreach (${JSON.stringify(users)} as $uid) db()->prepare('DELETE FROM users WHERE id = ?')->execute([$uid]); foreach (json_decode('${JSON.stringify(tokens)}') as $token) db()->prepare('DELETE FROM app_sessions WHERE session_id = ?')->execute([$token]);`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
