<?php
declare(strict_types=1);
require_once __DIR__ . '/brief-access.php';

function imported_brief_font(mixed $source): ?array
{
    if ($source === null) return null;
    if (!is_array($source) || !is_string($source['name'] ?? null) || !is_string($source['data'] ?? null)) {
        throw new InvalidArgumentException('Choose a valid font file.');
    }
    $name = trim($source['name']);
    if ($name === '' || mb_strlen($name) > 255 || str_contains($name, '/') || str_contains($name, '\\') || preg_match('/[\x00-\x1F\x7F]/', $name)) {
        throw new InvalidArgumentException('Choose a font file with a valid name.');
    }
    $extensions = ['woff2' => ['font/woff2', 'wOF2'], 'woff' => ['font/woff', 'wOFF'], 'ttf' => ['font/ttf', "\x00\x01\x00\x00"], 'otf' => ['font/otf', 'OTTO']];
    $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!isset($extensions[$extension])) throw new InvalidArgumentException('Use a WOFF2, WOFF, TTF, or OTF font file.');
    [$mime, $signature] = $extensions[$extension];
    if (!preg_match('~^data:' . preg_quote($mime, '~') . ';base64,([A-Za-z0-9+/]+={0,2})$~D', $source['data'], $match)) {
        throw new InvalidArgumentException('The imported font has an invalid format.');
    }
    $bytes = base64_decode($match[1], true);
    if ($bytes === false || strlen($bytes) < 32 || strlen($bytes) > 2 * 1024 * 1024 || !str_starts_with($bytes, $signature)) {
        throw new InvalidArgumentException('The imported font is invalid or larger than 2 MB.');
    }
    $size = strlen($bytes);
    if ($extension === 'woff' || $extension === 'woff2') {
        $minimum = $extension === 'woff2' ? 48 : 44;
        $declaredSize = unpack('N', substr($bytes, 8, 4))[1];
        $tables = unpack('n', substr($bytes, 12, 2))[1];
        if ($size < $minimum || $declaredSize !== $size || $tables < 1 || $tables > 4096 || ($extension === 'woff' && $minimum + 20 * $tables > $size)) {
            throw new InvalidArgumentException('The imported font is invalid.');
        }
    } else {
        $tables = unpack('n', substr($bytes, 4, 2))[1];
        if ($tables < 1 || $tables > 4096 || 12 + 16 * $tables > $size) throw new InvalidArgumentException('The imported font is invalid.');
        for ($index = 0; $index < $tables; $index++) {
            $record = substr($bytes, 12 + 16 * $index, 16);
            $offset = unpack('N', substr($record, 8, 4))[1];
            $length = unpack('N', substr($record, 12, 4))[1];
            if ($length < 1 || $offset > $size || $length > $size - $offset) throw new InvalidArgumentException('The imported font is invalid.');
        }
    }
    return ['name' => $name, 'mime' => $mime, 'bytes' => $bytes];
}

function send_imported_brief_font(array $font): never
{
    $extension = ['font/woff2' => 'woff2', 'font/woff' => 'woff', 'font/ttf' => 'ttf', 'font/otf' => 'otf'][$font['mime']] ?? null;
    if ($extension === null) json_response(['error' => 'Unsupported font type.'], 415);
    header('Content-Type: application/octet-stream');
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Content-Disposition: attachment; filename="brief-font.' . $extension . '"; filename*=UTF-8\'\'' . rawurlencode($font['name']));
    echo $font['bytes'];
    exit;
}

function download_brief_font(string $role): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') { header('Allow: GET'); json_response(['error' => 'Method not allowed.'], 405); }
    $user = current_user();
    if (!$user) json_response(['error' => 'Sign in to download this font.'], 401);
    if ($user['role'] !== $role) json_response(['error' => 'Access denied.'], 403);
    $id = $_GET['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Font not found.'], 404);
    try {
        $column = db_driver() === 'pgsql' ? "encode(f.font_data, 'base64') AS bytes" : 'f.font_data AS bytes';
        $access = $role === 'artist'
            ? ' JOIN brief_artist_access a ON a.brief_id = b.id WHERE b.id = ? AND a.artist_id = ?'
            : ' WHERE b.id = ? AND b.client_id = ?';
        $query = db()->prepare('SELECT f.name, f.mime, ' . $column . ' FROM client_brief_fonts f JOIN client_briefs b ON b.id = f.brief_id' . $access);
        $query->execute([$id, $user['id']]);
        $font = $query->fetch();
        if (!$font) json_response(['error' => 'Font not found.'], 404);
        if (db_driver() === 'pgsql') $font['bytes'] = base64_decode((string) $font['bytes'], true);
        if (!is_string($font['bytes'])) json_response(['error' => 'Font could not be loaded.'], 503);
        send_imported_brief_font($font);
    } catch (PDOException $error) {
        error_log('Brief font download error: ' . $error->getMessage());
        json_response(['error' => 'Font could not be loaded. Please try again.'], 503);
    }
}
