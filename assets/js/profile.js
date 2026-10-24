'use strict';

const profileTrigger = document.getElementById('profile-trigger');
const profileDialog = document.getElementById('user-profile');

if (profileTrigger && profileDialog) {
  profileTrigger.addEventListener('click', () => profileDialog.showModal());

  // Close only when both ends of the click are on the backdrop.
  let startedOnBackdrop = false;
  const isBackdrop = (event) => {
    const bounds = profileDialog.getBoundingClientRect();
    return event.target === profileDialog && (
      event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom
    );
  };
  profileDialog.addEventListener('pointerdown', (event) => {
    startedOnBackdrop = isBackdrop(event);
  });
  profileDialog.addEventListener('click', (event) => {
    if (startedOnBackdrop && isBackdrop(event)) profileDialog.close();
    startedOnBackdrop = false;
  });
  const editButton = document.getElementById('profile-edit');
  const editForm = document.getElementById('profile-edit-form');
  const readonlyFields = document.getElementById('profile-readonly');
  const cancelButton = document.getElementById('profile-cancel');
  const saveButton = document.getElementById('profile-save');
  const feedback = document.getElementById('profile-feedback');
  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const bioInput = document.getElementById('profile-bio');
  const photoInput = document.getElementById('profile-photo');
  const removePhotoButton = document.getElementById('profile-remove-photo');
  const portrait = profileDialog.querySelector('.profile-portrait');
  let savedPhotoUrl = profileDialog.dataset.photoUrl;
  let savedInitial = (Array.from(nameInput.value.trim())[0] || '').toUpperCase();
  let previewUrl = null;
  let removePhoto = false;
  let saving = false;

  function renderPhoto(container, url, initial) {
    container.textContent = '';
    if (url) {
      const image = document.createElement('img');
      image.src = url;
      image.alt = '';
      container.append(image);
    } else {
      container.textContent = initial;
    }
  }

  function resetPhotoPreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    photoInput.value = '';
    removePhoto = false;
    removePhotoButton.hidden = !savedPhotoUrl;
    renderPhoto(portrait, savedPhotoUrl, savedInitial);
  }

  photoInput.addEventListener('change', () => {
    const file = photoInput.files[0];
    if (!file) { resetPhotoPreview(); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      resetPhotoPreview();
      feedback.dataset.error = 'true';
      feedback.textContent = 'Choose a JPG, PNG, or WebP photo no larger than 2 MB.';
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    removePhoto = false;
    removePhotoButton.hidden = false;
    renderPhoto(portrait, previewUrl, savedInitial);
    feedback.textContent = '';
  });

  removePhotoButton.addEventListener('click', () => {
    resetPhotoPreview();
    removePhoto = true;
    removePhotoButton.hidden = true;
    renderPhoto(portrait, null, savedInitial);
  });

  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Unable to read this photo. Choose it again.'));
      reader.onabort = () => reject(new Error('Photo reading was interrupted. Please try again.'));
      reader.readAsDataURL(file);
    });
  }

  function setEditing(editing) {
    editForm.hidden = !editing;
    readonlyFields.hidden = editing;
    editButton.hidden = editing;
    if (editing) nameInput.focus();
  }

  function resetEditor() {
    editForm.reset();
    resetPhotoPreview();
    feedback.textContent = '';
    feedback.dataset.error = 'false';
    setEditing(false);
  }

  editButton.addEventListener('click', () => {
    feedback.textContent = '';
    setEditing(true);
  });
  cancelButton.addEventListener('click', () => {
    resetEditor();
    editButton.focus();
  });
  profileDialog.addEventListener('close', () => {
    if (!saving) resetEditor();
    profileTrigger.focus();
  });

  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !editForm.reportValidity()) return;
    saving = true;
    saveButton.textContent = 'Saving…';
    saveButton.disabled = cancelButton.disabled = true;
    nameInput.disabled = emailInput.disabled = bioInput.disabled = photoInput.disabled = removePhotoButton.disabled = true;
    editForm.setAttribute('aria-busy', 'true');
    feedback.textContent = '';

    try {
      const payload = {
        csrf: editForm.elements.csrf.value,
        name: nameInput.value,
        email: emailInput.value,
        bio: bioInput.value,
      };
      if (photoInput.files[0]) payload.photo = await readPhoto(photoInput.files[0]);
      else if (removePhoto) payload.photo = null;
      const response = await fetch(editForm.action, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'Your profile could not be saved. Please try again.');
      }

      const profile = result.profile;
      nameInput.value = nameInput.defaultValue = profile.name;
      emailInput.value = emailInput.defaultValue = profile.email;
      bioInput.value = bioInput.defaultValue = profile.bio ?? '';
      document.getElementById('profile-bio-display').textContent = profile.bio ?? '';
      savedInitial = profile.initial;
      savedPhotoUrl = profile.photoUrl || '';
      resetPhotoPreview();
      renderPhoto(profileTrigger, savedPhotoUrl, savedInitial);
      profileDialog.querySelector('.profile-identity-copy h3').textContent = profile.name;
      readonlyFields.querySelectorAll('dd')[0].textContent = profile.name;
      readonlyFields.querySelectorAll('dd')[1].textContent = profile.email;
      const welcomeName = document.querySelector('.welcome-note strong');
      if (welcomeName) welcomeName.textContent = profile.name + '.';
      setEditing(false);
      feedback.dataset.error = 'false';
      feedback.textContent = 'Your profile has been updated.';
      if (profileDialog.open) editButton.focus();
    } catch (error) {
      feedback.dataset.error = 'true';
      feedback.textContent = error instanceof SyntaxError || error instanceof TypeError
        ? 'Unable to save your profile. Check your connection and try again.'
        : error.message;
    } finally {
      saving = false;
      saveButton.textContent = 'Save changes';
      saveButton.disabled = cancelButton.disabled = false;
      nameInput.disabled = emailInput.disabled = bioInput.disabled = photoInput.disabled = removePhotoButton.disabled = false;
      editForm.removeAttribute('aria-busy');
    }
  });
}
