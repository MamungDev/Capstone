<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

// Existing installations receive the additive tables without changing saved briefs.
ensure_database_schema();

function client_brief_code(string $id, int $clientId): string
{
    $query = db()->prepare('SELECT id FROM client_briefs WHERE id = ? AND client_id = ?');
    $query->execute([$id, $clientId]);
    if (!$query->fetchColumn()) throw new RuntimeException('Brief not found.');
    // Backfill older briefs only for their owner. They stay private until shared.
    $sql = db_driver() === 'pgsql'
        ? 'INSERT INTO brief_access_codes (brief_id, access_code) VALUES (?, ?) ON CONFLICT (brief_id) DO NOTHING'
        : 'INSERT INTO brief_access_codes (brief_id, access_code) VALUES (?, ?) ON DUPLICATE KEY UPDATE brief_id = brief_id';
    $query = db()->prepare($sql);
    $query->execute([$id, bin2hex(random_bytes(16))]);
    $query = db()->prepare('SELECT access_code FROM brief_access_codes WHERE brief_id = ?');
    $query->execute([$id]);
    return (string) $query->fetchColumn();
}
