(function () {
  'use strict';
  fetch('/api/public-projects', { cache: 'no-store' })
    .then(function (r) {
      return r.ok ? r.json() : [];
    })
    .then(function (items) {
      if (!Array.isArray(items) || !items.length) return;
      var grid = document.querySelector('.project-grid'),
        template = grid && grid.querySelector('.pcard');
      if (!grid || !template) return;
      grid.replaceChildren();
      items.forEach(function (p, i) {
        var card = template.cloneNode(true);
        card.setAttribute('data-pcat', p.categories || '');
        card.querySelector('.pcard-num-token').textContent =
          String(i + 1).padStart(2, '0') +
          ' / ' +
          (p.subtitle || 'PROJECT').toUpperCase();
        card.querySelector('.window-url').textContent = p.url || 'Project';
        card.querySelector('.window-status').textContent =
          p.status || 'Project';
        var img = card.querySelector('.pcard-logo img');
        if (img) {
          var image = typeof p.image === 'string' ? p.image.trim() : '';
          var isAsset =
            /^\/?assets\/[A-Za-z0-9_./-]+$/.test(image) &&
            !image.split('/').includes('..');
          var isUpload =
            /^\/?api\/uploads\/[0-9a-f]{32}\.(?:png|jpg|webp|gif)$/.test(image);
          var imagePath =
            (isAsset || isUpload) && image
              ? image
              : 'assets/logos/ai-career-agent.jpg';
          img.src = imagePath;
          img.alt = p.imageAlt || p.title;
        }
        card.querySelector('h3').textContent = p.title || '';
        card.querySelector('p.desc').textContent = p.description || '';
        var tags = card.querySelector('.tags');
        tags.replaceChildren();
        (p.tags || []).forEach(function (t) {
          var s = document.createElement('span');
          s.className = 'tag';
          s.textContent = t;
          tags.appendChild(s);
        });
        var links = card.querySelector('.pcard-links');
        links.replaceChildren();
        [
          ['live', 'Live ↗'],
          ['github', 'GitHub ↗'],
        ].forEach(function (pair) {
          var safeUrl = '';
          try {
            var parsed = new URL(p[pair[0]], location.href);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:')
              safeUrl = parsed.href;
          } catch (_) {}
          if (safeUrl) {
            var a = document.createElement('a');
            a.className = 'plink';
            a.href = safeUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = pair[1];
            links.appendChild(a);
          }
        });
        var b = document.createElement('button');
        b.className = 'plink pcard-details-btn';
        b.type = 'button';
        b.textContent = 'Project Details';
        links.appendChild(b);
        grid.appendChild(card);
      });
      var all = document.querySelector('[data-pfilter="all"]');
      if (all) all.textContent = 'All Projects (' + items.length + ')';
    })
    .catch(function () {});
})();
