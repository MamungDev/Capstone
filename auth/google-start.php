<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    exit;
}

$config = app_config();
if (empty($config['google_client_id']) || empty($config['google_client_secret'])) {
    header('Location: ../index.php?auth=client&notice=google-not-configured', true, 302);
    exit;
}

$state = bin2hex(random_bytes(32));
$nonce = bin2hex(random_bytes(32));
$_SESSION['google_oauth'] = ['state' => $state, 'nonce' => $nonce, 'created_at' => time()];

$parameters = [
    'client_id' => $config['google_client_id'],
    'redirect_uri' => $config['google_redirect_uri'],
    'response_type' => 'code',
    'scope' => 'openid email profile',
    'state' => $state,
    'nonce' => $nonce,
    'prompt' => 'select_account',
];
header('Cache-Control: no-store');
header('Location: https://accounts.google.com/o/oauth2/v2/auth?' . http_build_query($parameters, '', '&', PHP_QUERY_RFC3986), true, 302);
exit;
