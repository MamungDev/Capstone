<?php
declare(strict_types=1);
require_once __DIR__ . '/admin.php';

// All invitation changes share the sign-in lock so revocation cannot race provisioning.
function admin_invitation_manage(array $input, string $action, string $reason): array {
    $pdo = db(); $pdo->beginTransaction();
    try {
        $pdo->query('SELECT id FROM admin_security_lock WHERE id = 1 FOR UPDATE');
        $actor = admin_current();
        if (!$actor) throw new DomainException('Your admin session expired. Sign in again.', 403);
        if ($action !== 'invite_admin' && !admin_is_owner($actor)) {
            throw new DomainException('Only ' . admin_owner_email() . ' can review administrator invitations.', 403);
        }
        $email = is_string($input['email'] ?? null) ? mb_strtolower(trim($input['email'])) : '';
        if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^[^@]+@gmail\.com$/D', $email)) {
            throw new DomainException('Enter a valid Gmail address.', 422);
        }
        $q = $pdo->prepare('SELECT * FROM admin_access_requests WHERE email = ? FOR UPDATE');
        $q->execute([$email]); $request = $q->fetch();
        if ($action === 'invite_admin') {
            if (in_array($email, admin_allowed_emails(), true) || $email === admin_owner_email()) {
                throw new DomainException('That account is already on the site administrator allowlist.', 409);
            }
            if ($request && in_array($request['status'], ['pending', 'approved'], true)) {
                throw new DomainException('That Gmail already has a pending or approved invitation.', 409);
            }
            $q = $pdo->prepare('SELECT active FROM admin_accounts WHERE email = ?');
            $q->execute([$email]); $existing = $q->fetch();
            if ($existing && (!$request || $request['status'] !== 'revoked')) {
                throw new DomainException('That administrator already exists. Ask the owner to manage their access.', 409);
            }
            if ($request) {
                $pdo->prepare("UPDATE admin_access_requests SET requested_by = ?, requested_by_email = ?, reason = ?, status = 'pending', reviewed_by_email = NULL, review_reason = NULL, reviewed_at = NULL, created_at = CURRENT_TIMESTAMP, version = version + 1 WHERE email = ?")
                    ->execute([$actor['id'], $actor['email'], $reason, $email]);
            } else {
                $pdo->prepare('INSERT INTO admin_access_requests (email, requested_by, requested_by_email, reason) VALUES (?, ?, ?, ?)')
                    ->execute([$email, $actor['id'], $actor['email'], $reason]);
            }
            admin_audit('admin_invitation_requested', 'admin', $email, ['status' => $request['status'] ?? null], ['status' => 'pending'], $reason, $actor);
            $result = ['message' => 'Invitation submitted for approval by ' . admin_owner_email() . '. Access is pending. No email has been sent.'];
        } else {
            $version = filter_var($input['version'] ?? null, FILTER_VALIDATE_INT);
            if (!$request) throw new DomainException('Invitation not found.', 404);
            if ($version === false || $version === null || $version !== (int) $request['version']) {
                throw new DomainException('This invitation changed. Refresh before trying again.', 409);
            }
            $status = match ($action) {
                'approve_admin_invite' => 'approved',
                'reject_admin_invite' => 'rejected',
                'revoke_admin_invite' => 'revoked',
                default => throw new DomainException('Unknown invitation action.', 422),
            };
            $expected = $status === 'revoked' ? 'approved' : 'pending';
            if ($request['status'] !== $expected) throw new DomainException('This invitation has already been reviewed. Refresh the page.', 409);
            $pdo->prepare('UPDATE admin_access_requests SET status = ?, reviewed_by_email = ?, review_reason = ?, reviewed_at = CURRENT_TIMESTAMP, version = version + 1 WHERE email = ?')
                ->execute([$status, $actor['email'], $reason, $email]);
            if ($status === 'revoked' || $status === 'approved') {
                $pdo->prepare('UPDATE admin_accounts SET active = ?, session_version = session_version + 1 WHERE email = ?')
                    ->execute([$status === 'approved' ? 1 : 0, $email]);
            }
            admin_audit('admin_invitation_' . $status, 'admin', $email, ['status' => $request['status']], ['status' => $status], $reason, $actor);
            $result = ['message' => match ($status) {
                'approved' => 'Invitation approved. ' . $email . ' can now sign in with Google from the Admin link. Share the sign-in link with them; no email has been sent.',
                'rejected' => 'Invitation rejected. This Gmail has not been granted administrator access.',
                default => 'Invitation revoked. This Gmail can no longer use its invitation to access the admin workspace.',
            }];
        }
        $pdo->commit();
        return $result;
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
}
