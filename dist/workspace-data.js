export const STATUSES = [
  ['new', 'New'], ['reviewing', 'Reviewing'], ['in_progress', 'In progress'],
  ['ready_for_review', 'Ready for review'], ['completed', 'Completed'],
];
export const statusLabel = value => STATUSES.find(([key]) => key === value)?.[1] || value;

export function explainError(error) {
  if (['42P01', '42703', 'PGRST200', 'PGRST204', 'PGRST205'].includes(error?.code)) {
    return 'The shared workspace is not set up yet. Ask the app owner to complete the database setup, then refresh.';
  }
  return error?.message || 'We could not connect. Please try again.';
}

export async function sessionClient() {
  await window.makerflowAuth.ready;
  const user = window.makerflowAuth.currentUser();
  if (!user) throw new Error('Please sign in to open your workspace.');
  return { client: await window.makerflowAuth.getClient(), user };
}

export async function getProfile() {
  const { client, user } = await sessionClient();
  const { data, error } = await client.from('profiles').select('id,display_name,email,role').eq('id', user.id).single();
  if (error) throw error;
  return data;
}

const projectFields = 'id,name,description,mode,created_at,updated_at,status,client_id,brief_details,image_path,image_url,client:profiles!projects_client_id_fkey(display_name,email)';
export async function listProjects({ search = '', status = '', page = 0, own = false } = {}) {
  const { client, user } = await sessionClient();
  let query = client.from('projects').select(projectFields, { count: 'exact' }).order('created_at', { ascending: false }).order('id');
  if (own) query = query.eq('client_id', user.id);
  if (status) query = query.eq('status', status);
  // Treat user input as text; do not permit PostgREST filter syntax in the search.
  const term = search.replace(/[(),%*_\\"]/g, ' ').trim().slice(0, 120);
  if (term) query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  const { data, error, count } = await query.range(page * 12, page * 12 + 11);
  if (error) throw error;
  return { projects: data, count: count || 0 };
}

export async function projectCounts(own = false) {
  const { client, user } = await sessionClient();
  const entries = await Promise.all(STATUSES.map(async ([status]) => {
    let query = client.from('projects').select('id', { count: 'exact', head: true }).eq('status', status);
    if (own) query = query.eq('client_id', user.id);
    const { count, error } = await query;
    if (error) throw error;
    return [status, count || 0];
  }));
  return Object.fromEntries(entries);
}

export async function getProject(id) {
  const { client } = await sessionClient();
  const { data, error } = await client.from('projects').select(projectFields).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('This brief is unavailable or you do not have access to it.');
  return data;
}

export async function changeStatus(id, status) {
  const { client } = await sessionClient();
  const { data, error } = await client.from('projects').update({ status }).eq('id', id).select('id,status,updated_at').single();
  if (error) throw error;
  return data;
}

export async function getNote(id) {
  const { client } = await sessionClient();
  const { data, error } = await client.from('artist_notes').select('body,updated_at').eq('project_id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveNote(id, body) {
  const { client, user } = await sessionClient();
  if (body.length > 10000) throw new Error('Please keep notes under 10,000 characters.');
  const existing = await getNote(id);
  // Separate insert/update so column grants never permit changing project_id on update.
  const query = existing
    ? client.from('artist_notes').update({ body, author_id: user.id }).eq('project_id', id)
    : client.from('artist_notes').insert({ project_id: id, body, author_id: user.id });
  const { data, error } = await query.select('body,updated_at').single();
  if (error) throw error;
  return data;
}

export async function referenceUrl(project, download = false) {
  const { client } = await sessionClient();
  if (project.image_path) {
    const { data, error } = await client.storage.from('brief-files').createSignedUrl(project.image_path, 600, { download });
    if (error) throw error;
    return data.signedUrl;
  }
  // Only allow known legacy storage URLs, never arbitrary links supplied in a brief.
  if (!project.image_url) return null;
  const base = window.MAKERFLOW_AUTH_CONFIG.url.replace(/\/+$/, '');
  if (!project.image_url.startsWith(`${base}/storage/v1/object/public/project-images/`)) return null;
  return project.image_url + (download ? '?download=reference' : '');
}
