<?php
declare(strict_types=1);
require_once __DIR__ . '/brief-access.php';

function valid_brief_docx(string $bytes): bool
{
    if (!str_starts_with($bytes, "PK\x03\x04")) return false;
    $size = strlen($bytes);
    $end = strrpos($bytes, "PK\x05\x06");
    if ($end === false || $end < $size - 65557 || $end + 22 > $size) return false;
    $footer = unpack('vdisk/vstart/vdiskEntries/ventries/VdirectorySize/VdirectoryOffset/vcomment', substr($bytes, $end + 4, 18));
    if ($footer['disk'] !== 0 || $footer['start'] !== 0 || $footer['diskEntries'] !== $footer['entries']
        || $footer['entries'] < 2 || $footer['entries'] > 10000 || $end + 22 + $footer['comment'] !== $size
        || $footer['directoryOffset'] + $footer['directorySize'] !== $end) return false;
    $position = $footer['directoryOffset'];
    $parts = [];
    for ($index = 0; $index < $footer['entries']; $index++) {
        if ($position + 46 > $end || substr($bytes, $position, 4) !== "PK\x01\x02") return false;
        $nameLength = unpack('v', substr($bytes, $position + 28, 2))[1];
        $extraLength = unpack('v', substr($bytes, $position + 30, 2))[1];
        $commentLength = unpack('v', substr($bytes, $position + 32, 2))[1];
        $localOffset = unpack('V', substr($bytes, $position + 42, 4))[1];
        if ($position + 46 + $nameLength + $extraLength + $commentLength > $end
            || substr($bytes, $localOffset, 4) !== "PK\x03\x04") return false;
        $parts[substr($bytes, $position + 46, $nameLength)] = true;
        $position += 46 + $nameLength + $extraLength + $commentLength;
    }
    return $position === $end && isset($parts['[Content_Types].xml'], $parts['word/document.xml']);
}

function imported_brief_document(mixed $source): ?array
{
    if ($source === null) return null;
    if (!is_array($source) || !is_string($source['name'] ?? null) || !is_string($source['data'] ?? null)) {
        throw new InvalidArgumentException('Choose a DOCX or PDF document.');
    }
    $name = trim($source['name']);
    if ($name === '' || mb_strlen($name) > 255 || str_contains($name, '/') || str_contains($name, '\\')
        || preg_match('/[\x00-\x1F\x7F]/', $name)) {
        throw new InvalidArgumentException('Choose a document with a valid filename.');
    }
    $types = ['pdf' => 'application/pdf', 'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (!isset($types[$extension]) || trim(substr($name, 0, -strlen($extension) - 1)) === '') {
        throw new InvalidArgumentException('Choose a DOCX or PDF document.');
    }
    $mime = $types[$extension];
    if (!preg_match('~^data:' . preg_quote($mime, '~') . ';base64,([A-Za-z0-9+/]+={0,2})$~D', $source['data'], $match)) {
        throw new InvalidArgumentException('The document format is invalid.');
    }
    $bytes = base64_decode($match[1], true);
    if ($bytes === false || strlen($bytes) < 12 || strlen($bytes) > 5 * 1024 * 1024) {
        throw new InvalidArgumentException('Choose a DOCX or PDF smaller than 5 MB.');
    }
    if ($extension === 'pdf') {
        $valid = (bool) preg_match('/^%PDF-[12]\.[0-9]/', $bytes) && str_contains(substr($bytes, -1024), '%%EOF');
    } else {
        $valid = valid_brief_docx($bytes);
    }
    if (!$valid) throw new InvalidArgumentException('The document is not a valid ' . strtoupper($extension) . ' file.');
    return ['name' => $name, 'mime' => $mime, 'bytes' => $bytes];
}

function download_brief_document(string $role): never
{
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') { header('Allow: GET'); json_response(['error' => 'Method not allowed.'], 405); }
    $user = current_user();
    if (!$user) json_response(['error' => 'Sign in to download this document.'], 401);
    if ($user['role'] !== $role) json_response(['error' => 'Access denied.'], 403);
    $id = $_GET['id'] ?? '';
    if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Document not found.'], 404);
    try {
        $column = db_driver() === 'pgsql' ? "encode(d.file_data, 'base64') AS bytes" : 'd.file_data AS bytes';
        $access = $role === 'artist'
            ? ' JOIN brief_artist_access a ON a.brief_id = b.id WHERE b.id = ? AND a.artist_id = ?'
            : ' WHERE b.id = ? AND b.client_id = ?';
        $query = db()->prepare('SELECT d.name, d.mime, ' . $column . ' FROM client_brief_documents d JOIN client_briefs b ON b.id = d.brief_id' . $access);
        $query->execute([$id, $user['id']]);
        $document = $query->fetch();
        if (!$document) json_response(['error' => 'Document not found.'], 404);
        if (db_driver() === 'pgsql') $document['bytes'] = base64_decode((string) $document['bytes'], true);
        if (!is_string($document['bytes'])) json_response(['error' => 'Document could not be loaded.'], 503);
        $extension = $document['mime'] === 'application/pdf' ? 'pdf' : 'docx';
        header('Content-Type: application/octet-stream');
        header('Cache-Control: private, no-store');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        header('Content-Disposition: attachment; filename="brief-document.' . $extension . '"; filename*=UTF-8\'\'' . rawurlencode($document['name']));
        echo $document['bytes'];
        exit;
    } catch (PDOException $error) {
        error_log('Brief document download error: ' . $error->getMessage());
        json_response(['error' => 'Document could not be loaded. Please try again.'], 503);
    }
}
