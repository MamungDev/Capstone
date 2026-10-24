<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
$client = require_client_auth();
function html(mixed $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
$id = $_GET['id'] ?? null;
$brief = null;
$rows = [];
$error = '';
$page = max(1, min(100000, (int) ($_GET['page'] ?? 1)));
try {
    require_once __DIR__ . '/../auth/brief-access.php';
    if ($id !== null) {
        if (is_string($id) && preg_match('/^[a-f0-9]{32}$/D', $id)) {
            $query = db()->prepare('SELECT id, details_json, created_at, visual_mime FROM client_briefs WHERE id = ? AND client_id = ?');
            $query->execute([$id, $client['id']]);
            $brief = $query->fetch() ?: null;
        }
        if (!$brief) {
            http_response_code(404);
            $error = 'This brief could not be found in your account.';
        } else {
            $details = json_decode($brief['details_json'], true, 512, JSON_THROW_ON_ERROR);
            $accessCode = client_brief_code($id, (int) $client['id']);
        }
    } else {
        $query = db()->prepare('SELECT id, project_name, created_at FROM client_briefs WHERE client_id = ? ORDER BY created_at DESC, id DESC LIMIT 21 OFFSET ' . (($page - 1) * 20));
        $query->execute([$client['id']]);
        $rows = $query->fetchAll();
    }
} catch (Throwable $exception) {
    error_log('Brief retrieval error: ' . $exception->getMessage());
    http_response_code(503);
    $error = 'Your saved briefs are temporarily unavailable. Please try again.';
}
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>My briefs &mdash; Mamungkun</title>
    <link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;display=swap" rel="stylesheet">
    <link rel="stylesheet" href="client.css?v=<?= filemtime(__DIR__ . '/client.css') ?>">
  <link rel="stylesheet" href="../assets/css/profile.css?v=<?= filemtime(__DIR__ . '/../assets/css/profile.css') ?>">
  <script src="../assets/js/profile.js?v=<?= filemtime(__DIR__ . '/../assets/js/profile.js') ?>" defer></script>
</head>
<body>
<div class="shell">
    <nav aria-label="Client navigation">
        <a class="brand" href="../index.php"><span class="mark" aria-hidden="true">&#10022;</span>Mamungkun</a>
        <div class="nav">
            <a class="builder-home" href="Client%20UI.php">Workspace</a>
            <a class="builder-home" href="submitted.php">My briefs</a>
            <form action="../auth/logout.php" method="post">
                <input type="hidden" name="csrf" value="<?= html(csrf_token()) ?>">
                <button class="plain" type="submit">Sign out</button>
            </form>
            <button class="avatar" id="profile-trigger" type="button" aria-label="Open your profile" aria-haspopup="dialog" aria-controls="user-profile" title="View your profile"><?php if (!empty($client['photo_mime'])): ?><img src="profile-photo.php" alt=""><?php else: ?><?= htmlspecialchars(mb_strtoupper(mb_substr($client['display_name'], 0, 1)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?><?php endif; ?></button>
        </div>
    </nav>
    <main class="saved-briefs">
    <?php if ($error): ?>
        <h1>Let's <em>try again.</em></h1>
        <p class="intro" role="alert"><?= html($error) ?></p>
        <a class="builder-home" href="submitted.php">Back to my briefs</a>
    <?php elseif ($brief): ?>
        <div class="eyebrow">Brief submitted</div>
        <h1 class="brief-title"><?= html($details['projectName']) ?></h1>
        <p class="intro">Your saved creative brief. Submitted <?= html($brief['created_at']) ?> (database time).</p>
        <section class="review">
            <div class="card">
                <div class="summary"><strong>Private project code</strong><input aria-label="Private project code" readonly value="<?= html($accessCode) ?>" onclick="this.select()"><p class="subtle">Share this code only with your chosen artist. They must enter it in their inbox to receive this brief and its references.</p></div>
                <?php foreach ([
                    'Project type' => $details['projectType'],
                    'Idea' => $details['idea'],
                    'Audience' => $details['audience'] ?: 'Not specified',
                    'Goal' => $details['goal'] ?: 'Not specified',
                    'Direction' => implode(' · ', [$details['style'], $details['energy'], $details['format']]),
                    'Keywords' => implode(', ', $details['tags']) ?: 'No keywords selected',
                ] as $label => $value): ?>
                    <div class="summary"><strong><?= html($label) ?></strong><div><?= html($value) ?></div></div>
                <?php endforeach; ?>
            </div>
            <div class="card">
                <div class="preview">
                    <?php if ($brief['visual_mime']): ?>
                        <img src="brief-image.php?id=<?= html($brief['id']) ?>" alt="Submitted visual reference">
                    <?php else: ?>
                        <div>No visual reference added.<br><span class="subtle">Your written direction will lead.</span></div>
                    <?php endif; ?>
                </div>
                <div class="summary"><strong>Visual reference</strong><div><?= html($brief['visual_mime'] ? ($details['referenceName'] ?: 'Your sketch') : 'None added') ?></div></div>
            </div>
        </section>
        <p class="subtle submission-id">Submission ID: <?= html($brief['id']) ?></p>
        <a class="builder-home" href="submitted.php">&larr; All my briefs</a>
    <?php else: ?>
        <div class="eyebrow">Your creative space</div>
        <h1>Ideas you've <em>set in motion.</em></h1>
        <p class="intro">Your submitted briefs are saved to your account. Browser drafts remain in the workspace.</p>
        <section class="brief-list" aria-label="Submitted briefs">
            <?php if (!$rows): ?>
                <div class="card"><h2>No submitted briefs here yet.</h2><p class="subtle">Finish the four steps in your workspace and select Submit brief.</p><a class="builder-home" href="Client%20UI.php">Open workspace &rarr;</a></div>
            <?php endif; ?>
            <?php foreach (array_slice($rows, 0, 20) as $row): ?>
                <a class="card brief-list-item" href="submitted.php?id=<?= html($row['id']) ?>">
                    <div><h2><?= html($row['project_name']) ?></h2><span class="subtle">Submitted <?= html($row['created_at']) ?> (database time)</span></div>
                    <span aria-hidden="true">&rarr;</span>
                </a>
            <?php endforeach; ?>
        </section>
        <div class="footer">
            <?php if ($page > 1): ?><a class="builder-home" href="?page=<?= $page - 1 ?>">&larr; Previous</a><?php endif; ?>
            <?php if (count($rows) > 20): ?><a class="builder-home" href="?page=<?= $page + 1 ?>">Next &rarr;</a><?php endif; ?>
        </div>
    <?php endif; ?>
    </main>
</div>
<?php $profileUser = $client; require __DIR__ . '/../auth/profile-panel.php'; ?>
</body>
</html>
