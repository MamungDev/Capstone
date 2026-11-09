<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin.php';
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    json_response(['error' => 'Administrators must sign in with Google.'], 405);
}
header('Location: ' . (admin_authorized() ? 'index.php' : '../index.php?auth=admin'), true, 303);
exit;
