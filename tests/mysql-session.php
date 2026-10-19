<?php
declare(strict_types=1);

// Run with XAMPP MySQL: php tests/mysql-session.php
putenv('SESSION_DRIVER=mysql');
require __DIR__ . '/../auth/bootstrap.php';
$token = bin2hex(random_bytes(16));
$_SESSION['session_test'] = $token;
$id = session_id();
session_write_close();
session_id($id);
if (!session_start() || ($_SESSION['session_test'] ?? null) !== $token) {
    fwrite(STDERR, "MySQL session did not persist.\n");
    exit(1);
}
$_SESSION = [];
session_destroy();
echo "PASS: MySQL session persisted and was cleaned up.\n";
