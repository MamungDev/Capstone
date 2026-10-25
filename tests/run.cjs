// Run every regression suite: node tests/run.cjs
// Requires local MySQL, PHP, Node, and Edge (or CHROMIUM_BINARY).
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { once } = require('node:events');
const { readdirSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const root = path.resolve(__dirname, '..');
const php = process.env.PHP_BINARY || 'C:/xampp/php/php.exe';
const dbName = 'mamungkun_suite_test_' + randomBytes(8).toString('hex');
const env = { ...process.env, DB_DRIVER: 'mysql', DB_NAME: dbName, SESSION_DRIVER: 'mysql', SESSION_COOKIE_PATH: '/', PHP_BINARY: php };
delete env.VERCEL;
let server, created = false;
const failures = [];
function run(label, command, args, runEnv = env) {
  console.log('\n--- ' + label + ' ---');
  const result = spawnSync(command, args, { cwd: root, env: runEnv, stdio: 'inherit', windowsHide: true });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) failures.push(label);
}
function fixture(code) {
  execFileSync(php, ['-r', `
    $c = require 'auth/config.local.php';
    if (!in_array($c['db_host'], ['127.0.0.1', 'localhost'], true)) throw new RuntimeException('Local MySQL required');
    $name = getenv('DB_NAME');
    if (!preg_match('/^mamungkun_suite_test_[a-f0-9]{16}$/D', $name)) throw new RuntimeException('Unsafe database');
    $p = new PDO('mysql:host='.$c['db_host'].';port='.($c['db_port'] ?? 3306), $c['db_user'], $c['db_password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    ${code}
  `], { cwd: root, env, stdio: 'inherit', windowsHide: true });
}
function sources(dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules', 'vendor'].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(php|js|cjs)$/.test(file) ? [file] : [];
  });
}
(async () => {
  try {
    for (const file of sources()) {
      const isPhp = file.endsWith('.php');
      const result = spawnSync(isPhp ? php : process.execPath, [isPhp ? '-l' : '--check', file], { cwd: root, encoding: 'utf8', windowsHide: true });
      if (result.status !== 0) { failures.push(path.relative(root, file)); console.error(result.error || result.stdout + result.stderr); }
    }
    console.log('Syntax checks finished.');
    fixture("$p->exec('CREATE DATABASE '.$name);");
    created = true;
    fixture(`$p->exec('USE '.$name); foreach (explode(';', preg_replace('/^\\s*--[^\\r\\n]*$/m', '', file_get_contents('auth/schema.sql'))) as $sql) if (trim($sql) !== '') $p->exec($sql);`);
    const listener = net.createServer();
    listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    env.TEST_BASE_URL = `http://127.0.0.1:${port}/`;
    server = spawn(php, ['-S', `127.0.0.1:${port}`, 'api/index.php'], { cwd: root, env, stdio: 'ignore', windowsHide: true });
    await once(server, 'spawn');
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try { await fetch(env.TEST_BASE_URL + 'assets/css/landing.css'); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    if (!ready) throw new Error('PHP test server did not start');
    run('Google identity', php, ['tests/google-auth.php'], { ...env, SESSION_DRIVER: 'files' });
    run('Google HTTP flow', process.execPath, ['tests/google-flow.cjs']);
    run('Onboarding', process.execPath, ['tests/onboarding.cjs']);
    run('Admin accounts', process.execPath, ['tests/admin-accounts.cjs']);
    run('Multiple references', process.execPath, ['tests/multiple-references.cjs']);
    run('Brief submission and artist workspace', process.execPath, ['tests/brief-submission.cjs']);
    run('Brief privacy', php, ['tests/brief-privacy.php']);
    run('Project workflow', process.execPath, ['tests/workflow.cjs']);
    run('MySQL sessions', php, ['tests/mysql-session.php']);
    run('Sketchpad', process.execPath, ['tests/run-sketchpad.cjs', ...(process.env.CHROMIUM_BINARY ? [process.env.CHROMIUM_BINARY] : [])]);
  } finally {
    if (server && server.exitCode === null) { const stopped = once(server, 'exit'); server.kill(); await stopped; }
    if (created) fixture("$p->exec('DROP DATABASE '.$name);");
  }
  if (failures.length) { console.error('\nFAILED: ' + failures.join(', ')); process.exitCode = 1; }
  else console.log('\nPASS: all syntax checks and 10 regression suites. Temporary test database removed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
