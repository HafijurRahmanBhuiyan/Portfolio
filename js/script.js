document.getElementById('year').textContent = new Date().getFullYear();

  // Theme toggle
  var sunIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/></svg>';
  var moonIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>';
  function paintThemeIcon(){
    var t = document.documentElement.getAttribute('data-theme');
    document.getElementById('themeIcon').innerHTML = t === 'light' ? moonIcon : sunIcon;
  }
  paintThemeIcon();
  document.getElementById('themeToggle').addEventListener('click', function(){
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try{ localStorage.setItem('hrb-theme', next); }catch(e){}
    paintThemeIcon();
  });

  // Mobile menu
  var burger = document.getElementById('burgerBtn');
  var panel = document.getElementById('mobilePanel');
  burger.addEventListener('click', function(){
    var open = panel.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  panel.querySelectorAll('a').forEach(function(a){
    a.addEventListener('click', function(){ panel.classList.remove('open'); burger.setAttribute('aria-expanded','false'); });
  });

  // Active section highlight
  var navLinks = document.querySelectorAll('nav.links a');
  var sections = Array.from(document.querySelectorAll('main section[id]'));
  var byId = {};
  navLinks.forEach(function(a){ byId[a.getAttribute('href').slice(1)] = a; });
  var io = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      if(entry.isIntersecting){
        navLinks.forEach(function(a){ a.removeAttribute('aria-current'); });
        var link = byId[entry.target.id];
        if(link) link.setAttribute('aria-current','true');
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  sections.forEach(function(s){ io.observe(s); });

  // Reveal on scroll
  var revealEls = document.querySelectorAll('.reveal');
  var rio = new IntersectionObserver(function(entries){
    entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); rio.unobserve(e.target); } });
  }, { threshold: 0.12 });
  revealEls.forEach(function(el){ rio.observe(el); });

  // Back to top
  document.getElementById('backTop').addEventListener('click', function(){
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Profile image: falls back to the placeholder icon if assets/profile.jpg is missing
  (function(){
    var img = document.getElementById('profileImg');
    var fallback = document.getElementById('photoFallback');
    img.addEventListener('error', function(){ img.style.display = 'none'; fallback.style.display = 'flex'; });
    img.addEventListener('load', function(){ img.style.display = 'block'; fallback.style.display = 'none'; });
  })();
