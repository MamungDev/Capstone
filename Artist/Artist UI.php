<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
$artist = require_artist_auth();
function artist_html(mixed $value): string {
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function artist_query(string $key, string $fallback = ''): string {
    return is_string($_GET[$key] ?? null) ? trim($_GET[$key]) : $fallback;
}
function inbox_url(array $changes = []): string {
    return 'Artist%20UI.php?' . http_build_query(array_merge([
        'q' => artist_query('q'), 'type' => artist_query('type'),
        'visual' => artist_query('visual'), 'sort' => artist_query('sort', 'newest'),
    ], $changes));
}
function submitted_date(string $date): string {
    return date('M j, Y', strtotime($date));
}
$types = ['Poster', 'Social post', 'Event identity', 'Album cover', 'Presentation', 'Something else'];
$search = mb_substr(artist_query('q'), 0, 120);
$type = artist_query('type');
if (!in_array($type, $types, true)) $type = '';
$withVisual = artist_query('visual') === 'yes';
$sort = artist_query('sort') === 'oldest' ? 'oldest' : 'newest';
$page = max(1, min(100000, (int) artist_query('page', '1')));
$id = artist_query('id');
$detailRequested = array_key_exists('id', $_GET);
$brief = null;
$rows = [];
$error = '';
$total = 0;
try {
    if ($detailRequested) {
        if (preg_match('/^[a-f0-9]{32}$/D', $id)) {
            $query = db()->prepare('SELECT b.id, b.project_name, b.details_json, b.visual_mime, b.created_at, u.display_name AS client_name FROM client_briefs b JOIN users u ON u.id = b.client_id WHERE b.id = ?');
            $query->execute([$id]);
            $brief = $query->fetch() ?: null;
        }
        if (!$brief) {
            http_response_code(404);
            $error = 'This brief could not be found. Return to the inbox to see the latest submissions.';
        } else {
            $details = json_decode($brief['details_json'], true, 512, JSON_THROW_ON_ERROR);
        }
    } else {
        $stats = db()->query('SELECT COUNT(*) AS total, COALESCE(SUM(visual_mime IS NOT NULL), 0) AS visual, COUNT(DISTINCT client_id) AS clients FROM client_briefs')->fetch();
        $where = [];
        $params = [];
        if ($search !== '') {
            // Treat SQL wildcard characters as literal search text.
            $term = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search) . '%';
            $where[] = "(b.project_name LIKE ? ESCAPE '!' OR u.display_name LIKE ? ESCAPE '!' OR JSON_UNQUOTE(JSON_EXTRACT(b.details_json, '$.idea')) LIKE ? ESCAPE '!')";
            array_push($params, $term, $term, $term);
        }
        if ($type !== '') {
            $where[] = "JSON_UNQUOTE(JSON_EXTRACT(b.details_json, '$.projectType')) = ?";
            $params[] = $type;
        }
        if ($withVisual) $where[] = 'b.visual_mime IS NOT NULL';
        $from = ' FROM client_briefs b JOIN users u ON u.id = b.client_id' . ($where ? ' WHERE ' . implode(' AND ', $where) : '');
        $query = db()->prepare('SELECT COUNT(*)' . $from);
        $query->execute($params);
        $total = (int) $query->fetchColumn();
        $pages = max(1, (int) ceil($total / 12));
        $page = min($page, $pages);
        $order = $sort === 'oldest' ? 'ASC' : 'DESC';
        $query = db()->prepare('SELECT b.id, b.project_name, b.details_json, b.visual_mime, b.created_at, u.display_name AS client_name' . $from . " ORDER BY b.created_at $order, b.id $order LIMIT 12 OFFSET " . (($page - 1) * 12));
        $query->execute($params);
        $rows = $query->fetchAll();
    }
} catch (Throwable $exception) {
    error_log('Artist inbox error: ' . $exception->getMessage());
    http_response_code(503);
    $error = 'The brief inbox is temporarily unavailable. Please refresh to try again.';
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f7f8fc">
    <title>Mamungkun &mdash; artist workspace</title>
    <link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;display=swap" rel="stylesheet">
    <link rel="stylesheet" href="artist.css?v=<?= filemtime(__DIR__ . '/artist.css') ?>">
  </head>
  <body>
    <a class="skip-link" href="#artist-main">Skip to briefs</a>
    <div class="shell">
      <nav aria-label="Artist workspace navigation">
        <a class="brand" href="../index.php"><span class="mark" aria-hidden="true">&#10022;</span>Mamungkun</a>
        <div class="nav">
          <a class="builder-home" href="../index.php">Home</a>
          <a class="inbox-nav" href="Artist%20UI.php" <?= !$detailRequested ? 'aria-current="page"' : '' ?>>Brief inbox</a>
          <span class="artist-role">Artist account</span>
          <form method="post" action="../auth/logout.php">
            <input type="hidden" name="csrf" value="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
            <button class="plain" type="submit">Sign out</button>
          </form>
          <div class="avatar" aria-label="Signed-in artist" title="<?= htmlspecialchars($artist['display_name'], ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>"><?= htmlspecialchars(mb_strtoupper(mb_substr($artist['display_name'], 0, 1)), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?></div>
        </div>
      </nav>
      <main class="artist-main" id="artist-main">
      <?php if ($error): ?>
        <section class="empty-state card" role="alert"><span class="empty-symbol" aria-hidden="true">&#10023;</span><h1>Let's try again.</h1><p><?= artist_html($error) ?></p><a class="button" href="Artist%20UI.php">Return to inbox</a></section>
      <?php elseif ($brief): ?>
        <a class="back-link" href="<?= artist_html(inbox_url()) ?>">&larr; Back to the inbox</a>
        <header class="detail-heading"><div><p class="eyebrow"><?= artist_html($details['projectType'] ?: 'Creative brief') ?></p><h1><?= artist_html($brief['project_name']) ?></h1><p class="muted">Submitted <?= artist_html(submitted_date($brief['created_at'])) ?> &middot; <?= artist_html($brief['client_name']) ?></p></div><span class="status">Submitted</span></header>
        <div class="detail-grid"><div>
          <section class="card"><p class="section-label">01 / The idea</p><h2>The starting point</h2><p class="description"><?= artist_html($details['idea']) ?></p>
            <dl class="detail-fields">
            <?php foreach (['Audience' => $details['audience'], 'Goal' => $details['goal'], 'Format' => $details['format'], 'Visual style' => $details['style'], 'Colour energy' => $details['energy']] as $label => $value): ?>
              <div><dt><?= artist_html($label) ?></dt><dd><?= artist_html($value ?: 'Not specified') ?></dd></div>
            <?php endforeach; ?>
              <div><dt>Keywords</dt><dd><?php if ($details['tags']): ?><?php foreach ($details['tags'] as $tag): ?><span class="chip"><?= artist_html($tag) ?></span><?php endforeach; ?><?php else: ?>No keywords selected<?php endif; ?></dd></div>
            </dl>
          </section>
          <section class="card"><p class="section-label">02 / Visual direction</p><div class="card-heading"><h2>Reference & inspiration</h2><?php if ($brief['visual_mime']): ?><a class="small-button" href="brief-image.php?id=<?= artist_html($id) ?>&amp;download=1">Download reference &darr;</a><?php endif; ?></div>
            <div class="reference"><?php if ($brief['visual_mime']): ?><img src="brief-image.php?id=<?= artist_html($id) ?>" alt="Visual reference for <?= artist_html($brief['project_name']) ?>"><?php else: ?><p>This idea starts with words.<br>No visual reference was attached.</p><?php endif; ?></div>
            <?php if ($brief['visual_mime']): ?><p class="muted reference-name"><?= artist_html($details['referenceName'] ?: 'Client sketch') ?></p><?php endif; ?>
          </section>
        </div><aside>
          <section class="card client-card"><p class="section-label">Submitted by</p><span class="client-avatar" aria-hidden="true"><?= artist_html(mb_strtoupper(mb_substr($brief['client_name'], 0, 1))) ?></span><h2><?= artist_html($brief['client_name']) ?></h2><p class="muted">Client</p><hr><p class="section-label">Received</p><p class="muted"><?= artist_html(submitted_date($brief['created_at'])) ?></p></section>
          <section class="studio-note"><span aria-hidden="true">&#10022;</span><h2>A little context.<br>A world of possibility.</h2><p>Start with the idea, explore the direction, and let the references spark something new.</p></section>
          <p class="brief-id">Submission ID<br><?= artist_html($id) ?></p>
        </aside></div>
      <?php else: ?>
        <header class="inbox-heading"><div><p class="eyebrow">Your creative studio</p><h1>Good work starts<br>with a <em>clear brief.</em></h1><p class="intro">A home for incoming ideas. Explore your clients' briefs and find the details that bring their vision to life.</p></div><div class="welcome-note"><span class="studio-star" aria-hidden="true">&#10023;</span><p>Welcome back,<br><strong><?= artist_html($artist['display_name']) ?>.</strong></p><span class="role-pill">Artist workspace</span></div></header>
        <section class="stats" aria-label="Submission overview">
          <div class="stat"><span>All briefs</span><strong><?= (int) $stats['total'] ?></strong><small>Ideas shared with the studio</small></div>
          <div class="stat warm"><span>With visual references</span><strong><?= (int) $stats['visual'] ?></strong><small>Images and sketches to explore</small></div>
          <div class="stat mint"><span>Clients</span><strong><?= (int) $stats['clients'] ?></strong><small>People behind the ideas</small></div>
        </section>
        <section class="inbox" aria-labelledby="inbox-title">
          <div class="inbox-title"><div><h2 id="inbox-title">The brief inbox</h2><p>Every new idea has a place here.</p></div><a class="small-button" href="<?= artist_html(inbox_url(['page' => $page])) ?>">&#8635; Refresh</a></div>
          <form class="filters" method="get" action="Artist%20UI.php" role="search">
            <label class="search"><span class="sr-only">Search briefs by project, client, or idea</span><span aria-hidden="true">&#8981;</span><input type="search" name="q" maxlength="120" value="<?= artist_html($search) ?>" placeholder="Search projects, clients, or ideas"></label>
            <label class="select-filter">Type<select name="type"><option value="">All types</option><?php foreach ($types as $option): ?><option <?= $type === $option ? 'selected' : '' ?>><?= artist_html($option) ?></option><?php endforeach; ?></select></label>
            <label class="select-filter">Order<select name="sort"><option value="newest" <?= $sort === 'newest' ? 'selected' : '' ?>>Newest first</option><option value="oldest" <?= $sort === 'oldest' ? 'selected' : '' ?>>Oldest first</option></select></label>
            <label class="visual-filter"><input type="checkbox" name="visual" value="yes" <?= $withVisual ? 'checked' : '' ?>> Has reference</label>
            <button class="button" type="submit">Apply</button>
            <?php if ($search || $type || $withVisual || $sort !== 'newest'): ?><a class="clear-link" href="Artist%20UI.php">Clear filters</a><?php endif; ?>
          </form>
          <?php if (!$rows): ?>
            <div class="empty-state"><span class="empty-symbol" aria-hidden="true">&#10023;</span><h2><?= $stats['total'] ? 'No matching briefs' : 'Room for the next big idea.' ?></h2><p><?= $stats['total'] ? 'Try a different search or clear the filters to explore every brief.' : 'When a client submits a brief, it will appear here. Select Refresh to check for new arrivals.' ?></p></div>
          <?php else: ?>
            <div class="table-wrap"><table><caption class="sr-only">Submitted client briefs</caption><thead><tr><th scope="col">Project</th><th scope="col">Client</th><th scope="col">Reference</th><th scope="col">Submitted</th><th scope="col"><span class="sr-only">Open brief</span></th></tr></thead><tbody>
            <?php foreach ($rows as $row): $rowDetails = json_decode($row['details_json'], true) ?: []; $link = inbox_url(['id' => $row['id']]); ?>
              <tr><td><a class="project-link" href="<?= artist_html($link) ?>"><span class="file-icon" aria-hidden="true"><?= $row['visual_mime'] ? '&#9639;' : '&#8801;' ?></span><span><strong><?= artist_html($row['project_name']) ?></strong><small><?= artist_html($rowDetails['projectType'] ?? 'Creative brief') ?></small></span></a></td><td><span class="client-name"><?= artist_html($row['client_name']) ?></span></td><td><span class="reference-badge <?= $row['visual_mime'] ? 'attached' : '' ?>"><?= $row['visual_mime'] ? (($rowDetails['visualKind'] ?? '') === 'sketch' ? 'Sketch' : 'Image') : 'Written brief' ?></span></td><td class="date"><time datetime="<?= artist_html(substr($row['created_at'], 0, 10)) ?>"><?= artist_html(submitted_date($row['created_at'])) ?></time></td><td><a class="open-link" href="<?= artist_html($link) ?>" aria-label="Open <?= artist_html($row['project_name']) ?>">View &nearr;</a></td></tr>
            <?php endforeach; ?>
            </tbody></table></div>
            <nav class="pagination" aria-label="Brief pages"><span><?= ($page - 1) * 12 + 1 ?>&ndash;<?= min($page * 12, $total) ?> of <?= $total ?> briefs</span><div><?php if ($page > 1): ?><a class="small-button" href="<?= artist_html(inbox_url(['page' => $page - 1])) ?>">&larr; Previous</a><?php endif; ?><?php if ($page < $pages): ?><a class="small-button" href="<?= artist_html(inbox_url(['page' => $page + 1])) ?>">Next &rarr;</a><?php endif; ?></div></nav>
          <?php endif; ?>
        </section>
        <p class="footnote">Submitted briefs are shared with the artist studio. Client drafts stay in their workspace.</p>
      <?php endif; ?>
      </main>
    </div>
  </body>
</html>
