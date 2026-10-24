<?php
$profilePhotoUrl = !empty($profileUser['photo_mime']) ? 'profile-photo.php' : '';
$profileBio = $profileUser['bio'] ?? "A little imagination.\nA world of possibility.";
$profileRoleLabel = ucfirst($profileUser['role']);
function profile_html(mixed $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
?>
    <dialog class="profile-dialog" id="user-profile" aria-labelledby="profile-title" data-photo-url="<?= profile_html($profilePhotoUrl) ?>">
      <div class="profile-topbar">
        <div><p class="eyebrow">Your creative space</p><h2 id="profile-title">My profile</h2></div>
        <form method="dialog"><button class="profile-close" aria-label="Close profile" autofocus>&times;</button></form>
      </div>
      <div class="profile-layout">
        <section class="profile-identity" aria-label="Profile identity">
          <div class="profile-art" aria-hidden="true"><span class="profile-spark">&#10022;</span><span class="profile-portrait"><?php if ($profilePhotoUrl): ?><img src="<?= profile_html($profilePhotoUrl) ?>" alt=""><?php else: ?><?= profile_html(mb_strtoupper(mb_substr($profileUser['display_name'], 0, 1))) ?><?php endif; ?></span></div>
          <div class="profile-identity-copy"><span class="role-pill"><?= profile_html($profileRoleLabel) ?></span><h3><?= profile_html($profileUser['display_name']) ?></h3><p id="profile-bio-display"><?= profile_html($profileBio) ?></p></div>
        </section>
        <section class="profile-information" aria-labelledby="profile-details-title">
          <p class="section-label">The person behind the ideas</p>
          <div class="profile-details-heading"><h3 id="profile-details-title">Profile information</h3><button class="small-button" id="profile-edit" type="button" aria-controls="profile-edit-form">Edit</button></div>
          <dl class="profile-fields" id="profile-readonly">
            <div><dt>Display name</dt><dd><?= profile_html($profileUser['display_name']) ?></dd></div>
            <div><dt>Email address</dt><dd><?= profile_html($profileUser['email']) ?></dd></div>
            <div><dt>Account type</dt><dd><span class="profile-role-dot" aria-hidden="true"></span><?= profile_html($profileRoleLabel) ?></dd></div>
          </dl>
          <form id="profile-edit-form" class="profile-edit-form" action="profile.php" method="post" hidden>
            <input type="hidden" name="csrf" value="<?= profile_html(csrf_token()) ?>">
            <label for="profile-photo">Profile photo</label>
            <input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="profile-photo-help">
            <p id="profile-photo-help" class="profile-help">JPG, PNG, or WebP. Up to 2 MB and 16 megapixels. Your photo appears in a circle.</p>
            <button class="plain profile-remove-photo" id="profile-remove-photo" type="button" <?= !$profilePhotoUrl ? 'hidden' : '' ?>>Remove photo</button>
            <label for="profile-name">Display name</label>
            <input id="profile-name" name="name" type="text" autocomplete="nickname" maxlength="100" required value="<?= profile_html($profileUser['display_name']) ?>">
            <label for="profile-email">Email address</label>
            <input id="profile-email" name="email" type="email" autocomplete="email" maxlength="254" required aria-describedby="profile-email-help" value="<?= profile_html($profileUser['email']) ?>">
            <p id="profile-email-help" class="profile-help">Use this email the next time you sign in.</p>
            <label for="profile-bio">Bio</label>
            <textarea id="profile-bio" name="bio" rows="4" maxlength="500" aria-describedby="profile-bio-help" placeholder="Tell us a little about yourself and your creative work."><?= profile_html($profileBio) ?></textarea>
            <p id="profile-bio-help" class="profile-help">Up to 500 characters. You can leave this blank.</p>
            <div class="profile-edit-actions"><button class="button" id="profile-save" type="submit">Save changes</button><button class="small-button" id="profile-cancel" type="button">Cancel</button></div>
          </form>
          <p class="profile-feedback" id="profile-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
          <div class="profile-note"><span aria-hidden="true">&#10023;</span><p><?= profile_html($profileUser['role'] === 'artist' ? 'Your space to explore client briefs and bring new ideas to life.' : 'Your space to shape ideas and share them with the creative studio.') ?></p></div>
        </section>
      </div>
      <div class="profile-footer"><span>Mamungkun creative studio</span><form method="dialog"><button class="button" type="submit">Back to workspace &rarr;</button></form></div>
    </dialog>
