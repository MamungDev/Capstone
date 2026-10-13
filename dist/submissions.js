import { sessionClient, getProfile } from './workspace-data.js';

export async function submitBrief(brief) {
  const { client, user } = await sessionClient();
  // Check setup before uploading anything; an absent migration must not lose a draft.
  const profile = await getProfile();
  if (!profile.onboarded_at) throw new Error('Please finish registration in My workspace before submitting your brief. Your draft is still saved.');
  const name = brief.projectName.trim();
  if (!name || !brief.idea.trim()) throw new Error('Add a project name and description before submitting.');
  if (name.length > 120) throw new Error('Please shorten the project name to 120 characters or fewer.');
  const details = {
    idea: brief.idea.trim(), projectType: brief.projectType || '', audience: brief.audience || '',
    goal: brief.goal || '', format: brief.format || '', style: brief.style || '', energy: brief.energy || '',
    tags: brief.tags || [], referenceName: brief.referenceName || (brief.sketch ? 'Sketch' : ''),
  };
  const description = [
    details.idea, 'Project type: ' + details.projectType, 'Audience: ' + details.audience,
    'Goal: ' + details.goal, 'Format: ' + details.format, 'Style: ' + details.style,
    'Colour energy: ' + details.energy, 'Keywords: ' + details.tags.join(', '),
  ].join('\n\n');
  if (description.length > 5000) throw new Error('Please shorten your brief to 5,000 characters or fewer.');
  const id = brief.pendingId || crypto.randomUUID();
  // A timed-out request might already have committed. Reuse the draft's ID.
  const previous = await client.from('projects').select('id').eq('id', id).maybeSingle();
  if (previous.error) throw previous.error;
  if (previous.data) return { id };

  let imagePath = null;
  const visual = brief.reference || brief.sketch;
  if (visual) {
    const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(visual);
    if (!match) throw new Error('Please choose a PNG, JPEG, WebP, or GIF reference again.');
    const bytes = Uint8Array.from(atob(match[2]), char => char.charCodeAt(0));
    if (bytes.length > 5 * 1024 * 1024) throw new Error('Your image or sketch must be 5 MB or smaller.');
    const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[match[1]];
    imagePath = user.id + '/' + id + '.' + extension;
    const { error } = await client.storage.from('brief-files').upload(imagePath, new Blob([bytes], { type: match[1] }), { contentType: match[1], upsert: false });
    // Same draft + same ID means the image may already have uploaded on a prior attempt.
    if (error && String(error.statusCode) !== '409') throw error;
  }
  const { error } = await client.from('projects').insert({
    id, name, description, mode: brief.reference ? 'upload' : 'draw',
    client_id: user.id, brief_details: details, image_path: imagePath,
  });
  if (error) {
    if (error.code === '23505') {
      const existing = await client.from('projects').select('id').eq('id', id).maybeSingle();
      if (!existing.error && existing.data) return { id };
    }
    throw error;
  }
  return { id };
}
