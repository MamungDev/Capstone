<?php
declare(strict_types=1);

if (session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('mamungkun_session');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/Capstone/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.local.php';
        $config = is_file($file) ? require $file : require __DIR__ . '/config.example.php';
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $config = app_config();
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $config['db_host'], $config['db_name']);
        $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function csrf_token(): string
{
    return $_SESSION['csrf_token'] ??= bin2hex(random_bytes(32));
}

function require_csrf(mixed $token): void
{
    if (!is_string($token) || !hash_equals(csrf_token(), $token)) {
        json_response(['error' => 'Your session expired. Refresh the page and try again.'], 403);
    }
}

function current_user(): ?array
{
    $id = $_SESSION['user_id'] ?? null;
    if (!is_int($id) || $id < 1) return null;
    try {
        $statement = db()->prepare('SELECT id, role, email, display_name FROM users WHERE id = ? LIMIT 1');
        $statement->execute([$id]);
        $user = $statement->fetch();
        return $user ?: null;
    } catch (PDOException $exception) {
        error_log('Auth database error: ' . $exception->getMessage());
        return null;
    }
}

function sign_in_user(int $id): void
{
    session_regenerate_id(true);
    $_SESSION['user_id'] = $id;
    unset($_SESSION['csrf_token']);
    csrf_token();
}

function json_response(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function require_role_auth(string $role): array
{
    $user = current_user();
    if (!$user || $user['role'] !== $role) {
        header('Location: ../index.php?auth=' . $role, true, 302);
        exit;
    }
    header('Cache-Control: private, no-store');
    return $user;
}

function require_client_auth(): array
{
    return require_role_auth('client');
}

function require_artist_auth(): array
{
    return require_role_auth('artist');
}
