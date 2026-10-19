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
    '/Client/brief-image.php' => 'Client/brief-image.php',
    '/Artist/Artist UI.php' => 'Artist/Artist UI.php',
    '/Artist/brief-image.php' => 'Artist/brief-image.php',
    '/auth/account.php' => 'auth/account.php',
    '/auth/logout.php' => 'auth/logout.php',
    '/auth/google-start.php' => 'auth/google-start.php',
    '/auth/google-callback.php' => 'auth/google-callback.php',
];

$assets = [
    '/assets/mamungkun-icon.svg' => ['assets/mamungkun-icon.svg', 'image/svg+xml'],
    '/assets/css/landing.css' => ['assets/css/landing.css', 'text/css'],
    '/assets/css/auth.css' => ['assets/css/auth.css', 'text/css'],
    '/assets/js/landing.js' => ['assets/js/landing.js', 'text/javascript'],
    '/Client/client.css' => ['Client/client.css', 'text/css'],
    '/Client/client.js' => ['Client/client.js', 'text/javascript'],
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
