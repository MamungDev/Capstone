<?php
declare(strict_types=1);
require_once __DIR__ . '/brief-access.php';

// Call only after the caller has verified ownership or artist access to the brief.
function brief_reference_list(array $brief, array $details): array
{
    $query = db()->prepare('SELECT id, name, kind FROM client_brief_references WHERE brief_id = ? ORDER BY position, id');
    $query->execute([$brief['id']]);
    $references = $query->fetchAll();
    if (!$references && !empty($brief['visual_mime'])) {
        $references[] = ['id' => '', 'name' => ($details['referenceName'] ?? '') ?: 'Sketch', 'kind' => $details['visualKind'] ?? 'reference'];
    }
    return $references;
}

function reference_image(string $data, int $maxBytes = 2097152): array
{
    if (!preg_match('~^data:(image/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$~D', $data, $match)) {
        throw new InvalidArgumentException('Use a PNG, JPEG, WebP, or GIF reference.');
    }
    $bytes = base64_decode($match[2], true);
    if ($bytes === false || strlen($bytes) > $maxBytes) throw new InvalidArgumentException('Each reference must be 2 MB or smaller.');
    $image = @getimagesizefromstring($bytes);
    if (!$image || ($image['mime'] ?? '') !== $match[1] || $image[0] * $image[1] > 40000000) {
        throw new InvalidArgumentException('The reference is not a valid image, or its dimensions are too large.');
    }
    return ['mime' => $match[1], 'bytes' => $bytes];
}

function send_brief_reference(array $row, string $id): never
{
    $extensions = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
    if (!isset($extensions[$row['visual_mime']])) json_response(['error' => 'Unsupported reference type.'], 415);
    header('Content-Type: ' . $row['visual_mime']);
    header('Cache-Control: private, no-store');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    if (($_GET['download'] ?? '') === '1') header('Content-Disposition: attachment; filename="reference-' . $id . '.' . $extensions[$row['visual_mime']] . '"');
    echo $row['visual_data'];
    exit;
}
