

/* ── padStart polyfill (Android < 6) ── */
if (!String.prototype.padStart) {
  String.prototype.padStart = function (len, fill) {
    var s = String(this);
    var f = fill === undefined ? ' ' : String(fill);
    while (s.length < len) { s = f + s; }
    return s;
  };
}

function cdInit() {
  /* ── DOM refs ── */
  var startBtn      = document.getElementById('countdown-start-btn');
  var durationInput = document.getElementById('countdown-duration');
  var messageInput  = document.getElementById('countdown-message');
  var overlay       = document.getElementById('countdown-overlay');
  var display       = document.getElementById('countdown-display');
  var zeroMsg       = document.getElementById('countdown-zero-msg');
  var zeroText      = document.getElementById('countdown-zero-text');

  if (!startBtn || !durationInput || !messageInput ||
      !overlay  || !display       || !zeroMsg || !zeroText) {
    /* Elements not in DOM yet — retry once after a short delay */
    setTimeout(cdInit, 500);
    return;
  }

  /* ── State ── */
  var timer        = null;
  var endTime      = 0;
  var isRunning    = false;

  /* ── Audio ── */
  var audioCtx      = null;
  var audioUnlocked = false;

  function getAudioCtx() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      try { audioCtx.resume(); } catch(e){}
    }
    return audioCtx;
  }

  function unlockAudio() {
    if (audioUnlocked) { return; }
    var ctx = getAudioCtx();
    if (!ctx) { return; }
    try {
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      if (src.start) { src.start(0); } else { src.noteOn(0); }
    } catch (e) {}
    audioUnlocked = true;
  }

  function playBeep(freq, dur, vol) {
    try {
      var ctx = getAudioCtx();
      if (!ctx) { return; }
      var osc  = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      if (osc.start)  { osc.start(ctx.currentTime); }  else { osc.noteOn(ctx.currentTime); }
      if (osc.stop)   { osc.stop(ctx.currentTime + dur);} else { osc.noteOff(ctx.currentTime + dur); }
    } catch (e) {}
  }

  function playTickBeep()   { playBeep(880,  0.07, 0.18); }
  function playUrgentBeep() { playBeep(1320, 0.12, 0.28); }
  function playLaunchFanfare() {
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      (function(f, d) { setTimeout(function() { playBeep(f, 0.22, 0.35); }, d); }(notes[i], i * 100));
    }
  }

  /* ── Helpers ── */
  function formatTime(secs) {
    var s   = Math.max(0, Math.floor(secs));
    var m   = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0');
  }

  function addClass(el, cls) {
    if (el.className.indexOf(cls) === -1) { el.className += ' ' + cls; }
  }
  function removeClass(el, cls) {
    el.className = el.className.replace(new RegExp('\\b' + cls + '\\b', 'g'), '').replace(/\s+/g, ' ').trim();
  }

  function showOverlay() { removeClass(overlay, 'hide'); }
  function hideOverlay() { addClass(overlay, 'hide'); }
  function setUrgent(on) { if (on) { addClass(display, 'urgent'); } else { removeClass(display, 'urgent'); } }

  function showZeroMessage(msg) {
    zeroText.textContent = msg || '\uD83C\uDF86 Happy New Year! \uD83C\uDF86';
    addClass(zeroMsg, 'visible');
    setTimeout(function() { removeClass(zeroMsg, 'visible'); }, 5000);
  }

  /* ── Launch fireworks via the app's own API ──────────────────────────
   * The app stores all state in `store`. Clicking DOM checkboxes does
   * nothing because the app reads from store.state, not from the DOM.
   * We must call store.setState() + togglePause() directly.
   * All three functions are defined in globals.js / actions.js and are
   * available as globals by the time window 'load' fires.
   * ─────────────────────────────────────────────────────────────────── */
  function triggerAutoLaunch() {
    try {
      /* 1. Enable auto-launch and finale via the store */
      if (typeof store !== 'undefined' && store.setState) {
        var cfg = Object.assign({}, store.state.config, {
          autoLaunch: true,
          finale: true
        });
        store.setState({ config: cfg });
        /* Sync config side-effects */
        if (typeof configDidUpdate === 'function') { configDidUpdate(); }
        /* Also sync UI checkboxes so they reflect reality */
        if (typeof updateConfig === 'function') { updateConfig(cfg); }
      }

      /* 2. Unpause if paused */
      if (typeof togglePause === 'function') {
        togglePause(false);   /* false = un-pause / resume */
      } else if (typeof store !== 'undefined') {
        store.setState({ paused: false });
      }

      /* 3. Close the settings menu if open */
      if (typeof toggleMenu === 'function') {
        toggleMenu(false);
      } else if (typeof store !== 'undefined') {
        store.setState({ menuOpen: false });
      }

    } catch (e) {
      /* Fallback: try clicking DOM elements */
      try {
        var autoCheck  = document.querySelector('.auto-launch');
        var finaleCheck = document.querySelector('.finale-mode');
        if (autoCheck  && !autoCheck.checked)  { autoCheck.click(); }
        if (finaleCheck && !finaleCheck.checked) { finaleCheck.click(); }
        var pauseBtn = document.querySelector('.pause-btn');
        if (pauseBtn) { pauseBtn.click(); }
      } catch(e2) {}
    }
  }

  /* ── Drift-corrected tick ── */
  function tick() {
    var remaining = Math.round((endTime - Date.now()) / 1000);

    if (remaining <= 0) {
      display.textContent = '0:00';
      finish();
      return;
    }

    display.textContent = formatTime(remaining);

    if (remaining <= 10) {
      setUrgent(true);
      playUrgentBeep();
    } else {
      playTickBeep();
    }
  }

  function finish() {
    clearInterval(timer);
    timer     = null;
    isRunning = false;

    hideOverlay();
    setUrgent(false);

    var raw = messageInput.value || '';
    var msg = raw.replace(/^\s+|\s+$/g, '') || '🎊 Happy Birthday Ezekiel! 🎊';
    showZeroMessage(msg);
    playLaunchFanfare();
    triggerAutoLaunch();

    startBtn.textContent = 'Start Countdown';
    removeClass(startBtn, 'active');
  }

  function startCountdown() {
    var secs = parseInt(durationInput.value, 10);
    if (!secs || secs < 1) { durationInput.focus(); return; }

    endTime   = Date.now() + secs * 1000;
    isRunning = true;

    display.textContent = formatTime(secs);
    showOverlay();
    setUrgent(false);

    startBtn.textContent = 'Cancel';
    addClass(startBtn, 'active');

    timer = setInterval(tick, 1000);
  }

  function cancelCountdown() {
    clearInterval(timer);
    timer     = null;
    isRunning = false;
    endTime   = 0;

    hideOverlay();
    setUrgent(false);
    removeClass(zeroMsg, 'visible');

    startBtn.textContent = 'Start Countdown';
    removeClass(startBtn, 'active');

    var v = parseInt(durationInput.value, 10);
    display.textContent = formatTime(isNaN(v) ? 0 : v);
  }

  /* ── Button: touchend + click dual handler ── */
  var touchFired = false;

  function handleActivation(e) {
    if (e && e.preventDefault) { e.preventDefault(); }
    unlockAudio();
    if (isRunning) { cancelCountdown(); } else { startCountdown(); }
  }

  startBtn.addEventListener('touchend', function(e) {
    touchFired = true;
    handleActivation(e);
    setTimeout(function() { touchFired = false; }, 600);
  }, { passive: false });

  startBtn.addEventListener('click', function(e) {
    if (touchFired) { return; }
    handleActivation(e);
  });

  /* Live preview while editing duration */
  durationInput.addEventListener('input', function() {
    if (!isRunning) {
      var v = parseInt(this.value, 10);
      display.textContent = formatTime(isNaN(v) ? 0 : v);
    }
  });

  /* ── Page Visibility: re-sync on wake ── */
  var visChange =
    typeof document.hidden           !== 'undefined' ? 'visibilitychange' :
    typeof document.msHidden         !== 'undefined' ? 'msvisibilitychange' :
    typeof document.webkitHidden     !== 'undefined' ? 'webkitvisibilitychange' : null;

  if (visChange) {
    document.addEventListener(visChange, function() {
      if (!isRunning) { return; }
      var hidden = document.hidden || document.msHidden || document.webkitHidden;
      if (!hidden) {
        tick();
        if (Date.now() >= endTime) { clearInterval(timer); finish(); }
      }
    });
  }
}

/* ── Boot: wait for ALL scripts to finish (window load) ── */
if (document.readyState === 'complete') {
  cdInit();
} else {
  window.addEventListener('load', cdInit);
}
