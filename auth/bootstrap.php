<?php
declare(strict_types=1);

$isVercel = getenv('VERCEL') !== false;
if (session_status() !== PHP_SESSION_ACTIVE) {
    $sessionDriver = getenv('SESSION_DRIVER');
    if ($sessionDriver === false || $sessionDriver === '') {
        $configuredDbDriver = getenv('DB_DRIVER');
        $sessionDriver = $isVercel ? (($configuredDbDriver === 'pgsql') ? 'pgsql' : 'mysql') : 'files';
    }
    if ($isVercel && !in_array($sessionDriver, ['mysql', 'pgsql'], true)) {
        throw new RuntimeException('Vercel deployments require SESSION_DRIVER=mysql or pgsql.');
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

    if (in_array($sessionDriver, ['mysql', 'pgsql'], true)) {
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
                $sql = db_driver() === 'pgsql'
                    ? "SELECT encode(session_data, 'base64') FROM app_sessions WHERE session_id = ? AND expires_at > ?"
                    : 'SELECT session_data FROM app_sessions WHERE session_id = ? AND expires_at > ?';
                $statement = $this->pdo()->prepare($sql);
                $statement->execute([$id, time()]);
                $data = $statement->fetchColumn();
                if (db_driver() === 'pgsql' && is_string($data)) $data = base64_decode($data, true);
                return is_string($data) ? $data : '';
            }

            public function write(string $id, string $data): bool
            {
                $expiresAt = time() + (int) ini_get('session.gc_maxlifetime');
                $sql = db_driver() === 'pgsql'
                    ? "INSERT INTO app_sessions (session_id, session_data, expires_at) VALUES (?, decode(?, 'base64'), ?) ON CONFLICT (session_id) DO UPDATE SET session_data = EXCLUDED.session_data, expires_at = EXCLUDED.expires_at"
                    : 'INSERT INTO app_sessions (session_id, session_data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE session_data = ?, expires_at = ?';
                $statement = $this->pdo()->prepare($sql);
                return $statement->execute(db_driver() === 'pgsql' ? [$id, base64_encode($data), $expiresAt] : [$id, $data, $expiresAt, $data, $expiresAt]);
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
            'db_driver' => 'DB_DRIVER',
            'db_sslmode' => 'DB_SSLMODE',
            'db_ssl_ca' => 'DB_SSL_CA',
            'db_ssl_ca_pem' => 'DB_SSL_CA_PEM',
            'admin_password' => 'ADMIN_PASSWORD',
            'google_client_id' => 'GOOGLE_CLIENT_ID',
            'google_client_secret' => 'GOOGLE_CLIENT_SECRET',
            'google_redirect_uri' => 'GOOGLE_REDIRECT_URI',
        ] as $key => $environmentVariable) {
            $value = getenv($environmentVariable);
            if ($value !== false && $value !== '') $config[$key] = $value;
        }
        if (getenv('VERCEL') !== false) {
            foreach (['DB_DRIVER', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as $name) {
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
        $driver = db_driver();
        $port = filter_var($config['db_port'] ?? ($driver === 'pgsql' ? 5432 : 3306), FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535],
        ]);
        if ($port === false) throw new RuntimeException('DB_PORT must be a valid TCP port.');
        if ($driver === 'pgsql') {
            $sslmode = $config['db_sslmode'] ?? 'require';
            if (!in_array($sslmode, ['require', 'verify-ca', 'verify-full'], true)) throw new RuntimeException('DB_SSLMODE must be require, verify-ca, or verify-full.');
            $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s;sslmode=%s', $config['db_host'], $port, $config['db_name'], $sslmode);
        } else {
            $dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4', $config['db_host'], $port, $config['db_name']);
        }
        $options = [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Supavisor's transaction pooler does not support server-side prepared statements.
            PDO::ATTR_EMULATE_PREPARES => $driver === 'pgsql',
        ];
        if ($driver === 'mysql') $options += mysql_ssl_options($config);
        $pdo = new PDO($dsn, $config['db_user'], $config['db_password'], $options);
    }
    return $pdo;
}

function db_driver(): string
{
    static $driver = null;
    if ($driver === null) {
        $config = app_config();
        $driver = (string) ($config['db_driver'] ?? 'mysql');
        if (!in_array($driver, ['mysql', 'pgsql'], true)) throw new RuntimeException('DB_DRIVER must be mysql or pgsql.');
    }
    return $driver;
}

function db_duplicate_error(PDOException $exception): bool
{
    return db_driver() === 'pgsql'
        ? $exception->getCode() === '23505'
        : $exception->getCode() === '23000' || ($exception->errorInfo[1] ?? null) === 1062;
}

function ensure_database_schema(): void
{
    try {
        db()->query('SELECT 1 FROM app_sessions LIMIT 0');
        db()->query('SELECT 1 FROM users LIMIT 0');
        db()->query('SELECT 1 FROM client_briefs LIMIT 0');
        db()->query('SELECT 1 FROM client_brief_references LIMIT 0');
        db()->query('SELECT 1 FROM brief_access_codes LIMIT 0');
        db()->query('SELECT 1 FROM brief_artist_access LIMIT 0');
        db()->query('SELECT 1 FROM admin_login_limits LIMIT 0');
        return;
    } catch (PDOException $error) {
        $missingTable = db_driver() === 'pgsql' ? $error->getCode() === '42P01' : $error->getCode() === '42S02';
        if (!$missingTable) throw $error;
    }

    // The checked-in schema uses CREATE TABLE IF NOT EXISTS, so concurrent
    // cold starts and existing accounts/briefs remain safe.
    $schemaFile = db_driver() === 'pgsql' ? 'schema.postgres.sql' : 'schema.sql';
    $schema = file_get_contents(__DIR__ . '/' . $schemaFile);
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
        $sql = 'SELECT id, role, email, display_name, bio, photo_mime, (photo_data IS NOT NULL) AS has_profile_photo FROM users WHERE id = ? LIMIT 1';
        try {
            $statement = db()->prepare($sql);
        } catch (PDOException $exception) {
            $unknownColumn = db_driver() === 'pgsql'
                ? $exception->getCode() === '42703'
                : (($exception->errorInfo[1] ?? null) === 1054);
            if (!$unknownColumn) throw $exception;
            // Upgrade existing installations; fresh databases include these columns.
            $columns = db_driver() === 'pgsql'
                ? ['bio VARCHAR(500) NULL', 'photo_mime VARCHAR(20) NULL', 'photo_data BYTEA NULL']
                : ['bio VARCHAR(500) NULL', 'photo_mime VARCHAR(20) NULL', 'photo_data MEDIUMBLOB NULL'];
            foreach ($columns as $column) {
                try {
                    db()->exec('ALTER TABLE users ADD COLUMN ' . $column);
                } catch (PDOException $migrationError) {
                    $duplicateColumn = db_driver() === 'pgsql'
                        ? $migrationError->getCode() === '42701'
                        : (($migrationError->errorInfo[1] ?? null) === 1060);
                    if (!$duplicateColumn) throw $migrationError;
                }
            }
            $statement = db()->prepare($sql);
        }
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
