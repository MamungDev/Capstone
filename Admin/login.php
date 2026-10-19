<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin.php';
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
header('Referrer-Policy: same-origin');

if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}
if (admin_authorized()) {
    header('Location: index.php', true, 303);
    exit;
}
$status = admin_password_status();
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!is_string($_POST['csrf'] ?? null) || !hash_equals(csrf_token(), $_POST['csrf'])) {
            http_response_code(403);
            throw new DomainException('Your session expired. Refresh this page and try again.');
        }
        $result = admin_signin(is_string($_POST['password'] ?? null) ? $_POST['password'] : '');
        if ($result !== 'ok') {
            http_response_code($result === 'limited' ? 429 : 403);
            throw new DomainException(match ($result) {
                'disabled' => 'Admin sign-in is unavailable until the site owner completes setup below.',
                'limited' => 'Too many sign-in attempts. Please try again in 15 minutes.',
                default => 'The admin password is incorrect. Please try again.',
            });
        }
        header('Location: index.php', true, 303);
        exit;
    } catch (DomainException $exception) {
        $error = $exception->getMessage();
    } catch (Throwable $exception) {
        error_log('Admin sign-in failed: ' . $exception->getMessage());
        http_response_code(503);
        $error = 'We could not sign you in. Please try again shortly.';
    }
}
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Admin sign in &mdash; Mamungkun</title>
  <link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;1,600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../Artist/artist.css">
  <link rel="stylesheet" href="admin.css?v=<?= filemtime(__DIR__ . '/admin.css') ?>">
</head>
<body class="admin-signin-page">
  <div class="shell">
    <nav aria-label="Main navigation">
      <a class="brand" href="../index.php"><span class="mark" aria-hidden="true">&#10022;</span>Mamungkun</a>
      <a class="small-button" href="../index.php">Back to home</a>
    </nav>
    <main class="signin-main">
      <section class="admin-card signin-card" aria-labelledby="signin-title">
        <div class="signin-heading">
          <span class="signin-mark" aria-hidden="true">&#10022;</span>
          <p class="eyebrow">Mamungkun administration</p>
          <h1 id="signin-title">Welcome <em>back.</em></h1>
          <p>Sign in to look after your creative community.</p>
        </div>
        <?php if ($error): ?><p class="notice error" role="alert"><?= htmlspecialchars($error, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></p><?php endif; ?>
        <form method="post" action="login.php">
          <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
          <label for="admin-password">Admin password</label>
          <input id="admin-password" type="password" name="password" autocomplete="current-password" required maxlength="4096" placeholder="Enter your admin password" aria-describedby="signin-help">
          <p id="signin-help" class="signin-help">Use the separate password set by the site owner.</p>
          <button class="button signin-submit" type="submit" <?= $status !== 'ready' ? 'disabled aria-describedby="setup-message"' : '' ?>>Sign in to admin</button>
        </form>
        <?php if ($status !== 'ready'): ?>
          <aside class="setup-notice" id="setup-message">
            <strong>Owner setup needed</strong>
            <?php if ($status === 'short'): ?>
              <p>The saved admin password is shorter than 16 characters. Set a longer <code>ADMIN_PASSWORD</code> in Vercel and redeploy to enable sign-in.</p>
            <?php else: ?>
              <p>This deployment has no <code>ADMIN_PASSWORD</code>. Save a password of at least 16 characters for Production in Vercel, then redeploy.</p>
            <?php endif; ?>
          </aside>
        <?php endif; ?>
        <p class="signin-footer">Account management for authorized administrators.</p>
      </section>
    </main>
  </div>
</body>
</html>
