(() => {
  'use strict';

  const setup = document.currentScript.dataset.layout === 'setup';
  const sections = { overview: 'overview', accounts: 'accounts', projects: 'projects', activity: 'activity', security: 'admin access' };
  let timer;
  let fallback;
  let screen;
  let savedBody;
  const block = (kind = 'line') => '<span class="admin-skeleton-block admin-skeleton-' + kind + '"></span>';
  const card = content => '<div class="admin-skeleton-card">' + content + '</div>';
  const rows = () => '<div class="admin-skeleton-rows">' + Array.from({ length: 5 }, () =>
    '<div class="admin-skeleton-row">' + block() + block() + block('short') + '</div>').join('') + '</div>';
  const fields = () => card(block('subtitle') + block() + block('field') + block('short') + block('field') + block('button'));

  function lockContent() {
    if (!screen || !document.body || savedBody) return;
    savedBody = { element: document.body, inert: document.body.inert, busy: document.body.getAttribute('aria-busy') };
    document.body.inert = true;
    document.body.setAttribute('aria-busy', 'true');
  }

  function hide() {
    clearTimeout(timer);
    clearTimeout(fallback);
    screen?.remove();
    screen = null;
    if (savedBody) {
      savedBody.element.inert = savedBody.inert;
      if (savedBody.busy === null) savedBody.element.removeAttribute('aria-busy');
      else savedBody.element.setAttribute('aria-busy', savedBody.busy);
      savedBody = null;
    }
  }

  function show(url, message) {
    hide();
    const isSetup = /\/setup\.php$/.test(url.pathname) || (setup && url.pathname === location.pathname);
    const requested = url.searchParams.get('tab');
    const section = Object.hasOwn(sections, requested) ? requested : 'overview';
    const detail = url.searchParams.has('user') || url.searchParams.has('project');
    let content;
    if (isSetup) content = fields();
    else if (section === 'overview') {
      content = '<div class="admin-skeleton-stats">' + Array.from({ length: 3 }, () => card(block('short') + block('number'))).join('') + '</div>' + card(block('subtitle') + rows());
    } else if (section === 'security') content = fields() + fields();
    else if (section === 'activity') content = card(block('field')) + Array.from({ length: 3 }, () => card(block('subtitle') + block() + block('short'))).join('');
    else content = (detail ? fields() : '') + card('<div class="admin-skeleton-filters">' + block('field') + block('field') + block('button') + '</div>') + card(rows());

    screen = document.createElement('div');
    screen.id = 'admin-loading';
    screen.className = isSetup ? 'admin-skeleton-setup' : 'admin-skeleton-dashboard';
    screen.setAttribute('role', 'status');
    screen.setAttribute('aria-live', 'polite');
    screen.setAttribute('aria-label', 'Loading administration');
    screen.innerHTML = '<div class="admin-skeleton-wrap"><div aria-hidden="true">' +
      (isSetup ? '' : '<div class="admin-skeleton-topbar"><span class="admin-skeleton-brand"><span class="admin-skeleton-mark">&#10022;</span>Mamungkun</span>' + block('button') + '</div>') +
      '<div class="admin-skeleton-heading">' + block('eyebrow') + block('title') + block() + '</div>' +
      (isSetup ? '' : '<div class="admin-skeleton-tabs">' + Array.from({ length: 5 }, () => block('tab')).join('') + '</div>') +
      content + '</div><p class="admin-skeleton-status"></p></div>';
    screen.querySelector('.admin-skeleton-status').textContent = message || (isSetup ? 'Loading admin setup…' : 'Loading ' + sections[section] + '…');
    // Keep the status outside the inert page so assistive technology can announce it.
    document.documentElement.appendChild(screen);
    lockContent();
    fallback = setTimeout(hide, 12000);
  }

  function schedule(url = new URL(location.href), message) {
    clearTimeout(timer);
    timer = setTimeout(() => show(url, message), 160);
  }

  schedule();
  document.addEventListener('DOMContentLoaded', lockContent, { once: true });
  window.addEventListener('load', hide, { once: true });
  window.addEventListener('pageshow', hide);
  window.addEventListener('pagehide', hide);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });

  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/\/Admin\/(?:index|setup)\.php$/.test(url.pathname) || (url.pathname === location.pathname && url.search === location.search)) return;
    setTimeout(() => { if (!event.defaultPrevented) schedule(url); }, 0);
  });

  document.addEventListener('submit', event => {
    const form = event.target;
    const target = event.submitter?.formTarget || form.target;
    if (event.defaultPrevented || (target && target !== '_self') || form.method === 'dialog') return;
    const url = new URL(event.submitter?.getAttribute('formaction') || form.action, location.href);
    if (url.origin !== location.origin) return;
    let message;
    if (form.method.toLowerCase() === 'get') {
      url.search = new URLSearchParams(new FormData(form)).toString();
    } else {
      message = form.elements.namedItem('action')?.value === 'logout' ? 'Signing out…' : 'Saving changes…';
    }
    // Let validation and any other submit handlers finish before covering the page.
    setTimeout(() => { if (!event.defaultPrevented) schedule(url, message); }, 0);
  });
})();
