<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';
$artist = current_user();
if (!$artist) json_response(['error' => 'Sign in to view this reference.'], 401);
if ($artist['role'] !== 'artist') json_response(['error' => 'Artist access required.'], 403);
$id = $_GET['id'] ?? '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Reference not found.'], 404);
try {
    require_once __DIR__ . '/../auth/brief-references.php';
    $referenceId = $_GET['reference'] ?? null;
    if ($referenceId !== null && (!is_string($referenceId) || !preg_match('/^[a-f0-9]{32}$/D', $referenceId))) json_response(['error' => 'Reference not found.'], 404);
    // Authorization is part of both queries, including direct attachment URLs.
    $access = ' JOIN brief_artist_access a ON a.brief_id = b.id WHERE b.id = ? AND a.artist_id = ?';
    $visualColumn = db_driver() === 'pgsql' ? "encode(r.image_data, 'base64') AS visual_data" : 'r.image_data AS visual_data';
    $query = db()->prepare('SELECT r.mime AS visual_mime, ' . $visualColumn . ' FROM client_brief_references r JOIN client_briefs b ON b.id = r.brief_id' . $access . ($referenceId !== null ? ' AND r.id = ?' : '') . ' ORDER BY r.position, r.id LIMIT 1');
    $params = [$id, $artist['id']];
    if ($referenceId !== null) $params[] = $referenceId;
    $query->execute($params);
    $row = $query->fetch();
    if (!$row && $referenceId === null) {
        $legacyColumn = db_driver() === 'pgsql' ? "encode(b.visual_data, 'base64') AS visual_data" : 'b.visual_data';
        $query = db()->prepare('SELECT b.visual_mime, ' . $legacyColumn . ' FROM client_briefs b' . $access);
        $query->execute([$id, $artist['id']]);
        $row = $query->fetch();
    }
    if (!$row || $row['visual_data'] === null) json_response(['error' => 'Reference not found.'], 404);
    if (db_driver() === 'pgsql') $row['visual_data'] = base64_decode((string) $row['visual_data'], true);
    send_brief_reference($row, $referenceId ?? $id);
} catch (PDOException $exception) {
    error_log('Artist reference error: ' . $exception->getMessage());
    json_response(['error' => 'Unable to load this reference. Please try again.'], 503);
}
