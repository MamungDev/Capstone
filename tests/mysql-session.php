<?php
declare(strict_types=1);

// Run with XAMPP MySQL: php tests/mysql-session.php
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
putenv('SESSION_DRIVER=mysql');
require __DIR__ . '/../auth/bootstrap.php';
$opensslOptions = ['config' => 'C:/xampp/apache/conf/openssl.cnf'];
$key = openssl_pkey_new($opensslOptions + ['private_key_bits' => 2048]);
$request = openssl_csr_new(['commonName' => 'local-test.invalid'], $key, $opensslOptions);
$certificate = openssl_csr_sign($request, null, $key, 1, $opensslOptions);
openssl_x509_export($certificate, $pem);
$ssl = mysql_ssl_options(['db_ssl_ca_pem' => $pem]);
if (!is_file($ssl[PDO::MYSQL_ATTR_SSL_CA]) || $ssl[PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT] !== true) {
    fwrite(STDERR, "MySQL CA certificate was not configured for verification.\n");
    exit(1);
}
try {
    mysql_ssl_options(['db_ssl_ca_pem' => 'invalid']);
    fwrite(STDERR, "Invalid MySQL CA certificate was accepted.\n");
    exit(1);
} catch (RuntimeException) {
    // Invalid certificates must fail before opening a database connection.
}
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
echo "PASS: MySQL CA validation and session persistence.\n";
