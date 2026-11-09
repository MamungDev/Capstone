<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
if (!preg_match('/^mamungkun_admin_test_[a-f0-9]{16}$/D', (string) getenv('DB_NAME')) || getenv('DB_DRIVER') !== 'mysql') {
    throw new RuntimeException('An isolated local test database is required.');
}
require __DIR__ . '/../auth/admin-manage.php';

function check(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }
function denied(Closure $call): void {
    try { $call(); } catch (DomainException $e) {
        check($e->getMessage() === 'admin-not-allowed', 'Unexpected denial: ' . $e->getMessage());
        return;
    }
    throw new RuntimeException('Unauthorized identity accepted.');
}
$identity = ['email' => 'admin@example.com', 'sub' => 'google-admin-1', 'email_verified' => true, 'name' => 'Google Admin'];
denied(static fn () => admin_google_signin(array_replace($identity, ['email' => 'outsider@gmail.com'])));
denied(static fn () => admin_google_signin(array_replace($identity, ['email_verified' => false])));

// Simulate an installed password/authenticator admin table, including a disabled admin.
db()->exec('ALTER TABLE admin_accounts DROP COLUMN google_sub, DROP COLUMN session_key, ADD COLUMN password_hash VARCHAR(255) NOT NULL, ADD COLUMN totp_secret TEXT NOT NULL, ADD COLUMN recovery_hashes TEXT NOT NULL, ADD COLUMN last_step BIGINT NOT NULL DEFAULT -1');
$q = db()->prepare('INSERT INTO admin_accounts (email, display_name, password_hash, totp_secret, recovery_hashes, active) VALUES (?, ?, ?, ?, ?, ?)');
$q->execute(['admin@example.com', 'Existing Admin', 'old-hash', 'old-secret', '[]', 1]);
$existingId = (int) db()->lastInsertId();
$q->execute(['disabled@example.com', 'Disabled Admin', 'old-hash', 'old-secret', '[]', 0]);

// A legacy session cannot authorize requests or be refreshed through a password.
$_SESSION['admin_id'] = $existingId;
$_SESSION['admin_until'] = time() + 3600;
$_SESSION['admin_proof'] = 'legacy-proof';
check(admin_current() === null, 'Legacy session survived.');
admin_google_signin($identity);
$admin = admin_current();
check($admin !== null && (int) $admin['id'] === $existingId && $admin['display_name'] === 'Existing Admin', 'Existing admin was not preserved.');
$columns = db()->query("SHOW COLUMNS FROM admin_accounts")->fetchAll(PDO::FETCH_COLUMN);
check(!array_intersect(['password_hash', 'totp_secret', 'recovery_hashes', 'last_step'], $columns), 'Legacy credentials remain.');
ensure_admin_google_schema();
check((int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn() === 22, 'Admin sign-in changed client/artist accounts.');
denied(static fn () => admin_google_signin(array_replace($identity, ['sub' => 'replacement-account'])));
denied(static fn () => admin_google_signin(array_replace($identity, ['email' => 'second@example.com'])));
denied(static fn () => admin_google_signin(array_replace($identity, ['email' => 'disabled@example.com', 'sub' => 'google-disabled'])));
check((int) db()->query("SELECT active FROM admin_accounts WHERE email = 'disabled@example.com'")->fetchColumn() === 0, 'Disabled account was reactivated.');

$_SESSION['admin_proof'] = 'tampered';
check(admin_current() === null, 'Tampered proof accepted.');
admin_google_signin($identity);
$_SESSION['admin_until'] = time() - 1;
check(admin_current() === null, 'Expired session accepted.');
admin_google_signin($identity);
db()->exec('UPDATE admin_accounts SET session_version = session_version + 1 WHERE id = ' . $existingId);
check(admin_current() === null, 'Revoked session accepted.');
admin_google_signin($identity);
db()->exec('UPDATE admin_accounts SET active = 0 WHERE id = ' . $existingId);
check(admin_current() === null, 'Disabled session accepted.');
db()->exec('UPDATE admin_accounts SET active = 1 WHERE id = ' . $existingId);
admin_logout();
check(admin_current() === null, 'Logout failed.');

$second = array_replace($identity, ['email' => 'second@example.com', 'sub' => 'google-admin-2']);
admin_google_signin($second);
$secondId = (int) admin_current()['id'];
admin_google_signin($second);
check((int) admin_current()['id'] === $secondId, 'Repeat Google sign-in duplicated the admin.');
check((int) db()->query('SELECT COUNT(*) FROM admin_accounts')->fetchColumn() === 3, 'Unexpected administrator count.');
admin_logout();
echo "PASS: legacy migration, allowlist, verified email, stable Google identity, disabled accounts, automatic provisioning, session tampering/expiry/revocation, and logout.\n";
