<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin.php';
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

$json = str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
if (!in_array($_SERVER['REQUEST_METHOD'], ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    header('Location: ' . (admin_authorized() ? 'index.php' : '../index.php?auth=admin'), true, 303);
    exit;
}
try {
    if (!is_string($_POST['csrf'] ?? null) || !hash_equals(csrf_token(), $_POST['csrf'])) {
        http_response_code(403);
        throw new DomainException('Your session expired. Refresh this page and try again.');
    }
    $result = admin_authorized() ? 'ok' : admin_signin(is_string($_POST['password'] ?? null) ? $_POST['password'] : '');
    if ($result !== 'ok') {
        http_response_code($result === 'limited' ? 429 : 403);
        throw new DomainException(match ($result) {
            'disabled' => 'Admin sign-in is unavailable until the site owner completes setup.',
            'limited' => 'Too many sign-in attempts. Please try again in 15 minutes.',
            default => 'The admin password is incorrect. Please try again.',
        });
    }
    if ($json) json_response(['ok' => true]);
    header('Location: index.php', true, 303);
    exit;
} catch (DomainException $exception) {
    $error = $exception->getMessage();
} catch (Throwable $exception) {
    error_log('Admin sign-in failed: ' . $exception->getMessage());
    http_response_code(503);
    $error = 'We could not sign you in. Please try again shortly.';
}
if ($json) json_response(['error' => $error], http_response_code());
$_SESSION['admin_login_error'] = $error;
header('Location: ../index.php?auth=admin', true, 303);
exit;
