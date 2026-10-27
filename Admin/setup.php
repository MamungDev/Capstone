<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin.php';
header('Cache-Control: private, no-store');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
ensure_database_schema();
function setup_html(mixed $v): string { return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
$inviteToken = is_string($_GET['invite'] ?? null) ? $_GET['invite'] : '';
$error = '';
$codes = [];
$first = (int) db()->query('SELECT COUNT(*) FROM admin_accounts')->fetchColumn() === 0;
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) { header('Allow: GET, POST'); http_response_code(405); exit; }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        require_csrf($_POST['csrf'] ?? null);
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) throw new DomainException('Request too large.', 413);
        if (($_POST['action'] ?? '') === 'start') {
            unset($_SESSION['admin_enrollment']);
            if (!admin_attempt('enroll:' . ($first ? 'first' : hash('sha256', $inviteToken)))) throw new DomainException('Too many attempts. Try again in 15 minutes.', 429);
            $email = is_string($_POST['email'] ?? null) ? mb_strtolower(trim($_POST['email'])) : '';
            $name = is_string($_POST['name'] ?? null) ? trim($_POST['name']) : '';
            $password = $_POST['password'] ?? null;
            if ($first) {
                if (admin_secret() === '' || !is_string($_POST['setup_key'] ?? null) || !hash_equals(admin_secret(), $_POST['setup_key'])) throw new DomainException('The setup key is incorrect or setup is unavailable.', 403);
            } else {
                $q = db()->prepare('SELECT * FROM admin_invites WHERE token_hash = ? AND expires_at > ?');
                $q->execute([hash('sha256', $inviteToken), time()]); $invite = $q->fetch();
                if (!$invite) throw new DomainException('This invitation is invalid or expired.', 403);
                $email = $invite['email']; $name = $invite['display_name'];
            }
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 254 || $name === '' || mb_strlen($name) > 100) throw new DomainException('Enter a name and valid email.', 422);
            if (!admin_email_allowed($email)) throw new DomainException('This Gmail address is not on the site administrator allowlist.', 403);
            if (!is_string($password) || strlen($password) < 12 || strlen($password) > 4096 || $password !== ($_POST['confirmation'] ?? null)) throw new DomainException('Use at least 12 characters and matching passwords.', 422);
            admin_cipher_key();
            $_SESSION['admin_enrollment'] = ['email' => $email, 'name' => $name, 'hash' => password_hash($password, PASSWORD_DEFAULT), 'secret' => admin_totp_secret(), 'first' => $first, 'invite' => hash('sha256', $inviteToken), 'expires' => time() + 600];
        } elseif (($_POST['action'] ?? '') === 'finish') {
            $pending = $_SESSION['admin_enrollment'] ?? null;
            if (!is_array($pending) || $pending['expires'] < time()) throw new DomainException('Setup expired. Start again.', 403);
            if (!admin_attempt('enroll-code:' . $pending['email'])) throw new DomainException('Too many attempts. Try again in 15 minutes.', 429);
            $step = admin_totp_step($pending['secret'], is_string($_POST['code'] ?? null) ? trim($_POST['code']) : '');
            if ($step === null) throw new DomainException('Enter the current six-digit code from your authenticator.', 422);
            db()->beginTransaction();
            db()->query('SELECT id FROM admin_security_lock WHERE id = 1 FOR UPDATE');
            if ($pending['first']) {
                if ((int) db()->query('SELECT COUNT(*) FROM admin_accounts')->fetchColumn() !== 0) throw new DomainException('The first admin has already been created.', 409);
            } else {
                $q = db()->prepare('SELECT * FROM admin_invites WHERE token_hash = ? AND expires_at > ? FOR UPDATE');
                $q->execute([$pending['invite'], time()]); $invite = $q->fetch();
                if (!$invite || $invite['email'] !== $pending['email']) throw new DomainException('Invitation expired or was revoked.', 403);
            }
            for ($i = 0; $i < 10; $i++) $codes[] = strtoupper(bin2hex(random_bytes(8)));
            $q = db()->prepare('INSERT INTO admin_accounts (email, display_name, password_hash, totp_secret, recovery_hashes, last_step) VALUES (?, ?, ?, ?, ?, ?)' . (db_driver() === 'pgsql' ? ' RETURNING id' : ''));
            $q->execute([$pending['email'], $pending['name'], $pending['hash'], admin_encrypt($pending['secret']), json_encode(array_map(static fn ($code) => hash('sha256', $code), $codes)), $step]);
            $id = (int) (db_driver() === 'pgsql' ? $q->fetchColumn() : db()->lastInsertId());
            $admin = ['id' => $id, 'email' => $pending['email'], 'password_hash' => $pending['hash'], 'session_version' => 0];
            if (!$pending['first']) db()->prepare('DELETE FROM admin_invites WHERE token_hash = ?')->execute([$pending['invite']]);
            admin_audit('admin_enrolled', 'admin', (string) $id, [], ['email' => $pending['email']], '', $admin);
            db()->commit();
            admin_start_session($admin);
        } else throw new DomainException('Unknown action.', 422);
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        $codes = [];
        http_response_code($e instanceof DomainException ? ($e->getCode() ?: 422) : 503);
        $error = $e instanceof DomainException ? $e->getMessage() : 'Admin setup could not finish. Check configuration or try again.';
        if (!$e instanceof DomainException) error_log('Admin setup: ' . get_class($e));
    }
}
$pending = $_SESSION['admin_enrollment'] ?? null;
if (is_array($pending) && $pending['expires'] < time()) { unset($_SESSION['admin_enrollment']); $pending = null; }
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Admin setup — Mamungkun</title>
<link rel="stylesheet" href="../assets/css/admin-loading.css?v=<?= filemtime(__DIR__.'/../assets/css/admin-loading.css') ?>">
<script src="../assets/js/admin-loading.js?v=<?= filemtime(__DIR__.'/../assets/js/admin-loading.js') ?>" data-layout="setup"></script>
<link rel="stylesheet" href="../assets/css/complete-profile.css"><link rel="stylesheet" href="../assets/css/password-toggle.css"><script src="../assets/js/password-toggle.js" defer></script><link rel="stylesheet" href="../assets/css/dropdowns.css"><script src="../assets/js/dropdowns.js" defer></script></head><body><main class="profile-card">
<h1>Admin setup</h1>
<?php if ($error): ?><p class="error" role="alert"><?= setup_html($error) ?></p><?php endif; ?>
<?php if ($codes): ?>
<h2>Save your recovery codes</h2><p>Each code works once if you lose your authenticator. Store them somewhere private. They are shown only now.</p>
<ul><?php foreach ($codes as $code): ?><li><code><?= setup_html($code) ?></code></li><?php endforeach; ?></ul><a href="index.php">I saved my codes — open admin</a>
<?php elseif ($pending): ?>
<p>Add a new time-based account in your authenticator app using this setup key.</p><p><code><?= setup_html(chunk_split($pending['secret'], 4, ' ')) ?></code></p><p>Account: <?= setup_html($pending['email']) ?><br>Type: time-based, 6 digits, 30 seconds, SHA-1.</p>
<form method="post"><input type="hidden" name="csrf" value="<?= setup_html(csrf_token()) ?>"><input type="hidden" name="action" value="finish"><label for="code">Authenticator code</label><input id="code" name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="one-time-code" required><button>Verify and create admin</button></form>
<?php elseif ($first || $inviteToken !== ''): ?>
<p><?= $first ? 'Create the first named administrator using the site setup key.' : 'Create your password, then connect your authenticator.' ?></p>
<?php if (!admin_allowed_emails()): ?><p class="error">Administrator setup is closed until the site owner adds allowed Gmail addresses to ADMIN_ALLOWED_EMAILS.</p><?php else: ?>
<form method="post"><input type="hidden" name="csrf" value="<?= setup_html(csrf_token()) ?>"><input type="hidden" name="action" value="start">
<?php if ($first): ?><label for="setup-key">Site setup key</label><input id="setup-key" name="setup_key" type="password" required autocomplete="off"><label for="name">Name</label><input id="name" name="name" required maxlength="100"><label for="email">Allowed Gmail address</label><select id="email" name="email" required><option value="">Choose an approved account</option><?php foreach (admin_allowed_emails() as $allowedEmail): ?><option value="<?= setup_html($allowedEmail) ?>"><?= setup_html($allowedEmail) ?></option><?php endforeach; ?></select><?php endif; ?>
<label for="password">Admin password</label><input id="password" name="password" type="password" required minlength="12" maxlength="4096" autocomplete="new-password"><label for="confirmation">Confirm password</label><input id="confirmation" name="confirmation" type="password" required minlength="12" maxlength="4096" autocomplete="new-password"><p>Use at least 12 characters.</p><button>Set up authenticator</button></form>
<?php endif; ?>
<?php else: ?><p>Admin setup is closed. Ask an existing administrator for an invitation. The invitation only works for an allowlisted Gmail account.</p><?php endif; ?>
<p><a href="../index.php?auth=admin">Back to sign-in</a></p></main></body></html>
