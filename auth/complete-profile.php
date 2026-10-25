<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; form-action 'self'; base-uri 'self'; frame-ancestors 'none'");
header('Referrer-Policy: same-origin');

$user = current_user();
if (!$user) {
    header('Location: ../index.php', true, 302);
    exit;
}
$workspace = $user['role'] === 'artist' ? '../Artist/Artist%20UI.php' : '../Client/Client%20UI.php';
if (empty($user['onboarding_pending'])) {
    header('Location: ' . $workspace, true, 302);
    exit;
}
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}

function profile_html(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

$name = $user['display_name'];
$bio = $user['bio'] ?? '';
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = is_string($_POST['name'] ?? null) ? trim($_POST['name']) : '';
    $bio = is_string($_POST['bio'] ?? null) ? trim(str_replace(["\r\n", "\r"], "\n", $_POST['bio'])) : '';
    $password = $_POST['password'] ?? null;
    $confirmation = $_POST['password_confirmation'] ?? null;
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) {
        http_response_code(413);
        $error = 'Your profile is too large. Shorten your name or bio and try again.';
    } elseif (!is_string($_POST['csrf'] ?? null) || !hash_equals(csrf_token(), $_POST['csrf'])) {
        http_response_code(403);
        $error = 'Your session expired. Refresh the page and try again.';
    } elseif ($name === '' || mb_strlen($name) > 100 || preg_match('/[\x00-\x1F\x7F]/u', $name)) {
        $error = 'Enter a display name between 1 and 100 characters.';
    } elseif (mb_strlen($bio) > 500) {
        $error = 'Keep your bio to 500 characters or fewer.';
    } elseif (!is_string($password) || strlen($password) < 8 || strlen($password) > 4096) {
        $error = 'Choose a password of at least 8 characters.';
    } elseif (!is_string($confirmation) || !hash_equals($password, $confirmation)) {
        $error = 'Your passwords do not match.';
    } else {
        try {
            $statement = db()->prepare('UPDATE users SET display_name = ?, bio = ?, password_hash = ?, onboarding_pending = FALSE WHERE id = ? AND onboarding_pending = TRUE AND google_sub IS NOT NULL');
            $statement->execute([$name, $bio === '' ? null : $bio, password_hash($password, PASSWORD_DEFAULT), $user['id']]);
            if ($statement->rowCount() !== 1) {
                http_response_code(409);
                $error = 'Your profile has already changed. Refresh this page to continue.';
            } else {
                header('Location: ' . $workspace, true, 303);
                exit;
            }
        } catch (PDOException $exception) {
            error_log('Google profile completion failed: ' . $exception->getMessage());
            http_response_code(503);
            $error = 'Your profile could not be saved. Please try again.';
        }
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Complete your profile &mdash; Mamungkun</title>
  <link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:wght@600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../assets/css/complete-profile.css?v=<?= filemtime(__DIR__ . '/../assets/css/complete-profile.css') ?>">
</head>
<body>
  <main class="profile-card">
    <div class="brand-mark" aria-hidden="true">&#10022;</div>
    <p class="eyebrow">YOUR CREATIVE SPACE</p>
    <h1>Complete your profile.</h1>
    <p class="intro">One quick step before you enter your <?= profile_html($user['role']) ?> workspace.</p>
    <?php if ($error !== ''): ?><p class="error" role="alert"><?= profile_html($error) ?></p><?php endif; ?>
    <form method="post" action="complete-profile.php">
      <input type="hidden" name="csrf" value="<?= profile_html(csrf_token()) ?>">
      <label for="display-name">Display name</label>
      <input id="display-name" name="name" type="text" autocomplete="name" maxlength="100" required value="<?= profile_html($name) ?>">
      <p class="field-help">This is how your name appears in Mamungkun.</p>
      <label for="bio">About you <span>(optional)</span></label>
      <textarea id="bio" name="bio" rows="3" maxlength="500" placeholder="Tell us a little about yourself or your creative work."><?= profile_html($bio) ?></textarea>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" autocomplete="new-password" minlength="8" maxlength="4096" required aria-describedby="password-help">
      <p class="field-help" id="password-help">At least 8 characters. You can use this password to sign in with your email.</p>
      <label for="password-confirmation">Confirm password</label>
      <input id="password-confirmation" name="password_confirmation" type="password" autocomplete="new-password" minlength="8" maxlength="4096" required>
      <div class="account-summary"><span><?= profile_html(ucfirst($user['role'])) ?> account</span><span><?= profile_html($user['email']) ?></span></div>
      <button type="submit">Continue to workspace</button>
    </form>
    <p class="footer-note">You can sign in with Google or with your email and this password.</p>
    <form class="sign-out" method="post" action="logout.php">
      <input type="hidden" name="csrf" value="<?= profile_html(csrf_token()) ?>">
      <button type="submit">Use another account</button>
    </form>
  </main>
</body>
</html>
