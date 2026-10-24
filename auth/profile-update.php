<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';
if (!isset($profileRole) || !in_array($profileRole, ['artist', 'client'], true)) json_response(['error' => 'Not found.'], 404);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    json_response(['error' => 'Method not allowed.'], 405);
}
$profileUser = current_user();
if (!$profileUser || $profileUser['role'] !== $profileRole) {
    json_response(['error' => 'Please sign in again to save your profile.'], 401);
}
$requestLimit = 3 * 1024 * 1024;
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $requestLimit) {
    json_response(['error' => 'Use a profile photo smaller than 2 MB.'], 413);
}
$raw = file_get_contents('php://input', false, null, 0, $requestLimit + 1);
if ($raw === false || strlen($raw) > $requestLimit) json_response(['error' => 'Request is too large.'], 413);
$input = json_decode($raw, true);
if (!is_array($input)) json_response(['error' => 'Invalid request.'], 400);
require_csrf($input['csrf'] ?? null);
$name = is_string($input['name'] ?? null) ? trim($input['name']) : '';
$email = is_string($input['email'] ?? null) ? mb_strtolower(trim($input['email'])) : '';
$bio = $input['bio'] ?? ($profileUser['bio'] ?? null);
if ($bio !== null && (!is_string($bio) || mb_strlen($bio) > 500)) {
    json_response(['error' => 'Keep your bio to 500 characters or fewer.', 'field' => 'bio'], 422);
}
$bio = $bio === null ? null : trim(str_replace(["\r\n", "\r"], "\n", $bio));
if ($name === '' || mb_strlen($name) > 100 || preg_match('/[\x00-\x1F\x7F]/u', $name)) {
    json_response(['error' => 'Enter a display name between 1 and 100 characters.', 'field' => 'name'], 422);
}
if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    json_response(['error' => 'Enter a valid email address.', 'field' => 'email'], 422);
}
$changePhoto = array_key_exists('photo', $input);
$photoMime = null;
$photoData = null;
if ($changePhoto && $input['photo'] !== null) {
    if (!is_string($input['photo']) || !preg_match('~^data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$~D', $input['photo'], $match)) {
        json_response(['error' => 'Choose a JPG, PNG, or WebP profile photo.', 'field' => 'photo'], 422);
    }
    $photoMime = $match[1];
    $photoData = base64_decode($match[2], true);
    if ($photoData === false || strlen($photoData) > 2 * 1024 * 1024) {
        json_response(['error' => 'Choose a profile photo no larger than 2 MB.', 'field' => 'photo'], 422);
    }
    $image = @getimagesizefromstring($photoData);
    if (!$image || ($image['mime'] ?? '') !== $photoMime || $image[0] * $image[1] > 16000000) {
        json_response(['error' => 'Choose a valid photo of up to 16 megapixels.', 'field' => 'photo'], 422);
    }
}
try {
    $sql = 'UPDATE users SET display_name = ?, email = ?, bio = ?';
    $params = [$name, $email, $bio];
    if ($changePhoto) {
        $sql .= ', photo_mime = ?, photo_data = ?';
        array_push($params, $photoMime, $photoData);
    }
    $statement = db()->prepare($sql . ' WHERE id = ? AND role = ?');
    $statement->execute([...$params, $profileUser['id'], $profileRole]);
    json_response(['ok' => true, 'profile' => [
        'name' => $name,
        'email' => $email,
        'bio' => $bio,
        'initial' => mb_strtoupper(mb_substr($name, 0, 1)),
        'photoUrl' => ($changePhoto ? $photoMime !== null : !empty($profileUser['photo_mime'])) ? 'profile-photo.php?v=' . bin2hex(random_bytes(8)) : null,
    ]]);
} catch (PDOException $exception) {
    if (($exception->errorInfo[1] ?? null) === 1062) {
        json_response(['error' => 'That email address is already in use. Try another one.', 'field' => 'email'], 409);
    }
    error_log('Profile update error: ' . $exception->getMessage());
    json_response(['error' => 'Your profile could not be saved. Please try again.'], 503);
}
