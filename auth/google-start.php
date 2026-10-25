<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/google.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    exit;
}

$role = $_GET['role'] ?? null;
if (!in_array($role, ['client', 'artist'], true)) {
    header('Location: ../index.php', true, 302);
    exit;
}
$config = app_config();
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
if (!google_configured($config)) {
    header('Location: ../index.php?auth=' . $role . '&notice=google-not-configured', true, 302);
    exit;
}

// Start on the callback's hostname so Vercel preview URLs cannot lose the state cookie.
$redirect = $config['google_redirect_uri'];
$parts = parse_url($redirect);
$authority = $parts['host'] . (isset($parts['port']) ? ':' . $parts['port'] : '');
if (strtolower($_SERVER['HTTP_HOST'] ?? '') !== strtolower($authority)) {
    $startUrl = substr($redirect, 0, -strlen('google-callback.php')) . 'google-start.php';
    header('Location: ' . $startUrl . '?role=' . $role, true, 302);
    exit;
}

$state = bin2hex(random_bytes(32));
$nonce = bin2hex(random_bytes(32));
$verifier = bin2hex(random_bytes(32));
$_SESSION['google_oauth'] = [
    'state' => $state, 'nonce' => $nonce, 'created_at' => time(),
    'role' => $role, 'code_verifier' => $verifier, 'redirect_uri' => $redirect,
];

$parameters = [
    'client_id' => $config['google_client_id'],
    'redirect_uri' => $config['google_redirect_uri'],
    'response_type' => 'code',
    'scope' => 'openid email profile',
    'state' => $state,
    'nonce' => $nonce,
    'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
    'code_challenge_method' => 'S256',
    'prompt' => 'select_account',
];
session_write_close();
header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($parameters, '', '&', PHP_QUERY_RFC3986), true, 302);
exit;
