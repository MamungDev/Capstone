<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
if (!isset($profileRole) || !in_array($profileRole, ['artist', 'client'], true)) json_response(['error' => 'Not found.'], 404);
$profileUser = current_user();
if (!$profileUser || $profileUser['role'] !== $profileRole) json_response(['error' => 'Please sign in to view your profile photo.'], 401);
try {
    $statement = db()->prepare('SELECT photo_mime, photo_data FROM users WHERE id = ? AND role = ?');
    $statement->execute([$profileUser['id'], $profileRole]);
    $photo = $statement->fetch();
    if (!$photo || $photo['photo_data'] === null) json_response(['error' => 'No profile photo.'], 404);
    if (!in_array($photo['photo_mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) {
        json_response(['error' => 'Unsupported photo.'], 415);
    }
    header('Content-Type: ' . $photo['photo_mime']);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    echo $photo['photo_data'];
} catch (PDOException $exception) {
    error_log('Profile photo error: ' . $exception->getMessage());
    json_response(['error' => 'Unable to load your profile photo.'], 503);
}
