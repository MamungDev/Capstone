<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/admin-manage.php';
require_once __DIR__ . '/../auth/brief-references.php';
$admin = admin_require();
function html(mixed $v): string { return htmlspecialchars((string) $v, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function field(string $name, mixed $value): void { echo '<input type="hidden" name="'.html($name).'" value="'.html($value).'">'; }
function action_start(string $action, array $values = []): void {
    echo '<form method="post" class="admin-action">'; field('csrf', csrf_token()); field('action', $action);
    foreach ($values as $name => $value) field($name, $value);
}
function reason_fields(bool $password = false): void {
    echo '<label>Reason<textarea name="reason" required minlength="5" maxlength="500" rows="2" placeholder="Explain why this change is needed"></textarea></label>';
    if ($password) echo '<label>Your admin password<input name="admin_password" type="password" autocomplete="current-password" required maxlength="4096"></label>';
}
$tab = admin_text($_GET, 'tab') ?: 'overview';
if (!in_array($tab, ['overview','accounts','projects','activity','security'], true)) $tab = 'overview';
$q = mb_substr(admin_text($_GET, 'q'), 0, 120);
$page = max(1, min(100000, (int) admin_text($_GET, 'page')));
$message = $_SESSION['admin_message_v2'] ?? null; unset($_SESSION['admin_message_v2']);
$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    try {
        require_csrf($_POST['csrf'] ?? null);
        if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 16384) throw new DomainException('Request too large.', 413);
        $message = admin_manage($_POST);
        if (!empty($message['logout'])) { header('Location: login.php', true, 303); exit; }
        $_SESSION['admin_message_v2'] = $message;
        $redirect = 'index.php?tab=' . $tab;
        if (isset($_GET['user']) && ($_POST['action'] ?? '') !== 'delete_user') $redirect .= '&user=' . (int) $_GET['user'];
        if (isset($_GET['project']) && ($_POST['action'] ?? '') !== 'delete_project') $redirect .= '&project=' . rawurlencode(admin_text($_GET,'project'));
        header('Location: ' . $redirect, true, 303); exit;
    } catch (Throwable $e) {
        http_response_code($e instanceof DomainException ? ($e->getCode() ?: 422) : 503);
        $error = $e instanceof DomainException ? $e->getMessage() : 'The change could not be saved. Please try again.';
        if (!$e instanceof DomainException) error_log('Admin management: ' . get_class($e));
    }
}
$rows = []; $total = 0; $pages = 1; $user = null; $project = null; $overview = [];
try {
    $term = '%' . str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $q) . '%';
    if ($tab === 'accounts') {
        $where = " WHERE (u.display_name LIKE ? ESCAPE '!' OR u.email LIKE ? ESCAPE '!')"; $params = [$term, $term];
        $role = admin_text($_GET, 'role');
        if (in_array($role, ['client','artist'], true)) { $where .= ' AND u.role = ?'; $params[] = $role; }
        $from = ' FROM users u LEFT JOIN account_controls c ON c.user_id = u.id';
        $query = db()->prepare('SELECT COUNT(*)' . $from . $where); $query->execute($params); $total = (int) $query->fetchColumn();
        $pages = max(1,(int) ceil($total/20)); $page = min($page,$pages);
        $query = db()->prepare('SELECT u.id, u.email, u.display_name, u.role, u.created_at, COALESCE(c.suspended,0) AS suspended, (SELECT COUNT(*) FROM client_briefs b WHERE b.client_id=u.id) AS briefs' . $from . $where . ' ORDER BY u.id DESC LIMIT 20 OFFSET ' . (($page-1)*20)); $query->execute($params); $rows = $query->fetchAll();
        if (isset($_GET['user'])) {
            $query = db()->prepare('SELECT u.id, u.email, u.display_name, u.role, u.bio, u.created_at, COALESCE(c.suspended,0) AS suspended' . $from . ' WHERE u.id = ?'); $query->execute([(int) $_GET['user']]); $user = $query->fetch();
            if (!$user) throw new DomainException('Account not found.',404);
        }
    } elseif ($tab === 'projects') {
        $where = " WHERE (b.project_name LIKE ? ESCAPE '!' OR u.display_name LIKE ? ESCAPE '!')"; $params = [$term,$term];
        $filter = admin_text($_GET, 'status');
        if (isset(workflow_labels()[$filter])) { $where .= " AND COALESCE(w.status,'submitted') = ?"; $params[] = $filter; }
        $from = ' FROM client_briefs b JOIN users u ON u.id=b.client_id LEFT JOIN brief_workflow w ON w.brief_id=b.id LEFT JOIN users a ON a.id=w.artist_id';
        $query = db()->prepare('SELECT COUNT(*)'.$from.$where); $query->execute($params); $total=(int)$query->fetchColumn();
        $pages=max(1,(int)ceil($total/20)); $page=min($page,$pages);
        $query=db()->prepare("SELECT b.id,b.project_name,b.created_at,u.display_name AS client_name,a.display_name AS artist_name,COALESCE(w.status,'submitted') AS status".$from.$where.' ORDER BY b.created_at DESC,b.id DESC LIMIT 20 OFFSET '.(($page-1)*20)); $query->execute($params); $rows=$query->fetchAll();
        if (isset($_GET['project'])) {
            $query=db()->prepare('SELECT b.id,b.client_id,b.project_name,b.details_json,b.visual_mime,b.created_at,u.display_name AS client_name'.$from.' WHERE b.id=?'); $query->execute([admin_text($_GET,'project')]); $project=$query->fetch();
            if (!$project) throw new DomainException('Project not found.',404);
            $state=workflow_read($project['id']); $details=json_decode($project['details_json'],true,512,JSON_THROW_ON_ERROR);
            $references=brief_reference_list($project,$details);
            $artists=db()->query("SELECT u.id,u.display_name,u.email FROM users u LEFT JOIN account_controls c ON c.user_id=u.id WHERE u.role='artist' AND COALESCE(c.suspended,0)=0 ORDER BY u.display_name,u.id")->fetchAll();
            $query=db()->prepare('SELECT u.id,u.display_name FROM brief_artist_access a JOIN users u ON u.id=a.artist_id WHERE a.brief_id=?'); $query->execute([$project['id']]); $access=$query->fetchAll();
            admin_audit('project_viewed','project',$project['id']);
        }
    } elseif ($tab === 'activity') {
        $where=" WHERE (actor_email LIKE ? ESCAPE '!' OR action LIKE ? ESCAPE '!' OR target_id LIKE ? ESCAPE '!')"; $params=[$term,$term,$term];
        $query=db()->prepare('SELECT COUNT(*) FROM admin_audit'.$where);$query->execute($params);$total=(int)$query->fetchColumn();
        $pages=max(1,(int)ceil($total/20));$page=min($page,$pages);
        $query=db()->prepare('SELECT * FROM admin_audit'.$where.' ORDER BY id DESC LIMIT 20 OFFSET '.(($page-1)*20));$query->execute($params);$rows=$query->fetchAll();
    } elseif ($tab === 'security') {
        $rows=db()->query('SELECT id,email,display_name,active FROM admin_accounts ORDER BY id')->fetchAll();
        $invites=db()->query('SELECT token_hash,email,expires_at FROM admin_invites ORDER BY expires_at DESC')->fetchAll();
    } else {
        $overview['accounts']=(int)db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
        $overview['suspended']=(int)db()->query('SELECT COUNT(*) FROM account_controls WHERE suspended=1')->fetchColumn();
        $overview['projects']=(int)db()->query('SELECT COUNT(*) FROM client_briefs')->fetchColumn();
        $stages=db()->query("SELECT COALESCE(w.status,'submitted') AS status,COUNT(*) AS total FROM client_briefs b LEFT JOIN brief_workflow w ON w.brief_id=b.id GROUP BY COALESCE(w.status,'submitted')")->fetchAll();
        $rows=db()->query('SELECT actor_email,action,target_id,created_at FROM admin_audit ORDER BY id DESC LIMIT 8')->fetchAll();
    }
} catch(Throwable $e) {
    http_response_code($e instanceof DomainException ? ($e->getCode() ?: 422) : 503);
    $error=$e instanceof DomainException?$e->getMessage():'The admin data could not be loaded. Please try again.';
    if (!$e instanceof DomainException) error_log('Admin listing: '.get_class($e));
}
?>
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Site administration &mdash; Mamungkun</title>
<link rel="icon" href="../assets/mamungkun-icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="../Artist/artist.css">
<link rel="stylesheet" href="../assets/css/dropdowns.css?v=<?= filemtime(__DIR__.'/../assets/css/dropdowns.css') ?>">
<link rel="stylesheet" href="../assets/css/password-toggle.css?v=<?= filemtime(__DIR__.'/../assets/css/password-toggle.css') ?>">
<link rel="stylesheet" href="admin.css?v=<?= filemtime(__DIR__.'/admin.css') ?>">
<script src="../assets/js/dropdowns.js?v=<?= filemtime(__DIR__.'/../assets/js/dropdowns.js') ?>" defer></script>
<script src="../assets/js/password-toggle.js?v=<?= filemtime(__DIR__.'/../assets/js/password-toggle.js') ?>" defer></script>
<script src="../assets/js/admin-tools.js" defer></script></head><body class="admin-page"><a class="skip-link" href="#admin-main">Skip to admin content</a><div class="shell">
<nav class="admin-topbar" aria-label="Admin navigation"><a class="brand" href="../index.php"><span class="mark" aria-hidden="true">&#10022;</span>Mamungkun</a><div class="nav"><a href="../index.php">View website</a><span class="admin-identity"><?= html($admin['email']) ?></span><?php action_start('logout'); ?><button class="small-button">Sign out</button></form></div></nav>
<main class="artist-main" id="admin-main">
<?php $headings = ['overview'=>['A space to care.','Keep your creative community and its projects moving forward.'], 'accounts'=>['People behind the ideas.','Look after client and artist accounts in your community.'], 'projects'=>['Ideas in motion.','Review briefs, guide progress, and manage artist access.'], 'activity'=>['Every change, in view.','Follow the decisions and updates made across your workspace.'], 'security'=>['Care starts with trust.','Manage administrator access and your account security.']]; ?>
<header class="admin-heading"><div><p class="eyebrow">Your creative space / Administration</p><h1><?= html($headings[$tab][0]) ?></h1><p class="intro"><?= html($headings[$tab][1]) ?></p></div><div class="admin-welcome"><span aria-hidden="true">&#10022;</span><p>Welcome back,<br><strong><?= html($admin['display_name']) ?></strong></p></div></header>
<nav class="admin-tabs" aria-label="Admin sections"><?php foreach(['overview'=>'Overview','accounts'=>'Accounts','projects'=>'Projects','activity'=>'Activity','security'=>'Admin access'] as $key=>$label): ?><a href="?tab=<?= html($key) ?>" <?= $tab===$key?'aria-current="page"':'' ?>><?= html($label) ?></a><?php endforeach; ?></nav>
<?php if($error): ?><p class="error" role="alert"><?= html($error) ?></p><?php endif; ?>
<?php if($message): ?><section class="admin-card notice" role="status"><p><?= html($message['message']) ?></p><?php if(!empty($message['link'])): ?><a id="private-link" href="<?= html($message['link']) ?>">Open private link</a> <button type="button" data-copy-link="private-link">Copy private link</button><span id="copy-status" aria-live="polite"></span><?php endif; ?></section><?php endif; ?>
<?php if($tab==='overview'): ?>
<section class="stats" aria-label="Community totals"><?php foreach($overview as $label=>$count): ?><div class="stat"><span><?= html(['accounts'=>'Total accounts','suspended'=>'Suspended accounts','projects'=>'Submitted projects'][$label]) ?></span><strong><?= $count ?></strong></div><?php endforeach; ?></section>
<section class="admin-card"><h2>Project stages</h2><p>A little clarity on where the work stands.</p><div class="admin-stages"><?php $stageCounts = array_column($stages??[], 'total', 'status'); foreach(workflow_labels() as $stage=>$label): ?><a href="?tab=projects&amp;status=<?= html($stage) ?>"><?= html($label) ?> <strong><?= (int)($stageCounts[$stage]??0) ?></strong></a><?php endforeach; ?></div></section>
<section class="admin-card"><h2>Recent activity</h2><?php if(!$rows): ?><p class="empty">Your community updates will appear here.</p><?php else: ?><ul class="admin-activity-list"><?php foreach($rows as $row): ?><li><div><strong><?= html(ucfirst(str_replace('_',' ',$row['action']))) ?></strong><small><?= html($row['actor_email']) ?></small></div><time><?= html($row['created_at']) ?></time></li><?php endforeach; ?></ul><?php endif; ?><a href="?tab=activity">View activity history &rarr;</a></section>
<?php elseif($tab==='accounts'): ?>
<?php if($user): ?><section class="admin-card"><h2><?= html($user['display_name']) ?></h2><p><?= html($user['email'].' / '.$user['role']) ?> &middot; <?= $user['suspended']?'Suspended':'Active' ?></p>
<?php action_start('edit_user',['user_id'=>$user['id']]); ?><label>Display name<input name="name" maxlength="100" value="<?= html($user['display_name']) ?>" required></label><label>Bio<textarea name="bio" maxlength="500"><?= html($user['bio']) ?></textarea></label><?php reason_fields(); ?><button class="button">Save profile</button></form>
<?php action_start($user['suspended']?'restore':'suspend',['user_id'=>$user['id']]); reason_fields(); ?><button class="button"><?= $user['suspended']?'Restore account':'Suspend account and sign out sessions' ?></button></form>
<?php action_start('reset_password',['user_id'=>$user['id']]); reason_fields(true); ?><button class="button">Create password reset link</button></form>
<details class="danger-zone"><summary>Permanently delete account</summary><p>This removes this account and all its submitted briefs and attachments.</p><?php action_start('delete_user',['user_id'=>$user['id']]); ?><label>Type the exact account email<input name="confirmation" required autocomplete="off"></label><?php reason_fields(true); ?><button class="button danger">Permanently delete account</button></form></details></section><?php endif; ?>
<form class="filters" method="get"><?php field('tab','accounts'); ?><label>Search<input name="q" value="<?= html($q) ?>" placeholder="Name or email"></label><label>Role<select name="role"><option value="">All roles</option><?php foreach(['client','artist'] as $r): ?><option <?= ($role??'')===$r?'selected':'' ?>><?= html($r) ?></option><?php endforeach; ?></select></label><button class="button">Search</button></form>
<p><?= $total ?> matching account(s)</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Briefs</th><th>Manage</th></tr></thead><tbody><?php if(!$rows): ?><tr><td colspan="6" class="empty">No accounts match your search.</td></tr><?php endif; ?><?php foreach($rows as $row): ?><tr><td><?= html($row['display_name']) ?></td><td><?= html($row['email']) ?></td><td><?= html($row['role']) ?></td><td><?= $row['suspended']?'Suspended':'Active' ?></td><td><?= (int)$row['briefs'] ?></td><td><a href="?tab=accounts&amp;user=<?= (int)$row['id'] ?>">Manage account</a></td></tr><?php endforeach; ?></tbody></table></div>
<?php elseif($tab==='projects'): ?>
<?php if($project): $values=['project_id'=>$project['id'],'version'=>$state['version']]; ?>
<section class="admin-card"><h2><?= html($project['project_name']) ?></h2><p>Client: <?= html($project['client_name']) ?> &middot; <?= html(workflow_labels()[$state['status']]) ?> &middot; Artist: <?= html($state['artist_name']??'Not assigned') ?></p>
<dl><?php foreach($details as $key=>$value): if(!in_array($key,['projectType','idea','audience','goal','format','style','energy','tags'],true)) continue; ?><dt><?= html(ucfirst($key)) ?></dt><dd><?= html(is_array($value)?implode(', ',$value):$value) ?></dd><?php endforeach; ?></dl>
<?php action_start('assign',$values); ?><label>Responsible artist<select name="artist_id" required><option value="">Choose active artist</option><?php foreach($artists as $a): ?><option value="<?= (int)$a['id'] ?>"><?= html($a['display_name'].' / '.$a['email']) ?></option><?php endforeach; ?></select></label><p>Assignment grants viewing access and resets progress to Submitted.</p><?php reason_fields(); ?><button class="button">Assign artist</button></form>
<?php action_start('status',$values); ?><label>Correct project stage<select name="status"><?php foreach(workflow_labels() as $key=>$label): ?><option value="<?= html($key) ?>" <?= $state['status']===$key?'selected':'' ?>><?= html($label) ?></option><?php endforeach; ?></select></label><?php reason_fields(); ?><button class="button">Update stage</button></form>
<h3>Artist access</h3><?php foreach($access as $a): action_start('revoke',$values+['artist_id'=>$a['id']]); ?><strong><?= html($a['display_name']) ?></strong><p>Revoking access also replaces the shared code. Revoking the assigned artist resets this project to Submitted.</p><?php reason_fields(); ?><button class="button">Revoke access</button></form><?php endforeach; ?>
<?php action_start('rotate_code',$values); ?><p>Replace the shared code to prevent new unlocks with the old code. Artists already listed keep their access. The client can copy the new code from their brief.</p><?php reason_fields(); ?><button class="button">Replace project code</button></form>
<h3>References</h3><?php foreach($references as $reference): ?><div class="admin-reference"><a target="_blank" rel="noopener" href="brief-image.php?id=<?= html($project['id']) ?>&amp;reference=<?= html($reference['id']) ?>"><?= html($reference['name']) ?> &middot; View reference</a><?php action_start('delete_reference',$values+['reference_id'=>$reference['id']]); reason_fields(); ?><button class="button danger">Remove reference permanently</button></form></div><?php endforeach; ?>
<details class="danger-zone"><summary>Permanently delete project</summary><?php action_start('delete_project',$values); ?><label>Type the project name exactly<input name="confirmation" required></label><?php reason_fields(true); ?><button class="button danger">Delete project and references</button></form></details></section>
<?php endif; ?>
<form method="get" class="filters"><?php field('tab','projects'); ?><label>Search<input name="q" value="<?= html($q) ?>" placeholder="Project or client"></label><label>Stage<select name="status"><option value="">All stages</option><?php foreach(workflow_labels() as $key=>$label): ?><option value="<?= html($key) ?>" <?= ($filter??'')===$key?'selected':'' ?>><?= html($label) ?></option><?php endforeach; ?></select></label><button class="button">Search</button></form>
<p><?= $total ?> matching project(s)</p><div class="table-wrap"><table><thead><tr><th>Project</th><th>Client</th><th>Artist</th><th>Stage</th><th>Manage</th></tr></thead><tbody><?php if(!$rows): ?><tr><td colspan="5" class="empty">No projects match your search.</td></tr><?php endif; ?><?php foreach($rows as $row): ?><tr><td><?= html($row['project_name']) ?></td><td><?= html($row['client_name']) ?></td><td><?= html($row['artist_name']??'Not assigned') ?></td><td><?= html(workflow_labels()[$row['status']]) ?></td><td><a href="?tab=projects&amp;project=<?= html($row['id']) ?>">Review project</a></td></tr><?php endforeach; ?></tbody></table></div>
<?php elseif($tab==='activity'): ?>
<p>Administrative actions and private project views are recorded here. Times use the database timezone.</p><form method="get" class="filters"><?php field('tab','activity'); ?><label>Search<input name="q" value="<?= html($q) ?>" placeholder="Admin email, action, or record ID"></label><button class="button">Search</button></form>
<?php if(!$rows): ?><section class="admin-card"><p class="empty">No activity matches your search.</p></section><?php endif; ?><?php foreach($rows as $row): ?><article class="admin-card"><strong><?= html(ucfirst(str_replace('_',' ',$row['action']))) ?></strong><p><?= html($row['actor_email'].' / '.$row['created_at'].' / '.$row['target_type'].' '.$row['target_id']) ?></p><p><?= html($row['reason']) ?></p><details><summary>Previous and new values</summary><pre>Before: <?= html($row['before_json']) ?>
After: <?= html($row['after_json']) ?></pre></details></article><?php endforeach; ?>
<?php elseif($tab==='security'): ?>
<section class="admin-card"><h2>Administrators</h2><p>Each administrator has full management access and must use an authenticator. Your own account cannot be disabled here.</p><?php foreach($rows as $row): ?><p><strong><?= html($row['display_name']) ?></strong> <?= html($row['email']) ?> &middot; <?= $row['active']?'Active':'Disabled' ?></p><?php if((int)$row['id']!==(int)$admin['id']): action_start($row['active']?'disable_admin':'enable_admin',['admin_id'=>$row['id']]); reason_fields(true); ?><button class="button"><?= $row['active']?'Disable administrator':'Enable administrator' ?></button></form><?php endif; endforeach; ?></section>
<section class="admin-card"><h2>Invite administrator</h2><?php action_start('invite_admin'); ?><label>Name<input name="name" required maxlength="100"></label><label>Email<input name="email" type="email" required maxlength="254"></label><?php reason_fields(true); ?><button class="button">Create private invitation</button></form></section>
<section class="admin-card"><h2>Pending invitations</h2><?php if(empty($invites)): ?><p class="empty">No pending invitations. Your admin team is up to date.</p><?php endif; ?><?php foreach($invites??[] as $invite): ?><p><?= html($invite['email']) ?> &middot; <?= (int)$invite['expires_at']>time()?'Pending':'Expired' ?></p><?php action_start('revoke_invite',['invite_id'=>$invite['token_hash']]); reason_fields(); ?><button class="button">Revoke invitation</button></form><?php endforeach; ?></section>
<section class="admin-card"><h2>Change your admin password</h2><?php action_start('change_password'); ?><label>New password<input name="new_password" type="password" required minlength="12" maxlength="4096" autocomplete="new-password"></label><label>Confirm new password<input name="confirmation" type="password" required minlength="12" maxlength="4096" autocomplete="new-password"></label><?php reason_fields(true); ?><button class="button">Change password and sign out all sessions</button></form><p>Keep your recovery codes safe. If you lose both your authenticator and recovery codes, the server owner must recover your account.</p></section>
<?php endif; ?>
<?php if(in_array($tab,['accounts','projects','activity'],true)): ?><nav class="pagination" aria-label="Result pages"><span>Page <?= $page ?> of <?= $pages ?></span><div><?php if($page>1): ?><a href="?<?= html(http_build_query(['tab'=>$tab,'q'=>$q,'role'=>$role??'','status'=>$filter??'','page'=>$page-1])) ?>">Previous</a><?php endif; ?> <?php if($page<$pages): ?><a href="?<?= html(http_build_query(['tab'=>$tab,'q'=>$q,'role'=>$role??'','status'=>$filter??'','page'=>$page+1])) ?>">Next</a><?php endif; ?></div></nav><?php endif; ?>
</main></div></body></html>
