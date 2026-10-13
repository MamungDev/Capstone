const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const db = new PGlite();
const clientA = '11111111-1111-4111-8111-111111111111';
const clientB = '22222222-2222-4222-8222-222222222222';
const artist = '33333333-3333-4333-8333-333333333333';
const projectA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const projectB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const legacy = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
await db.exec(`
  create role anon; create role authenticated;
  create schema auth; create schema storage;
  grant usage on schema public, auth, storage to anon, authenticated;
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
  $$;
  create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, unique(bucket_id,name));
  alter table storage.objects enable row level security;
  grant select, insert on storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language sql as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1];
  $$;
`);
await db.exec(`
  create table public.projects (
    id uuid primary key default gen_random_uuid(),
    name text not null check(char_length(name) between 1 and 120),
    description text not null default '' check(char_length(description)<=5000),
    mode text not null check(mode in ('draw','upload')), image_url text,
    created_at timestamptz not null default now()
  );
  alter table public.projects enable row level security;
  create policy "Anyone can submit a project" on public.projects for insert to anon with check(true);
  insert into storage.buckets(id,name,public) values('project-images','project-images',true);
  create policy "Anyone can upload project images" on storage.objects for insert to anon with check(bucket_id='project-images');
`);
await db.query('insert into public.projects (id,name,mode) values ($1,$2,$3)', [legacy, 'Legacy anonymous brief', 'draw']);
await db.query(`insert into auth.users values ($1,'client-a@example.test','{}'),($2,'client-b@example.test','{}'),($3,'artist@example.test','{"role":"artist"}')`, [clientA, clientB, artist]);
const migration = readFileSync(new URL('../supabase/002_client_artist.sql', import.meta.url), 'utf8');
await db.exec(migration);
assert.equal((await db.query('select role from public.profiles where id=$1', [artist])).rows[0].role, 'client', 'metadata cannot grant artist access');
await db.query(`update public.profiles set role='artist' where id=$1`, [artist]);
await db.exec(migration);
assert.equal((await db.query('select role from public.profiles where id=$1', [artist])).rows[0].role, 'artist', 'rerun preserves approved roles');

async function asUser(id, action, role = 'authenticated') {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [id || '']);
  try { return await action(); } finally { await db.exec('reset role'); }
}
async function denied(action) {
  await assert.rejects(action, /permission denied|row-level security|violates check constraint/i);
}

