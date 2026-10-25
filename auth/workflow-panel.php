<?php
// Included only after the containing page has checked access to this brief.
require_once __DIR__ . '/workflow.php';
$workflow = workflow_read($brief['id']);
$workflowOwner = isset($client);
$workflowUser = $workflowOwner ? $client : $artist;
$workflowEscape = static fn ($value) => htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
$workflowActions = [];
if ($workflowOwner && $workflow['status'] === 'review' && $workflow['artist_id']) {
    $workflowActions = ['revise' => 'Request revisions', 'complete' => 'Approve and complete'];
} elseif (!$workflowOwner && (int) $workflow['artist_id'] === (int) $workflowUser['id']) {
    $workflowActions = match ($workflow['status']) {
        'submitted' => ['accept' => 'Accept project'],
        'accepted' => ['start' => 'Start work'],
        'in_progress' => ['review' => 'Mark ready for review'],
        default => [],
    };
}
?>
<section class="card project-progress" aria-label="Project progress">
    <h2>Project progress</h2>
    <p><strong><?= $workflowEscape(workflow_labels()[$workflow['status']]) ?></strong> &middot; Responsible artist: <?= $workflowEscape($workflow['artist_name'] ?? 'Not assigned') ?></p>
    <p class="subtle">Submitted &rarr; Accepted &rarr; In progress &rarr; Review &rarr; Completed</p>
    <?php if ($workflowOwner && $workflow['status'] !== 'completed'):
        $candidates = db()->prepare("SELECT u.id, u.display_name, u.email FROM brief_artist_access a JOIN users u ON u.id = a.artist_id WHERE a.brief_id = ? AND u.role = 'artist' ORDER BY u.display_name, u.id");
        $candidates->execute([$brief['id']]);
        $candidates = $candidates->fetchAll();
    ?>
        <?php if ($candidates): ?>
        <form method="post" action="../auth/project-update.php">
            <input type="hidden" name="csrf" value="<?= $workflowEscape(csrf_token()) ?>">
            <input type="hidden" name="id" value="<?= $workflowEscape($brief['id']) ?>">
            <input type="hidden" name="version" value="<?= (int) $workflow['version'] ?>">
            <input type="hidden" name="action" value="assign">
            <label for="responsible-artist">Choose responsible artist</label>
            <select id="responsible-artist" name="artist_id" required>
                <option value="">Select an artist</option>
                <?php foreach ($candidates as $candidate): ?>
                <option value="<?= (int) $candidate['id'] ?>" <?= (int) $workflow['artist_id'] === (int) $candidate['id'] ? 'selected' : '' ?>><?= $workflowEscape($candidate['display_name'] . ' (' . $candidate['email'] . ')') ?></option>
                <?php endforeach; ?>
            </select>
            <p class="subtle">Changing the responsible artist resets progress to Submitted. Other artists retain viewing access.</p>
            <button type="submit">Assign artist</button>
        </form>
        <?php else: ?><p>Share your project code with an artist. Once they unlock the brief, you can assign them here.</p><?php endif; ?>
    <?php elseif (!$workflowOwner && (int) $workflow['artist_id'] !== (int) $workflowUser['id']): ?>
        <p>You have viewing access. The client chooses the artist responsible for progress updates.</p>
    <?php endif; ?>
    <?php if ($workflowActions): ?>
    <form method="post" action="../auth/project-update.php">
        <input type="hidden" name="csrf" value="<?= $workflowEscape(csrf_token()) ?>">
        <input type="hidden" name="id" value="<?= $workflowEscape($brief['id']) ?>">
        <input type="hidden" name="version" value="<?= (int) $workflow['version'] ?>">
        <?php foreach ($workflowActions as $action => $label): ?><button name="action" value="<?= $workflowEscape($action) ?>" type="submit"><?= $workflowEscape($label) ?></button><?php endforeach; ?>
    </form>
    <?php endif; ?>
</section>
