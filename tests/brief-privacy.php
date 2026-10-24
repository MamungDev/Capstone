<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/../auth/brief-access.php';

function request_page(string $path, int $user, array $get = [], array $post = []): string {
    $bootstrap = realpath(__DIR__ . '/../auth/bootstrap.php');
    $target = realpath(__DIR__ . '/../' . $path);
    $script = 'require ' . var_export($bootstrap, true) . ';'
        . '$_SESSION["user_id"]=' . $user . '; $_SESSION["csrf_token"]="privacy-test";'
        . '$_GET=' . var_export($get, true) . '; $_POST=' . var_export($post, true) . ';'
        . '$_SERVER["REQUEST_METHOD"]=' . var_export($post ? 'POST' : 'GET', true) . ';'
        . 'register_shutdown_function(function(){echo "\nSTATUS:" . http_response_code();});'
        . 'require ' . var_export($target, true) . ';';
    $process = proc_open([PHP_BINARY, '-r', $script], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    $output = stream_get_contents($pipes[1]);
    $error = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    if (proc_close($process) !== 0 || $error !== '') throw new RuntimeException($error);
    return $output;
}
function check(bool $condition, string $message): void {
    if (!$condition) throw new RuntimeException($message);
}
$users = [];
$id = bin2hex(random_bytes(16));
$secretTitle = 'PRIVATE-' . $id;
try {
    foreach (['client', 'artist', 'artist'] as $role) {
        db()->prepare('INSERT INTO users (role, email, display_name) VALUES (?, ?, ?)')->execute([$role, bin2hex(random_bytes(16)) . '@privacy-test.invalid', 'Privacy test']);
        $users[] = (int) db()->lastInsertId();
    }
    $details = ['projectName' => $secretTitle, 'projectType' => 'Poster', 'idea' => 'Private idea', 'audience' => '', 'goal' => '', 'format' => '', 'style' => '', 'energy' => '', 'tags' => [], 'referenceName' => ''];
    db()->prepare('INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash, visual_mime, visual_data) VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([$id, $users[0], $secretTitle, json_encode($details), str_repeat('a', 64), 'image/png', 'private-image']);
    $code = client_brief_code($id, $users[0]);
    check($code === client_brief_code($id, $users[0]), 'Owner code must remain stable.');
    $inbox = request_page('Artist/Artist UI.php', $users[1]);
    check(!str_contains($inbox, $secretTitle) && str_contains($inbox, '<strong>0</strong>'), 'Locked brief leaked into inbox or statistics.');
    check(!str_contains(request_page('Artist/Artist UI.php', $users[1], ['q' => $secretTitle]), $secretTitle . '</strong>'), 'Search leaked a locked brief.');
    check(str_contains(request_page('Artist/Artist UI.php', $users[1], ['id' => $id]), 'STATUS:404'), 'Direct detail access was allowed.');
    check(str_contains(request_page('Artist/brief-image.php', $users[1], ['id' => $id]), 'STATUS:404'), 'Direct image access was allowed.');
    check(str_contains(request_page('Artist/Artist UI.php', $users[1], [], ['csrf' => 'bad', 'access_code' => $code]), 'STATUS:403'), 'Missing CSRF protection.');
    check(str_contains(request_page('Artist/Artist UI.php', $users[1], [], ['csrf' => 'privacy-test', 'access_code' => str_repeat('0', 32)]), 'That code is not valid'), 'Wrong code was accepted.');
    check(str_contains(request_page('Artist/Artist UI.php', $users[1], [], ['csrf' => 'privacy-test', 'access_code' => $code]), 'STATUS:303'), 'Correct code failed.');
    check(str_contains(request_page('Artist/Artist UI.php', $users[1], ['id' => $id]), $secretTitle), 'Unlocked brief missing.');
    check(str_contains(request_page('Artist/brief-image.php', $users[1], ['id' => $id]), 'private-image'), 'Unlocked image missing.');
    check(str_contains(request_page('Artist/Artist UI.php', $users[2], ['id' => $id]), 'STATUS:404'), 'Unlock leaked to another artist.');
    for ($i = 0; $i < 10; $i++) request_page('Artist/Artist UI.php', $users[2], [], ['csrf' => 'privacy-test', 'access_code' => 'wrong']);
    check(str_contains(request_page('Artist/Artist UI.php', $users[2], [], ['csrf' => 'privacy-test', 'access_code' => $code]), 'STATUS:429'), 'Rate limit failed.');
    echo "PASS: stable owner code, locked search/details/images, CSRF, invalid/valid codes, account isolation, rate limiting.\n";
} finally {
    db()->prepare('DELETE FROM client_briefs WHERE id = ?')->execute([$id]);
    foreach ($users as $user) {
        db()->prepare('DELETE FROM admin_login_limits WHERE bucket = ?')->execute([hash('sha256', 'brief-unlock:' . $user)]);
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([$user]);
    }
}
