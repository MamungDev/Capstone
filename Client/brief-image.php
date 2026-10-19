<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
$client = current_user();
if (!$client) json_response(['error' => 'Sign in to view this image.'], 401);
if ($client['role'] !== 'client') json_response(['error' => 'Client access required.'], 403);
$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Image not found.'], 404);
try {
    $query = db()->prepare('SELECT visual_mime, visual_data FROM client_briefs WHERE id = ? AND client_id = ?');
    $query->execute([$id, $client['id']]);
    $row = $query->fetch();
    if (!$row || $row['visual_data'] === null) json_response(['error' => 'Image not found.'], 404);
    header('Content-Type: ' . $row['visual_mime']);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $row['visual_data'];
} catch (PDOException $exception) {
    error_log('Brief image error: ' . $exception->getMessage());
    json_response(['error' => 'Unable to load this image. Try again later.'], 503);
}
