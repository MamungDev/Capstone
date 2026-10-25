<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    json_response(['error' => 'Method not allowed.'], 405);
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 8192) json_response(['error' => 'Request is too large.'], 413);
$input = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($input)) json_response(['error' => 'Invalid request.'], 400);
require_csrf($input['csrf'] ?? null);

$action = $input['action'] ?? '';
if (!in_array($action, ['signup', 'signin', 'logout'], true)) {
    json_response(['error' => 'Unknown action.'], 400);
}

if ($action === 'logout') {
    $_SESSION = [];
    session_regenerate_id(true);
    json_response(['ok' => true, 'csrf' => csrf_token()]);
}

$role = $input['role'] ?? null;
if (!in_array($role, ['client', 'artist'], true)) {
    json_response(['error' => 'Choose Client or Artist first.'], 422);
}

if (!is_string($input['email'] ?? null) || !is_string($input['password'] ?? null)) {
    json_response(['error' => 'Enter a valid email and password.'], 422);
}
$email = mb_strtolower(trim($input['email']));
$password = $input['password'];
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || $password === '' || strlen($password) > 4096) {
    json_response(['error' => 'Enter a valid email and password.'], 422);
}

try {
    if ($action === 'signup') {
        $name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
        if ($name === '' || mb_strlen($name) > 100 || strlen($password) < 8) {
            json_response(['error' => 'Enter your name and a password of at least 8 characters.'], 422);
        }
        $statement = db()->prepare(db_driver() === 'pgsql'
            ? 'INSERT INTO users (role, email, display_name, password_hash) VALUES (?, ?, ?, ?) RETURNING id'
            : 'INSERT INTO users (role, email, display_name, password_hash) VALUES (?, ?, ?, ?)');
        try {
            $statement->execute([$role, $email, $name, password_hash($password, PASSWORD_DEFAULT)]);
        } catch (PDOException $exception) {
            if (db_duplicate_error($exception)) json_response(['error' => 'An account already uses this email. Sign in instead.'], 409);
            throw $exception;
        }
        sign_in_user((int) (db_driver() === 'pgsql' ? $statement->fetchColumn() : db()->lastInsertId()));
    } else {
        $statement = db()->prepare('SELECT id, role, password_hash FROM users WHERE email = ? LIMIT 1');
        $statement->execute([$email]);
        $account = $statement->fetch();
        if (!$account || $account['role'] !== $role || !is_string($account['password_hash']) ||
            !password_verify($password, $account['password_hash'])) {
            json_response(['error' => 'That email or password does not match this account type.'], 401);
        }
        sign_in_user((int) $account['id']);
    }
    $redirect = $role === 'client' ? 'Client/Client%20UI.php' : 'Artist/Artist%20UI.php';
    json_response(['ok' => true, 'csrf' => csrf_token(), 'redirect' => $redirect]);
} catch (PDOException $exception) {
    error_log('Account auth database error: ' . $exception->getMessage());
    json_response(['error' => 'Sign-in is temporarily unavailable. Please try again.'], 503);
}
