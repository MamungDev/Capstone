(() => {
  const stage = document.querySelector('[data-brief-stack]');
  if (!stage) return;
  const cards = Array.from(stage.querySelectorAll('.example-brief'));
  const controls = stage.querySelector('.example-stack-controls');
  const status = stage.querySelector('.example-stack-status');
  if (cards.length < 2 || !controls || !status) return;
  let current = 0;

  function show(index) {
    current = (index + cards.length) % cards.length;
    cards.forEach((card, position) => {
      const depth = (position - current + cards.length) % cards.length;
      card.dataset.stackPosition = String(depth);
      card.inert = depth !== 0;
      if (depth === 0) card.removeAttribute('aria-hidden');
      else card.setAttribute('aria-hidden', 'true');
    });
    const title = document.createElement('span');
    title.className = 'stack-sr-only';
    title.textContent = ' ' + cards[current].dataset.briefTitle;
    status.replaceChildren(`${current + 1} / ${cards.length}`, title);
  }

  stage.querySelector('[data-stack-previous]').addEventListener('click', () => show(current - 1));
  stage.querySelector('[data-stack-next]').addEventListener('click', () => show(current + 1));
  controls.hidden = false;
})();
