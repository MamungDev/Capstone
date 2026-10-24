// Keep native selects as the source of truth for existing forms and change handlers.
(() => {
  let serial = 0;
  let opened = null;
  const controls = new WeakMap();
  function enhance(select) {
    if (controls.has(select) || select.multiple || select.size > 1) return;
    const wrapper = document.createElement('span');
    wrapper.className = 'site-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'site-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    const label = Array.from(select.labels || []).map(item => Array.from(item.childNodes)
      .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim()).join(' ');
    trigger.setAttribute('aria-label', select.getAttribute('aria-label') || label || 'Choose an option');
    if (select.hasAttribute('aria-describedby')) trigger.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
    const menu = document.createElement('div');
    menu.id = `site-select-${++serial}`;
    menu.className = 'site-select-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', trigger.getAttribute('aria-label'));
    menu.hidden = true;
    trigger.setAttribute('aria-controls', menu.id);
    select.before(wrapper);
    wrapper.append(select, trigger);
    let active = -1;
    let search = '';
    let searchTime = 0;
    const options = () => Array.from(select.options);
    const enabled = index => options()[index] && !options()[index].disabled && !options()[index].hidden;
    function sync() {
      trigger.textContent = select.selectedOptions[0]?.textContent || 'Choose an option';
      trigger.disabled = select.disabled;
    }
    function highlight(index) {
      active = index;
      Array.from(menu.children).forEach((item, i) => item.classList.toggle('is-active', i === active));
      const item = menu.children[active];
      if (item) {
        trigger.setAttribute('aria-activedescendant', item.id);
        item.scrollIntoView({ block: 'nearest' });
      }
    }
    function close() {
      menu.remove();
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
      trigger.removeAttribute('aria-activedescendant');
      if (opened?.trigger === trigger) opened = null;
    }
    function choose(index) {
      if (!enabled(index)) return;
      const changed = select.selectedIndex !== index;
      select.selectedIndex = index;
      sync();
      close();
      trigger.focus();
      if (changed) {
        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    function open() {
      if (select.disabled) return;
      opened?.close();
      sync();
      menu.replaceChildren(...options().map((option, index) => {
        const item = document.createElement('div');
        item.id = `${menu.id}-${index}`;
        item.className = 'site-select-option';
        item.textContent = option.textContent;
        item.hidden = option.hidden;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === select.selectedIndex));
        item.setAttribute('aria-disabled', String(option.disabled));
        item.addEventListener('pointermove', () => { if (enabled(index)) highlight(index); });
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('click', () => choose(index));
        return item;
      }));
      document.body.append(menu);
      menu.hidden = false;
      const rect = trigger.getBoundingClientRect();
      const below = innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const upwards = below < 220 && above > below;
      const height = Math.min(300, Math.max(80, upwards ? above : below));
      const width = Math.min(Math.max(rect.width, 180), innerWidth - 24);
      menu.style.width = `${width}px`;
      menu.style.maxHeight = `${height}px`;
      menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
      menu.style.top = `${upwards ? Math.max(12, rect.top - Math.min(menu.scrollHeight, height) - 6) : rect.bottom + 6}px`;
      trigger.setAttribute('aria-expanded', 'true');
      opened = { trigger, menu, close };
      highlight(enabled(select.selectedIndex) ? select.selectedIndex : options().findIndex((_, i) => enabled(i)));
    }
    trigger.addEventListener('click', () => menu.hidden ? open() : close());
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Tab' || event.key === 'Escape') { close(); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        if (menu.hidden) { open(); return; }
        const indices = options().map((_, i) => i).filter(enabled);
        const position = indices.indexOf(active);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? indices.length - 1 :
          Math.max(0, Math.min(indices.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)));
        highlight(indices[next]);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (menu.hidden) open(); else choose(active);
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (menu.hidden) open();
        search = Date.now() - searchTime > 700 ? event.key : search + event.key;
        searchTime = Date.now();
        const match = options().findIndex((option, i) => enabled(i) && option.textContent.trim().toLowerCase().startsWith(search.toLowerCase()));
        if (match >= 0) highlight(match);
      }
    });
    select.addEventListener('change', sync);
    select.form?.addEventListener('reset', () => setTimeout(sync, 0));
    controls.set(select, { sync });
    sync();
  }
  const scan = () => {
    if (opened && !opened.trigger.isConnected) opened.close();
    document.querySelectorAll('select').forEach(select => {
      if (!controls.has(select)) enhance(select);
    });
  };
  document.addEventListener('pointerdown', event => {
    if (opened && !opened.trigger.contains(event.target) && !opened.menu.contains(event.target)) opened.close();
  });
  document.addEventListener('focusin', event => { if (opened && event.target !== opened.trigger) opened.close(); });
  window.addEventListener('resize', () => opened?.close());
  document.addEventListener('scroll', event => { if (opened && event.target !== opened.menu) opened.close(); }, true);
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
