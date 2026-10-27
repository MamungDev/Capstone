document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-copy-link]');
  if (!button) return;
  const link = document.getElementById(button.dataset.copyLink);
  const status = document.getElementById('copy-status');
  if (!link) return;
  try {
    await navigator.clipboard.writeText(new URL(link.href, window.location.href).href);
    if (status) status.textContent = 'Private link copied.';
  } catch {
    if (status) status.textContent = 'Copy failed. Select and copy the private link manually.';
  }
});
