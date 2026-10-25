<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); json_response(['error' => 'Method not allowed.'], 405); }
$client = current_user();
if (!$client) json_response(['error' => 'Sign in again to upload your references.'], 401);
if ($client['role'] !== 'client') json_response(['error' => 'Only clients can upload references.'], 403);
$limit = 3 * 1024 * 1024;
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) json_response(['error' => 'Each reference must be 2 MB or smaller.'], 413);
$raw = file_get_contents('php://input', false, null, 0, $limit + 1);
if ($raw === false || strlen($raw) > $limit) json_response(['error' => 'This reference is too large.'], 413);
$input = json_decode($raw, true);
if (!is_array($input)) json_response(['error' => 'Invalid request.'], 400);
require_csrf($input['csrf'] ?? null);
session_write_close();
$id = $input['id'] ?? null;
$name = $input['name'] ?? null;
$kind = $input['kind'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || !is_string($name) || mb_strlen($name) > 255 || !in_array($kind, ['reference', 'sketch'], true) || !is_string($input['data'] ?? null)) {
    json_response(['error' => 'Invalid reference details.'], 422);
}
try {
    require_once __DIR__ . '/../auth/brief-references.php';
    $image = reference_image($input['data']);
    $hash = hash('sha256', $name . "\0" . $kind . "\0" . $image['mime'] . "\0" . $image['bytes']);
    try {
        $insertSql = db_driver() === 'pgsql'
            ? "INSERT INTO client_brief_references (id, client_id, name, kind, mime, image_data, content_hash) VALUES (?, ?, ?, ?, ?, decode(?, 'base64'), ?)"
            : 'INSERT INTO client_brief_references (id, client_id, name, kind, mime, image_data, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)';
        db()->prepare($insertSql)->execute([$id, $client['id'], $name, $kind, $image['mime'], db_driver() === 'pgsql' ? base64_encode($image['bytes']) : $image['bytes'], $hash]);
    } catch (PDOException $error) {
        if (!db_duplicate_error($error)) throw $error;
        $query = db()->prepare('SELECT content_hash FROM client_brief_references WHERE id = ? AND client_id = ?');
        $query->execute([$id, $client['id']]);
        $previous = $query->fetchColumn();
        if (!is_string($previous) || !hash_equals($previous, $hash)) json_response(['error' => 'This reference ID is already in use.'], 409);
    }
    json_response(['ok' => true, 'id' => $id], 200);
} catch (InvalidArgumentException $error) {
    json_response(['error' => $error->getMessage()], 422);
} catch (PDOException $error) {
    error_log('Reference upload error: ' . $error->getMessage());
    json_response(['error' => 'Your reference could not be uploaded. Please retry.'], 503);
}
