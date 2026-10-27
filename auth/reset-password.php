<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");

function reset_html(mixed $value): string { return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
$token = is_string($_POST['token'] ?? null) ? $_POST['token'] : (is_string($_GET['token'] ?? null) ? $_GET['token'] : '');
$validToken = preg_match('/^[a-f0-9]{64}$/D', $token) === 1;
$valid = false;
if ($validToken) {
    $query = db()->prepare('SELECT 1 FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?');
    $query->execute([hash('sha256', $token), time()]);
    $valid = (bool) $query->fetchColumn();
}
$error = '';
$done = false;
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        require_csrf($_POST['csrf'] ?? null);
        if (!$validToken) throw new DomainException('This password reset link is invalid or expired.', 404);
        $password = $_POST['password'] ?? null;
        if (!is_string($password) || strlen($password) < 8 || strlen($password) > 4096 || $password !== ($_POST['confirmation'] ?? null)) {
            throw new DomainException('Use at least 8 characters and enter the same password twice.', 422);
        }
        $pdo = db();
        $pdo->beginTransaction();
        try {
            $query = $pdo->prepare('SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ? FOR UPDATE');
            $query->execute([hash('sha256', $token), time()]);
            $userId = $query->fetchColumn();
            if (!$userId) throw new DomainException('This password reset link is invalid or expired.', 404);
            $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $userId]);
            $sql = db_driver() === 'pgsql'
                ? 'INSERT INTO account_controls (user_id, session_version) VALUES (?, 1) ON CONFLICT (user_id) DO UPDATE SET session_version = account_controls.session_version + 1'
                : 'INSERT INTO account_controls (user_id, session_version) VALUES (?, 1) ON DUPLICATE KEY UPDATE session_version = session_version + 1';
            $pdo->prepare($sql)->execute([$userId]);
            $pdo->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?')->execute([$userId]);
            $pdo->commit();
            $done = true;
        } catch (Throwable $exception) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $exception;
        }
    } catch (DomainException $exception) { $error = $exception->getMessage(); }
    catch (Throwable $exception) { error_log('Password reset failed: ' . get_class($exception)); http_response_code(503); $error = 'We could not update your password. Please try again.'; }
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET, POST'); http_response_code(405); exit;
}
if (!$valid && !$done && !$error) { http_response_code(404); $error = 'This password reset link is invalid or expired.'; }
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reset password — Mamungkun</title><link rel="stylesheet" href="../assets/css/complete-profile.css"></head><body><main class="profile-card">
<p class="eyebrow">Your creative space</p><h1>Reset your password</h1>
<?php if ($done): ?><p role="status">Your password has been updated. You can now sign in with your new password.</p><p><a href="../index.php">Return to Mamungkun</a></p>
<?php elseif ($valid): ?><?php if ($error): ?><p class="error" role="alert"><?= reset_html($error) ?></p><?php endif; ?><p>Choose a new password. This private link works once and expires after 30 minutes.</p><form method="post"><input type="hidden" name="csrf" value="<?= reset_html(csrf_token()) ?>"><input type="hidden" name="token" value="<?= reset_html($token) ?>"><label for="password">New password</label><input id="password" name="password" type="password" minlength="8" maxlength="4096" autocomplete="new-password" required><label for="confirmation">Confirm new password</label><input id="confirmation" name="confirmation" type="password" minlength="8" maxlength="4096" autocomplete="new-password" required><button type="submit">Update password</button></form>
<?php else: ?><p class="error" role="alert"><?= reset_html($error) ?></p><p><a href="../index.php">Return to Mamungkun</a></p><?php endif; ?>
</main></body></html>
