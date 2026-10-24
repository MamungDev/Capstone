<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin.php';
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
header('Referrer-Policy: same-origin');

if (!admin_authorized()) {
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        http_response_code(403);
        header('Content-Type: text/html; charset=utf-8');
        exit('Your admin session expired. <a href="login.php">Sign in again</a> to manage accounts.');
    }
    header('Location: login.php', true, 302);
    exit;
}

function html(mixed $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
function text_input(array $values, string $key): string
{
    return is_string($values[$key] ?? null) ? trim($values[$key]) : '';
}
function admin_url(array $overrides = []): string
{
    global $search, $role, $page;
    return 'index.php?' . http_build_query(array_merge(['q' => $search, 'role' => $role, 'page' => $page], $overrides));
}

$search = mb_substr(text_input($_GET, 'q'), 0, 254);
$role = text_input($_GET, 'role');
if (!in_array($role, ['client', 'artist'], true)) $role = '';
$page = max(1, (int) text_input($_GET, 'page'));
$deleteId = max(0, (int) text_input($_GET, 'delete'));
$message = $_SESSION['admin_message'] ?? '';
unset($_SESSION['admin_message']);
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        if (!is_string($_POST['csrf'] ?? null) || !hash_equals(csrf_token(), $_POST['csrf'])) {
            http_response_code(403);
            throw new DomainException('Your session expired. Refresh the page and try again.');
        }
        $action = text_input($_POST, 'action');
        if ($action === 'logout') {
            unset($_SESSION['admin_until'], $_SESSION['admin_proof'], $_SESSION['csrf_token']);
            session_regenerate_id(true);
            header('Location: login.php', true, 303);
            exit;
        }
        if ($action !== 'delete') {
            http_response_code(400);
            throw new DomainException('Unknown action.');
        }
        $deleteId = max(0, (int) text_input($_POST, 'user_id'));
        admin_delete_user($deleteId, text_input($_POST, 'confirm_email'));
        $_SESSION['admin_message'] = 'Account and its submitted briefs deleted.';
        header('Location: ' . admin_url(), true, 303);
        exit;
    } catch (DomainException $exception) {
        $error = $exception->getMessage();
    } catch (Throwable $exception) {
        error_log('Admin operation failed: ' . $exception->getMessage());
        http_response_code(503);
        $error = 'We could not complete that request. Please try again.';
    }
}

$rows = [];
$counts = ['total' => 0, 'clients' => 0, 'artists' => 0];
$target = null;
$total = 0;
$pages = 1;
    try {
        $counts = db()->query("SELECT COUNT(*) AS total, COALESCE(SUM(role = 'client'), 0) AS clients, COALESCE(SUM(role = 'artist'), 0) AS artists FROM users")->fetch();
        $conditions = [];
        $params = [];
        if ($search !== '') {
            $conditions[] = '(LOCATE(?, display_name) > 0 OR LOCATE(?, email) > 0)';
            $params = [$search, $search];
        }
        if ($role !== '') { $conditions[] = 'role = ?'; $params[] = $role; }
        $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
        $query = db()->prepare('SELECT COUNT(*) FROM users' . $where);
        $query->execute($params);
        $total = (int) $query->fetchColumn();
        $pages = max(1, (int) ceil($total / 20));
        $page = min($page, $pages);
        $query = db()->prepare('SELECT id, display_name, email, role, created_at, (SELECT COUNT(*) FROM client_briefs WHERE client_id = users.id) AS briefs FROM users' . $where . ' ORDER BY created_at DESC, id DESC LIMIT 20 OFFSET ' . (($page - 1) * 20));
        $query->execute($params);
        $rows = $query->fetchAll();
        if ($deleteId) {
            $query = db()->prepare('SELECT id, display_name, email, role, (SELECT COUNT(*) FROM client_briefs WHERE client_id = users.id) AS briefs FROM users WHERE id = ?');
            $query->execute([$deleteId]);
            $target = $query->fetch() ?: null;
            if (!$target && !$error) $error = 'This account no longer exists.';
        }
    } catch (Throwable $exception) {
        error_log('Admin listing failed: ' . $exception->getMessage());
        http_response_code(503);
        $error = 'Accounts could not be loaded. Please try again.';
    }
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Manage accounts — Mamungkun</title>
  <link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;1,600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../Artist/artist.css">
  <link rel="stylesheet" href="admin.css">
  <link rel="stylesheet" href="../assets/css/dropdowns.css?v=<?= filemtime(__DIR__ . '/../assets/css/dropdowns.css') ?>">
  <script src="../assets/js/dropdowns.js?v=<?= filemtime(__DIR__ . '/../assets/js/dropdowns.js') ?>" defer></script>
