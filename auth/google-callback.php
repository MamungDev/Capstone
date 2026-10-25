<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

function google_failure(string $code): never
{
    header('Location: ../index.php?auth=client&notice=' . rawurlencode($code), true, 303);
    exit;
}

function base64url_decode_strict(string $value): string|false
{
    if (!preg_match('/^[A-Za-z0-9_-]+$/D', $value)) return false;
    return base64_decode(strtr($value, '-_', '+/') . str_repeat('=', (4 - strlen($value) % 4) % 4), true);
}

function google_json_request(string $url, ?array $post = null): array
{
    $handle = curl_init($url);
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
    ]);
    if ($post !== null) {
        curl_setopt($handle, CURLOPT_POST, true);
        curl_setopt($handle, CURLOPT_POSTFIELDS, http_build_query($post, '', '&', PHP_QUERY_RFC3986));
    }
    $body = curl_exec($handle);
    $status = curl_getinfo($handle, CURLINFO_HTTP_CODE);
    curl_close($handle);
    if (!is_string($body) || $status !== 200) throw new RuntimeException('Google request failed.');
    $data = json_decode($body, true);
    if (!is_array($data)) throw new RuntimeException('Invalid Google response.');
    return $data;
}

function verified_google_identity(string $jwt, string $clientId, string $nonce): array
{
    $parts = explode('.', $jwt);
    if (count($parts) !== 3 || strlen($jwt) > 10000) throw new RuntimeException('Invalid ID token.');
    [$headerPart, $payloadPart, $signaturePart] = $parts;
    $headerJson = base64url_decode_strict($headerPart);
    $payloadJson = base64url_decode_strict($payloadPart);
    $signature = base64url_decode_strict($signaturePart);
    if ($headerJson === false || $payloadJson === false || $signature === false) throw new RuntimeException('Invalid ID token encoding.');
    $header = json_decode($headerJson, true);
    $claims = json_decode($payloadJson, true);
    if (!is_array($header) || !is_array($claims) || ($header['alg'] ?? '') !== 'RS256' ||
        !is_string($header['kid'] ?? null)) throw new RuntimeException('Invalid token header.');

    $certificates = google_json_request('https://www.googleapis.com/oauth2/v1/certs');
    $certificate = $certificates[$header['kid']] ?? null;
    if (!is_string($certificate) || openssl_verify($headerPart . '.' . $payloadPart, $signature, $certificate, OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('Invalid Google token signature.');
    }
    $issuer = $claims['iss'] ?? '';
    if (!in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true) ||
        ($claims['aud'] ?? '') !== $clientId || ($claims['nonce'] ?? '') !== $nonce ||
        !is_numeric($claims['exp'] ?? null) || (int) $claims['exp'] <= time() ||
        !is_numeric($claims['iat'] ?? null) || (int) $claims['iat'] > time() + 60 ||
        !is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 255 ||
        !in_array($claims['email_verified'] ?? null, [true, 'true'], true) ||
        !filter_var($claims['email'] ?? null, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Invalid Google identity claims.');
    }
    return $claims;
}

$pending = $_SESSION['google_oauth'] ?? null;
unset($_SESSION['google_oauth']);
if (!is_array($pending) || !is_string($_GET['state'] ?? null) ||
    !hash_equals($pending['state'], $_GET['state']) ||
    ($pending['created_at'] ?? 0) < time() - 600) google_failure('google-expired');
if (isset($_GET['error'])) google_failure('google-cancelled');
if (!is_string($_GET['code'] ?? null) || $_GET['code'] === '') google_failure('google-failed');

try {
    $config = app_config();
    if (empty($config['google_client_id']) || empty($config['google_client_secret'])) google_failure('google-not-configured');
    $token = google_json_request('https://oauth2.googleapis.com/token', [
        'code' => $_GET['code'],
        'client_id' => $config['google_client_id'],
        'client_secret' => $config['google_client_secret'],
        'redirect_uri' => $config['google_redirect_uri'],
        'grant_type' => 'authorization_code',
    ]);
    if (!is_string($token['id_token'] ?? null)) throw new RuntimeException('No Google ID token.');
    $identity = verified_google_identity($token['id_token'], $config['google_client_id'], $pending['nonce']);
    $sub = $identity['sub'];
    $email = mb_strtolower($identity['email']);
    if (strlen($email) > 254) throw new RuntimeException('Google email is too long.');
    $statement = db()->prepare('SELECT id, role FROM users WHERE google_sub = ? LIMIT 1');
    $statement->execute([$sub]);
    $account = $statement->fetch();
    if ($account) {
        if ($account['role'] !== 'client') google_failure('client-only');
        sign_in_user((int) $account['id']);
    } else {
        $statement = db()->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        if ($statement->fetch()) google_failure('email-exists');
        $name = mb_substr(trim((string) ($identity['name'] ?? '')), 0, 100);
        if ($name === '') $name = explode('@', $email)[0];
        $statement = db()->prepare(db_driver() === 'pgsql'
            ? 'INSERT INTO users (role, email, display_name, google_sub) VALUES (?, ?, ?, ?) RETURNING id'
            : 'INSERT INTO users (role, email, display_name, google_sub) VALUES (?, ?, ?, ?)');
        $statement->execute(['client', $email, $name, $sub]);
        sign_in_user((int) (db_driver() === 'pgsql' ? $statement->fetchColumn() : db()->lastInsertId()));
    }
    header('Location: ../Client/Client%20UI.php', true, 303);
    exit;
} catch (Throwable $exception) {
    error_log('Google sign-in error: ' . $exception->getMessage());
    google_failure('google-failed');
}
