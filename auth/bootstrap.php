<?php
declare(strict_types=1);

$isVercel = getenv('VERCEL') !== false;
if (session_status() !== PHP_SESSION_ACTIVE) {
    $sessionDriver = getenv('SESSION_DRIVER');
    if ($sessionDriver === false || $sessionDriver === '') {
        $sessionDriver = $isVercel ? 'mysql' : 'files';
    }
    if ($isVercel && $sessionDriver !== 'mysql') {
        throw new RuntimeException('Vercel deployments require SESSION_DRIVER=mysql.');
    }
    ini_set('session.use_strict_mode', '1');
    ini_set('session.use_only_cookies', '1');
    session_name('mamungkun_session');
    $cookiePath = getenv('SESSION_COOKIE_PATH');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => $cookiePath !== false && $cookiePath !== '' ? $cookiePath : ($isVercel ? '/' : '/Capstone/'),
        'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ||
            ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    if ($sessionDriver === 'mysql') {
        if ($isVercel) ensure_database_schema();
        $sessionPdo = null;
        $getSessionPdo = static function () use (&$sessionPdo): PDO {
            return $sessionPdo ??= db();
        };
        session_set_save_handler(new class($getSessionPdo) implements SessionHandlerInterface, SessionUpdateTimestampHandlerInterface {
            public function __construct(private Closure $getPdo) {}

            private function pdo(): PDO
            {
                return ($this->getPdo)();
            }

            public function open(string $path, string $name): bool { return true; }
            public function close(): bool { return true; }

            public function read(string $id): string|false
            {
                $statement = $this->pdo()->prepare('SELECT session_data FROM app_sessions WHERE session_id = ? AND expires_at > ?');
                $statement->execute([$id, time()]);
                $data = $statement->fetchColumn();
                return is_string($data) ? $data : '';
            }

            public function write(string $id, string $data): bool
            {
                $expiresAt = time() + (int) ini_get('session.gc_maxlifetime');
                $statement = $this->pdo()->prepare('INSERT INTO app_sessions (session_id, session_data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_data = ?, expires_at = ?');
                return $statement->execute([$id, $data, $expiresAt, $data, $expiresAt]);
            }

            public function destroy(string $id): bool
            {
                $statement = $this->pdo()->prepare('DELETE FROM app_sessions WHERE session_id = ?');
                return $statement->execute([$id]);
            }

            public function gc(int $maxLifetime): int|false
            {
                $statement = $this->pdo()->prepare('DELETE FROM app_sessions WHERE expires_at <= ?');
                return $statement->execute([time()]) ? $statement->rowCount() : false;
            }

            public function validateId(string $id): bool
            {
                $statement = $this->pdo()->prepare('SELECT 1 FROM app_sessions WHERE session_id = ? AND expires_at > ?');
                $statement->execute([$id, time()]);
                return $statement->fetchColumn() !== false;
            }

            public function updateTimestamp(string $id, string $data): bool
            {
                $statement = $this->pdo()->prepare('UPDATE app_sessions SET expires_at = ? WHERE session_id = ?');
                return $statement->execute([time() + (int) ini_get('session.gc_maxlifetime'), $id]);
            }
        }, true);
    }

    session_start();
}

function app_config(): array
{
    static $config = null;
    if ($config === null) {
        $file = __DIR__ . '/config.local.php';
        $config = is_file($file) ? require $file : require __DIR__ . '/config.example.php';
        foreach ([
            'db_host' => 'DB_HOST',
            'db_port' => 'DB_PORT',
            'db_name' => 'DB_NAME',
            'db_user' => 'DB_USER',
            'db_password' => 'DB_PASSWORD',
            'db_ssl_ca' => 'DB_SSL_CA',
            'db_ssl_ca_pem' => 'DB_SSL_CA_PEM',
            'google_client_id' => 'GOOGLE_CLIENT_ID',
            'google_client_secret' => 'GOOGLE_CLIENT_SECRET',
            'google_redirect_uri' => 'GOOGLE_REDIRECT_URI',
        ] as $key => $environmentVariable) {
            $value = getenv($environmentVariable);
            if ($value !== false && $value !== '') $config[$key] = $value;
        }
        if (getenv('VERCEL') !== false) {
            foreach (['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'DB_SSL_CA_PEM'] as $name) {
                if (getenv($name) === false || getenv($name) === '') {
                    throw new RuntimeException('Missing required deployment configuration: ' . $name . '.');
                }
            }
        }
    }
    return $config;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo === null) {
        $config = app_config();
        $port = filter_var($config['db_port'] ?? 3306, FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535],
        ]);
        if ($port === false) throw new RuntimeException('DB_PORT must be a valid TCP port.');
        $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db_host'], $port, $config['db_name']);
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ];
        $options += mysql_ssl_options($config);
        $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], $options);
    }
    return $pdo;
}

function ensure_database_schema(): void
{
    try {
        db()->query('SELECT 1 FROM app_sessions LIMIT 0');
        db()->query('SELECT 1 FROM users LIMIT 0');
        db()->query('SELECT 1 FROM client_briefs LIMIT 0');
        return;
    } catch (PDOException $error) {
        if ($error->getCode() !== '42S02') throw $error;
    }

    // The checked-in schema uses CREATE TABLE IF NOT EXISTS, so concurrent
    // cold starts and existing accounts/briefs remain safe.
    $schema = file_get_contents(__DIR__ . '/schema.sql');
    if ($schema === false) throw new RuntimeException('Database schema file is missing.');
    $schema = preg_replace('/^\s*--[^\r\n]*$/m', '', $schema);
    foreach (explode(';', $schema) as $statement) {
        $statement = trim($statement);
        if ($statement !== '') db()->exec($statement);
    }
}

function mysql_ssl_options(array $config): array
{
    $caPath = $config['db_ssl_ca'] ?? '';
    $caPem = $config['db_ssl_ca_pem'] ?? '';
    if ($caPem !== '') {
        // Vercel's deployed files are read-only. Its temporary directory can hold
        // the CA certificate supplied through a project environment variable.
        $caPem = str_replace('\\n', "\n", $caPem);
        if (@openssl_x509_read($caPem) === false) {
            throw new RuntimeException('DB_SSL_CA_PEM is not a valid PEM certificate.');
        }
        $caPath = tempnam(sys_get_temp_dir(), 'mamungkun-ca-');
        if ($caPath === false || file_put_contents($caPath, $caPem) === false) {
            throw new RuntimeException('Unable to prepare the database CA certificate.');
        }
        @chmod($caPath, 0600);
        register_shutdown_function(static function () use ($caPath): void { @unlink($caPath); });
    }
    if ($caPath === '') return [];
    if (!is_file($caPath) || !is_readable($caPath)) {
        throw new RuntimeException('The database CA certificate file cannot be read.');
    }
    if (class_exists(\Pdo\Mysql::class)) {
        return [
            \Pdo\Mysql::ATTR_SSL_CA => $caPath,
            \Pdo\Mysql::ATTR_SSL_VERIFY_SERVER_CERT => true,
        ];
    }
    return [
        PDO::MYSQL_ATTR_SSL_CA => $caPath,
        PDO::MYSQL_ATTR_SSL_VERIFY_SERVER_CERT => true,
    ];
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
