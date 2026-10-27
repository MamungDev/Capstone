<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/admin.php';

$email = mb_strtolower(trim((string) ($argv[1] ?? '')));
if (!admin_email_allowed($email)) { fwrite(STDERR, "That email is not on ADMIN_ALLOWED_EMAILS.\n"); exit(2); }
if (admin_secret() === '') { fwrite(STDERR, "ADMIN_PASSWORD must be configured with at least 16 characters.\n"); exit(2); }
$prompt = fopen('php://stdin', 'r');
fwrite(STDERR, "Enter the site setup key (ADMIN_PASSWORD): ");
$provided = trim((string) fgets($prompt));
if (!hash_equals(admin_secret(), $provided)) { fwrite(STDERR, "Setup key incorrect.\n"); exit(2); }
$query = db()->prepare('SELECT id, email FROM admin_accounts WHERE email = ? AND active = 1');
$query->execute([$email]);
$admin = $query->fetch();
if (!$admin) { fwrite(STDERR, "No active administrator exists for that allowed Gmail address.\n"); exit(2); }

$secret = admin_totp_secret();
$codes = [];
for ($i = 0; $i < 10; $i++) $codes[] = strtoupper(bin2hex(random_bytes(8)));
db()->beginTransaction();
try {
    $query = db()->prepare('UPDATE admin_accounts SET totp_secret = ?, recovery_hashes = ?, last_step = -1, session_version = session_version + 1 WHERE id = ?');
    $query->execute([admin_encrypt($secret), json_encode(array_map(static fn(string $code): string => hash('sha256', $code), $codes), JSON_THROW_ON_ERROR), $admin['id']]);
    admin_audit('admin_mfa_recovered', 'admin', (string) $admin['id'], [], ['recovery_codes_issued' => count($codes)], 'Recovered by the site owner from the server command line.', ['email' => 'site owner']);
    db()->commit();
} catch (Throwable $error) {
    if (db()->inTransaction()) db()->rollBack();
    fwrite(STDERR, "Recovery failed. Check the database and encryption key configuration.\n");
    exit(1);
}
fwrite(STDOUT, "Authenticator reset for {$email}. All existing admin sessions were signed out.\n");
fwrite(STDOUT, "Add this key to a new time-based authenticator (6 digits, 30 seconds, SHA-1):\n{$secret}\n\nSave these one-time recovery codes now:\n");
foreach ($codes as $code) fwrite(STDOUT, $code . "\n");
