<?php
declare(strict_types=1);
require_once __DIR__ . '/admin.php';
require_once __DIR__ . '/admin-invitations.php';
require_once __DIR__ . '/workflow.php';

function admin_text(array $input, string $key): string { return is_string($input[$key] ?? null) ? trim($input[$key]) : ''; }

function admin_manage(array $input): array
{
    $admin = admin_require();
    $action = admin_text($input, 'action');
    if ($action === 'logout') { admin_audit('logout', 'admin', (string) $admin['id']); admin_logout(); return ['message' => 'Signed out.', 'logout' => true]; }
    $reason = admin_reason($input['reason'] ?? null);
    if (in_array($action, ['invite_admin', 'approve_admin_invite', 'reject_admin_invite', 'revoke_admin_invite'], true)) {
        return admin_invitation_manage($input, $action, $reason);
    }
    if ($action === 'delete_user') {
        admin_delete_user((int) admin_text($input, 'user_id'), admin_text($input, 'confirmation'), $reason);
        return ['message' => 'Account and its submitted briefs deleted.'];
    }
    $pdo = db(); $pdo->beginTransaction();
    $result = ['message' => 'Change saved.'];
    try {
        if (in_array($action, ['suspend', 'restore', 'edit_user', 'reset_password'], true)) {
            $id = (int) admin_text($input, 'user_id');
            $q = $pdo->prepare('SELECT id, email, display_name, role, bio FROM users WHERE id = ? FOR UPDATE'); $q->execute([$id]); $user = $q->fetch();
            if (!$user) throw new DomainException('Account not found.', 404);
            admin_control_row($id);
            if ($action === 'suspend' || $action === 'restore') {
                $before = account_control($id);
                $suspended = $action === 'suspend' ? 1 : 0;
                $pdo->prepare('UPDATE account_controls SET suspended = ?, session_version = session_version + 1 WHERE user_id = ?')->execute([$suspended, $id]);
                admin_audit('account_' . $action, 'user', (string) $id, $before, ['suspended' => $suspended], $reason);
            } elseif ($action === 'edit_user') {
                $name = admin_text($input, 'name'); $bio = admin_text($input, 'bio');
                if ($name === '' || mb_strlen($name) > 100 || mb_strlen($bio) > 500 || preg_match('/[\x00-\x1f\x7f]/u', $name)) throw new DomainException('Enter a name up to 100 characters and bio up to 500.', 422);
                $pdo->prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?')->execute([$name, $bio ?: null, $id]);
                admin_audit('account_edited', 'user', (string) $id, ['name' => $user['display_name'], 'bio' => $user['bio']], ['name' => $name, 'bio' => $bio], $reason);
            } else {
                $token = bin2hex(random_bytes(32));
                $pdo->prepare('DELETE FROM password_reset_tokens WHERE user_id = ?')->execute([$id]);
                $pdo->prepare('INSERT INTO password_reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)')->execute([hash('sha256', $token), $id, time() + 1800]);
                admin_audit('password_reset_issued', 'user', (string) $id, [], ['expires_in_minutes' => 30], $reason);
                $result = ['message' => 'Reset link created. Copy it and share privately with the verified account owner. It expires in 30 minutes and works once. No email has been sent.', 'link' => '../auth/reset-password.php?token=' . $token];
            }
        } elseif (in_array($action, ['assign', 'status', 'revoke', 'rotate_code', 'delete_reference', 'delete_project'], true)) {
            $id = admin_text($input, 'project_id');
            $q = $pdo->prepare('SELECT id, client_id, project_name, details_json, visual_mime FROM client_briefs WHERE id = ? FOR UPDATE'); $q->execute([$id]); $brief = $q->fetch();
            if (!$brief) throw new DomainException('Project not found.', 404);
            $state = workflow_read($id);
            $version = filter_var($input['version'] ?? null, FILTER_VALIDATE_INT);
            if ($version === false || $version === null || $version !== (int) $state['version']) throw new DomainException('This project changed. Refresh before trying again.', 409);
            $new = ['artist_id' => $state['artist_id'], 'status' => $state['status']];
            if ($action === 'delete_project') {
                if (admin_text($input, 'confirmation') !== $brief['project_name']) throw new DomainException('Type the project name exactly to confirm deletion.', 422);
                $pdo->prepare('DELETE FROM client_briefs WHERE id = ?')->execute([$id]);
                admin_audit('project_deleted', 'project', $id, ['name' => $brief['project_name'], 'client_id' => $brief['client_id']], [], $reason);
            } else {
                if ($action === 'assign') {
                    $artist = (int) admin_text($input, 'artist_id');
                    $q = $pdo->prepare("SELECT u.id FROM users u LEFT JOIN account_controls c ON c.user_id = u.id WHERE u.id = ? AND u.role = 'artist' AND COALESCE(c.suspended, 0) = 0"); $q->execute([$artist]);
                    if (!$q->fetchColumn()) throw new DomainException('Choose an active artist.', 422);
                    $sql = db_driver() === 'pgsql' ? 'INSERT INTO brief_artist_access VALUES (?, ?) ON CONFLICT DO NOTHING' : 'INSERT IGNORE INTO brief_artist_access VALUES (?, ?)';
                    $pdo->prepare($sql)->execute([$id, $artist]);
                    $new = ['artist_id' => $artist, 'status' => 'submitted'];
                } elseif ($action === 'status') {
                    $status = admin_text($input, 'status');
                    if (!isset(workflow_labels()[$status])) throw new DomainException('Choose a valid project stage.', 422);
                    if ($status !== 'submitted' && !$state['artist_id']) throw new DomainException('Assign an artist before advancing this project.', 422);
                    $new['status'] = $status;
                } elseif ($action === 'revoke') {
                    $artist = (int) admin_text($input, 'artist_id');
                    $pdo->prepare('DELETE FROM brief_artist_access WHERE brief_id = ? AND artist_id = ?')->execute([$id, $artist]);
                    if ((int) $state['artist_id'] === $artist) $new = ['artist_id' => null, 'status' => 'submitted'];
                    // Rotation prevents the removed artist from reusing the old shared code.
                    $pdo->prepare('DELETE FROM brief_access_codes WHERE brief_id = ?')->execute([$id]);
                    client_brief_code($id, (int) $brief['client_id']);
                    admin_audit('artist_access_revoked', 'project', $id, ['artist_id' => $artist], ['code_replaced' => true], $reason);
                } elseif ($action === 'rotate_code') {
                    $pdo->prepare('DELETE FROM brief_access_codes WHERE brief_id = ?')->execute([$id]);
                    client_brief_code($id, (int) $brief['client_id']);
                } elseif ($action === 'delete_reference') {
                    $reference = admin_text($input, 'reference_id');
                    $q = $pdo->prepare('SELECT name FROM client_brief_references WHERE id = ? AND brief_id = ?'); $q->execute([$reference, $id]); $name = $q->fetchColumn();
                    if ($reference !== '' && $name === false) throw new DomainException('Reference not found.', 404);
                    $pdo->prepare('DELETE FROM client_brief_references WHERE id = ? AND brief_id = ?')->execute([$reference, $id]);
                    $q = $pdo->prepare('SELECT name, mime, kind FROM client_brief_references WHERE brief_id = ? ORDER BY position, id'); $q->execute([$id]); $remaining = $q->fetchAll();
                    $details = json_decode($brief['details_json'], true, 512, JSON_THROW_ON_ERROR);
                    $details['referenceCount'] = count($remaining);
                    $details['referenceName'] = $remaining[0]['name'] ?? '';
                    $details['visualKind'] = $remaining[0]['kind'] ?? null;
                    $pdo->prepare('UPDATE client_briefs SET details_json = ?, visual_mime = ?, visual_data = NULL WHERE id = ?')->execute([json_encode($details), $remaining[0]['mime'] ?? null, $id]);
                    admin_audit('reference_removed', 'project', $id, ['reference_id' => $reference, 'name' => $name ?: 'Legacy reference'], [], $reason);
                }
                $sql = db_driver() === 'pgsql' ? 'INSERT INTO brief_workflow (brief_id, artist_id, status, version) VALUES (?, ?, ?, ?) ON CONFLICT (brief_id) DO UPDATE SET artist_id = EXCLUDED.artist_id, status = EXCLUDED.status, version = EXCLUDED.version, updated_at = CURRENT_TIMESTAMP' : 'INSERT INTO brief_workflow (brief_id, artist_id, status, version) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE artist_id = VALUES(artist_id), status = VALUES(status), version = VALUES(version), updated_at = CURRENT_TIMESTAMP';
                $pdo->prepare($sql)->execute([$id, $new['artist_id'], $new['status'], $version + 1]);
                admin_audit('project_' . $action, 'project', $id, ['artist_id' => $state['artist_id'], 'status' => $state['status'], 'version' => $version], $new + ['version' => $version + 1], $reason);
            }
        } elseif (in_array($action, ['disable_admin', 'enable_admin'], true)) {
            $pdo->query('SELECT id FROM admin_security_lock WHERE id = 1 FOR UPDATE');
            $current = admin_current();
            if (!$current || !admin_is_owner($current)) throw new DomainException('Only the owner can enable or disable administrators.', 403);
            $id = (int) admin_text($input, 'admin_id');
            if ($id === (int) $admin['id']) throw new DomainException('You cannot disable your own account.', 422);
            $q = $pdo->prepare('SELECT id, email, active FROM admin_accounts WHERE id = ? FOR UPDATE'); $q->execute([$id]); $other = $q->fetch();
            if (!$other) throw new DomainException('Administrator not found.', 404);
            if (admin_is_owner($other)) throw new DomainException('The owner account cannot be disabled.', 403);
            $active = $action === 'enable_admin' ? 1 : 0;
            $pdo->prepare('UPDATE admin_accounts SET active = ?, session_version = session_version + 1 WHERE id = ?')->execute([$active, $id]);
            admin_audit($action, 'admin', (string) $id, $other, ['active' => $active], $reason);
        } else throw new DomainException('Unknown admin action.', 422);
        $pdo->commit();
        if (!empty($result['logout'])) admin_logout();
        return $result;
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