await asUser(clientA, async () => {
  await db.query(`insert into storage.objects(bucket_id,name) values ('brief-files',$1)`, [clientA + '/reference.png']);
  await db.query(`insert into public.projects(id,name,description,mode,client_id,image_path) values($1,'Client A brief','Idea','upload',$2,$3)`, [projectA, clientA, clientA + '/reference.png']);
  await denied(() => db.query(`insert into public.projects(id,name,mode,client_id) values(gen_random_uuid(),'Spoofed owner','draw',$1)`, [clientB]));
  await denied(() => db.query(`update public.profiles set role='artist' where id=$1`, [clientA]));
  await denied(() => db.query(`insert into public.projects(id,name,mode,client_id,status) values(gen_random_uuid(),'Already completed','draw',$1,'completed')`, [clientA]));
  await denied(() => db.query(`insert into storage.objects(bucket_id,name) values ('brief-files',$1)`, [clientB + '/stolen.png']));
});
await asUser(clientB, async () => {
  await db.query(`insert into public.projects(id,name,mode,client_id) values($1,'Client B brief','draw',$2)`, [projectB, clientB]);
  await denied(() => db.query(`insert into public.projects(id,name,mode,client_id,image_path) values(gen_random_uuid(),'Stolen reference','upload',$1,$2)`, [clientB, clientA + '/reference.png']));
  const rows = (await db.query('select id from public.projects')).rows;
  assert.deepEqual(rows.map(row => row.id), [projectB]);
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
  assert.equal((await db.query('select * from public.profiles')).rows.length, 1);
  assert.equal((await db.query(`update public.projects set status='completed' where id=$1 returning id`, [projectB])).rows.length, 0, 'clients cannot change status');
});
await asUser(artist, async () => {
  assert.equal((await db.query('select * from public.projects')).rows.length, 3, 'artist sees both clients and legacy');
  assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
  assert.equal((await db.query('select * from public.profiles')).rows.length, 3);
  await db.query(`update public.projects set status='ready_for_review' where id=$1`, [projectA]);
  await denied(() => db.query(`update public.projects set client_id=$1 where id=$2`, [clientB, projectA]));
  await denied(() => db.query(`update public.projects set status='made_up' where id=$1`, [projectA]));
  await db.query(`insert into public.artist_notes(project_id,body,author_id) values($1,'Private studio note',$2)`, [projectA, artist]);
  await db.query(`update public.artist_notes set body='Updated private note',author_id=$1 where project_id=$2`, [artist, projectA]);
});
await asUser(clientA, async () => {
  assert.equal((await db.query('select status from public.projects where id=$1', [projectA])).rows[0].status, 'ready_for_review');
  assert.equal((await db.query('select * from public.artist_notes')).rows.length, 0, 'artist notes stay private');
  await denied(() => db.query(`insert into public.artist_notes(project_id,body,author_id) values($1,'Client note',$2)`, [projectB, clientA]));
});
await asUser(null, async () => {
  await denied(() => db.query('select * from public.projects'));
  await denied(() => db.query(`insert into public.projects(name,mode) values('Anonymous','draw')`));
  await denied(() => db.query(`insert into storage.objects(bucket_id,name) values('project-images','anonymous.png')`));
}, 'anon');
await db.query(`update auth.users set raw_user_meta_data='{"role":"artist","full_name":"Updated name"}' where id=$1`, [clientA]);
assert.equal((await db.query('select role from public.profiles where id=$1', [clientA])).rows[0].role, 'client');
assert.equal((await db.query('select count(*)::int as count from public.projects')).rows[0].count, 3);
console.log('PASS: migration reruns safely; ownership, artist access, private notes, status-only updates, private storage, metadata escalation, and anonymous restrictions verified in PostgreSQL.');
const registration = readFileSync(new URL('../supabase/004_registration.sql', import.meta.url), 'utf8');
await db.exec(registration);
assert.equal((await db.query('select count(*)::int as count from public.profiles where onboarded_at is not null')).rows[0].count,3);
assert.equal((await db.query('select role from public.profiles where id=$1',[artist])).rows[0].role,'artist');
const newcomer='44444444-4444-4444-8444-444444444444';
const applicant='55555555-5555-4555-8555-555555555555';
await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'new@example.test','{"role":"artist","onboarded_at":"2026-01-01"}'),($2,'applicant@example.test','{}')`,[newcomer,applicant]);
await db.exec(registration);
assert.equal((await db.query('select onboarded_at from public.profiles where id=$1',[newcomer])).rows[0].onboarded_at,null,'rerun must not skip new registration');
await asUser(newcomer,async()=>{
  await denied(()=>db.query(`insert into public.projects(name,mode,client_id) values('Bypass','draw',$1)`,[newcomer]));
  await denied(()=>db.query(`insert into storage.objects(bucket_id,name) values('brief-files',$1)`,[newcomer+'/bypass.png']));
  await denied(()=>db.query(`update public.profiles set onboarded_at=now(),role='artist' where id=$1`,[newcomer]));
  await assert.rejects(()=>db.query(`select public.complete_registration('Name','admin')`),/Choose client or artist/);
  await assert.rejects(()=>db.query(`select public.complete_registration('  ','client')`),/display name/);
  await assert.rejects(()=>db.query(`select public.complete_registration('Name','artist','javascript:alert(1)')`),/portfolio URL/);
  await db.query(`select public.complete_registration('Chosen Name','client')`);
  await db.query(`select public.complete_registration('Retry','client')`);
  assert.equal((await db.query('select display_name,role from public.profiles where id=$1',[newcomer])).rows[0].display_name,'Chosen Name');
  await db.query(`insert into public.projects(name,mode,client_id) values('Registered brief','draw',$1)`,[newcomer]);
});
await db.query(`update auth.users set raw_user_meta_data='{"full_name":"Google Name","role":"artist"}' where id=$1`,[newcomer]);
assert.equal((await db.query('select display_name from public.profiles where id=$1',[newcomer])).rows[0].display_name,'Chosen Name');
await asUser(applicant,async()=>{
  await db.query(`select public.complete_registration('New Artist','artist','https://portfolio.example','I draw.')`);
  await db.query(`select public.complete_registration('Retry','artist')`);
  assert.equal((await db.query('select role from public.profiles where id=$1',[applicant])).rows[0].role,'client');
  assert.equal((await db.query('select status,introduction from public.artist_applications')).rows[0].introduction,'I draw.');
  await denied(()=>db.query(`update public.artist_applications set status='approved' where user_id=$1`,[applicant]));
  await denied(()=>db.query(`insert into public.artist_applications(user_id,status) values($1,'approved')`,[newcomer]));
  await denied(()=>db.query(`select private.review_artist_application($1,'approved')`,[applicant]));
  assert.equal((await db.query('select * from public.projects')).rows.length,0,'pending artists cannot read others briefs');
});
await asUser(artist,async()=>{
  assert.equal((await db.query('select * from public.artist_applications')).rows.length,0,'studio artists are not application reviewers');
  await denied(()=>db.query(`select private.review_artist_application($1,'approved')`,[applicant]));
});
await asUser(null,async()=>{
  await denied(()=>db.query(`select public.complete_registration('Anon','client')`));
  await denied(()=>db.query('select * from public.artist_applications'));
},'anon');
await db.query(`select private.review_artist_application($1,'rejected','Please add more work.')`,[applicant]);
await asUser(applicant,async()=>{
  assert.equal((await db.query('select status from public.artist_applications')).rows[0].status,'rejected');
  await db.query(`select public.complete_registration('New Artist','artist','https://portfolio.example/new','More work')`);
  assert.equal((await db.query('select status,review_message from public.artist_applications')).rows[0].review_message,'');
});
await db.query(`select private.review_artist_application($1,'approved','Welcome!')`,[applicant]);
await assert.rejects(()=>db.query(`select private.review_artist_application($1,'rejected')`,[applicant]),/already been reviewed/);
await asUser(applicant,async()=>{
  assert.equal((await db.query('select role from public.profiles where id=$1',[applicant])).rows[0].role,'artist');
  assert.equal((await db.query('select * from public.projects')).rows.length,4);
  await db.query(`select public.complete_registration('Retry','client')`);
  assert.equal((await db.query('select role from public.profiles where id=$1',[applicant])).rows[0].role,'artist');
});
await db.exec(registration);
assert.equal((await db.query('select status from public.artist_applications where user_id=$1',[applicant])).rows[0].status,'approved');
console.log('PASS registration: grandfathering, safe reruns, metadata protection, client signup, pending/rejected/resubmitted/approved artists, idempotent retries, private applications, owner-only review, submission/upload gates, role escalation denied.');
// Account deletion must retain briefs/files and block old tokens from private files.
await db.exec(`
  create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade);
  create table auth.identities(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade);
  create table auth.refresh_tokens(id integer primary key,user_id text);
  alter table storage.objects add column owner uuid references auth.users(id), add column owner_id text;
  alter table storage.buckets add column owner uuid references auth.users(id), add column owner_id text;
