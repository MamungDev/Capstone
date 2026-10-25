<?php
declare(strict_types=1);
require_once __DIR__ . '/auth/admin.php';
require_once __DIR__ . '/auth/google.php';
$googleEnabled = google_configured(app_config());
$signedInUser = current_user();
$adminStatus = admin_password_status();
$adminError = $_SESSION['admin_login_error'] ?? '';
unset($_SESSION['admin_login_error']);
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Turn your next idea into a clear creative brief with Mamungkun. Find the words, set the mood, and bring your references together.">
    <meta name="theme-color" content="#f7f8fc">
    <title>Mamungkun &mdash; a place for your next idea</title>
    <link rel="icon" href="assets/mamungkun-icon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/landing.css">
    <link rel="stylesheet" href="assets/css/auth.css?v=<?= filemtime(__DIR__ . '/assets/css/auth.css') ?>">
    <script>window.MAMUNGKUN_AUTH = <?= json_encode([
        'csrf' => csrf_token(),
        'user' => $signedInUser,
    ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_INVALID_UTF8_SUBSTITUTE) ?>;</script>
    <script src="assets/js/landing.js?v=<?= filemtime(__DIR__ . '/assets/js/landing.js') ?>" defer></script>
    <script src="assets/js/admin-modal.js" defer></script>
  </head>
  <body id="home">
    <div id="landing">
      <header class="home-nav">
        <a class="home-brand" href="#home"><span aria-hidden="true">&#10022;</span>Mamungkun</a>
        <nav aria-label="Main navigation">
          <a href="?auth=admin" data-admin-open aria-haspopup="dialog" aria-controls="admin-modal">Admin</a>
          <a class="home-how-link" href="#how-it-works">How it works</a>
          <a class="home-button compact" href="#auth-modal" data-auth-open aria-haspopup="dialog" aria-controls="auth-modal">Open workspace</a>
        </nav>
      </header>
      <main class="home-main">
        <section class="home-hero">
          <div class="hero-copy">
            <p class="home-kicker">A little structure. A lot of possibility.</p>
            <h1>Big ideas start<br>with a <em>little spark.</em></h1>
            <p class="home-description">Turn the idea in your head into a clear creative brief. Find the words, set the mood, and bring your references together.</p>
            <div class="hero-actions">
              <a class="home-button" href="#auth-modal" data-auth-open aria-haspopup="dialog" aria-controls="auth-modal">Shape your idea</a>
              <a class="home-secondary" href="#how-it-works">See how it works</a>
            </div>
            <p class="home-caption">Sign in to shape your idea. Your draft stays in this browser.</p>
          </div>
          <div class="brief-stage" aria-label="Example creative brief">
            <div class="example-tag">
              A spark, made concrete
            </div>
            <article class="example-brief">
              <div class="example-top">
                <span>CREATIVE BRIEF / EXAMPLE</span>
                <span>01</span>
              </div>
              <h2>Midnight<br>Sessions.</h2>
              <p>A poster series for a small,<br>late-night jazz room.</p>
              <div class="example-rule">
              </div>
              <dl>
                <div>
                  <dt>The audience</dt>
                  <dd>Curious night owls &amp; music lovers</dd>
                </div>
                <div>
                  <dt>The feeling</dt>
                  <dd>Warm. Intimate. A little unexpected.</dd>
                </div>
              </dl>
              <div class="example-colours" aria-label="Navy, coral, yellow and mint palette">
                <i></i><i></i><i></i><i></i>
              </div>
              <div class="example-bottom">
                <span>Poster · 4:5</span>
                <span>Hand-crafted</span>
              </div>
            </article>
            <div class="example-note">
              <span aria-hidden="true">&#10022;</span>
              <div>
                It doesn't have to be perfect.<br>It just has to begin.
              </div>
            </div>
          </div>
        </section>
        <section class="home-process" id="how-it-works">
          <div class="process-heading">
            <div>
              <p class="home-kicker">From a thought to a direction</p>
              <h2>Four steps.<br><em>One clearer idea.</em></h2>
            </div>
            <p>You bring the starting point. Mamungkun helps you ask the right questions and put the pieces in place.</p>
          </div>
          <div class="process-steps">
            <article>
              <span>01 / DESCRIBE</span>
              <h3>Find the words.</h3>
              <p>What are you making? Who is it for? Start with a few questions about your idea and its purpose.</p>
            </article>
            <article>
              <span>02 / SET DIRECTION</span>
              <h3>Give it a feeling.</h3>
              <p>Choose a format, a visual style, and the keywords that capture the mood you have in mind.</p>
            </article>
            <article>
              <span>03 / ADD REFERENCES</span>
              <h3>Show what you mean.</h3>
              <p>Upload an image or draw a quick sketch. A rough starting point can say more than a perfect sentence.</p>
            </article>
            <article>
              <span>04 / REVIEW</span>
              <h3>Bring it together.</h3>
              <p>See your description, direction, and reference in one brief. Return to any step to refine the details.</p>
            </article>
          </div>
        </section>
        <section class="home-end">
          <span class="end-star" aria-hidden="true">✦</span>
          <h2>That idea you've been sitting on?<br><em>Give it somewhere to start.</em></h2>
          <a class="home-button" href="#auth-modal" data-auth-open aria-haspopup="dialog" aria-controls="auth-modal">Open your creative workspace</a>
        </section>
      </main>
      <footer class="home-footer">
        <a class="home-brand" href="#home">Mamungkun</a>
        <p>A space for the first draft.</p>
        <a href="#auth-modal" data-auth-open aria-haspopup="dialog" aria-controls="auth-modal">Open workspace</a>
      </footer>
    </div>
    <dialog id="auth-modal" class="auth-modal" aria-labelledby="auth-title" aria-describedby="auth-description">
      <div class="auth-content">
        <button class="auth-close" type="button" aria-label="Close sign-in dialog">&times;</button>
        <div class="auth-brand" aria-hidden="true">
          &#10022;
        </div>
        <p class="auth-eyebrow">YOUR CREATIVE SPACE</p>
        <h2 id="auth-title">A little spark.<br>A place to begin.</h2>
        <p id="auth-description">How would you like to join Mamungkun?</p>
        <div class="auth-roles" aria-label="Choose your workspace">
          <button class="auth-role" type="button" data-auth-role="artist"><span class="auth-role-symbol" aria-hidden="true">✧</span><strong>Artist</strong><span>Bring ideas to life.</span><span class="auth-role-arrow" aria-hidden="true">→</span></button>
          <button class="auth-role" type="button" data-auth-role="client"><span class="auth-role-symbol" aria-hidden="true">✦</span><strong>Client</strong><span>Find a home for your idea.</span><span class="auth-role-arrow" aria-hidden="true">→</span></button>
        </div>
        <div class="auth-methods" hidden>
          <button class="auth-back" type="button">← Choose Artist or Client</button>
          <?php if ($googleEnabled): ?>
          <a class="auth-google" href="auth/google-start.php?role=client" hidden>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.16v5.12h6.6c3.86-3.55 6.09-8.78 6.09-14.78z"/>
              <path fill="#34A853" d="M24 44c5.51 0 10.13-1.83 13.51-4.95l-6.6-5.12c-1.83 1.23-4.17 1.98-6.91 1.98-5.31 0-9.82-3.58-11.43-8.4H5.76v5.28A20 20 0 0 0 24 44z"/>
              <path fill="#FBBC05" d="M12.57 27.51a12 12 0 0 1 0-7.02v-5.28H5.76a20 20 0 0 0 0 17.58l6.81-5.28z"/>
              <path fill="#EA4335" d="M24 12.09c3 0 5.68 1.03 7.8 3.05l5.85-5.85C34.1 5.98 29.51 4 24 4A20 20 0 0 0 5.76 15.21l6.81 5.28c1.61-4.82 6.12-8.4 11.43-8.4z"/>
            </svg>
            <span>Continue with Google</span>
          </a>
          <?php endif; ?>
          <form id="authEmailForm" class="auth-email-form" method="dialog">
            <div id="authNameField" class="auth-field" hidden>
              <label for="authName">Your name</label>
              <input id="authName" name="name" autocomplete="name" maxlength="100">
            </div>
            <div id="authEmailField" class="auth-field">
              <label for="authEmail">Email address</label>
              <input id="authEmail" name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com">
            </div>
            <div id="authPasswordField" class="auth-field">
              <label for="authPassword">Password</label>
              <input id="authPassword" name="password" type="password" autocomplete="current-password" required><small id="authPasswordHint" hidden>Use at least 8 characters.</small>
            </div>
            <div id="authConfirmField" class="auth-field" hidden>
              <label for="authConfirm">Confirm password</label>
              <input id="authConfirm" name="confirm" type="password" autocomplete="new-password">
            </div>
            <button class="auth-forgot" type="button">Forgot password?</button>
            <button class="auth-submit" type="submit">Sign in</button>
          </form>
          <div class="auth-divider">
            <span>New here?</span>
          </div>
          <button class="auth-create" type="button">Create an account</button>
        </div>
        <p class="auth-status" role="status" aria-live="polite" hidden></p>
        <p class="auth-note">A space for your ideas and the people who bring them to life.</p>
        <button class="auth-cancel" type="button">Back to exploring</button>
      </div>
    </dialog>
    <dialog id="admin-modal" class="auth-modal" aria-labelledby="admin-title" aria-describedby="admin-description" data-authenticated="<?= admin_authorized() ? 'true' : 'false' ?>">
      <div class="auth-content">
        <button class="auth-close" type="button" aria-label="Close admin sign-in dialog">&times;</button>
        <div class="auth-brand" aria-hidden="true">&#10022;</div>
        <p class="auth-eyebrow">MAMUNGKUN ADMINISTRATION</p>
        <h2 id="admin-title">Welcome back.<br>A space to care.</h2>
        <p id="admin-description">Sign in to look after your creative community.</p>
        <form id="admin-form" class="auth-email-form" method="post" action="Admin/login.php">
          <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
          <div class="auth-field">
            <label for="admin-password">Admin password</label>
            <input id="admin-password" name="password" type="password" autocomplete="current-password" required maxlength="4096" placeholder="Enter your admin password">
          </div>
          <button class="auth-submit" type="submit" <?= $adminStatus !== 'ready' ? 'disabled' : '' ?>>Sign in to admin</button>
        </form>
        <p class="auth-status" role="status" aria-live="polite" <?= $adminError === '' ? 'hidden' : '' ?>><?= htmlspecialchars((string) $adminError, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></p>
        <?php if ($adminStatus !== 'ready'): ?>
          <p class="auth-status"><?php if ($adminStatus === 'short'): ?>The saved admin password is shorter than 16 characters. Set a longer ADMIN_PASSWORD in Vercel and redeploy.<?php else: ?>This deployment has no ADMIN_PASSWORD. Save a password of at least 16 characters for Production in Vercel, then redeploy.<?php endif; ?></p>
        <?php endif; ?>
        <p class="auth-note">Account management for authorized administrators.</p>
        <button class="auth-cancel" type="button">Back to exploring</button>
      </div>
    </dialog>
  </body>
</html>
