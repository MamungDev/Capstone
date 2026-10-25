<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
header('Cache-Control: private, no-store');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); json_response(['error' => 'Method not allowed.'], 405); }
$user = current_user();
if (!$user) json_response(['error' => 'Sign in again to update this project.'], 401);
if (!empty($user['onboarding_pending'])) json_response(['error' => 'Complete your profile first.'], 403);
require_csrf($_POST['csrf'] ?? null);
$id = $_POST['id'] ?? null;
$action = $_POST['action'] ?? null;
$version = filter_var($_POST['version'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
$artistId = filter_var($_POST['artist_id'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id) || !is_string($action) || $version === false || $version === null || $artistId === false) {
    json_response(['error' => 'Invalid project update.'], 422);
}
$back = ($user['role'] === 'client' ? '../Client/submitted.php?id=' : '../Artist/Artist%20UI.php?id=') . $id;
try {
    require_once __DIR__ . '/workflow.php';
    workflow_change($user, $id, $action, $version, $artistId);
    header('Location: ' . $back, true, 303);
    exit;
} catch (DomainException $error) {
    http_response_code($error->getCode());
    $message = $error->getMessage();
} catch (Throwable $error) {
    error_log('Project update failed: ' . $error->getMessage());
    http_response_code(503);
    $message = 'Your project could not be updated. Please try again.';
}
header('Content-Type: text/html; charset=utf-8');
?>
<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project update</title><main><h1>Project update</h1><p role="alert"><?= htmlspecialchars($message, ENT_QUOTES, 'UTF-8') ?></p><a href="<?= htmlspecialchars($back, ENT_QUOTES, 'UTF-8') ?>">Return to the brief</a></main></html>
