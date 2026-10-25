<?php
declare(strict_types=1);
require_once __DIR__ . '/brief-access.php';

function workflow_labels(): array
{
    return ['submitted' => 'Submitted', 'accepted' => 'Accepted', 'in_progress' => 'In progress', 'review' => 'Review', 'completed' => 'Completed'];
}

function workflow_read(string $id): array
{
    $query = db()->prepare('SELECT w.*, u.display_name AS artist_name FROM brief_workflow w LEFT JOIN users u ON u.id = w.artist_id WHERE w.brief_id = ?');
    $query->execute([$id]);
    return $query->fetch() ?: ['artist_id' => null, 'artist_name' => null, 'status' => 'submitted', 'version' => 0];
}

// Lock the parent brief even when it has no workflow row yet. Version checks
// prevent stale forms from overwriting a reassignment or a newer status.
function workflow_change(array $user, string $id, string $action, int $version, int $artistId = 0): void
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $query = $pdo->prepare('SELECT client_id FROM client_briefs WHERE id = ? FOR UPDATE');
        $query->execute([$id]);
        $owner = $query->fetchColumn();
        $isOwner = $user['role'] === 'client' && (int) $owner === (int) $user['id'];
        $access = $pdo->prepare('SELECT 1 FROM brief_artist_access WHERE brief_id = ? AND artist_id = ?');
        $access->execute([$id, $user['id']]);
        if ($owner === false || (!$isOwner && ($user['role'] !== 'artist' || !$access->fetchColumn()))) {
            throw new DomainException('Project not found.', 404);
        }
        $state = workflow_read($id);
        if ((int) $state['version'] !== $version) throw new DomainException('This project changed. Refresh the brief before trying again.', 409);
        if ($action === 'assign') {
            if (!$isOwner) throw new DomainException('Only the client can assign an artist.', 403);
            if ($state['status'] === 'completed') throw new DomainException('Completed projects cannot be reassigned.', 409);
            $query = $pdo->prepare("SELECT 1 FROM brief_artist_access a JOIN users u ON u.id = a.artist_id WHERE a.brief_id = ? AND a.artist_id = ? AND u.role = 'artist'");
            $query->execute([$id, $artistId]);
            if (!$query->fetchColumn()) throw new DomainException('Choose an artist who has unlocked this brief.', 422);
            if ((int) $state['artist_id'] === $artistId) throw new DomainException('That artist is already assigned.', 409);
            $state['artist_id'] = $artistId;
            $state['status'] = 'submitted';
        } else {
            $transitions = [
                'accept' => ['submitted', 'accepted', 'artist'],
                'start' => ['accepted', 'in_progress', 'artist'],
                'review' => ['in_progress', 'review', 'artist'],
                'revise' => ['review', 'in_progress', 'client'],
                'complete' => ['review', 'completed', 'client'],
            ];
            if (!isset($transitions[$action])) throw new DomainException('Unknown project action.', 422);
            [$from, $to, $role] = $transitions[$action];
            if ($user['role'] !== $role || ($role === 'client' ? !$isOwner : (int) $state['artist_id'] !== (int) $user['id'])) {
                throw new DomainException('You cannot make this project update.', 403);
            }
            if ($state['status'] !== $from || !$state['artist_id']) throw new DomainException('This action is unavailable at the current project stage.', 409);
            $state['status'] = $to;
        }
        $sql = db_driver() === 'pgsql'
            ? 'INSERT INTO brief_workflow (brief_id, artist_id, status, version) VALUES (?, ?, ?, ?) ON CONFLICT (brief_id) DO UPDATE SET artist_id = EXCLUDED.artist_id, status = EXCLUDED.status, version = EXCLUDED.version, updated_at = CURRENT_TIMESTAMP'
            : 'INSERT INTO brief_workflow (brief_id, artist_id, status, version) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE artist_id = VALUES(artist_id), status = VALUES(status), version = VALUES(version), updated_at = CURRENT_TIMESTAMP';
        $pdo->prepare($sql)->execute([$id, $state['artist_id'], $state['status'], $version + 1]);
        $pdo->commit();
    } catch (Throwable $error) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $error;
    }
}