`);
await db.query('insert into auth.sessions(user_id) values($1)',[applicant]);
await db.query('insert into auth.identities(user_id) values($1)',[applicant]);
await db.query('insert into auth.refresh_tokens values(1,$1)',[applicant]);
await db.query('update storage.objects set owner=$1::uuid,owner_id=($1::uuid)::text',[clientA]);
await db.query('update storage.buckets set owner=$1::uuid,owner_id=($1::uuid)::text',[artist]);
const resetSQL = readFileSync(new URL('../supabase/reset_all_accounts.sql',import.meta.url),'utf8');
await db.exec(resetSQL);
for (const table of ['auth.users','auth.sessions','auth.identities','auth.refresh_tokens','public.profiles','public.artist_applications']) {
  assert.equal((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count,0,table+' is cleared');
}
assert.equal((await db.query('select count(*)::int as count from public.projects')).rows[0].count,4);
assert.equal((await db.query('select body,author_id from public.artist_notes')).rows[0].body,'Updated private note');
assert.equal((await db.query('select author_id from public.artist_notes')).rows[0].author_id,null);
assert.equal((await db.query('select count(*)::int as count from storage.objects')).rows[0].count,1);
await asUser(clientA,async()=>{
  assert.equal((await db.query('select * from storage.objects')).rows.length,0,'deleted user token cannot read retained private files');
  assert.equal((await db.query('select * from public.projects')).rows.length,0);
});
const recreated='66666666-6666-4666-8666-666666666666';
await db.query(`insert into auth.users(id,email,raw_user_meta_data) values($1,'artist@example.test','{"role":"artist"}')`,[recreated]);
await asUser(recreated,async()=>{
  const profile=(await db.query('select role,onboarded_at from public.profiles')).rows[0];
  assert.equal(profile.onboarded_at,null); assert.equal(profile.role,'client');
  assert.equal((await db.query('select * from public.projects')).rows.length,0);
  await db.query(`select public.complete_registration('Studio Owner','artist')`);
});
await db.query(`select private.review_artist_application($1,'approved')`,[recreated]);
await asUser(recreated,async()=>{
  assert.equal((await db.query('select * from public.projects')).rows.length,4);
  assert.equal((await db.query('select * from storage.objects')).rows.length,1);
  assert.equal((await db.query('select * from public.artist_notes')).rows.length,1);
});
console.log('PASS full account reset: all users/identities/sessions/applications removed; briefs/notes/files retained; old tokens blocked; fresh signup and owner approval restore studio access.');
const fullResetSQL=readFileSync(new URL('../supabase/reset_accounts_and_submissions.sql',import.meta.url),'utf8');
await assert.rejects(()=>db.exec(fullResetSQL),/Empty brief-files and project-images/);
await db.exec('rollback');
assert.equal((await db.query('select count(*)::int as count from public.projects')).rows[0].count,4,'storage guard must leave records untouched');
assert.equal((await db.query('select count(*)::int as count from auth.users')).rows[0].count,1);
// The mock storage table has no real files; simulate dashboard removal before SQL.
await db.exec('delete from storage.objects');
await db.exec(fullResetSQL);
for(const table of ['auth.users','auth.sessions','auth.identities','auth.refresh_tokens','public.profiles','public.projects','public.artist_notes','public.artist_applications']) {
  assert.equal((await db.query(`select count(*)::int as count from ${table}`)).rows[0].count,0,table+' cleared by full reset');
}
assert.equal((await db.query('select count(*)::int as count from storage.buckets')).rows[0].count,2,'bucket containers remain available');
console.log('PASS submissions reset: refuses existing files without deleting records; removes all accounts/briefs/notes/applications after Storage cleanup; keeps buckets.');
await db.close();