</head>
<body>
<div class="shell">
  <nav aria-label="Main navigation">
    <a class="brand" href="../index.php"><span class="mark" aria-hidden="true">&#10022;</span>Mamungkun</a>
    <div class="nav"><a href="../index.php">Home</a><span class="role-pill">Admin</span>
      <form method="post" action="index.php"><input type="hidden" name="csrf" value="<?= html(csrf_token()) ?>"><input type="hidden" name="action" value="logout"><button class="plain" type="submit">Sign out of admin</button></form>
    </div>
  </nav>
  <main class="artist-main">
    <p class="eyebrow">Your creative community</p>
    <h1>People behind <em>the spark.</em></h1>
    <p class="intro">Manage the client and artist accounts in Mamungkun.</p>
    <?php if ($error): ?><p class="notice error" role="alert"><?= html($error) ?></p><?php endif; ?>
    <?php if ($message): ?><p class="notice success" role="status"><?= html($message) ?></p><?php endif; ?>

      <section class="stats" aria-label="Account totals">
        <div class="stat"><span>All accounts</span><strong><?= html($counts['total']) ?></strong><small>Your community, together.</small></div>
        <div class="stat warm"><span>Clients</span><strong><?= html($counts['clients']) ?></strong><small>Ideas looking for a home.</small></div>
        <div class="stat mint"><span>Artists</span><strong><?= html($counts['artists']) ?></strong><small>People bringing ideas to life.</small></div>
      </section>
      <?php if ($target): ?>
        <section class="admin-card confirmation" aria-labelledby="delete-title">
          <p class="eyebrow">Confirm deletion</p><h2 id="delete-title">Delete <?= html($target['display_name']) ?>?</h2>
          <p>This permanently removes the <strong><?= html($target['role']) ?></strong> account <strong><?= html($target['email']) ?></strong> and its <strong><?= html($target['briefs']) ?> submitted brief(s)</strong>, including attached images and sketches. This cannot be undone.</p>
          <form method="post" action="<?= html(admin_url()) ?>">
            <input type="hidden" name="csrf" value="<?= html(csrf_token()) ?>">
            <input type="hidden" name="action" value="delete">
            <input type="hidden" name="user_id" value="<?= html($target['id']) ?>">
            <label for="confirm-email">Type <?= html($target['email']) ?> to confirm</label>
            <input id="confirm-email" name="confirm_email" type="email" required autocomplete="off" maxlength="254">
            <div class="actions"><button class="button danger" type="submit">Permanently delete account</button><a class="small-button" href="<?= html(admin_url()) ?>">Cancel</a></div>
          </form>
        </section>
      <?php endif; ?>
      <section class="inbox" aria-labelledby="accounts-title">
        <div class="inbox-title"><div><h2 id="accounts-title">Accounts</h2><p><?= $total ?> matching account(s)</p></div><a class="small-button" href="<?= html(admin_url()) ?>">Refresh</a></div>
        <form class="filters" method="get" action="index.php">
          <label class="search"><span class="sr-only">Search by name or email</span><input type="search" name="q" placeholder="Search name or email" value="<?= html($search) ?>" maxlength="254"></label>
          <label class="select-filter">Role <select name="role"><option value="">All roles</option><option value="client" <?= $role === 'client' ? 'selected' : '' ?>>Client</option><option value="artist" <?= $role === 'artist' ? 'selected' : '' ?>>Artist</option></select></label>
          <button class="button" type="submit">Search</button>
          <?php if ($search || $role): ?><a href="index.php">Clear filters</a><?php endif; ?>
        </form>
        <div class="table-wrap">
          <table><caption class="sr-only">Registered client and artist accounts</caption><thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Briefs</th><th scope="col">Joined</th><th scope="col">Action</th></tr></thead>
          <tbody><?php foreach ($rows as $row): ?><tr>
            <td><strong><?= html($row['display_name']) ?></strong><small class="account-id">ID <?= html($row['id']) ?></small></td><td class="account-email"><?= html($row['email']) ?></td><td><span class="role-pill"><?= html($row['role']) ?></span></td><td><?= html($row['briefs']) ?></td><td><?= html(substr($row['created_at'], 0, 10)) ?></td><td><a class="delete-link" href="<?= html(admin_url(['delete' => $row['id']])) ?>" aria-label="Delete account for <?= html($row['email']) ?>">Delete</a></td>
          </tr><?php endforeach; ?>
          <?php if (!$rows): ?><tr><td colspan="6" class="empty">No accounts found. Try another name, email, or role.</td></tr><?php endif; ?></tbody></table>
        </div>
        <nav class="pagination" aria-label="Account pages"><span>Page <?= $page ?> of <?= $pages ?></span><div><?php if ($page > 1): ?><a class="small-button" href="<?= html(admin_url(['page' => $page - 1])) ?>">Previous</a><?php endif; ?> <?php if ($page < $pages): ?><a class="small-button" href="<?= html(admin_url(['page' => $page + 1])) ?>">Next</a><?php endif; ?></div></nav>
      </section>
  </main>
</div>
</body>
</html>
