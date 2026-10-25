<?php
declare(strict_types=1);

function loading_screen_head(string $kind = 'workspace'): void
{
    $kind = in_array($kind, ['landing', 'workspace', 'list'], true) ? $kind : 'workspace';
    ?>
    <style>
      #page-loading { position: fixed; inset: 0; z-index: 9999; overflow: auto; background: #f7f8fc; color: #1d2b4d; font: 14px/1.5 Arial, sans-serif; }
      #page-loading, #page-loading * { box-sizing: border-box; }
      #page-loading[hidden] { display: none !important; }
      #page-loading .load-wrap { width: min(1120px, 90%); margin: auto; }
      #page-loading .load-nav { height: 88px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid #dce3ef; }
      #page-loading .load-brand { display: flex; align-items: center; gap: 10px; color: #1d2b4d; font-weight: 800; font-size: 22px; letter-spacing: -.04em; }
      #page-loading .load-mark { display: grid; place-items: center; width: 31px; height: 31px; border-radius: 8px; background: #1d2b4d; color: #ffd166; }
      #page-loading .load-navlinks { display: flex; gap: 14px; align-items: center; }
      #page-loading .load-main { padding: 62px 0; }
      #page-loading .load-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 56px; align-items: center; }
      #page-loading .load-copy { max-width: 510px; }
      #page-loading .load-block { display: block; border-radius: 9px; background: #e3e8f2; background-image: linear-gradient(100deg, transparent 30%, #f5f7fb 48%, transparent 66%); background-size: 220% 100%; animation: load-shimmer 1.5s ease-in-out infinite; }
      #page-loading .load-eyebrow { width: 140px; height: 12px; margin-bottom: 24px; }
      #page-loading .load-title { width: 85%; height: 45px; margin: 0 0 12px; }
      #page-loading .load-title.short { width: 62%; }
      #page-loading .load-line { width: 90%; height: 15px; margin: 12px 0; }
      #page-loading .load-line.short { width: 67%; }
      #page-loading .load-button { width: 160px; height: 48px; margin-top: 27px; border-radius: 10px; }
      #page-loading .load-visual { min-height: 315px; border: 1px solid #dce3ef; border-radius: 18px; background: white; padding: 30px; }
      #page-loading .load-visual .load-title { height: 35px; width: 58%; }
      #page-loading .load-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 18px; margin-top: 42px; }
      #page-loading .load-card { min-height: 112px; border: 1px solid #dce3ef; border-radius: 15px; background: white; padding: 23px; }
      #page-loading .load-card .load-line { height: 13px; }
      #page-loading .load-message { margin: 28px 0 0; color: #63718d; font-size: 13px; }
      #page-loading.load-list .load-grid { display: block; }
      #page-loading.load-list .load-visual { display: none; }
      #page-loading.load-list .load-copy { max-width: 680px; }
      #page-loading.load-list .load-cards { grid-template-columns: 1fr; }
      #page-loading.load-list .load-card { min-height: 90px; }
      @keyframes load-shimmer { from { background-position: 120% 0; } to { background-position: -120% 0; } }
      @media (max-width: 680px) {
        #page-loading .load-nav { height: 74px; }
        #page-loading .load-navlinks .load-block:nth-child(n+2) { display: none; }
        #page-loading .load-main { padding: 40px 0; }
        #page-loading .load-grid { display: block; }
        #page-loading .load-title { height: 35px; }
        #page-loading .load-visual { min-height: 190px; margin-top: 34px; }
        #page-loading .load-cards { grid-template-columns: 1fr; gap: 12px; margin-top: 28px; }
        #page-loading .load-card { min-height: 75px; }
        #page-loading .load-card:nth-child(n+3) { display: none; }
      }
      @media (prefers-reduced-motion: reduce) { #page-loading .load-block { animation: none; background-image: none; } }
    </style>
    <script>
      (() => {
        const kind = <?= json_encode($kind) ?>;
        let timer;
        let fallback;
        function hide() {
          clearTimeout(timer);
          clearTimeout(fallback);
          document.getElementById('page-loading')?.remove();
        }
        function show() {
          if (document.getElementById('page-loading')) return;
          const screen = document.createElement('div');
          screen.id = 'page-loading';
          screen.className = 'load-' + kind;
          screen.setAttribute('role', 'status');
          screen.setAttribute('aria-label', 'Loading page');
          screen.innerHTML = '<div class="load-wrap"><div class="load-nav"><div class="load-brand"><span class="load-mark" aria-hidden="true">✦</span>Mamungkun</div><div class="load-navlinks" aria-hidden="true"><i class="load-block" style="width:65px;height:14px"></i><i class="load-block" style="width:90px;height:14px"></i><i class="load-block" style="width:108px;height:38px"></i></div></div><div class="load-main"><div class="load-grid"><div class="load-copy" aria-hidden="true"><i class="load-block load-eyebrow"></i><i class="load-block load-title"></i><i class="load-block load-title short"></i><i class="load-block load-line"></i><i class="load-block load-line short"></i><i class="load-block load-button"></i></div><div class="load-visual" aria-hidden="true"><i class="load-block load-eyebrow"></i><i class="load-block load-title"></i><i class="load-block load-line"></i><i class="load-block load-line short"></i><i class="load-block load-line"></i></div></div><div class="load-cards" aria-hidden="true"><div class="load-card"><i class="load-block load-line"></i><i class="load-block load-line short"></i></div><div class="load-card"><i class="load-block load-line"></i><i class="load-block load-line short"></i></div><div class="load-card"><i class="load-block load-line"></i><i class="load-block load-line short"></i></div></div><p class="load-message">Loading your space…</p></div></div>';
          document.documentElement.appendChild(screen);
          fallback = setTimeout(hide, 10000);
        }
        timer = setTimeout(show, 180);
        window.addEventListener('load', hide, { once: true });
        window.addEventListener('pageshow', hide);
        document.addEventListener('click', event => {
          const link = event.target.closest?.('a[href]');
          if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || link.target && link.target !== '_self') return;
          const url = new URL(link.href, location.href);
          if (url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search || !/\.php$|\/$/.test(url.pathname)) return;
          setTimeout(() => { if (!event.defaultPrevented) show(); }, 0);
        });
      })();
    </script>
    <?php
}
