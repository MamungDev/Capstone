<?php
declare(strict_types=1);
// This public notice can be read without signing in or opening a session.
header('Content-Type: text/html; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="How Mamungkun uses account information, cookies, and browser storage to support your creative workspace.">
  <meta name="theme-color" content="#f7f8fc">
  <title>Privacy &amp; Cookies &mdash; Mamungkun</title>
  <link rel="icon" href="assets/mamungkun-icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&amp;family=Manrope:wght@400;600;700;800&amp;family=Playfair+Display:ital,wght@0,600;0,700;1,600&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="assets/css/landing.css">
  <link rel="stylesheet" href="assets/css/privacy.css?v=<?= filemtime(__DIR__ . '/assets/css/privacy.css') ?>">
</head>
<body id="home">
<a class="privacy-skip" href="#privacy-content">Skip to privacy information</a>
<div id="landing">
  <header class="home-nav">
    <a class="home-brand" href="index.php"><span aria-hidden="true">&#10022;</span>Mamungkun</a>
    <nav aria-label="Main navigation"><a href="index.php">Back to home <span aria-hidden="true">&rarr;</span></a></nav>
  </header>
  <main class="home-main privacy-main" id="privacy-content">
    <header class="privacy-heading">
      <p class="home-kicker">Your creative space / Your information</p>
      <h1>Privacy &amp; <em>Cookies.</em></h1>
      <p class="privacy-intro">A clear look at the information that helps your workspace work, where it stays, and the choices you have.</p>
      <p class="privacy-updated">Last updated <time datetime="2026-10-27">27 October 2026</time></p>
    </header>
    <div class="privacy-layout">
      <nav class="privacy-contents" aria-label="On this page">
        <p>On this page</p>
        <a href="#accounts">Account information</a>
        <a href="#projects">Projects &amp; access</a>
        <a href="#storage">Cookies &amp; saved drafts</a>
        <a href="#services">Connected services</a>
        <a href="#retention">Keeping &amp; removing data</a>
        <a href="#choices">Your choices</a>
        <a href="#contact">Privacy questions</a>
      </nav>
      <article class="privacy-card">
        <section id="accounts">
          <p class="privacy-section-number">01 / Your account</p>
          <h2>The information you share.</h2>
          <p>Mamungkun stores your email address, display name, account role (client or artist), and account dates so you can sign in and use the right workspace. If you add a biography or profile photo, those are stored with your account too.</p>
          <p>Passwords are stored as hashes. If you use Google sign-in, we also store the Google account identifier used to recognize your account.</p>
          <p>Administrator accounts have additional security records, including an encrypted authenticator key, hashed recovery codes, and sign-in attempt records. Administrative actions are logged with the administrator, affected record, time, and relevant changes or reasons.</p>
        </section>
        <section id="projects">
          <p class="privacy-section-number">02 / Your work</p>
          <h2>From draft to shared brief.</h2>
          <p>Draft text, images, and editable sketches are saved in your browser. When you submit a brief, its details and references are uploaded and stored with your account, together with project assignment and progress information.</p>
          <p>Artists can view a brief after unlocking it with its shared project code or receiving access through an administrator. Anyone with the code and an artist account may be able to unlock it, so share the code only with intended collaborators.</p>
          <p>Authorized administrators can review accounts, briefs, and reference images to manage the service. Administrative changes and private project or reference views are recorded in the activity log.</p>
        </section>
        <section id="storage">
          <p class="privacy-section-number">03 / On your device</p>
          <h2>Cookies &amp; saved drafts.</h2>
          <p>The application uses a session cookie for sign-in, security checks, and multi-step account setup. Browser storage lets you return to a saved client draft. The current application does not include advertising or analytics tracking scripts.</p>
          <div class="privacy-table-wrap" role="region" aria-label="Cookies and browser storage details" tabindex="0">
            <table>
              <caption>What is stored in your browser</caption>
              <thead><tr><th scope="col">Storage</th><th scope="col">Purpose</th><th scope="col">How long it stays</th></tr></thead>
              <tbody>
                <tr><th scope="row">Session cookie<br><code>mamungkun_session</code></th><td>Connects your browser to its session for authentication and security checks.</td><td>Set as a session cookie. Browsers may restore it when restoring a previous session; server-side sign-in can expire sooner.</td></tr>
                <tr><th scope="row">Saved drafts<br>IndexedDB</th><td>Stores client draft text, reference images, and editable sketches on this device, separated by account.</td><td>Until replaced, cleared through your browser, or removed by the browser. Signing out does not erase saved drafts.</td></tr>
                <tr><th scope="row">Older saved drafts<br>Local storage</th><td>Reads drafts saved by an earlier version and transfers them to the current draft storage when possible.</td><td>Removed after a successful transfer, or when you clear the site's browser data.</td></tr>
              </tbody>
            </table>
          </div>
          <p class="privacy-note">Clearing this site's browser data can sign you out and erase drafts that have not been submitted. It does not delete accounts or submitted briefs stored on the server.</p>
        </section>
        <section id="services">
          <p class="privacy-section-number">04 / Connected services</p>
          <h2>Services that help the site run.</h2>
          <p><strong>Google sign-in, when enabled:</strong> choosing this option takes you to Google to authenticate. Mamungkun requests your basic profile and email identity; it does not request access to Gmail messages.</p>
          <p><strong>Google Fonts:</strong> pages use fonts delivered by Google. Your browser connects to Google's servers to download them. See <a href="https://policies.google.com/privacy">Google's Privacy Policy</a> for its handling of information.</p>
          <p><strong>Hosting and databases:</strong> when the site is hosted online, its hosting and database providers process the information needed to deliver pages and store accounts and submitted work. Server and hosting logs may also record technical request or error information.</p>
        </section>
        <section id="retention">
          <p class="privacy-section-number">05 / Data over time</p>
          <h2>Keeping &amp; removing information.</h2>
          <p>Accounts, submitted briefs, references, and administrative activity records currently have no automatic age-based deletion schedule. Administrators can remove accounts, projects, and references using the management tools.</p>
          <p>Deleting a client account removes its submitted briefs and uploaded references from the application's database. Administrative activity records can remain, including information recorded about deleted accounts or projects. Clearing browser data and deleting server records are separate actions.</p>
          <p>Reference files are uploaded as part of submission before the final brief is saved. If submission is interrupted, some uploads may remain on the server for a retry, even if the brief did not finish submitting.</p>
        </section>
        <section id="choices">
          <p class="privacy-section-number">06 / Your choices</p>
          <h2>You have a say.</h2>
          <ul>
            <li>Edit your display name, biography, and profile photo from your workspace profile.</li>
            <li>Choose what you include in a brief and who receives its project code.</li>
            <li>Use your browser's site-data settings to clear cookies and saved drafts. Blocking session cookies can prevent sign-in and security checks from working.</li>
            <li>Sign out when using a shared device. Saved drafts may still remain in that browser until its site data is cleared.</li>
          </ul>
        </section>
        <section id="contact">
          <p class="privacy-section-number">07 / Get in touch</p>
          <h2>Questions about your information?</h2>
          <p>Contact <strong>Mamungkun Support</strong> at <a href="mailto:inqurery@gmail.com">inqurery@gmail.com</a> for website inquiries, questions about stored information, or requests to remove your account or briefs.</p>
          <p>The site does not currently offer a self-service account deletion form. Please describe your request in your email and do not include passwords, authenticator codes, or recovery codes.</p>
        </section>
      </article>
    </div>
  </main>
  <footer class="home-footer">
    <a class="home-brand" href="index.php">Mamungkun</a>
    <p>A space for the first draft.</p>
    <nav class="home-footer-links" aria-label="Footer navigation"><a href="privacy.php" aria-current="page">Privacy &amp; Cookies</a><a href="index.php">Back to home</a></nav>
  </footer>
</div>
</body>
</html>
