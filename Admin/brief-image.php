<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin.php';
require_once __DIR__ . '/../auth/brief-references.php';
admin_require();
$id = $_GET['id'] ?? '';
$referenceId = $_GET['reference'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || ($referenceId !== null && (!is_string($referenceId) || ($referenceId !== '' && !preg_match('/^[a-f0-9]{32}$/D', $referenceId))))) json_response(['error' => 'Reference not found.'], 404);
$access = ' WHERE b.id = ?';
$visualColumn = db_driver() === 'pgsql' ? "encode(r.image_data, 'base64') AS visual_data" : 'r.image_data AS visual_data';
$query = db()->prepare('SELECT r.mime AS visual_mime, ' . $visualColumn . ' FROM client_brief_references r JOIN client_briefs b ON b.id = r.brief_id' . $access . ($referenceId !== null && $referenceId !== '' ? ' AND r.id = ?' : '') . ' ORDER BY r.position, r.id LIMIT 1');
$params = [$id];
if ($referenceId !== null && $referenceId !== '') $params[] = $referenceId;
$query->execute($params);
$row = $query->fetch();
if (!$row && ($referenceId === null || $referenceId === '')) {
    $legacyColumn = db_driver() === 'pgsql' ? "encode(b.visual_data, 'base64') AS visual_data" : 'b.visual_data';
    $query = db()->prepare('SELECT b.visual_mime, ' . $legacyColumn . ' FROM client_briefs b WHERE b.id = ?');
    $query->execute([$id]); $row = $query->fetch();
}
if (!$row || $row['visual_data'] === null) json_response(['error' => 'Reference not found.'], 404);
if (db_driver() === 'pgsql') $row['visual_data'] = base64_decode((string) $row['visual_data'], true);
admin_audit('reference_viewed', 'project', $id, [], ['reference_id' => $referenceId ?? 'legacy']);
send_brief_reference($row, $referenceId ?: $id);
