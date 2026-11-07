// Hafijur Rahman Bhuiyan Portfolio — Executive Interactive Systems, Audio & Animations
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
  var musicEnabled = true; // Desired state: music is ON by default
  var musicMasterGain = null;
  var musicTimer = null;
  var activeVoices = [];
  var soundToggleBtn = document.getElementById('soundToggle');
  var soundIcon = document.getElementById('soundIcon');

  var autoStartGestureArmed = false;
  var suppressToggleUntil = 0;

  function initAudioContext() {
    try {
      if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        var AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        // Safety net: whenever the browser lets the context run (e.g. it
        // releases the autoplay block), start the music if it should be on.
        audioCtx.onstatechange = function () {
          if (audioCtx.state === 'running' && musicEnabled && !isMusicPlaying) {
            startBackgroundMusic();
          }
        };
      }
      if (audioCtx && audioCtx.state === 'suspended' && audioCtx.resume) {
        var resumePromise = audioCtx.resume();
        if (resumePromise && typeof resumePromise.catch === 'function') {
          resumePromise.catch(function () {});
        }
      }
    } catch (e) {}
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
    if (isMusicPlaying) return;
    initAudioContext();
    if (!audioCtx) return;

    isMusicPlaying = true;
    currentChordIdx = 0;

    musicMasterGain = audioCtx.createGain();
    musicMasterGain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    // Smooth fade-in over 1.8 seconds
    musicMasterGain.gain.linearRampToValueAtTime(3, audioCtx.currentTime + 1.8);
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

    disarmAutoStartGesture();
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

  // Attempt to begin playback right now. Browsers block audio until a user
  // gesture, so this may leave the context suspended; armAutoStartGesture()
  // then guarantees playback begins on the visitor's first interaction.
  function attemptAutoplay() {
    if (!musicEnabled || isMusicPlaying) return;

    initAudioContext();
    if (!audioCtx) return;

    if (audioCtx.state === 'running') {
      startBackgroundMusic();
      return;
    }

    // resume() resolves once the context is allowed to run.
    try {
      var resumePromise = audioCtx.resume && audioCtx.resume();
      if (resumePromise && typeof resumePromise.then === 'function') {
        resumePromise.then(function () {
          if (musicEnabled && !isMusicPlaying && audioCtx.state === 'running') {
            startBackgroundMusic();
          }
        }).catch(function () {});
      }
    } catch (e) {}
  }

  // Only true *activation* events can unblock audio (a scroll or wheel does
  // NOT grant the user gesture browsers require). This list covers every
  // browser/platform: pointer + legacy mouse, touch (start/end) for iOS, and
  // keyboard for desktop users who only scroll.
  var AUTO_START_EVENTS = [
    'pointerdown', 'mousedown', 'pointerup',
    'touchstart', 'touchend',
    'keydown', 'click'
  ];

  function handleAutoStartGesture(e) {
    if (e && e.isTrusted === false) return;

    // The first interaction is the gesture the browser requires to unblock
    // audio. If it happens on the sound button, suppress that button's own
    // click toggle so we don't start and immediately mute in one gesture.
    if (soundToggleBtn && e && e.target && soundToggleBtn.contains(e.target)) {
      suppressToggleUntil = Date.now() + 500;
    }
    attemptAutoplay();
  }

  function armAutoStartGesture() {
    if (autoStartGestureArmed) return;
    autoStartGestureArmed = true;
    AUTO_START_EVENTS.forEach(function (evt) {
      window.addEventListener(evt, handleAutoStartGesture, true);
    });
  }

  function disarmAutoStartGesture() {
    if (!autoStartGestureArmed) return;
    autoStartGestureArmed = false;
    AUTO_START_EVENTS.forEach(function (evt) {
      window.removeEventListener(evt, handleAutoStartGesture, true);
    });
  }

  function enableMusicExperience() {
    musicEnabled = true;

    initAudioContext();
    if (!audioCtx) {
      updateAudioButtonUI(false);
      return;
    }

    attemptAutoplay();

    // Autoplay blocked: begin automatically on the next interaction.
    if (!isMusicPlaying) {
      if (soundToggleBtn) {
        soundToggleBtn.setAttribute('title', 'Background Music: Ready (Click or interact to start)');
      }
      armAutoStartGesture();
    }
  }

  function disableMusicExperience() {
    musicEnabled = false;
    disarmAutoStartGesture();

    if (isMusicPlaying) {
      stopBackgroundMusic();
    } else {
      updateAudioButtonUI(false);
      showToast('Background music muted');
    }
  }

  if (soundToggleBtn) {
    soundToggleBtn.addEventListener('click', function () {
      // Ignore the click that merely served as the first-interaction gesture.
      if (Date.now() < suppressToggleUntil) return;
      if (isMusicPlaying) {
        disableMusicExperience();
      } else {
        enableMusicExperience();
      }
    });
  }

  // Background music is ON by default on every visit. Attempt to start it
  // immediately, then retry just after load. If the browser blocks autoplay,
  // armAutoStartGesture() starts it on the visitor's first interaction.
  musicEnabled = true;
  enableMusicExperience();
  window.addEventListener('load', attemptAutoplay);
  setTimeout(attemptAutoplay, 400);

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

    // Debounced resize. Mobile browsers fire `resize` continuously while the
    // URL bar collapses/expands during a scroll; reallocating the full-screen
    // canvas on every one of those events caused stutter while scrolling.
    var resizeTimer = null;
    function applyResize() {
      var w = window.innerWidth;
      var h = window.innerHeight;
      if (w === width && h === height) return; // skip no-op resizes entirely
      width = canvas.width = w;
      height = canvas.height = h;
    }
    function resizeCanvas() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(applyResize, 150);
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

    // The ambient layer is purely decorative and always sits behind the
    // content, so it is capped at ~30fps (motion is delta-timed, so it looks
    // identical) which roughly halves the compositing work it forces on the
    // frosted-glass cards above it. Connection lines are also grouped into a
    // few alpha buckets and stroked once each instead of one stroke per line.
    var AMBIENT_STEP = 1000 / 30;
    var lastAmbientFrame = 0;
    var ambientRaf = 0;
    var CONNECT_BUCKETS = 5;
    var connectBuckets = [[], [], [], [], []];

    function drawAmbient(dt) {
      ctx.clearRect(0, 0, width, height);
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      var rgb = isLight ? '37, 99, 235' : '0, 240, 255';

      for (var b = 0; b < CONNECT_BUCKETS; b++) connectBuckets[b].length = 0;

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        var dx = pointerX - p.x;
        var dy = pointerY - p.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130 && dist > 0) {
          p.x -= (dx / dist) * 0.8 * dt;
          p.y -= (dy / dist) * 0.8 * dt;
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
            var bucket = Math.min(CONNECT_BUCKETS - 1, Math.floor((1 - d / 110) * CONNECT_BUCKETS));
            connectBuckets[bucket].push(p.x, p.y, p2.x, p2.y);
          }
        }
      }

      for (var k = 0; k < CONNECT_BUCKETS; k++) {
        var seg = connectBuckets[k];
        if (!seg.length) continue;
        ctx.beginPath();
        for (var s = 0; s < seg.length; s += 4) {
          ctx.moveTo(seg[s], seg[s + 1]);
          ctx.lineTo(seg[s + 2], seg[s + 3]);
        }
        var lineAlpha = ((k + 0.5) / CONNECT_BUCKETS) * 0.14;
        ctx.strokeStyle = 'rgba(' + rgb + ', ' + lineAlpha.toFixed(3) + ')';
        ctx.lineWidth = 0.75;
        ctx.stroke();
      }
    }

    function ambientLoop(now) {
      ambientRaf = 0;
      if (document.hidden) return; // restarted by visibilitychange
      if (!now) now = performance.now();
      if (lastAmbientFrame && now - lastAmbientFrame < AMBIENT_STEP - 1) {
        ambientRaf = requestAnimationFrame(ambientLoop);
        return;
      }
      var dt = lastAmbientFrame ? Math.min(2.5, (now - lastAmbientFrame) / (1000 / 60)) : 1;
      lastAmbientFrame = now;
      drawAmbient(dt);
      ambientRaf = requestAnimationFrame(ambientLoop);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !ambientRaf) {
        lastAmbientFrame = 0;
        ambientRaf = requestAnimationFrame(ambientLoop);
      }
    });

    ambientRaf = requestAnimationFrame(ambientLoop);
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
    var glowRaf = 0;

    window.addEventListener('mousemove', function (e) {
      mouseX = e.clientX;
      mouseY = e.clientY;
    }, { passive: true });

    function renderGlow() {
      glowRaf = 0;
      if (document.hidden) return; // restarted by visibilitychange
      curX += (mouseX - curX) * 0.15;
      curY += (mouseY - curY) * 0.15;
      // transform is compositor-only; animating left/top forced a layout
      // recalculation for the glow on every single frame.
      cursorGlow.style.transform = 'translate3d(' + curX.toFixed(1) + 'px, ' + curY.toFixed(1) + 'px, 0) translate(-50%, -50%)';
      glowRaf = requestAnimationFrame(renderGlow);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !glowRaf) glowRaf = requestAnimationFrame(renderGlow);
    });

    glowRaf = requestAnimationFrame(renderGlow);
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
  // Cached so the handler never has to read `scrollHeight` (which forces a
  // synchronous layout when styles are dirty) on every single scroll frame.
  var cachedDocHeight = 0;
  function refreshDocHeight() {
    cachedDocHeight = document.documentElement.scrollHeight - window.innerHeight;
  }
  window.addEventListener('resize', refreshDocHeight, { passive: true });
  window.addEventListener('load', refreshDocHeight);

  function updateScrollDynamics() {
    // --- All layout reads happen first (avoids forced reflow) ---
    var currentScrollY = window.pageYOffset || document.documentElement.scrollTop;
    var winHeight = window.innerHeight;
    var docHeight = cachedDocHeight > 0 ? cachedDocHeight : (document.documentElement.scrollHeight - winHeight);

    var expTop = 0;
    var expHeight = 0;
    var trackTimeline = timelineProgress && experienceSection;
    if (trackTimeline) {
      var expRect = experienceSection.getBoundingClientRect();
      expTop = expRect.top;
      expHeight = expRect.height;
    }

    // --- Then the writes ---
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

    if (trackTimeline && expTop < winHeight && expTop + expHeight > 0) {
      var pct = Math.min(1, Math.max(0, (winHeight * 0.65 - expTop) / expHeight));
      timelineProgress.style.height = (pct * 100).toFixed(1) + '%';
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
  refreshDocHeight();
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
  pfilterBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      playClickSound();
      pfilterBtns.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var pfilter = btn.getAttribute('data-pfilter');

      document.querySelectorAll('.pcard').forEach(function (pcard) {
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
  // 17. PROJECT & CARD DETAILS INSPECTION MODAL SYSTEM
  // =========================================================================
  var modalBackdrop = document.getElementById('card3DModal');
  var modalCard = document.getElementById('modalCard');
  var modalBody = document.getElementById('modalBody');
  var modalCloseBtn = document.getElementById('modalCloseBtn');
  var modalResetBtn = document.getElementById('modalResetBtn');
  var modalFlipBtn = document.getElementById('modalFlipBtn');
  var flipBtnText = document.getElementById('flipBtnText');

  var currentCardData = { frontNode: null, backNode: null, isFlipped: false };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }
  function appendAll(parent) {
    for (var i = 1; i < arguments.length; i++) {
      if (arguments[i]) parent.appendChild(arguments[i]);
    }
    return parent;
  }
  function textFrom(root, selector) {
    var node = root && root.querySelector(selector);
    return node ? node.textContent.trim() : '';
  }
  function safeUrl(value, sameOriginOnly) {
    try {
      var parsed = new URL(String(value || ''), location.href);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      if (sameOriginOnly && parsed.origin !== location.origin) return '';
      return String(value).charAt(0) === '#'
        ? '#' + parsed.hash.slice(1)
        : parsed.href;
    } catch (e) {
      return '';
    }
  }
  function makeLink(label, href, className, options) {
    options = options || {};
    var url = safeUrl(href, options.sameOriginOnly);
    if (!url) return null;
    var link = el('a', className, label);
    link.href = url;
    if (options.download) link.setAttribute('download', options.download);
    if (options.closeModal) link.setAttribute('data-close-modal', '');
    if (url.charAt(0) !== '#') {
      try {
        if (new URL(url, location.href).origin !== location.origin) {
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      } catch (e) {}
    }
    return link;
  }
  function linkBox(link) {
    var box = el('div', 'modal-links-box');
    if (link) box.appendChild(link);
    return box;
  }
  function resumeLink() {
    var link = makeLink('Download Full Resume', 'assets/resume.pdf', 'btn btn-primary', {
      download: 'Hafijur_Rahman_Bhuiyan_Resume.pdf',
    });
    if (!link) return null;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    [
      ['width', '15'],
      ['height', '15'],
      ['viewBox', '0 0 24 24'],
      ['fill', 'none'],
      ['stroke', 'currentColor'],
      ['stroke-width', '2'],
      ['stroke-linecap', 'round'],
      ['stroke-linejoin', 'round'],
    ].forEach(function (pair) {
      svg.setAttribute(pair[0], pair[1]);
    });
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4');
    var polyline = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'polyline',
    );
    polyline.setAttribute('points', '7 10 12 15 17 10');
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '12');
    line.setAttribute('y1', '15');
    line.setAttribute('x2', '12');
    line.setAttribute('y2', '3');
    appendAll(svg, path, polyline, line);
    link.prepend(svg);
    return link;
  }
  function tagsBox(source) {
    var box = el('div', 'modal-tags-box');
    var tags = el('div', 'tags');
    if (source)
      source.querySelectorAll('.tag').forEach(function (tag) {
        tags.appendChild(el('span', 'tag', tag.textContent));
      });
    box.appendChild(tags);
    return box;
  }
  function listBox(lines) {
    var list = el('ul', 'modal-list');
    lines.forEach(function (line) {
      list.appendChild(el('li', '', line));
    });
    return list;
  }
  function projectLinks(source) {
    var box = el('div', 'modal-links-box');
    if (source)
      Array.prototype.forEach.call(source.querySelectorAll('a'), function (old) {
        var link = makeLink(
          old.textContent,
          old.getAttribute('href') || '',
          old.className || 'plink',
        );
        if (link) box.appendChild(link);
      });
    return box;
  }
  function buildProject(cardElement, back) {
    var root = el('div', 'modal-project-content');
    var title = textFrom(cardElement, 'h3');
    var links = cardElement.querySelector('.pcard-links');
    if (!back) {
      var logoImg = cardElement.querySelector('.pcard-logo img');
      var imageUrl = logoImg
        ? safeUrl(logoImg.getAttribute('src') || '', true)
        : '';
      if (imageUrl) {
        var media = el('div', 'modal-media-wrap');
        var img = document.createElement('img');
        img.src = imageUrl;
        img.alt = logoImg.alt || 'Project logo';
        media.appendChild(img);
        root.appendChild(media);
      }
      appendAll(
        root,
        el('div', 'modal-meta-kicker', 'Project · Selected Work'),
        el('h2', 'modal-title', title),
        el('div', 'modal-desc', textFrom(cardElement, 'p.desc')),
        tagsBox(cardElement.querySelector('.tags')),
        projectLinks(links),
      );
      return root;
    }
    appendAll(
      root,
      el(
        'div',
        'modal-meta-kicker',
        'System Architecture & Implementation',
      ),
      el('h2', 'modal-title', title),
      el(
        'p',
        'modal-desc',
        'Technical engineering specifications, architectural invariants, and production implementation stack:',
      ),
      listBox([
        'End-to-End Pipeline: Architected for resilience, high throughput, and zero-downtime execution.',
        'Data & API Layer: Clean schema boundaries, robust input validation, and real API integrations.',
        'Production Security: Authentication flows, CSRF protection, and prepared query defenses.',
        'Frontend Performance: Responsive touch layout and efficient rendering.',
      ]),
      projectLinks(links),
    );
    return root;
  }
  function buildSkill(cardElement, back) {
    var root = el('div', 'modal-project-content');
    var title = textFrom(cardElement, 'h3');
    if (!back) {
      appendAll(
        root,
        el('div', 'modal-meta-kicker', 'Technical Expertise'),
        el('h2', 'modal-title', title),
        el(
          'p',
          'modal-desc',
          'Core competencies, production toolchains, and industry-standard technologies leveraged across end-to-end applications.',
        ),
        tagsBox(cardElement.querySelector('.tags')),
        linkBox(
          makeLink('Explore Shipped Projects', '#projects', 'btn btn-primary', {
            closeModal: true,
          }),
        ),
      );
      return root;
    }
    appendAll(
      root,
      el('div', 'modal-meta-kicker', 'Skill Mastery & Application'),
      el('h2', 'modal-title', title + ' — Architecture'),
      el(
        'p',
        'modal-desc',
        'Used across 5+ delivered production systems, university research, and high-concurrency client platforms.',
      ),
      listBox([
        'Production code standards with typed contracts and comprehensive automated testing.',
        'Cross-platform deployment across Render, Vercel, Netlify, and containerized Docker runtimes.',
      ]),
      linkBox(
        makeLink('Get in Touch', '#contact', 'btn btn-primary', {
          closeModal: true,
        }),
      ),
    );
    return root;
  }
  function buildExperience(cardElement, back) {
    var root = el('div', 'modal-project-content');
    if (!back) {
      var sourceList = cardElement.querySelector('ul');
      var lines = sourceList
        ? Array.prototype.map.call(sourceList.querySelectorAll('li'), function (
            item,
          ) {
            return item.textContent.trim();
          })
        : [];
      appendAll(
        root,
        el('div', 'modal-meta-kicker', 'Professional Track Record'),
        el('h2', 'modal-title', textFrom(cardElement, 'h3')),
        el('div', 'modal-subtitle', textFrom(cardElement, '.tl-meta')),
        listBox(lines),
        linkBox(resumeLink()),
      );
      return root;
    }
    appendAll(
      root,
      el(
        'div',
        'modal-meta-kicker',
        'Internship Deliverables & Outcomes',
      ),
      el('h2', 'modal-title', 'FNF PLANET — Servico Platform'),
      el(
        'p',
        'modal-desc',
        'Full lifecycle ownership of service marketplace booking workflows inspired by Sheba.xyz.',
      ),
      listBox([
        'Cross-functional team sprint execution with weekly code reviews.',
        'Production DRF API integration, role dashboards, and payment flow resilience.',
      ]),
      linkBox(resumeLink()),
    );
    return root;
  }
  function buildEducation(cardElement, back) {
    var root = el('div', 'modal-project-content');
    var title = textFrom(cardElement, 'h3');
    if (!back) {
      appendAll(
        root,
        el('div', 'modal-meta-kicker', 'Academic Background'),
        el('h2', 'modal-title', title),
        el(
          'div',
          'modal-subtitle',
          textFrom(cardElement, '.inst') +
            ' (' +
            textFrom(cardElement, '.yr') +
            ')',
        ),
        el(
          'p',
          'modal-desc',
          'Formal computer science foundation including data structures, algorithms, database systems, software architecture, machine learning, and operating systems.',
        ),
        linkBox(
          makeLink('Contact Hafijur', '#contact', 'btn btn-primary', {
            closeModal: true,
          }),
        ),
      );
      return root;
    }
    appendAll(
      root,
      el('div', 'modal-meta-kicker', 'Academic Focus & Coursework'),
      el('h2', 'modal-title', title),
      listBox([
        'Data Structures & Algorithms, Object-Oriented Programming (C/Python/JS).',
        'Relational & Distributed Database Systems, Web Systems Architecture.',
        'Machine Learning, Deep Learning, Image Classification (CNNs).',
      ]),
      linkBox(
        makeLink('Contact Hafijur', '#contact', 'btn btn-primary', {
          closeModal: true,
        }),
      ),
    );
    return root;
  }
  function buildFact(cardElement, back) {
    var root = el('div', 'modal-project-content');
    var title =
      cardElement.getAttribute('data-card-title') ||
      textFrom(cardElement, 'b') ||
      'Detail';
    var description =
      cardElement.getAttribute('data-card-desc') ||
      textFrom(cardElement, 'span');
    appendAll(
      root,
      el(
        'div',
        'modal-meta-kicker',
        back ? 'Profile Overview' : 'Key Information',
      ),
      el('h2', 'modal-title', title),
      el('p', 'modal-desc', description),
      linkBox(
        makeLink('Get in Touch', '#contact', 'btn btn-primary', {
          closeModal: true,
        }),
      ),
    );
    return root;
  }

  function openCardDetails(cardElement) {
    if (!modalBackdrop || !modalBody) return;
    playModalOpenSound();

    if (modalCard) modalCard.classList.remove('flipped');
    currentCardData.isFlipped = false;
    if (flipBtnText) flipBtnText.textContent = 'Architecture Blueprint';

    var isProject = cardElement.classList.contains('pcard');
    var isSkill = cardElement.classList.contains('skill-card');
    var isExperience = cardElement.classList.contains('tl-card');
    var isEducation = cardElement.classList.contains('edu-item');
    var isFact = cardElement.classList.contains('fact');

    if (isProject) {
      currentCardData.frontNode = buildProject(cardElement, false);
      currentCardData.backNode = buildProject(cardElement, true);
    } else if (isSkill) {
      currentCardData.frontNode = buildSkill(cardElement, false);
      currentCardData.backNode = buildSkill(cardElement, true);
    } else if (isExperience) {
      currentCardData.frontNode = buildExperience(cardElement, false);
      currentCardData.backNode = buildExperience(cardElement, true);
    } else if (isEducation) {
      currentCardData.frontNode = buildEducation(cardElement, false);
      currentCardData.backNode = buildEducation(cardElement, true);
    } else if (isFact) {
      currentCardData.frontNode = buildFact(cardElement, false);
      currentCardData.backNode = buildFact(cardElement, true);
    } else {
      currentCardData.frontNode = el('div', 'modal-project-content');
      currentCardData.backNode = el('div', 'modal-project-content');
    }

    modalBody.replaceChildren(currentCardData.frontNode.cloneNode(true));

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

      if (currentCardData.isFlipped) {
        if (flipBtnText) flipBtnText.textContent = 'Flip to Overview';
        if (currentCardData.backNode)
          modalBody.replaceChildren(currentCardData.backNode.cloneNode(true));
      } else {
        if (flipBtnText) flipBtnText.textContent = 'Architecture Blueprint';
        if (currentCardData.frontNode)
          modalBody.replaceChildren(currentCardData.frontNode.cloneNode(true));
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

  // Event delegation keeps cloned modal nodes interactive without inline
  // handlers. Links marked data-close-modal dismiss the modal after activation.
  if (modalBody) {
    modalBody.addEventListener('click', function (e) {
      if (e.target.closest('[data-close-modal]')) window.closeCard3DModal();
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalBackdrop && modalBackdrop.classList.contains('active')) {
      window.closeCard3DModal();
    }
  });

  document.addEventListener('click', function (e) {
    var card=e.target.closest('.card-3d'); if(!card) return;
      if (e.target.closest('a') && !e.target.closest('.pcard-details-btn')) {
        return;
      }
      openCardDetails(card);
  });
  document.addEventListener('keydown', function (e) {
    var card=e.target.closest('.card-3d'); if(!card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (!e.target.closest('a')) {
          e.preventDefault();
          openCardDetails(card);
        }
      }
  });

  if (modalResetBtn && modalCard) {
    modalResetBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      playClickSound();
      currentCardData.isFlipped = false;
      if (flipBtnText) flipBtnText.textContent = 'Architecture Blueprint';
      if (currentCardData.frontNode)
        modalBody.replaceChildren(currentCardData.frontNode.cloneNode(true));
    });
  }

})();
