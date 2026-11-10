<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth/bootstrap.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    json_response(['error' => 'Method not allowed.'], 405);
}
$client = current_user();
if (!$client) json_response(['error' => 'Sign in again to submit. Your draft is still in this browser.'], 401);
if ($client['role'] !== 'client') json_response(['error' => 'Only clients can submit briefs.'], 403);
$limit = 16 * 1024 * 1024;
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) json_response(['error' => 'This brief is too large. Use a smaller attachment.'], 413);
$raw = file_get_contents('php://input', false, null, 0, $limit + 1);
if ($raw === false || strlen($raw) > $limit) json_response(['error' => 'This brief is too large.'], 413);
$input = json_decode($raw, true);
if (!is_array($input)) json_response(['error' => 'Invalid request.'], 400);
require_csrf($input['csrf'] ?? null);
session_write_close();
$id = $input['submissionId'] ?? null;
if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D', $id)) json_response(['error' => 'Invalid submission ID. Refresh and try again.'], 422);
$source = $input['brief'] ?? null;
if (!is_array($source)) json_response(['error' => 'Add your brief details.'], 422);
$accessCode = $source['accessCode'] ?? '';
if (!is_string($accessCode) || !preg_match('/^[a-f0-9]{32}$/D', $accessCode)) {
    json_response(['error' => 'Refresh the review page to generate your private project code.'], 422);
}
$details = [];
foreach (['projectName' => 120, 'projectType' => 80, 'idea' => 5000, 'audience' => 1000, 'goal' => 1000,
    'format' => 80, 'style' => 80, 'energy' => 80, 'referenceName' => 255,
    'resolution' => 80, 'note' => 2000, 'font' => 120] as $field => $max) {
    $value = $source[$field] ?? '';
    if (!is_string($value) || mb_strlen($value) > $max) json_response(['error' => "$field must be text of at most $max characters."], 422);
    $details[$field] = trim($value);
}
if ($details['resolution'] !== '') {
    if (!preg_match('/^\s*([0-9]{1,7})\s*(?:px)?\s*(?:x|×|by)\s*([0-9]{1,7})\s*(?:px)?\s*$/iuD', $details['resolution'], $dimensions)
        || (int) $dimensions[1] < 1 || (int) $dimensions[2] < 1 || (int) $dimensions[1] > 1000000 || (int) $dimensions[2] > 1000000) {
        json_response(['error' => 'Enter width × height in whole pixels, from 1 to 1,000,000 per side (for example 1377 x 2111).'], 422);
    }
    $details['resolution'] = (int) $dimensions[1] . ' × ' . (int) $dimensions[2] . ' px';
}
$palette = $source['palette'] ?? [];
if (!is_array($palette) || !array_is_list($palette) || count($palette) > 8) json_response(['error' => 'Choose up to eight palette colors.'], 422);
foreach ($palette as $color) {
    if (!is_string($color) || !preg_match('/^#[0-9a-fA-F]{6}$/D', $color)) json_response(['error' => 'Use six-digit hex colors in your palette.'], 422);
}
$details['palette'] = array_values(array_unique(array_map('strtoupper', $palette)));
$tags = $source['tags'] ?? [];
if (!is_array($tags) || !array_is_list($tags) || count($tags) > 8) json_response(['error' => 'Choose up to eight keywords.'], 422);
foreach ($tags as $tag) {
    if (!is_string($tag) || !in_array($tag, ['Warm', 'Playful', 'Editorial', 'Minimal', 'Surprising', 'Bold', 'Elegant', 'Experimental'], true)) {
        json_response(['error' => 'Choose keywords from the available options.'], 422);
    }
}
$details['tags'] = array_values(array_unique($tags));
try {
    require_once __DIR__ . '/../auth/brief-fonts.php';
    $fontFile = imported_brief_font($source['fontFile'] ?? null);
} catch (InvalidArgumentException $error) {
    json_response(['error' => $error->getMessage()], 422);
}
if ($fontFile !== null) $details['fontFileName'] = $fontFile['name'];
try {
    require_once __DIR__ . '/../auth/brief-documents.php';
    $ideaFile = imported_brief_document($source['ideaFile'] ?? null);
} catch (InvalidArgumentException $error) {
    json_response(['error' => $error->getMessage()], 422);
}
if ($details['idea'] === '' && $ideaFile === null) json_response(['error' => 'Describe your idea or attach a DOCX or PDF file.'], 422);
if ($ideaFile !== null) $details['ideaFileName'] = $ideaFile['name'];
if ($details['projectName'] === '') {
    $firstLine = preg_split('/\R/u', $details['idea'], 2)[0];
    $title = $firstLine !== '' ? trim($firstLine) : preg_replace('/\.(docx|pdf)$/i', '', $ideaFile['name']);
    $details['projectName'] = mb_substr($title, 0, 120);
}
$referenceIds = $source['references'] ?? null;
if ($referenceIds !== null) {
    if (!is_array($referenceIds) || !array_is_list($referenceIds)) json_response(['error' => 'Invalid references.'], 422);
    foreach ($referenceIds as $referenceId) {
        if (!is_string($referenceId) || !preg_match('/^[a-f0-9]{32}$/D', $referenceId)) json_response(['error' => 'Invalid reference ID.'], 422);
    }
    if (count(array_unique($referenceIds)) !== count($referenceIds)) json_response(['error' => 'A reference was included twice.'], 422);
}
$visual = $source['reference'] ?? $source['sketch'] ?? null;
if ($referenceIds !== null) $visual = null;
$mime = null;
$bytes = null;
$details['visualKind'] = $visual === null ? null : (!empty($source['reference']) ? 'reference' : 'sketch');
if ($visual !== null) {
    if (!is_string($visual) || !preg_match('~^data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$~D', $visual, $match)) {
        json_response(['error' => 'Use a PNG, JPEG, WebP, or GIF reference.'], 422);
    }
    $mime = $match[1];
    $bytes = base64_decode($match[2], true);
    if ($bytes === false || strlen($bytes) > 5 * 1024 * 1024) json_response(['error' => 'The reference must be smaller than 5 MB.'], 422);
    $image = @getimagesizefromstring($bytes);
    if (!$image || ($image['mime'] ?? '') !== $mime || $image[0] * $image[1] > 40000000) {
        json_response(['error' => 'The reference is not a valid image, or its dimensions are too large.'], 422);
    }
}
$json = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
$fontHashPart = $fontFile === null ? '' : "\0" . hash('sha256', $fontFile['bytes']);
$documentHashPart = $ideaFile === null ? '' : "\0" . hash('sha256', $ideaFile['bytes']);
$hash = hash('sha256', $json . "\0" . ($mime ?? '') . "\0" . ($bytes ?? '') . $fontHashPart . $documentHashPart . "\0" . $accessCode);
try {
    require_once __DIR__ . '/../auth/brief-access.php';
    try {
        db()->beginTransaction();
        if ($referenceIds !== null) {
            $lookup = db()->prepare('SELECT id, brief_id, name, kind, mime, content_hash FROM client_brief_references WHERE id = ? AND client_id = ? FOR UPDATE');
            $orderedIds = $referenceIds;
            sort($orderedIds); // Consistent lock order for concurrent retries.
            $references = [];
            foreach ($orderedIds as $referenceId) {
                $lookup->execute([$referenceId, $client['id']]);
                $reference = $lookup->fetch();
                if (!$reference || ($reference['brief_id'] !== null && $reference['brief_id'] !== $id)) throw new InvalidArgumentException('A reference is missing or belongs to another brief. Please upload it again.');
                $references[$referenceId] = $reference;
            }
            $details['referenceCount'] = count($referenceIds);
            $details['referenceName'] = $referenceIds ? $references[$referenceIds[0]]['name'] : '';
            $details['visualKind'] = $referenceIds ? $references[$referenceIds[0]]['kind'] : null;
            $mime = $referenceIds ? $references[$referenceIds[0]]['mime'] : null;
            $json = json_encode($details, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $hash = hash('sha256', $json . "\0" . implode(',', array_map(static fn ($referenceId) => $referenceId . ':' . $references[$referenceId]['content_hash'], $referenceIds)) . $fontHashPart . $documentHashPart . "\0" . $accessCode);
        }
        $insertSql = db_driver() === 'pgsql'
            ? "INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash, visual_mime, visual_data) VALUES (?, ?, ?, ?, ?, ?, decode(?, 'base64'))"
            : 'INSERT INTO client_briefs (id, client_id, project_name, details_json, payload_hash, visual_mime, visual_data) VALUES (?, ?, ?, ?, ?, ?, ?)';
        $insert = db()->prepare($insertSql);
        $insert->execute([$id, $client['id'], $details['projectName'], $json, $hash, $mime, db_driver() === 'pgsql' && $bytes !== null ? base64_encode($bytes) : $bytes]);
        if ($fontFile !== null) {
            $insertFont = db_driver() === 'pgsql'
                ? "INSERT INTO client_brief_fonts (brief_id, name, mime, font_data) VALUES (?, ?, ?, decode(?, 'base64'))"
                : 'INSERT INTO client_brief_fonts (brief_id, name, mime, font_data) VALUES (?, ?, ?, ?)';
            db()->prepare($insertFont)->execute([$id, $fontFile['name'], $fontFile['mime'], db_driver() === 'pgsql' ? base64_encode($fontFile['bytes']) : $fontFile['bytes']]);
        }
        if ($ideaFile !== null) {
            $insertDocument = db_driver() === 'pgsql'
                ? "INSERT INTO client_brief_documents (brief_id, name, mime, file_data) VALUES (?, ?, ?, decode(?, 'base64'))"
                : 'INSERT INTO client_brief_documents (brief_id, name, mime, file_data) VALUES (?, ?, ?, ?)';
            db()->prepare($insertDocument)->execute([$id, $ideaFile['name'], $ideaFile['mime'], db_driver() === 'pgsql' ? base64_encode($ideaFile['bytes']) : $ideaFile['bytes']]);
        }
        if ($referenceIds !== null) {
            $attach = db()->prepare('UPDATE client_brief_references SET brief_id = ?, position = ? WHERE id = ? AND client_id = ?');
            foreach ($referenceIds as $position => $referenceId) $attach->execute([$id, $position, $referenceId, $client['id']]);
        }
        db()->prepare('INSERT INTO brief_access_codes (brief_id, access_code) VALUES (?, ?)')->execute([$id, $accessCode]);
        db()->commit();
        $status = 201;
    } catch (PDOException $exception) {
        if (db()->inTransaction()) db()->rollBack();
        if (!db_duplicate_error($exception)) throw $exception;
        // A lost response can be retried without creating a second brief.
        $existing = db()->prepare('SELECT payload_hash FROM client_briefs WHERE id = ? AND client_id = ?');
        $existing->execute([$id, $client['id']]);
        $previous = $existing->fetchColumn();
        if (!is_string($previous) || !hash_equals($previous, $hash)) {
            json_response(['error' => 'This submission ID was already used for another brief. Start a new brief to submit changes.'], 409);
        }
        $status = 200;
    }
    json_response(['ok' => true, 'id' => $id, 'url' => 'submitted.php?id=' . $id], $status);
} catch (InvalidArgumentException $exception) {
    if (db()->inTransaction()) db()->rollBack();
    json_response(['error' => $exception->getMessage()], 422);
} catch (PDOException $exception) {
    if (db()->inTransaction()) db()->rollBack();
    error_log('Brief submission error: ' . $exception->getMessage());
    json_response(['error' => 'Your brief could not be saved. Your draft is retained; please try again.'], 503);
}
