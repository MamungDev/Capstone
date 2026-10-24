// Run with: node tests/run-sketchpad.cjs [path-to-Chromium-browser]
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const profile = mkdtempSync(join(tmpdir(), 'capstone-sketch-test-'));
try {
  const browser = process.argv[2] || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const result = spawnSync(browser, [
    '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--allow-file-access-from-files', '--dump-dom',
    '--virtual-time-budget=15000', pathToFileURL(resolve(__dirname, 'sketchpad.html')).href,
  ], { encoding: 'utf8', timeout: 30000, windowsHide: true });
  if (result.error) throw result.error;
  const output = result.stdout.match(/<pre id="results">([\s\S]*?)<\/pre>/)?.[1];
  console.log(output || result.stdout.slice(0, 2000) || result.stderr);
  if (!output?.startsWith('PASS:')) {
    console.error(result.stderr.slice(0, 1500));
    console.error('Rendered document:', result.stdout.slice(0, 2200));
    process.exitCode = 1;
  }
} finally {
  // Only the unique temporary browser profile created by this runner is removed.
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
