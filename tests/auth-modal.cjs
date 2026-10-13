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
  querySelectorAll(key) {
    if (key === '[data-auth-role]') return ['artist','client'].map(role => {
      const element = this.querySelector(`[data-auth-role="${role}"]`);
      element.dataset = {authRole:role}; return element;
    });
    return [];
  }
  setAttribute() {}
  appendChild(child) { this.lastChild = child; }
  addEventListener(type, fn) { this.handlers[type] = fn; }
  showModal() { this.open = true; }
  close() { this.open = false; this.handlers.close?.(); }
  focus() { this.focused = true; }
  getBoundingClientRect() { return { left: 20, right: 100, top: 20, bottom: 100 }; }
  reportValidity() { return true; }
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
  const window = { MAKERFLOW_AUTH_CONFIG: {}, dispatchEvent() {} };
  vm.runInNewContext(fs.readFileSync('dist/auth.js', 'utf8'), {
    window, document, CustomEvent: class {}, MutationObserver: class { observe() {} }, location: { protocol: 'file:', hash: '#home' }, URL, URLSearchParams
  });
  assert.equal(window.makerflowAuth.isSignedIn(), false);
  window.makerflowAuth.open();
  assert.equal(modal.open, true);
  assert.equal(document.body.classes.has('auth-open'), true);
  const email = modal.querySelector('#authEmail');
  assert.equal(modal.querySelector('[data-auth-role="artist"]').focused, true);
  modal.querySelector('[data-auth-role="artist"]').onclick();
  assert.equal(modal.querySelector('.auth-methods').hidden, false);
  assert.equal(email.focused, true);
  await modal.querySelector('#authEmailForm').onsubmit({preventDefault(){}});
  assert.match(modal.querySelector('.auth-status').textContent, /Sign-in is not connected/);
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
