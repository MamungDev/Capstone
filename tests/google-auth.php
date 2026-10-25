<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../auth/google.php';

function check(bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
}
function rejects(Closure $call, ?string $message = null): void {
    try { $call(); } catch (RuntimeException | DomainException $error) {
        if ($message !== null) check($error->getMessage() === $message, 'Unexpected rejection.');
        return;
    }
    throw new RuntimeException('Unsafe input was accepted.');
}
function b64url(string $value): string { return rtrim(strtr(base64_encode($value), '+/', '-_'), '='); }
$options = ['private_key_bits' => 2048];
if (is_file('C:/xampp/apache/conf/openssl.cnf')) $options['config'] = 'C:/xampp/apache/conf/openssl.cnf';
$key = openssl_pkey_new($options);
if ($key === false) throw new RuntimeException('Unable to generate test signing key.');
$keys = ['test-key' => openssl_pkey_get_details($key)['key']];
$nonce = bin2hex(random_bytes(32));
$claims = ['iss' => 'https://accounts.google.com', 'aud' => 'test-client', 'sub' => '123456',
    'iat' => time(), 'exp' => time() + 120, 'nonce' => $nonce, 'email' => 'example@gmail.com', 'email_verified' => true];
$sign = static function (array $payload, array $header = ['alg' => 'RS256', 'kid' => 'test-key']) use ($key): string {
    $data = b64url(json_encode($header)) . '.' . b64url(json_encode($payload));
    openssl_sign($data, $signature, $key, OPENSSL_ALGO_SHA256);
    return $data . '.' . b64url($signature);
};
$verify = static fn ($jwt) => verified_google_identity($jwt, 'test-client', $nonce, $keys);
check($verify($sign($claims))['sub'] === '123456', 'Valid identity rejected.');
foreach ([['iss' => 'https://attacker.invalid'], ['aud' => 'other-client'], ['azp' => 'other-client'],
    ['nonce' => 'wrong'], ['exp' => time() - 1], ['iat' => time() + 3600], ['email_verified' => false],
    ['sub' => ''], ['email' => 'invalid']] as $invalid) {
    rejects(static fn () => $verify($sign(array_replace($claims, $invalid))));
}
rejects(static fn () => $verify($sign($claims, ['alg' => 'none', 'kid' => 'test-key'])));
rejects(static fn () => $verify($sign($claims, ['alg' => 'RS256', 'kid' => 'unknown'])));
$parts = explode('.', $sign($claims));
$parts[1] = b64url(json_encode(array_replace($claims, ['sub' => 'tampered'])));
rejects(static fn () => $verify(implode('.', $parts)));
rejects(static fn () => $verify('invalid.token'));

$pending = ['state' => bin2hex(random_bytes(32)), 'nonce' => $nonce, 'code_verifier' => bin2hex(random_bytes(32)), 'created_at' => time(), 'role' => 'artist'];
check(google_pending_valid($pending, $pending['state']), 'Valid pending login rejected.');
check(!google_pending_valid($pending, 'wrong'), 'Wrong state accepted.');
check(!google_pending_valid($pending, []), 'Array state accepted.');
check(!google_pending_valid(null, $pending['state']), 'Missing session accepted.');
foreach ([['created_at' => time() - 601], ['created_at' => time() + 3600], ['role' => 'admin'], ['code_verifier' => '']] as $invalid) {
    check(!google_pending_valid(array_replace($pending, $invalid), $pending['state']), 'Invalid pending login accepted.');
}
$config = ['google_client_id' => 'test-client', 'google_client_secret' => 'test-secret', 'google_redirect_uri' => 'https://example.com/auth/google-callback.php'];
check(google_configured($config), 'Valid config rejected.');
check(!google_configured(array_replace($config, ['google_client_secret' => ''])), 'Missing secret accepted.');
check(!google_configured(array_replace($config, ['google_redirect_uri' => 'http://example.com/auth/google-callback.php'])), 'Insecure remote callback accepted.');

// Isolated database exercises identity and role handling without touching user records.
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT NOT NULL, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, google_sub TEXT UNIQUE, password_hash TEXT, onboarding_pending INTEGER NOT NULL DEFAULT 0)');
$clientId = google_account($pdo, $claims, 'client');
check($clientId > 0 && google_account($pdo, $claims, 'client') === $clientId, 'Repeat login duplicated account.');
check((int) $pdo->query('SELECT onboarding_pending FROM users WHERE id = ' . $clientId)->fetchColumn() === 1, 'New Google account must complete onboarding.');
$pdo->exec('UPDATE users SET onboarding_pending = 0 WHERE id = ' . $clientId);
check(google_account($pdo, $claims, 'client') === $clientId, 'Returning account changed.');
check((int) $pdo->query('SELECT onboarding_pending FROM users WHERE id = ' . $clientId)->fetchColumn() === 0, 'Returning account was forced to repeat onboarding.');
rejects(static fn () => google_account($pdo, $claims, 'artist'), 'role-mismatch');
rejects(static fn () => google_account($pdo, $claims, 'admin'), 'role-mismatch');
$artist = array_replace($claims, ['sub' => 'artist-sub', 'email' => 'artist@gmail.com']);
check(google_account($pdo, $artist, 'artist') !== $clientId, 'Artist account was not created.');
$pdo->exec("INSERT INTO users (role, email, display_name, password_hash) VALUES ('client', 'password@gmail.com', 'Existing account', 'existing-hash')");
rejects(static fn () => google_account($pdo, array_replace($claims, ['sub' => 'new-sub', 'email' => 'password@gmail.com']), 'client'), 'email-exists');
check($pdo->query("SELECT google_sub FROM users WHERE email = 'password@gmail.com'")->fetchColumn() === null, 'Password account was linked without proof.');
check(google_account($pdo, array_replace($claims, ['email' => 'renamed@gmail.com']), 'client') === $clientId, 'Subject identity was lost after an email change.');
echo "PASS: Google token signatures/claims, state validation, configuration, role isolation, repeat login, and email collision handling.\n";
