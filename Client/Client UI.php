<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
$client = require_client_auth();
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="Shape your next idea into a creative brief in the Mamungkun client workspace.">
    <meta name="theme-color" content="#f7f8fc">
    <title>Mamungkun &mdash; client workspace</title>
    <link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;display=swap" rel="stylesheet">
    <link rel="stylesheet" href="client.css?v=<?= filemtime(__DIR__ . '/client.css') ?>">
    <script>window.CLIENT_SESSION = <?= json_encode([
        'csrf' => csrf_token(),
        'id' => (int) $client['id'],
    ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
    <script src="client.js?v=<?= filemtime(__DIR__ . '/client.js') ?>" defer></script>
  </head>
  <body>
    <div class="shell">
      <nav aria-label="Client workspace navigation">
        <a class="brand" href="../index.php"><span class="mark" aria-hidden="true">&#10022;</span>Mamungkun</a>
        <div class="nav">
          <a class="builder-home" href="../index.php">Home</a>
          <a class="builder-home" href="submitted.php">My briefs</a>
          <button class="plain" id="reset" type="button">Start over</button>
          <span id="saved" role="status" title="Drafts are saved only in this browser">Draft saved</span>
          <button class="plain" id="logout" type="button">Sign out</button>
          <div class="avatar" aria-label="Signed-in client" title="<?= htmlspecialchars($client['display_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"><?= htmlspecialchars(mb_strtoupper(mb_substr($client['display_name'], 0, 1)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></div>
        </div>
      </nav>
      <div class="progress" id="progress" role="group" aria-label="Creative brief steps"></div>
      <div class="labels" aria-hidden="true">
        <span>Describe</span>
        <span>Set direction</span>
        <span>Add references</span>
        <span>Review</span>
      </div>
      <main id="app" tabindex="-1">
        <noscript>
          <h1>Start with <em>the spark.</em></h1>
          <p class="intro">Enable JavaScript to use the creative brief builder.</p>
        </noscript>
      </main>
    </div>
    <div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
  </body>
</html>
