<?php
declare(strict_types=1);

function admin_totp_secret(): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $secret = '';
    for ($i = 0; $i < 32; $i++) $secret .= $alphabet[random_int(0, 31)];
    return $secret;
}

function admin_totp(string $secret, int $step): string
{
    $bits = '';
    foreach (str_split($secret) as $char) {
        $value = strpos('ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', $char);
        if ($value === false) throw new RuntimeException('Invalid authenticator secret');
        $bits .= str_pad(decbin($value), 5, '0', STR_PAD_LEFT);
    }
    $key = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $key .= chr(bindec($byte));
    $hash = hash_hmac('sha1', pack('N2', 0, $step), $key, true);
    $offset = ord($hash[19]) & 15;
    $number = unpack('N', substr($hash, $offset, 4))[1] & 0x7fffffff;
    return str_pad((string) ($number % 1000000), 6, '0', STR_PAD_LEFT);
}

function admin_totp_step(string $secret, string $code, int $last = -1): ?int
{
    if (!preg_match('/^\d{6}$/D', $code)) return null;
    $now = intdiv(time(), 30);
    foreach ([$now, $now - 1, $now + 1] as $step) {
        if ($step > $last && hash_equals(admin_totp($secret, $step), $code)) return $step;
    }
    return null;
}

function admin_cipher_key(): string
{
    // A dedicated stable key is preferred. Existing installations can start
    // using their configured setup secret; changing that key requires recovery.
    $key = (string) (app_config()['admin_mfa_key'] ?? '');
    if ($key === '') $key = admin_secret();
    if (strlen($key) < 16) throw new RuntimeException('Admin encryption key is not configured');
    return hash('sha256', 'mamungkun-admin-mfa:' . $key, true);
}

function admin_encrypt(string $secret): string
{
    $iv = random_bytes(12);
    $cipher = openssl_encrypt($secret, 'aes-256-gcm', admin_cipher_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) throw new RuntimeException('Could not protect authenticator secret');
    return base64_encode($iv . $tag . $cipher);
}

function admin_decrypt(string $cipher): string
{
    $raw = base64_decode($cipher, true);
    if ($raw === false || strlen($raw) < 29) throw new RuntimeException('Invalid authenticator data');
    $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', admin_cipher_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    if ($plain === false) throw new RuntimeException('Authenticator key has changed');
    return $plain;
}
