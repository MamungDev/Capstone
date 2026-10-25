<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/admin-mfa.php';

function admin_password_status(): string {
    $secret = (string) (app_config()['admin_password'] ?? '');
    return $secret === '' ? 'missing' : (strlen($secret) < 16 ? 'short' : 'ready');
}
function admin_secret(): string {
    return admin_password_status() === 'ready' ? (string) app_config()['admin_password'] : '';
}
function admin_audit(string $action, string $type, string $id, array $before = [], array $after = [], string $reason = '', ?array $actor = null): void {
    $actor ??= admin_current();
    db()->prepare('INSERT INTO admin_audit (actor_id, actor_email, action, target_type, target_id, before_json, after_json, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
        $actor['id'] ?? null, $actor['email'] ?? 'system', $action, $type, $id,
        json_encode($before, JSON_THROW_ON_ERROR), json_encode($after, JSON_THROW_ON_ERROR), $reason,
    ]);
}
function admin_current(): ?array {
    if (!is_int($_SESSION['admin_id'] ?? null) || (int) ($_SESSION['admin_until'] ?? 0) <= time()) return null;
    ensure_database_schema();
    $query = db()->prepare('SELECT * FROM admin_accounts WHERE id = ? AND active = 1');
    $query->execute([$_SESSION['admin_id']]);
    $admin = $query->fetch();
    if (!$admin) return null;
    $proof = hash_hmac('sha256', session_id() . ':' . $_SESSION['admin_until'] . ':' . $admin['session_version'], $admin['password_hash']);
    return hash_equals($proof, (string) ($_SESSION['admin_proof'] ?? '')) ? $admin : null;
}
function admin_authorized(): bool { return admin_current() !== null; }
function admin_require(): array {
    $admin = admin_current();
    if (!$admin) {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') json_response(['error' => 'Your admin session expired. Sign in again.'], 403);
        header('Location: login.php', true, 302); exit;
    }
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: frame-ancestors 'none'; form-action 'self'; base-uri 'self'");
    header('Referrer-Policy: no-referrer');
    return $admin;
}
function admin_start_session(array $admin): void {
    session_regenerate_id(true);
    $_SESSION['admin_id'] = (int) $admin['id'];
    $_SESSION['admin_until'] = time() + 3600;
    $_SESSION['admin_proof'] = hash_hmac('sha256', session_id() . ':' . $_SESSION['admin_until'] . ':' . $admin['session_version'], $admin['password_hash']);
    unset($_SESSION['csrf_token'], $_SESSION['admin_enrollment']);
}
function admin_logout(): void {
    unset($_SESSION['admin_id'], $_SESSION['admin_until'], $_SESSION['admin_proof'], $_SESSION['csrf_token'], $_SESSION['admin_enrollment']);
    session_regenerate_id(true);
}
function admin_attempt(string $scope): bool {
    ensure_database_schema();
    $bucket = hash('sha256', 'admin-v2:' . $scope);
    $now = time();
    $sql = db_driver() === 'pgsql'
        ? 'INSERT INTO admin_login_limits (bucket, attempts, window_end) VALUES (?, 1, ?) ON CONFLICT (bucket) DO UPDATE SET attempts = CASE WHEN admin_login_limits.window_end <= ? THEN 1 ELSE admin_login_limits.attempts + 1 END, window_end = CASE WHEN admin_login_limits.window_end <= ? THEN EXCLUDED.window_end ELSE admin_login_limits.window_end END'
        : 'INSERT INTO admin_login_limits (bucket, attempts, window_end) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE attempts = IF(window_end <= ?, 1, attempts + 1), window_end = IF(window_end <= ?, VALUES(window_end), window_end)';
    db()->prepare($sql)->execute([$bucket, $now + 900, $now, $now]);
    $q = db()->prepare('SELECT attempts FROM admin_login_limits WHERE bucket = ?'); $q->execute([$bucket]);
    return (int) $q->fetchColumn() <= 10;
}
function admin_clear_attempts(string $scope): void {
    db()->prepare('DELETE FROM admin_login_limits WHERE bucket = ?')->execute([hash('sha256', 'admin-v2:' . $scope)]);
}
function admin_signin(string $email, string $password, string $code): string {
    $email = mb_strtolower(trim($email));
    if (!admin_attempt('login:' . $email)) return 'limited';
    $pdo = db(); $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM admin_accounts WHERE email = ? FOR UPDATE'); $q->execute([$email]); $admin = $q->fetch();
        $valid = $admin && (int) $admin['active'] === 1 && strlen($password) <= 4096 && password_verify($password, $admin['password_hash']);
        $step = null; $recovery = null;
        if ($valid) {
            $hashes = json_decode($admin['recovery_hashes'], true, 512, JSON_THROW_ON_ERROR);
            $index = array_search(hash('sha256', strtoupper(trim($code))), $hashes, true);
            if ($index !== false) { unset($hashes[$index]); $recovery = array_values($hashes); }
            else $step = admin_totp_step(admin_decrypt($admin['totp_secret']), trim($code), (int) $admin['last_step']);
            $valid = $step !== null || $recovery !== null;
        }
        if (!$valid) {
            admin_audit('login_failed', 'admin', '', [], [], '', ['email' => mb_substr($email, 0, 254)]);
            $pdo->commit(); return 'invalid';
        }
        if ($step !== null) $pdo->prepare('UPDATE admin_accounts SET last_step = ? WHERE id = ?')->execute([$step, $admin['id']]);
        else $pdo->prepare('UPDATE admin_accounts SET recovery_hashes = ? WHERE id = ?')->execute([json_encode($recovery), $admin['id']]);
        admin_audit($recovery !== null ? 'login_recovery' : 'login', 'admin', (string) $admin['id'], [], [], '', $admin);
        $pdo->commit();
        admin_clear_attempts('login:' . $email);
        admin_start_session($admin);
        return 'ok';
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
function admin_reauthenticate(array $admin, string $password): void {
    if (!admin_attempt('reauth:' . $admin['id'])) throw new DomainException('Too many attempts. Try again in 15 minutes.', 429);
    if (strlen($password) > 4096 || !password_verify($password, $admin['password_hash'])) throw new DomainException('Enter your current admin password to confirm.', 403);
    admin_clear_attempts('reauth:' . $admin['id']);
}
function admin_reason(mixed $value): string {
    if (!is_string($value) || mb_strlen(trim($value)) < 5 || mb_strlen(trim($value)) > 500) throw new DomainException('Enter a reason between 5 and 500 characters.', 422);
    return trim($value);
}
function admin_control_row(int $id): void {
    $sql = db_driver() === 'pgsql' ? 'INSERT INTO account_controls (user_id) VALUES (?) ON CONFLICT DO NOTHING' : 'INSERT IGNORE INTO account_controls (user_id) VALUES (?)';
    db()->prepare($sql)->execute([$id]);
}
function admin_delete_user(int $id, string $confirmation, string $reason = ''): void {
    $admin = admin_current();
    if (!$admin) throw new DomainException('Your admin session expired.', 403);
    $pdo = db(); $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT id, email, display_name, role FROM users WHERE id = ? FOR UPDATE'); $q->execute([$id]); $user = $q->fetch();
        if (!$user) throw new DomainException('Account not found.', 404);
        if (!hash_equals($user['email'], $confirmation)) throw new DomainException('Enter the account email exactly to confirm.', 422);
        $pdo->prepare('DELETE FROM client_briefs WHERE client_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        admin_audit('account_deleted', 'user', (string) $id, $user, [], $reason, $admin);
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
