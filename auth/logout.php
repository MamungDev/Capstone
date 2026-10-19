<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || !is_string($_POST['csrf'] ?? null) ||
    !hash_equals(csrf_token(), $_POST['csrf'])) {
    http_response_code(403);
    exit('Invalid sign-out request.');
}

$_SESSION = [];
session_regenerate_id(true);
header('Location: ../index.php', true, 303);
exit;
