// Hafijur Rahman Bhuiyan Portfolio — Executive 3D Physics, Audio & Interactive Systems
(function () {
  'use strict';

  // =========================================================================
  // 1. Current Year
  // =========================================================================
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // =========================================================================
  // 2. Ambient Background Music Experience (Web Audio API Engine)
  // =========================================================================
  var audioCtx = null;
  var isMusicPlaying = false;
  var musicMasterGain = null;
  var musicTimer = null;
  var activeVoices = [];
  var soundToggleBtn = document.getElementById('soundToggle');
  var soundIcon = document.getElementById('soundIcon');

  function initAudioContext() {
    if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      var AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // Harmonic chord progressions (frequencies in Hz): Peaceful Ambient Soundscape in D Dorian
  // Dm9: D3, F3, A3, C4, E4
  // Bbmaj7: Bb2, D3, F3, A3, D4
  // Gm7: G2, Bb2, D3, F3, A3
  // Am7: A2, C3, E3, G3, C4
  var chordProgressions = [
    [146.83, 174.61, 220.00, 261.63, 329.63],
    [116.54, 146.83, 174.61, 220.00, 293.66],
    [98.00, 116.54, 146.83, 174.61, 220.00],
    [110.00, 130.81, 164.81, 196.00, 261.63]
  ];

  // Pentatonic chime notes for gentle occasional Rhodes bells (Hz)
  var chimeNotes = [293.66, 329.63, 349.23, 440.00, 523.25, 587.33, 659.25];

  var currentChordIdx = 0;
  var padFilter = null;
  var delayNode = null;
  var delayGain = null;

  function createAmbientPad(chord, duration) {
    if (!audioCtx || !musicMasterGain) return;
    var now = audioCtx.currentTime;

    chord.forEach(function (freq, i) {
      try {
        var osc1 = audioCtx.createOscillator();
        var osc2 = audioCtx.createOscillator();
        var voiceGain = audioCtx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';

        // Gentle chorus detuning
        osc1.frequency.setValueAtTime(freq, now);
        osc2.frequency.setValueAtTime(freq * 1.003, now);

        var baseGain = 0.016 / (i + 1);
        voiceGain.gain.setValueAtTime(0.0001, now);
        voiceGain.gain.linearRampToValueAtTime(baseGain, now + 1.8);
        voiceGain.gain.setValueAtTime(baseGain, now + duration - 1.8);
        voiceGain.gain.linearRampToValueAtTime(0.0001, now + duration);

        osc1.connect(voiceGain);
        osc2.connect(voiceGain);
        voiceGain.connect(padFilter);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + duration + 0.1);
        osc2.stop(now + duration + 0.1);

        activeVoices.push(osc1, osc2, voiceGain);
      } catch (e) {}
    });
  }

  function playBellChime() {
    if (!audioCtx || !musicMasterGain || !isMusicPlaying) return;
    try {
      var now = audioCtx.currentTime;
      var note = chimeNotes[Math.floor(Math.random() * chimeNotes.length)];
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note, now);

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.026, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

      osc.connect(gain);
      gain.connect(delayNode);
      gain.connect(musicMasterGain);

      osc.start(now);
      osc.stop(now + 2.3);
      activeVoices.push(osc, gain);
    } catch (e) {}
  }

  function ambientStep() {
    if (!isMusicPlaying || !audioCtx) return;
    var duration = 7.5;
    var chord = chordProgressions[currentChordIdx];
    currentChordIdx = (currentChordIdx + 1) % chordProgressions.length;

    createAmbientPad(chord, duration);

    setTimeout(function () { if (isMusicPlaying) playBellChime(); }, 1200);
    setTimeout(function () { if (isMusicPlaying) playBellChime(); }, 3800);
    setTimeout(function () { if (isMusicPlaying) playBellChime(); }, 5600);

    if (activeVoices.length > 50) {
      activeVoices = activeVoices.slice(-20);
    }

    musicTimer = setTimeout(ambientStep, (duration - 1.2) * 1000);
  }

  function startBackgroundMusic() {
    initAudioContext();
    if (!audioCtx) return;

    isMusicPlaying = true;
    currentChordIdx = 0;

    musicMasterGain = audioCtx.createGain();
    musicMasterGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    // Smooth fade-in over 1.8 seconds
    musicMasterGain.gain.linearRampToValueAtTime(0.09, audioCtx.currentTime + 1.8);
    musicMasterGain.connect(audioCtx.destination);

    padFilter = audioCtx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.setValueAtTime(520, audioCtx.currentTime);
    padFilter.Q.setValueAtTime(1.2, audioCtx.currentTime);
    padFilter.connect(musicMasterGain);

    delayNode = audioCtx.createDelay(1.0);
    delayNode.delayTime.setValueAtTime(0.38, audioCtx.currentTime);
    delayGain = audioCtx.createGain();
    delayGain.gain.setValueAtTime(0.28, audioCtx.currentTime);

    delayNode.connect(delayGain);
    delayGain.connect(delayNode);
    delayGain.connect(musicMasterGain);

    updateAudioButtonUI(true);
    ambientStep();
    showToast('♫ Ambient background music playing');
  }

  function stopBackgroundMusic() {
    if (!isMusicPlaying) return;
    isMusicPlaying = false;
    clearTimeout(musicTimer);

    if (musicMasterGain && audioCtx) {
      try {
        var now = audioCtx.currentTime;
        musicMasterGain.gain.setValueAtTime(musicMasterGain.gain.value, now);
        // Smooth fade-out over 1.2 seconds
        musicMasterGain.gain.linearRampToValueAtTime(0.0001, now + 1.2);
        setTimeout(function () {
          try {
            musicMasterGain.disconnect();
            activeVoices.forEach(function (node) {
              try { node.stop ? node.stop() : node.disconnect(); } catch (e) {}
            });
            activeVoices = [];
          } catch (e) {}
        }, 1300);
      } catch (e) {}
    }

    updateAudioButtonUI(false);
    showToast('Background music paused');
  }

  function updateAudioButtonUI(playing) {
    if (!soundToggleBtn || !soundIcon) return;
    if (playing) {
      soundToggleBtn.classList.add('playing');
      soundToggleBtn.setAttribute('title', 'Background Music: Playing (Click to pause)');
      soundIcon.innerHTML = '<span class="audio-eq-bars"><span class="audio-eq-bar"></span><span class="audio-eq-bar"></span><span class="audio-eq-bar"></span></span>';
    } else {
      soundToggleBtn.classList.remove('playing');
      soundToggleBtn.setAttribute('title', 'Background Music: Paused (Click to play)');
      soundIcon.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>';
    }
  }

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', function () {
      if (isMusicPlaying) {
        stopBackgroundMusic();
      } else {
        startBackgroundMusic();
      }
    });
  }

  function playUiTone(freqStart, freqEnd, duration, type, gainLevel) {
    try {
      initAudioContext();
      if (!audioCtx) return;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
      if (freqEnd && freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainLevel || 0.03, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function playClickSound() { playUiTone(780, 1100, 0.035, 'sine', 0.025); }
  function playFlipSound() { playUiTone(420, 780, 0.07, 'triangle', 0.03); }
  function playModalOpenSound() { playUiTone(340, 680, 0.1, 'sine', 0.035); }
  function playModalCloseSound() { playUiTone(620, 310, 0.08, 'sine', 0.03); }

  // =========================================================================
  // 3. Color Theme Toggle
  // =========================================================================
  var sunIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.9" y1="4.9" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.1" y2="19.1"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.9" y1="19.1" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.1" y2="4.9"/></svg>';
  var moonIcon = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"/></svg>';

  function paintThemeIcon() {
    var t = document.documentElement.getAttribute('data-theme');
    var iconContainer = document.getElementById('themeIcon');
    if (iconContainer) {
      iconContainer.innerHTML = t === 'light' ? moonIcon : sunIcon;
    }
  }
  paintThemeIcon();

  var themeToggleBtn = document.getElementById('themeToggle');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      playClickSound();
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('hrb-theme', next); } catch (e) {}
      paintThemeIcon();
      showToast('Theme switched to ' + (next === 'light' ? 'Light' : 'Obsidian Dark'));
    });
  }

  // =========================================================================
  // 4. Mobile Navigation Menu
  // =========================================================================
  var burger = document.getElementById('burgerBtn');
  var panel = document.getElementById('mobilePanel');
  if (burger && panel) {
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      playClickSound();
      var open = panel.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    panel.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        panel.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      });
    });

    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') && !panel.contains(e.target) && !burger.contains(e.target)) {
        panel.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) {
        panel.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 960 && panel.classList.contains('open')) {
        panel.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // =========================================================================
  // 5. Toast Feedback System & Quick Actions
  // =========================================================================
  var toastBox = document.getElementById('toastBox');
  var toastMsg = document.getElementById('toastMsg');
  var toastTimer = null;

  function showToast(message) {
    if (!toastBox || !toastMsg) return;
    toastMsg.textContent = message;
    toastBox.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastBox.classList.remove('show');
    }, 2800);
  }

  var copyLocBtn = document.getElementById('copyLocationBtn');
  if (copyLocBtn) {
    copyLocBtn.addEventListener('click', function () {
      playClickSound();
      if (navigator.clipboard) {
        navigator.clipboard.writeText('Uttar Badda, Dhaka, Bangladesh');
        showToast('Location copied: Uttar Badda, Dhaka, Bangladesh');
      }
    });
  }

  var copyPhoneBtn = document.getElementById('copyPhoneBtn');
  if (copyPhoneBtn) {
    copyPhoneBtn.addEventListener('click', function () {
      playClickSound();
      if (navigator.clipboard) {
        navigator.clipboard.writeText('+8801786444587');
        showToast('Phone number copied: +880 1786-444587');
      }
    });
  }

  var copyEmailBtn = document.getElementById('copyEmailBtn');
  if (copyEmailBtn) {
    copyEmailBtn.addEventListener('click', function () {
      playClickSound();
      if (navigator.clipboard) {
        navigator.clipboard.writeText('hrssohan2@gmail.com');
        showToast('Email copied: hrssohan2@gmail.com');
      }
    });
  }

  var resumeBtn = document.getElementById('resumeDownloadBtn');
  if (resumeBtn) {
    resumeBtn.addEventListener('click', function () {
      playClickSound();
      showToast('Downloading Hafijur Rahman Bhuiyan Resume PDF...');
    });
  }
  var navResumeBtn = document.getElementById('navResumeBtn');
  if (navResumeBtn) {
    navResumeBtn.addEventListener('click', function () {
      playClickSound();
      showToast('Downloading Hafijur Rahman Bhuiyan Resume PDF...');
    });
  }

  // =========================================================================
  // 6. Dynamic Role Typing Switcher & Dhaka Live Clock
  // =========================================================================
  var dhakaClockEl = document.getElementById('dhakaClock');
  function updateDhakaClock() {
    if (!dhakaClockEl) return;
    try {
      var d = new Date();
      var timeStr = d.toLocaleTimeString('en-US', {
        timeZone: 'Asia/Dhaka',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      dhakaClockEl.textContent = timeStr + ' GMT+6';
    } catch (e) {
      dhakaClockEl.textContent = 'UTC+6 (Dhaka)';
    }
  }
  updateDhakaClock();
  setInterval(updateDhakaClock, 1000);

  var typeRoleEl = document.getElementById('typeRole');
  if (typeRoleEl) {
    var roles = [
      'Software Engineer & Full-Stack Developer',
      'React & Django Engineer',
      'AI & Web Systems Builder',
      'Full-Stack Developer'
    ];
    var roleIndex = 0;
    var charIndex = roles[0].length;
    var isDeleting = false;
    var typeSpeed = 70;

    function typeLoop() {
      var currentRole = roles[roleIndex];
      if (isDeleting) {
        typeRoleEl.textContent = currentRole.substring(0, charIndex - 1);
        charIndex--;
        typeSpeed = 40;
      } else {
        typeRoleEl.textContent = currentRole.substring(0, charIndex + 1);
        charIndex++;
        typeSpeed = 85;
      }

      if (!isDeleting && charIndex === currentRole.length) {
        isDeleting = true;
        typeSpeed = 2200; // Hold at end
      } else if (isDeleting && charIndex === 0) {
        isDeleting = false;
        roleIndex = (roleIndex + 1) % roles.length;
        typeSpeed = 500; // Brief pause before typing next
      }

      setTimeout(typeLoop, typeSpeed);
    }
    setTimeout(typeLoop, 2000);
  }

  // =========================================================================
  // 7. Interactive Developer Terminal Tabs
  // =========================================================================
  var consoleTabs = document.querySelectorAll('.console-tab');
  var consoleContent = document.getElementById('consoleContent');
  var devConsoleSnippets = {
    terminal: '<span class="c-cmt"># Developer terminal inspection</span>\n<span class="c-kw">$</span> hafijur --status\n<span class="c-cyan">✓</span> Role: <span class="c-str">"Software Engineer &amp; Full-Stack"</span>\n<span class="c-cyan">✓</span> Stack: <span class="c-str">"React / Node / Django / PostgreSQL"</span>\n<span class="c-cyan">✓</span> Status: <span class="c-str">"Available for Full-Time &amp; Remote"</span>\n<span class="c-kw">$</span> <span class="c-fn">ready_to_interview</span>() <span class="c-cmt"># Ready to ship impact</span>',
    stack: '<span class="c-kw">interface</span> <span class="c-cyan">EngineerProfile</span> {\n  frontend: [<span class="c-str">"React 19"</span>, <span class="c-str">"TypeScript"</span>, <span class="c-str">"Tailwind"</span>];\n  backend:  [<span class="c-str">"Django"</span>, <span class="c-str">"DRF"</span>, <span class="c-str">"Node.js"</span>, <span class="c-str">"Fastify"</span>];\n  database: [<span class="c-str">"PostgreSQL"</span>, <span class="c-str">"MongoDB"</span>, <span class="c-str">"Supabase"</span>];\n  ai_stack: [<span class="c-str">"Gemini API"</span>, <span class="c-str">"Claude"</span>, <span class="c-str">"OpenAI"</span>, <span class="c-str">"CNN"</span>];\n}',
    bio: '{\n  <span class="c-cyan">"name"</span>: <span class="c-str">"Hafijur Rahman Bhuiyan"</span>,\n  <span class="c-cyan">"location"</span>: <span class="c-str">"Dhaka, Bangladesh"</span>,\n  <span class="c-cyan">"degree"</span>: <span class="c-str">"B.Sc. in CSE, Independent Univ"</span>,\n  <span class="c-cyan">"internship"</span>: <span class="c-str">"FNF Planet (Jan-Apr 2026, Completed)"</span>,\n  <span class="c-cyan">"openToRoles"</span>: <span class="c-num">true</span>\n}'
  };

  if (consoleTabs.length && consoleContent) {
    consoleTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        playClickSound();
        consoleTabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var tabKey = tab.getAttribute('data-tab');
        if (devConsoleSnippets[tabKey]) {
          consoleContent.innerHTML = devConsoleSnippets[tabKey];
        }
      });
    });
  }

  // =========================================================================
  // 8. Interactive Ambient Particle System (Canvas)
  // =========================================================================
  var canvas = document.getElementById('ambientCanvas');
  if (canvas && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var ctx = canvas.getContext('2d');
    var particles = [];
    var particleCount = Math.min(48, Math.floor(window.innerWidth / 30));
    var width = canvas.width = window.innerWidth;
    var height = canvas.height = window.innerHeight;

    function resizeCanvas() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resizeCanvas, { passive: true });

    for (var pIdx = 0; pIdx < particleCount; pIdx++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2 + 1,
        alpha: Math.random() * 0.4 + 0.15
      });
    }

    var pointerX = -9999;
    var pointerY = -9999;
    window.addEventListener('mousemove', function (e) {
      pointerX = e.clientX;
      pointerY = e.clientY;
    }, { passive: true });

    function renderCanvas() {
      ctx.clearRect(0, 0, width, height);
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var rgb = isLight ? '37, 99, 235' : '0, 240, 255';

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        var dx = pointerX - p.x;
        var dy = pointerY - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          p.x -= (dx / dist) * 0.8;
          p.y -= (dy / dist) * 0.8;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + rgb + ', ' + p.alpha + ')';
        ctx.fill();

        for (var j = i + 1; j < particles.length; j++) {
          var p2 = particles[j];
          var djx = p.x - p2.x;
          var djy = p.y - p2.y;
          var d = Math.sqrt(djx * djx + djy * djy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = 'rgba(' + rgb + ', ' + ((1 - d / 110) * 0.14) + ')';
            ctx.lineWidth = 0.75;
            ctx.stroke();
          }
        }
      }
      requestAnimationFrame(renderCanvas);
    }
    renderCanvas();
  }

  // =========================================================================
  // 9. Cursor Spotlight Tracking
  // =========================================================================
  var cursorGlow = document.getElementById('cursorGlow');
  if (cursorGlow && window.matchMedia('(pointer: fine)').matches) {
    var mouseX = window.innerWidth / 2;
    var mouseY = window.innerHeight / 2;
    var curX = mouseX;
    var curY = mouseY;

    window.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function renderGlow() {
      curX += (mouseX - curX) * 0.15;
      curY += (mouseY - curY) * 0.15;
      cursorGlow.style.left = curX + 'px';
      cursorGlow.style.top = curY + 'px';
      requestAnimationFrame(renderGlow);
    }
    renderGlow();
  }

  // =========================================================================
  // 10. Dynamic Scroll Animation Engine (Both Scroll Down & Scroll Up)
  // =========================================================================
  var scrollProgressBar = document.getElementById('scrollProgressIndicator');
  var scrollDepthText = document.getElementById('scrollDepthText');
  var scrollDepthPill = document.getElementById('scrollDepthPill');
  var timelineProgress = document.getElementById('timelineProgressFill');
  var experienceSection = document.getElementById('experience');
  var lastScrollY = window.pageYOffset || document.documentElement.scrollTop;
  var scrollTicking = false;

  function updateScrollDynamics() {
    var currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    var winHeight = window.innerHeight;
    var docHeight = document.documentElement.scrollHeight - winHeight;
    var progress = docHeight > 0 ? (currentScrollY / docHeight) * 100 : 0;
    var clampedProgress = Math.min(100, Math.max(0, progress));

    if (scrollProgressBar) {
      scrollProgressBar.style.width = clampedProgress + '%';
    }
    if (scrollDepthText) {
      scrollDepthText.textContent = Math.round(clampedProgress) + '%';
    }

    if (currentScrollY > 40) {
      document.body.classList.add('is-scrolled');
    } else {
      document.body.classList.remove('is-scrolled');
    }

    if (currentScrollY > lastScrollY && currentScrollY > 80) {
      document.body.classList.add('scrolling-down');
      document.body.classList.remove('scrolling-up');
    } else if (currentScrollY < lastScrollY) {
      document.body.classList.add('scrolling-up');
      document.body.classList.remove('scrolling-down');
    }

    if (timelineProgress && experienceSection) {
      var expRect = experienceSection.getBoundingClientRect();
      var expTop = expRect.top;
      var expHeight = expRect.height;
      if (expTop < winHeight && expTop + expHeight > 0) {
        var pct = Math.min(1, Math.max(0, (winHeight * 0.65 - expTop) / expHeight));
        timelineProgress.style.height = (pct * 100).toFixed(1) + '%';
      }
    }

    lastScrollY = currentScrollY;
    scrollTicking = false;
  }

  window.addEventListener('scroll', function () {
    if (!scrollTicking) {
      requestAnimationFrame(updateScrollDynamics);
      scrollTicking = true;
    }
  }, { passive: true });
  updateScrollDynamics();

  if (scrollDepthPill) {
    scrollDepthPill.addEventListener('click', function () {
      playClickSound();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // =========================================================================
  // 11. Section Scroll Observer (Active Nav Indicator)
  // =========================================================================
  var navLinks = document.querySelectorAll('nav.links a');
  var sections = Array.from(document.querySelectorAll('main section[id]'));
  var byId = {};
  navLinks.forEach(function (a) {
    var href = a.getAttribute('href');
    if (href && href.startsWith('#')) {
      byId[href.slice(1)] = a;
    }
  });

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
          var link = byId[entry.target.id];
          if (link) link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-35% 0px -40% 0px', threshold: 0 });
    sections.forEach(function (s) { io.observe(s); });
  }

  // =========================================================================
  // 12. Reveal on Scroll Observer
  // =========================================================================
  var revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var rio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add('in');
        } else if (e.boundingClientRect.top > window.innerHeight) {
          e.target.classList.remove('in');
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    revealEls.forEach(function (el) { rio.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  // =========================================================================
  // 13. Back to Top Button
  // =========================================================================
  var backTopBtn = document.getElementById('backTop');
  if (backTopBtn) {
    backTopBtn.addEventListener('click', function () {
      playClickSound();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // =========================================================================
  // 14. Profile Image Fallback Handler
  // =========================================================================
  (function () {
    var img = document.getElementById('profileImg');
    var fallback = document.getElementById('photoFallback');
    if (img && fallback) {
      img.addEventListener('error', function () {
        img.style.display = 'none';
        fallback.style.display = 'flex';
      });
      img.addEventListener('load', function () {
        img.style.display = 'block';
        fallback.style.display = 'none';
      });
    }
  })();

  // =========================================================================
  // 15. Interactive Skills Discipline Filter
  // =========================================================================
  var filterBtns = document.querySelectorAll('.sfilter-btn');
  var skillCards = document.querySelectorAll('.skill-card');
  filterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      playClickSound();
      filterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var filter = btn.getAttribute('data-filter');

      skillCards.forEach(function (card) {
        var cat = card.getAttribute('data-category');
        if (filter === 'all' || cat === filter) {
          card.classList.remove('dimmed');
          card.classList.add('highlighted');
          setTimeout(function () { card.classList.remove('highlighted'); }, 600);
        } else {
          card.classList.add('dimmed');
        }
      });
    });
  });

  // =========================================================================
  // 16. Interactive Projects Filter (AI, Full-Stack, Trading)
  // =========================================================================
  var pfilterBtns = document.querySelectorAll('.pfilter-btn');
  var projectCards = document.querySelectorAll('.pcard');
  pfilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      playClickSound();
      pfilterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var pfilter = btn.getAttribute('data-pfilter');

      projectCards.forEach(function (pcard) {
        var pcat = pcard.getAttribute('data-pcat') || '';
        if (pfilter === 'all' || pcat.indexOf(pfilter) !== -1) {
          pcard.style.display = '';
          pcard.classList.add('in');
        } else {
          pcard.style.display = 'none';
        }
      });
    });
  });

  // =========================================================================
  // 17. SUBTLE 'MAGNETIC' HOVER INTERACTION & 3D DEPTH ENGINE
  // =========================================================================
  var cards3D = document.querySelectorAll('.card-3d');
  var isTouch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (!isTouch) {
    cards3D.forEach(function (card) {
      var ticking = false;

      card.addEventListener('mouseenter', function () {
        card.classList.add('is-magnet-active');
      });

      card.addEventListener('mousemove', function (e) {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          var rect = card.getBoundingClientRect();
          var x = e.clientX - rect.left;
          var y = e.clientY - rect.top;
          var w = rect.width;
          var h = rect.height;

          // Normalized coordinates relative to card center [-1, 1]
          var normX = (x / w) * 2 - 1;
          var normY = (y / h) * 2 - 1;

          // Subtle magnetic displacement (card slightly follows cursor movement)
          var maxPull = 9.5; // pixels
          var magX = normX * maxPull;
          var magY = normY * maxPull;

          // 3D physical rotation towards cursor
          var rotX = normY * -8.5;
          var rotY = normX * 10.5;

          // Elevated Z-depth for tangible physical presence
          var liftZ = 14;

          card.style.transform = 'perspective(1200px) translate3d(' + magX.toFixed(2) + 'px, ' + magY.toFixed(2) + 'px, ' + liftZ + 'px) rotateX(' + rotX.toFixed(2) + 'deg) rotateY(' + rotY.toFixed(2) + 'deg)';
          card.style.setProperty('--glare-x', ((x / w) * 100).toFixed(1) + '%');
          card.style.setProperty('--glare-y', ((y / h) * 100).toFixed(1) + '%');

          // Dynamic shadow offset in opposite direction of magnetic pull (gives floating height sensation)
          card.style.setProperty('--card-shadow-x', (-magX * 1.4).toFixed(1) + 'px');
          card.style.setProperty('--card-shadow-y', (20 - magY * 1.2).toFixed(1) + 'px');

          // Multi-layer micro-parallax for inner elements
          var innerMedia = card.querySelector('.pcard-logo, .modal-media-wrap, .tl-dot');
          if (innerMedia) {
            innerMedia.style.transform = 'translate3d(' + (normX * 4.5).toFixed(2) + 'px, ' + (normY * 4.5).toFixed(2) + 'px, 28px)';
          }
          var innerTitle = card.querySelector('h3');
          if (innerTitle) {
            innerTitle.style.transform = 'translate3d(' + (normX * 2.8).toFixed(2) + 'px, ' + (normY * 2.8).toFixed(2) + 'px, 24px)';
          }
          var innerBtn = card.querySelector('.card-3d-open-btn');
          if (innerBtn) {
            innerBtn.style.transform = 'translate3d(' + (normX * 3.5).toFixed(2) + 'px, ' + (normY * 3.5).toFixed(2) + 'px, 26px)';
          }

          ticking = false;
        });
      }, { passive: true });

      card.addEventListener('mouseleave', function () {
        card.classList.remove('is-magnet-active');
        // Elastic spring back to center
        card.style.transform = 'perspective(1200px) translate3d(0px, 0px, 0px) rotateX(0deg) rotateY(0deg)';
        card.style.setProperty('--card-shadow-x', '0px');
        card.style.setProperty('--card-shadow-y', '22px');

        var innerMedia = card.querySelector('.pcard-logo, .modal-media-wrap, .tl-dot');
        if (innerMedia) {
          innerMedia.style.transition = 'transform 0.65s cubic-bezier(0.19, 1, 0.22, 1)';
          innerMedia.style.transform = '';
        }
        var innerTitle = card.querySelector('h3');
        if (innerTitle) {
          innerTitle.style.transition = 'transform 0.65s cubic-bezier(0.19, 1, 0.22, 1)';
          innerTitle.style.transform = '';
        }
        var innerBtn = card.querySelector('.card-3d-open-btn');
        if (innerBtn) {
          innerBtn.style.transition = 'transform 0.65s cubic-bezier(0.19, 1, 0.22, 1)';
          innerBtn.style.transform = '';
        }
      });
    });
  }

  // =========================================================================
  // 18. PROJECT & CARD DETAILS INSPECTION MODAL SYSTEM
  // =========================================================================
  var modalBackdrop = document.getElementById('card3DModal');
  var modalCardWrapper = document.getElementById('modalCardWrapper');
  var modalCard = document.getElementById('modalCard');
  var modalBody = document.getElementById('modalBody');
  var modalCloseBtn = document.getElementById('modalCloseBtn');
  var modalResetBtn = document.getElementById('modalResetBtn');
  var modalFlipBtn = document.getElementById('modalFlipBtn');
  var flipBtnText = document.getElementById('flipBtnText');

  var currentCardData = { frontHtml: '', backHtml: '', isFlipped: false };

  function openCardDetails(cardElement) {
    if (!modalBackdrop || !modalBody) return;
    playModalOpenSound();

    modalCard.classList.remove('flipped');
    currentCardData.isFlipped = false;
    if (flipBtnText) flipBtnText.textContent = 'Architecture Blueprint';
    modalCard.style.transform = 'perspective(1500px) rotateX(0deg) rotateY(0deg) translateZ(0)';

    var isProject = cardElement.classList.contains('pcard');
    var isSkill = cardElement.classList.contains('skill-card');
    var isExperience = cardElement.classList.contains('tl-card');
    var isEducation = cardElement.classList.contains('edu-item');
    var isFact = cardElement.classList.contains('fact');

    var frontHtml = '';
    var backHtml = '';

    if (isProject) {
      var logoImg = cardElement.querySelector('.pcard-logo img');
      var title = cardElement.querySelector('h3') ? cardElement.querySelector('h3').textContent.trim() : '';
      var desc = cardElement.querySelector('p.desc') ? cardElement.querySelector('p.desc').innerHTML : '';
      var tagsContainer = cardElement.querySelector('.tags');
      var linksContainer = cardElement.querySelector('.pcard-links');

      if (logoImg) {
        frontHtml += '<div class="modal-media-wrap"><img src="' + logoImg.src + '" alt="' + (logoImg.alt || 'Project logo') + '"></div>';
      }
      frontHtml += '<div class="modal-meta-kicker">Project · Selected Work</div>';
      frontHtml += '<h2 class="modal-title">' + title + '</h2>';
      frontHtml += '<div class="modal-desc">' + desc + '</div>';

      if (tagsContainer) {
        frontHtml += '<div class="modal-tags-box"><div class="tags">' + tagsContainer.innerHTML + '</div></div>';
      }

      if (linksContainer) {
        frontHtml += '<div class="modal-links-box">' + linksContainer.innerHTML + '</div>';
      }

      // Back Face Architecture Details
      backHtml += '<div class="modal-meta-kicker">System Architecture &amp; Implementation</div>';
      backHtml += '<h2 class="modal-title">' + title + '</h2>';
      backHtml += '<p class="modal-desc">Technical engineering specifications, architectural invariants, and production implementation stack:</p>';
      backHtml += '<ul class="modal-list">';
      backHtml += '<li><b>End-to-End Pipeline:</b> Architected for resilience, high throughput, and zero-downtime execution.</li>';
      backHtml += '<li><b>Data &amp; API Layer:</b> Clean schema boundaries, robust input validation, and real API integrations.</li>';
      backHtml += '<li><b>Production Security:</b> JWT / OAuth authentication flows, CSRF protection, and prepared query defenses.</li>';
      backHtml += '<li><b>Frontend Performance:</b> Hardware-accelerated UI rendering, responsive touch layout, and minimal bundle footprint.</li>';
      backHtml += '</ul>';
      if (linksContainer) {
        backHtml += '<div class="modal-links-box">' + linksContainer.innerHTML + '</div>';
      }
    } else if (isSkill) {
      var skillTitle = cardElement.querySelector('h3') ? cardElement.querySelector('h3').textContent.trim() : '';
      var skillTags = cardElement.querySelector('.tags') ? cardElement.querySelector('.tags').innerHTML : '';

      frontHtml += '<div class="modal-meta-kicker">Technical Expertise</div>';
      frontHtml += '<h2 class="modal-title">' + skillTitle + '</h2>';
      frontHtml += '<p class="modal-desc">Core competencies, production toolchains, and industry-standard technologies leveraged across end-to-end applications.</p>';
      frontHtml += '<div class="modal-tags-box"><div class="tags">' + skillTags + '</div></div>';
      frontHtml += '<div class="modal-links-box"><a href="#projects" class="btn btn-primary" onclick="window.closeCard3DModal()">Explore Shipped Projects</a></div>';

      backHtml += '<div class="modal-meta-kicker">Skill Mastery &amp; Application</div>';
      backHtml += '<h2 class="modal-title">' + skillTitle + ' — Architecture</h2>';
      backHtml += '<p class="modal-desc">Used across 5+ delivered production systems, university research, and high-concurrency client platforms.</p>';
      backHtml += '<ul class="modal-list"><li>Production code standards with typed contracts and comprehensive automated testing.</li><li>Cross-platform deployment across Render, Vercel, Netlify, and containerized Docker runtimes.</li></ul>';
      backHtml += '<div class="modal-links-box"><a href="#contact" class="btn btn-primary" onclick="window.closeCard3DModal()">Get in Touch</a></div>';
    } else if (isExperience) {
      var expTitle = cardElement.querySelector('h3') ? cardElement.querySelector('h3').textContent.trim() : '';
      var expMeta = cardElement.querySelector('.tl-meta') ? cardElement.querySelector('.tl-meta').textContent.trim() : '';
      var expUl = cardElement.querySelector('ul') ? cardElement.querySelector('ul').innerHTML : '';

      frontHtml += '<div class="modal-meta-kicker">Professional Track Record</div>';
      frontHtml += '<h2 class="modal-title">' + expTitle + '</h2>';
      frontHtml += '<div class="modal-subtitle">' + expMeta + '</div>';
      frontHtml += '<ul class="modal-list">' + expUl + '</ul>';
      frontHtml += '<div class="modal-links-box"><a class="btn btn-primary" href="assets/resume.pdf" download="Hafijur_Rahman_Bhuiyan_Resume.pdf"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Full Resume</a></div>';

      backHtml += '<div class="modal-meta-kicker">Internship Deliverables &amp; Outcomes</div>';
      backHtml += '<h2 class="modal-title">FNF PLANET — Servico Platform</h2>';
      backHtml += '<p class="modal-desc">Full lifecycle ownership of service marketplace booking workflows inspired by Sheba.xyz.</p>';
      backHtml += '<ul class="modal-list"><li>Cross-functional team sprint execution with weekly code reviews.</li><li>Production DRF API integration, role dashboards, and payment flow resilience.</li></ul>';
      backHtml += '<div class="modal-links-box"><a class="btn btn-primary" href="assets/resume.pdf" download="Hafijur_Rahman_Bhuiyan_Resume.pdf">Download Full Resume</a></div>';
    } else if (isEducation) {
      var eduTitle = cardElement.querySelector('h3') ? cardElement.querySelector('h3').textContent.trim() : '';
      var eduInst = cardElement.querySelector('.inst') ? cardElement.querySelector('.inst').textContent.trim() : '';
      var eduYr = cardElement.querySelector('.yr') ? cardElement.querySelector('.yr').textContent.trim() : '';

      frontHtml += '<div class="modal-meta-kicker">Academic Background</div>';
      frontHtml += '<h2 class="modal-title">' + eduTitle + '</h2>';
      frontHtml += '<div class="modal-subtitle">' + eduInst + ' (' + eduYr + ')</div>';
      frontHtml += '<p class="modal-desc">Formal computer science foundation including data structures, algorithms, database systems, software architecture, machine learning, and operating systems.</p>';
      frontHtml += '<div class="modal-links-box"><a href="#contact" class="btn btn-primary" onclick="window.closeCard3DModal()">Contact Hafijur</a></div>';

      backHtml += '<div class="modal-meta-kicker">Academic Focus &amp; Coursework</div>';
      backHtml += '<h2 class="modal-title">' + eduTitle + '</h2>';
      backHtml += '<ul class="modal-list"><li>Data Structures &amp; Algorithms, Object-Oriented Programming (C/Python/JS).</li><li>Relational &amp; Distributed Database Systems, Web Systems Architecture.</li><li>Machine Learning, Deep Learning, Image Classification (CNNs).</li></ul>';
      backHtml += '<div class="modal-links-box"><a href="#contact" class="btn btn-primary" onclick="window.closeCard3DModal()">Contact Hafijur</a></div>';
    } else if (isFact) {
      var factTitle = cardElement.getAttribute('data-card-title') || (cardElement.querySelector('b') ? cardElement.querySelector('b').textContent.trim() : 'Detail');
      var factDesc = cardElement.getAttribute('data-card-desc') || (cardElement.querySelector('span') ? cardElement.querySelector('span').textContent.trim() : '');

      frontHtml += '<div class="modal-meta-kicker">Key Information</div>';
      frontHtml += '<h2 class="modal-title">' + factTitle + '</h2>';
      frontHtml += '<p class="modal-desc">' + factDesc + '</p>';
      frontHtml += '<div class="modal-links-box"><a href="#contact" class="btn btn-primary" onclick="window.closeCard3DModal()">Get in Touch</a></div>';

      backHtml += '<div class="modal-meta-kicker">Profile Overview</div>';
      backHtml += '<h2 class="modal-title">' + factTitle + '</h2>';
      backHtml += '<p class="modal-desc">' + factDesc + '</p>';
      backHtml += '<div class="modal-links-box"><a href="#contact" class="btn btn-primary" onclick="window.closeCard3DModal()">Get in Touch</a></div>';
    }

    currentCardData.frontHtml = frontHtml;
    currentCardData.backHtml = backHtml;
    modalBody.innerHTML = frontHtml;

    modalBackdrop.classList.remove('closing');
    modalBackdrop.classList.add('active');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  window.openCardIn3D = openCardDetails;

  // Flip Button Handler (Architecture Blueprint <-> Overview)
  if (modalFlipBtn) {
    modalFlipBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      playFlipSound();
      currentCardData.isFlipped = !currentCardData.isFlipped;
      modalCard.style.transition = 'transform 0.55s cubic-bezier(0.19, 1, 0.22, 1)';

      if (currentCardData.isFlipped) {
        modalCard.style.transform = 'perspective(1500px) rotateY(180deg)';
        if (flipBtnText) flipBtnText.textContent = 'Flip to Overview';
        setTimeout(function () {
          modalBody.innerHTML = currentCardData.backHtml;
          modalBody.style.transform = 'rotateY(180deg)';
        }, 200);
      } else {
        modalCard.style.transform = 'perspective(1500px) rotateY(0deg)';
        if (flipBtnText) flipBtnText.textContent = 'Architecture Blueprint';
        setTimeout(function () {
          modalBody.innerHTML = currentCardData.frontHtml;
          modalBody.style.transform = 'none';
        }, 200);
      }
    });
  }

  window.closeCard3DModal = function () {
    if (!modalBackdrop || !modalBackdrop.classList.contains('active')) return;
    playModalCloseSound();
    modalBackdrop.classList.add('closing');
    setTimeout(function () {
      modalBackdrop.classList.remove('active');
      modalBackdrop.classList.remove('closing');
      modalBackdrop.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      modalBody.style.transform = 'none';
    }, 320);
  };

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', window.closeCard3DModal);
  }

  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', function (e) {
      if (e.target === modalBackdrop || e.target.classList.contains('modal-3d-stage')) {
        window.closeCard3DModal();
      }
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalBackdrop && modalBackdrop.classList.contains('active')) {
      window.closeCard3DModal();
    }
  });

  cards3D.forEach(function (card) {
    card.addEventListener('click', function (e) {
      if (e.target.closest('a') && !e.target.closest('.pcard-details-btn')) {
        return;
      }
      openCardDetails(card);
    });

    card.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        if (!e.target.closest('a')) {
          e.preventDefault();
          openCardDetails(card);
        }
      }
    });
  });

  // Attach details button click handlers directly
  document.querySelectorAll('.pcard-details-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var card = btn.closest('.pcard');
      if (card) openCardDetails(card);
    });
  });

  if (modalCard) {
    var modalDragging = false;
    var startX = 0;
    var startY = 0;
    var currentRotX = 0;
    var currentRotY = 0;
    var targetRotX = 0;
    var targetRotY = 0;

    modalCard.addEventListener('mouseenter', function () {
      if (currentCardData.isFlipped) return;
      modalCard.style.transition = 'transform 0.12s cubic-bezier(0.16, 1, 0.3, 1)';
    });

    modalCard.addEventListener('mousemove', function (e) {
      if (currentCardData.isFlipped) return;
      var rect = modalCard.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      var normX = (x / rect.width) * 2 - 1;
      var normY = (y / rect.height) * 2 - 1;

      var magX = normX * 12;
      var magY = normY * 10;
      targetRotX = normY * -13;
      targetRotY = normX * 15;

      modalCard.style.transform = 'perspective(1500px) translate3d(' + magX.toFixed(2) + 'px, ' + magY.toFixed(2) + 'px, 16px) rotateX(' + targetRotX.toFixed(2) + 'deg) rotateY(' + targetRotY.toFixed(2) + 'deg)';
      modalCard.style.setProperty('--modal-glare-x', ((x / rect.width) * 100).toFixed(1) + '%');
      modalCard.style.setProperty('--modal-glare-y', ((y / rect.height) * 100).toFixed(1) + '%');
    }, { passive: true });

    modalCard.addEventListener('mouseleave', function () {
      if (currentCardData.isFlipped) return;
      modalCard.style.transition = 'transform 0.65s cubic-bezier(0.19, 1, 0.22, 1)';
      modalCard.style.transform = 'perspective(1500px) translate3d(0px, 0px, 0px) rotateX(0deg) rotateY(0deg)';
    });

    modalCard.addEventListener('touchstart', function (e) {
      if (e.touches.length === 1 && !currentCardData.isFlipped) {
        modalDragging = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    }, { passive: true });

    modalCard.addEventListener('touchmove', function (e) {
      if (!modalDragging || e.touches.length !== 1 || currentCardData.isFlipped) return;
      var dx = e.touches[0].clientX - startX;
      var dy = e.touches[0].clientY - startY;

      targetRotY = Math.max(-25, Math.min(25, currentRotY + dx * 0.25));
      targetRotX = Math.max(-20, Math.min(20, currentRotX - dy * 0.25));

      modalCard.style.transform = 'perspective(1500px) rotateX(' + targetRotX.toFixed(2) + 'deg) rotateY(' + targetRotY.toFixed(2) + 'deg) translateZ(12px)';
    }, { passive: true });

    modalCard.addEventListener('touchend', function () {
      modalDragging = false;
      currentRotX = targetRotX;
      currentRotY = targetRotY;
    });
  }

  if (modalResetBtn && modalCard) {
    modalResetBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      playClickSound();
      currentCardData.isFlipped = false;
      if (flipBtnText) flipBtnText.textContent = 'Architecture Blueprint';
      modalBody.innerHTML = currentCardData.frontHtml;
      modalBody.style.transform = 'none';
      modalCard.style.transform = 'perspective(1500px) rotateX(0deg) rotateY(0deg) translateZ(0)';
    });
  }

})();
