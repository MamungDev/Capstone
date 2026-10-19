<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    json_response(['error' => 'Method not allowed.'], 405);
}
$client = current_user();
if (!$client) json_response(['error' => 'Sign in again to submit. Your draft is still in this browser.'], 401);
if ($client['role'] !== 'client') json_response(['error' => 'Only clients can submit briefs.'], 403);
$limit = 7 * 1024 * 1024;
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) json_response(['error' => 'This brief is too large. Use a smaller image.'], 413);
$raw = file_get_contents('php://input', false, null, 0, $limit + 1);
if ($raw === false || strlen($raw) > $limit) json_response(['error' => 'This brief is too large.'], 413);
$input = json_decode($raw, true);
if (!is_array($input)) json_response(['error' => 'Invalid request.'], 400);
require_csrf($input['csrf'] ?? null);
session_write_close();
$id = $input['submissionId'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Invalid submission ID. Refresh and try again.'], 422);
$source = $input['brief'] ?? null;
if (!is_array($source)) json_response(['error' => 'Add your brief details.'], 422);
$details = [];
foreach (['projectName' => 120, 'projectType' => 80, 'idea' => 5000, 'audience' => 1000, 'goal' => 1000,
    'format' => 80, 'style' => 80, 'energy' => 80, 'referenceName' => 255] as $field => $max) {
    $value = $source[$field] ?? '';
    if (!is_string($value) || mb_strlen($value) > $max) json_response(['error' => "$field must be text of at most $max characters."], 422);
    $details[$field] = trim($value);
}
if ($details['projectName'] === '' || $details['idea'] === '') json_response(['error' => 'Add a project name and description.'], 422);
$tags = $source['tags'] ?? [];
if (!is_array($tags) || !array_is_list($tags) || count($tags) > 8) json_response(['error' => 'Choose up to eight keywords.'], 422);
foreach ($tags as $tag) {
    if (!is_string($tag) || !in_array($tag, ['Warm', 'Playful', 'Editorial', 'Minimal', 'Surprising', 'Bold', 'Elegant', 'Experimental'], true)) {
        json_response(['error' => 'Choose keywords from the available options.'], 422);
    }
}
$details['tags'] = array_values(array_unique($tags));
$visual = $source['reference'] ?? $source['sketch'] ?? null;
$mime = null;
$bytes = null;
$details['visualKind'] = $visual === null ? null : (!empty($source['reference']) ? 'reference' : 'sketch');
if ($visual !== null) {
    if (!is_string($visual) || !preg_match('~^data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$~D', $visual, $match)) {
        json_response(['error' => 'Use a PNG, JPEG, WebP, or GIF reference.'], 422);
    }
    $mime = $match[1];
    $bytes = base64_decode($match[2], true);
    if ($bytes === false || strlen($bytes) > 5 * 1024 * 1024) json_response(['error' => 'The reference must be smaller than 5 MB.'], 422);
    $image = @getimagesizefromstring($bytes);
    if (!$image || ($image['mime'] ?? '') !== $mime || $image[0] * $image[1] > 40000000) {
        json_response(['error' => 'The reference is not a valid image, or its dimensions are too large.'], 422);
    }
}
$json = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
$hash = hash('sha256', $json . "\0" . ($mime ?? '') . "\0" . ($bytes ?? ''));
try {
    try {
        $insert = db()->prepare('INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash, visual_mime, visual_data) VALUES (?, ?, ?, ?, ?, ?, ?)');
        $insert->execute([$id, $client['id'], $details['projectName'], $json, $hash, $mime, $bytes]);
        $status = 201;
    } catch (PDOException $exception) {
        if (($exception->errorInfo[1] ?? null) !== 1062) throw $exception;
        // A lost response can be retried without creating a second brief.
        $existing = db()->prepare('SELECT payload_hash FROM client_briefs WHERE id = ? AND client_id = ?');
        $existing->execute([$id, $client['id']]);
        $previous = $existing->fetchColumn();
        if (!is_string($previous) || !hash_equals($previous, $hash)) {
            json_response(['error' => 'This submission ID was already used for another brief. Start a new brief to submit changes.'], 409);
        }
        $status = 200;
    }
    json_response(['ok' => true, 'id' => $id, 'url' => 'submitted.php?id=' . $id], $status);
} catch (PDOException $exception) {
    error_log('Brief submission error: ' . $exception->getMessage());
    json_response(['error' => 'Your brief could not be saved. Your draft is retained; please try again.'], 503);
}
