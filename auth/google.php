<?php
declare(strict_types=1);

function google_configured(array $config): bool
{
    foreach (['google_client_id', 'google_client_secret', 'google_redirect_uri'] as $key) {
        if (!is_string($config[$key] ?? null) || trim($config[$key]) === '') return false;
    }
    $uri = parse_url($config['google_redirect_uri']);
    if (!$uri || isset($uri['query']) || isset($uri['fragment']) ||
        isset($uri['user']) || isset($uri['pass']) || empty($uri['host']) ||
        !str_ends_with($uri['path'] ?? '', '/auth/google-callback.php')) return false;
    return ($uri['scheme'] ?? '') === 'https' ||
        (getenv('VERCEL') === false && ($uri['scheme'] ?? '') === 'http' &&
            in_array($uri['host'], ['localhost', '127.0.0.1'], true));
}
function google_pending_valid(mixed $pending, mixed $state): bool
{
    return is_array($pending) && is_string($state) && is_string($pending['state'] ?? null) &&
        hash_equals($pending['state'], $state) &&
        is_int($pending['created_at'] ?? null) && $pending['created_at'] >= time() - 600 &&
        $pending['created_at'] <= time() &&
        is_string($pending['nonce'] ?? null) && strlen($pending['nonce']) === 64 &&
        is_string($pending['code_verifier'] ?? null) && strlen($pending['code_verifier']) === 64 &&
        in_array($pending['role'] ?? null, ['client', 'artist'], true);
}

// Google subject is the identity key. Matching email alone never links an account.
function google_account(PDO $pdo, array $identity, string $role): int
{
    if (!in_array($role, ['client', 'artist'], true)) throw new DomainException('role-mismatch');
    $find = $pdo->prepare('SELECT id, role FROM users WHERE google_sub = ? LIMIT 1');
    $find->execute([$identity['sub']]);
    $account = $find->fetch(PDO::FETCH_ASSOC);
    if ($account) {
        if ($account['role'] !== $role) throw new DomainException('role-mismatch');
        return (int) $account['id'];
    }
    $email = mb_strtolower($identity['email']);
    if (strlen($email) > 254) throw new RuntimeException('Google email is too long.');
    $exists = $pdo->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $exists->execute([$email]);
    if ($exists->fetchColumn() !== false) throw new DomainException('email-exists');
    $name = is_string($identity['name'] ?? null) ? trim($identity['name']) : '';
    if ($name === '') $name = explode('@', $email)[0];
    $name = mb_substr($name, 0, 100);
    $returning = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) !== 'mysql';
    $insert = $pdo->prepare('INSERT INTO users (role, email, display_name, google_sub) VALUES (?, ?, ?, ?)' . ($returning ? ' RETURNING id' : ''));
    try {
        $insert->execute([$role, $email, $name, $identity['sub']]);
        return (int) ($returning ? $insert->fetchColumn() : $pdo->lastInsertId());
    } catch (PDOException $error) {
        if (!in_array($error->getCode(), ['23505', '23000'], true)) throw $error;
        // A concurrent callback may have created this Google account already.
        $find->execute([$identity['sub']]);
        $account = $find->fetch(PDO::FETCH_ASSOC);
        if (!$account) throw new DomainException('email-exists');
        if ($account['role'] !== $role) throw new DomainException('role-mismatch');
        return (int) $account['id'];
    }
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
    $data = is_string($body) ? json_decode($body, true) : null;
    if (!is_string($body) || $status !== 200) {
        $code = is_array($data) ? ($data['error'] ?? '') : '';
        $code = is_string($code) && preg_match('/^[a-z_]{1,80}$/D', $code) ? $code : 'request_failed';
        // Error codes are safe diagnostics; never include Google's response body or request payload.
        throw new RuntimeException('Google request failed (HTTP ' . $status . ', ' . $code . ').');
    }
    if (!is_array($data)) throw new RuntimeException('Invalid Google response.');
    return $data;
}

function verified_google_identity(string $jwt, string $clientId, string $nonce, array $certificates): array
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

    $certificate = $certificates[$header['kid']] ?? null;
    if (!is_string($certificate) || openssl_verify($headerPart . '.' . $payloadPart, $signature, $certificate, OPENSSL_ALGO_SHA256) !== 1) {
        throw new RuntimeException('Invalid Google token signature.');
    }
    $issuer = $claims['iss'] ?? '';
    if (!in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true) ||
        ($claims['aud'] ?? '') !== $clientId ||
        (isset($claims['azp']) && $claims['azp'] !== $clientId) ||
        ($claims['nonce'] ?? '') !== $nonce ||
        !is_numeric($claims['exp'] ?? null) || (int) $claims['exp'] <= time() ||
        !is_numeric($claims['iat'] ?? null) || (int) $claims['iat'] > time() + 60 ||
        !is_string($claims['sub'] ?? null) || $claims['sub'] === '' || strlen($claims['sub']) > 255 ||
        !in_array($claims['email_verified'] ?? null, [true, 'true'], true) ||
        !filter_var($claims['email'] ?? null, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Invalid Google identity claims.');
    }
    return $claims;
}
