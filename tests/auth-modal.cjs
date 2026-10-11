// Run with node tests/auth-modal.cjs. Checks UI behavior without real credentials.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Element {
  constructor() {
    this.children = new Map(); this.handlers = {}; this.open = false;
    this.isConnected = true; this.classes = new Set();
    this.classList = { add: c => this.classes.add(c), remove: c => this.classes.delete(c) };
  }
  querySelector(key) {
    if (!this.children.has(key)) this.children.set(key, new Element());
    return this.children.get(key);
  }
  setAttribute() {}
  appendChild(child) { this.lastChild = child; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  showModal() { this.open = true; }
  close() { this.open = false; this.handlers.close?.(); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { left: 20, right: 100, top: 20, bottom: 100 }; }
}
async function run() {
  const document = new Element();
  document.head = new Element(); document.body = new Element();
  document.querySelectorAll = () => [];
  document.activeElement = new Element();
  let modal;
  document.createElement = tag => {
    const element = new Element();
    if (tag === 'dialog') modal = element;
    return element;
  };
  const window = { MAKERFLOW_AUTH_CONFIG: {} };
  vm.runInNewContext(fs.readFileSync('dist/auth.js', 'utf8'), {
    window, document, MutationObserver: class { observe() {} }, location: { protocol: 'file:', hash: '#home' }, URL, URLSearchParams
  });
  assert.equal(window.makerflowAuth.isSignedIn(), false);
  window.makerflowAuth.open();
  assert.equal(modal.open, true);
  assert.equal(document.body.classes.has('auth-open'), true);
  const google = modal.querySelector('.auth-google');
  assert.equal(google.focused, true);
  await google.onclick();
  assert.match(modal.querySelector('.auth-status').textContent, /Google sign-in/);
  assert.equal(window.makerflowAuth.isSignedIn(), false, 'Missing configuration must not fake login');
  modal.querySelector('.auth-close').onclick();
  assert.equal(modal.open, false);
  assert.equal(document.body.classes.has('auth-open'), false);
  assert.equal(document.activeElement.focused, true);
  window.makerflowAuth.open();
  modal.handlers.click({ target: modal, clientX: 30, clientY: 30 });
  assert.equal(modal.open, true, 'Clicking inside dialog must not dismiss');
  modal.handlers.click({ target: modal, clientX: 0, clientY: 0 });
  assert.equal(modal.open, false, 'Clicking backdrop dismisses');
  window.makerflowAuth.open();
  modal.querySelector('.auth-cancel').onclick();
  assert.equal(modal.open, false);
  console.log('Auth modal checks passed: open, focus, unconfigured state, dismissal, focus restoration.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
