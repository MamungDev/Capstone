<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
$artist = current_user();
if (!$artist) json_response(['error' => 'Sign in to view this reference.'], 401);
if ($artist['role'] !== 'artist') json_response(['error' => 'Artist access required.'], 403);
$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Reference not found.'], 404);
try {
    $query = db()->prepare('SELECT visual_mime, visual_data FROM client_briefs WHERE id = ?');
    $query->execute([$id]);
    $row = $query->fetch();
    if (!$row || $row['visual_data'] === null) json_response(['error' => 'Reference not found.'], 404);
    $extensions = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!isset($extensions[$row['visual_mime']])) json_response(['error' => 'Unsupported reference type.'], 415);
    header('Content-Type: ' . $row['visual_mime']);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    if (($_GET['download'] ?? '') === '1') {
        header('Content-Disposition: attachment; filename="reference-' . $id . '.' . $extensions[$row['visual_mime']] . '"');
    }
    echo $row['visual_data'];
} catch (PDOException $exception) {
    error_log('Artist reference error: ' . $exception->getMessage());
    json_response(['error' => 'Unable to load this reference. Please try again.'], 503);
}
