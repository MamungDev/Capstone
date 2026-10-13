-- REVIEW TOOL, not a migration. Run only in the Supabase SQL Editor.
-- 1. Run this SELECT and inspect the applicant before granting access.
select a.user_id, p.display_name, p.email, a.portfolio_url, a.introduction,
  a.status, a.submitted_at
from public.artist_applications a join public.profiles p on p.id=a.user_id
order by a.submitted_at desc;

-- 2. Copy the applicant's user_id above. Uncomment ONE call and replace the UUID.
-- Approval grants access to ALL client briefs and studio notes in this prototype.
-- select private.review_artist_application('APPLICANT-UUID-HERE'::uuid, 'approved', 'Welcome to the studio!');
-- select private.review_artist_application('APPLICANT-UUID-HERE'::uuid, 'rejected', 'Please add a portfolio and apply again.');
-- The review message is visible to the applicant. Do not include private notes.
