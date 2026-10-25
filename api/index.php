<?php
declare(strict_types=1);

if (getenv('VERCEL') !== false) {
    ini_set('display_errors', '0');
    set_exception_handler(static function (Throwable $error): void {
        error_log((string) $error);
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'The service is temporarily unavailable. Please try again shortly.';
    });
}

// Vercel's PHP runtime starts functions from api/. Keep the public URLs from
// the XAMPP version while dispatching only files that the application exposes.
$path = '/' . ltrim((string) ($_GET['path'] ?? parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH)), '/');
$path = rawurldecode($path);

$pages = [
    '/' => 'index.php',
    '/index.php' => 'index.php',
    '/Admin/index.php' => 'Admin/index.php',
    '/Admin/login.php' => 'Admin/login.php',
    '/Client/Client UI.php' => 'Client/Client UI.php',
    '/Client/submitted.php' => 'Client/submitted.php',
    '/Client/submit-brief.php' => 'Client/submit-brief.php',
    '/Client/upload-reference.php' => 'Client/upload-reference.php',
    '/Client/brief-image.php' => 'Client/brief-image.php',
    '/Client/profile.php' => 'Client/profile.php',
    '/Client/profile-photo.php' => 'Client/profile-photo.php',
    '/Artist/Artist UI.php' => 'Artist/Artist UI.php',
    '/Artist/brief-image.php' => 'Artist/brief-image.php',
    '/Artist/profile.php' => 'Artist/profile.php',
    '/Artist/profile-photo.php' => 'Artist/profile-photo.php',
    '/auth/account.php' => 'auth/account.php',
    '/auth/project-update.php' => 'auth/project-update.php',
    '/auth/logout.php' => 'auth/logout.php',
    '/auth/google-start.php' => 'auth/google-start.php',
    '/auth/google-callback.php' => 'auth/google-callback.php',
    '/auth/complete-profile.php' => 'auth/complete-profile.php',
];

$assets = [
    '/assets/mamungkun-icon.svg' => ['assets/mamungkun-icon.svg', 'image/svg+xml'],
    '/assets/css/landing.css' => ['assets/css/landing.css', 'text/css'],
    '/assets/css/auth.css' => ['assets/css/auth.css', 'text/css'],
    '/assets/css/complete-profile.css' => ['assets/css/complete-profile.css', 'text/css'],
    '/assets/css/dropdowns.css' => ['assets/css/dropdowns.css', 'text/css'],
    '/assets/js/dropdowns.js' => ['assets/js/dropdowns.js', 'text/javascript'],
    '/assets/js/landing.js' => ['assets/js/landing.js', 'text/javascript'],
    '/assets/js/admin-modal.js' => ['assets/js/admin-modal.js', 'text/javascript'],
    '/assets/css/profile.css' => ['assets/css/profile.css', 'text/css'],
    '/assets/css/workflow.css' => ['assets/css/workflow.css', 'text/css'],
    '/assets/js/profile.js' => ['assets/js/profile.js', 'text/javascript'],
    '/Client/client.css' => ['Client/client.css', 'text/css'],
    '/Client/client.js' => ['Client/client.js', 'text/javascript'],
    '/Client/draft-store.js' => ['Client/draft-store.js', 'text/javascript'],
    '/Client/sketchpad.js' => ['Client/sketchpad.js', 'text/javascript'],
    '/Artist/artist.css' => ['Artist/artist.css', 'text/css'],
    '/Admin/admin.css' => ['Admin/admin.css', 'text/css'],
];

if (isset($assets[$path])) {
    [$file, $type] = $assets[$path];
    header('Content-Type: ' . $type . '; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    readfile(__DIR__ . '/../' . $file);
    return;
}

if (isset($pages[$path])) {
    require __DIR__ . '/../' . $pages[$path];
    return;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo 'Not found';
