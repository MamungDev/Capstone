<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/google.php';

header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    exit;
}

function google_failure(string $code, string $role = 'client'): never
{
    $role = in_array($role, ['client', 'artist'], true) ? $role : 'client';
    header('Location: ../index.php?auth=' . $role . '&notice=' . rawurlencode($code), true, 303);
    exit;
}

$pending = $_SESSION['google_oauth'] ?? null;
$role = is_array($pending) && is_string($pending['role'] ?? null) ? $pending['role'] : 'client';
if (!google_pending_valid($pending, $_GET['state'] ?? null)) google_failure('google-expired', $role);
unset($_SESSION['google_oauth']); // Consume state once before exchanging the code.
if (isset($_GET['error'])) google_failure('google-cancelled', $role);
if (!is_string($_GET['code'] ?? null) || $_GET['code'] === '' || strlen($_GET['code']) > 8192) google_failure('google-failed', $role);

$stage = 'configuration';
try {
    $config = app_config();
    if (!google_configured($config)) google_failure('google-not-configured', $role);
    if (($pending['redirect_uri'] ?? '') !== $config['google_redirect_uri']) google_failure('google-expired', $role);
    $stage = 'token exchange';
    $token = google_json_request('https://oauth2.googleapis.com/token', [
        'code' => $_GET['code'],
        'client_id' => $config['google_client_id'],
        'client_secret' => $config['google_client_secret'],
        'redirect_uri' => $config['google_redirect_uri'],
        'grant_type' => 'authorization_code',
        'code_verifier' => $pending['code_verifier'],
    ]);
    if (!is_string($token['id_token'] ?? null)) throw new RuntimeException('No Google ID token.');
    $stage = 'identity verification';
    $certificates = google_json_request('https://www.googleapis.com/oauth2/v1/certs');
    $identity = verified_google_identity($token['id_token'], $config['google_client_id'], $pending['nonce'], $certificates);
    $stage = 'account sign-in';
    ensure_onboarding_column();
    sign_in_user(google_account(db(), $identity, $role));
    $user = current_user();
    if (!$user) throw new RuntimeException('Google account session could not be loaded.');
    $destination = !empty($user['onboarding_pending'])
        ? 'complete-profile.php'
        : ($role === 'artist' ? '../Artist/Artist%20UI.php' : '../Client/Client%20UI.php');
    header('Location: ' . $destination, true, 303);
    exit;
} catch (DomainException $exception) {
    google_failure($exception->getMessage(), $role);
} catch (Throwable $exception) {
    // Do not log OAuth tokens, authorization codes, or secrets.
    $reason = get_class($exception) === RuntimeException::class ? $exception->getMessage() : get_class($exception);
    error_log('Google sign-in failed at ' . $stage . ': ' . $reason . ' (code ' . $exception->getCode() . ').');
    google_failure('google-failed', $role);
}
