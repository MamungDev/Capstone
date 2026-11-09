<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
function admin_allowed_emails(): array {
    $configured = app_config()['admin_allowed_emails'] ?? [];
    if (is_string($configured)) $configured = preg_split('/[,;\s]+/', $configured, -1, PREG_SPLIT_NO_EMPTY);
    if (!is_array($configured)) return [];
    $allowed = [];
    foreach ($configured as $email) {
        if (!is_string($email)) continue;
        $email = mb_strtolower(trim($email));
        if (strlen($email) <= 254 && filter_var($email, FILTER_VALIDATE_EMAIL)) $allowed[] = $email;
    }
    return array_values(array_unique($allowed));
}
function admin_email_allowed(string $email): bool {
    $email = mb_strtolower(trim($email));
    return in_array($email, admin_allowed_emails(), true);
}
// Upgrade existing installations without changing admin IDs, status, or audit history.
function ensure_admin_google_schema(): void {
    static $checked = false;
    if ($checked) return;
    ensure_database_schema();
    $schema = db_driver() === 'pgsql' ? 'current_schema()' : 'DATABASE()';
    $columns = db()->query("SELECT column_name FROM information_schema.columns WHERE table_schema = $schema AND table_name = 'admin_accounts'")->fetchAll(PDO::FETCH_COLUMN);
    foreach (['google_sub' => 'VARCHAR(255) NULL UNIQUE', 'session_key' => "VARCHAR(64) NOT NULL DEFAULT ''"] as $column => $definition) {
        if (in_array($column, $columns, true)) continue;
        try { db()->exec("ALTER TABLE admin_accounts ADD COLUMN $column $definition"); }
        catch (PDOException $e) { if (!in_array($e->getCode(), ['42701', '42S21'], true)) throw $e; }
    }
    // Retired credentials have no sign-in or recovery path in the Google-only flow.
    foreach (['password_hash', 'totp_secret', 'recovery_hashes', 'last_step'] as $column) {
        if (!in_array($column, $columns, true)) continue;
        try { db()->exec("ALTER TABLE admin_accounts DROP COLUMN $column"); }
        catch (PDOException $e) { if ($e->getCode() !== '42703' && ($e->errorInfo[1] ?? null) !== 1091) throw $e; }
    }
    $checked = true;
}
function admin_audit(string $action, string $type, string $id, array $before = [], array $after = [], string $reason = '', ?array $actor = null): void {
    $actor ??= admin_current();
    db()->prepare('INSERT INTO admin_audit (actor_id, actor_email, action, target_type, target_id, before_json, after_json, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([
        $actor['id'] ?? null, $actor['email'] ?? 'system', $action, $type, $id,
        json_encode($before, JSON_THROW_ON_ERROR), json_encode($after, JSON_THROW_ON_ERROR), $reason,
    ]);
}
function admin_current(): ?array {
    if (($_SESSION['admin_auth_method'] ?? '') !== 'google' || !is_int($_SESSION['admin_id'] ?? null) || (int) ($_SESSION['admin_until'] ?? 0) <= time()) return null;
    ensure_admin_google_schema();
    $query = db()->prepare('SELECT * FROM admin_accounts WHERE id = ? AND active = 1');
    $query->execute([$_SESSION['admin_id']]);
    $admin = $query->fetch();
    if (!$admin || !admin_email_allowed((string) $admin['email']) || !$admin['google_sub'] || $admin['google_sub'] !== ($_SESSION['admin_google_sub'] ?? null) || $admin['session_key'] === '') return null;
    $proof = hash_hmac('sha256', session_id() . ':' . $_SESSION['admin_until'] . ':' . $admin['session_version'], $admin['session_key']);
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
    $_SESSION['admin_auth_method'] = 'google';
    $_SESSION['admin_google_sub'] = $admin['google_sub'];
    $_SESSION['admin_proof'] = hash_hmac('sha256', session_id() . ':' . $_SESSION['admin_until'] . ':' . $admin['session_version'], $admin['session_key']);
    unset($_SESSION['csrf_token'], $_SESSION['admin_enrollment']);
}
function admin_logout(): void {
    unset($_SESSION['admin_id'], $_SESSION['admin_until'], $_SESSION['admin_proof'], $_SESSION['admin_auth_method'], $_SESSION['admin_google_sub'], $_SESSION['csrf_token'], $_SESSION['admin_enrollment']);
    session_regenerate_id(true);
}
// Call only after Google's ID token signature, audience, nonce, and claims are verified.
function admin_google_signin(array $identity): void {
    $email = mb_strtolower(trim((string) ($identity['email'] ?? '')));
    $subject = $identity['sub'] ?? null;
    if (!admin_email_allowed($email) || !in_array($identity['email_verified'] ?? null, [true, 'true'], true) ||
        !is_string($subject) || $subject === '' || strlen($subject) > 255) throw new DomainException('admin-not-allowed');
    ensure_admin_google_schema();
    $pdo = db(); $pdo->beginTransaction();
    try {
        // Serialize provisioning so simultaneous callbacks cannot create duplicate admins.
        $pdo->query('SELECT id FROM admin_security_lock WHERE id = 1 FOR UPDATE');
        $q = $pdo->prepare('SELECT * FROM admin_accounts WHERE email = ? FOR UPDATE');
        $q->execute([$email]); $admin = $q->fetch();
        if ($admin && ((int) $admin['active'] !== 1 || ($admin['google_sub'] !== null && $admin['google_sub'] !== $subject))) {
            throw new DomainException('admin-not-allowed');
        }
        $q = $pdo->prepare('SELECT id FROM admin_accounts WHERE google_sub = ?');
        $q->execute([$subject]); $linked = $q->fetchColumn();
        if ($linked !== false && (!$admin || (int) $linked !== (int) $admin['id'])) throw new DomainException('admin-not-allowed');
        if (!$admin) {
            $name = is_string($identity['name'] ?? null) ? trim($identity['name']) : '';
            $name = mb_substr($name === '' ? explode('@', $email)[0] : $name, 0, 100);
            $q = $pdo->prepare('INSERT INTO admin_accounts (email, display_name, google_sub, session_key) VALUES (?, ?, ?, ?)');
            $q->execute([$email, $name, $subject, bin2hex(random_bytes(32))]);
        } elseif ($admin['google_sub'] === null) {
            $pdo->prepare('UPDATE admin_accounts SET google_sub = ?, session_key = ?, session_version = session_version + 1 WHERE id = ?')->execute([$subject, bin2hex(random_bytes(32)), $admin['id']]);
        }
        $q = $pdo->prepare('SELECT * FROM admin_accounts WHERE email = ?');
        $q->execute([$email]); $admin = $q->fetch();
        admin_audit('login_google', 'admin', (string) $admin['id'], [], [], '', $admin);
        $pdo->commit();
        admin_start_session($admin);
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
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
