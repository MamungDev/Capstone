# Brief submissions

This app's source is `dist/app.js`, served at http://localhost:3000. It is separate
from the React project in `C:\xampp\htdocs\Prototype 1`.

`Submit brief` now calls `dist/submissions.js`, using the existing public
configuration in `dist/auth-config.js`. No new database migration is needed for
the current Supabase project.

- Submitted records appear in Supabase Table Editor > public > projects.
- The project name maps to `name`; the idea, audience, goal, project type,
  format, style, colour energy, keywords and reference filename map to `description`.
- Reference images and sketches upload to the `project-images` bucket; their
  public URLs appear in `image_url`.
- The success page shows the database row's submission ID after a successful insert.
- Drafts remain local until explicitly submitted. Old browser-only success screens
  reopen at Review so those briefs can be submitted to the database.

This uses the existing anonymous insert-only policies, even when Google sign-in
is active. Submissions currently have no account owner or cross-device editing.
Images in the existing bucket are public. A failed database insert can leave an
uploaded image; retrying in the same page reuses that image.

Deploy the whole `dist` directory, including `submissions.js`, for these changes
to reach a hosted site. For local testing, hard-refresh http://localhost:3000.
