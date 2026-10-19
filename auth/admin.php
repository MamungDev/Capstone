<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

function admin_password_status(): string
{
    $secret = (string) (app_config()['admin_password'] ?? '');
    if ($secret === '') return 'missing';
    return strlen($secret) < 16 ? 'short' : 'ready';
}

function admin_secret(): string
{
    return admin_password_status() === 'ready' ? (string) app_config()['admin_password'] : '';
}

function admin_authorized(): bool
{
    $secret = admin_secret();
    $until = $_SESSION['admin_until'] ?? 0;
    $proof = $_SESSION['admin_proof'] ?? '';
    return $secret !== '' && is_int($until) && $until > time() && is_string($proof) &&
        hash_equals(hash_hmac('sha256', session_id() . ':' . $until, $secret), $proof);
}

function admin_signin(string $password): string
{
    $secret = admin_secret();
    if ($secret === '') return 'disabled';
    ensure_database_schema();
    // Shared limit survives cookie resets and separate Vercel instances.
    // Ten attempts per 15 minutes; changing the admin password resets the bucket.
    $bucket = hash_hmac('sha256', 'admin-login', $secret);
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $query = $pdo->prepare('INSERT INTO admin_login_limits (bucket, attempts, window_end) VALUES (?, 0, 0) ON DUPLICATE KEY UPDATE bucket = bucket');
        $query->execute([$bucket]);
        $query = $pdo->prepare('SELECT attempts, window_end FROM admin_login_limits WHERE bucket = ? FOR UPDATE');
        $query->execute([$bucket]);
        $row = $query->fetch();
        $now = time();
        $attempts = (int) $row['window_end'] > $now ? (int) $row['attempts'] : 0;
        $end = (int) $row['window_end'] > $now ? (int) $row['window_end'] : $now + 900;
        if ($attempts >= 10) {
            $pdo->commit();
            return 'limited';
        }
        $query = $pdo->prepare('UPDATE admin_login_limits SET attempts = ?, window_end = ? WHERE bucket = ?');
        $query->execute([$attempts + 1, $end, $bucket]);
        $valid = strlen($password) <= 4096 && hash_equals(hash('sha256', $secret), hash('sha256', $password));
        if ($valid) {
            $pdo->prepare('DELETE FROM admin_login_limits WHERE bucket = ?')->execute([$bucket]);
        }
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
    if (!$valid) return 'invalid';
    session_regenerate_id(true);
    $_SESSION['admin_until'] = time() + 3600;
    $_SESSION['admin_proof'] = hash_hmac('sha256', session_id() . ':' . $_SESSION['admin_until'], $secret);
    unset($_SESSION['csrf_token']);
    return 'ok';
}

function admin_delete_user(int $id, string $confirmation): void
{
    if (!admin_authorized()) throw new DomainException('Your admin session expired. Sign in again.');
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $query = $pdo->prepare('SELECT email FROM users WHERE id = ? FOR UPDATE');
        $query->execute([$id]);
        $email = $query->fetchColumn();
        if (!is_string($email)) throw new DomainException('This account no longer exists.');
        if (!hash_equals($email, trim($confirmation))) throw new DomainException('Enter the account email exactly as shown to confirm deletion.');
        $pdo->prepare('DELETE FROM client_briefs WHERE client_id = ?')->execute([$id]);
        $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        $pdo->commit();
        // Every protected page checks users again, so any remaining sessions
        // for a deleted account lose access on their next request.
        if (($_SESSION['user_id'] ?? null) === $id) unset($_SESSION['user_id']);
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
