/* countdown.js — cross-browser / mobile-safe
 * Fixes: DOMContentLoaded guard, iOS AudioContext unlock, drift-corrected
 * timer, padStart polyfill, touch-action, old-Android compat.
 */

/* ── String.prototype.padStart polyfill (old Android WebView) ── */
if (!String.prototype.padStart) {
  String.prototype.padStart = function (len, fill) {
    var s = String(this);
    var f = fill === undefined ? ' ' : String(fill);
    while (s.length < len) { s = f + s; }
    return s;
  };
}

/* ── Wait for DOM before touching any elements ── */
function cdInit() {

  /* ── DOM refs ── */
  var startBtn      = document.getElementById('countdown-start-btn');
  var durationInput = document.getElementById('countdown-duration');
  var messageInput  = document.getElementById('countdown-message');
  var overlay       = document.querySelector('.countdown-overlay');
  var display       = document.getElementById('countdown-display');
  var zeroMsg       = document.getElementById('countdown-zero-msg');
  var zeroText      = document.getElementById('countdown-zero-text');

  /* Guard: if any required element is missing, bail silently */
  if (!startBtn || !durationInput || !messageInput ||
      !overlay  || !display       || !zeroMsg || !zeroText) {
    return;
  }

  /* ── State ── */
  var timer        = null;   /* interval handle             */
  var endTime      = 0;      /* absolute end timestamp (ms) */
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
    /* Resume suspended context (iOS requires this after unlock) */
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  /* iOS Safari requires AudioContext to be created/resumed inside a
     direct user-gesture. We unlock it on the very first button tap. */
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
    } catch (e) { /* ignore */ }
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
      if (osc.start) { osc.start(ctx.currentTime); } else { osc.noteOn(ctx.currentTime); }
      if (osc.stop)  { osc.stop(ctx.currentTime + dur); }  else { osc.noteOff(ctx.currentTime + dur); }
    } catch (e) { /* audio not available */ }
  }

  function playTickBeep()   { playBeep(880,  0.07, 0.18); }
  function playUrgentBeep() { playBeep(1320, 0.12, 0.28); }
  function playLaunchFanfare() {
    var notes = [523, 659, 784, 1047];
    for (var i = 0; i < notes.length; i++) {
      (function (f, delay) {
        setTimeout(function () { playBeep(f, 0.22, 0.35); }, delay);
      }(notes[i], i * 100));
    }
  }

  /* ── Helpers ── */
  function formatTime(secs) {
    var s   = Math.max(0, Math.floor(secs));
    var m   = Math.floor(s / 60);
    var sec = s % 60;
    return m + ':' + String(sec).padStart(2, '0');
  }

  function showOverlay() {
    overlay.className = overlay.className.replace(/\bhide\b/g, '').trim();
  }
  function hideOverlay() {
    if (overlay.className.indexOf('hide') === -1) {
      overlay.className += ' hide';
    }
  }

  function setUrgent(on) {
    if (on) {
      if (display.className.indexOf('urgent') === -1) {
        display.className += ' urgent';
      }
    } else {
      display.className = display.className.replace(/\burgent\b/g, '').trim();
    }
  }

  function showZeroMessage(msg) {
    zeroText.textContent = msg || '\uD83C\uDF86 Happy New Year! \uD83C\uDF86';
    if (zeroMsg.className.indexOf('visible') === -1) {
      zeroMsg.className += ' visible';
    }
    setTimeout(function () {
      zeroMsg.className = zeroMsg.className.replace(/\bvisible\b/g, '').trim();
    }, 5000);
  }

  function triggerAutoLaunch() {
    try {
      var autoLaunchCheck = document.querySelector('.auto-launch');
      if (autoLaunchCheck && !autoLaunchCheck.checked) { autoLaunchCheck.click(); }
      var finaleCheck = document.querySelector('.finale-mode');
      if (finaleCheck && !finaleCheck.checked) { finaleCheck.click(); }
      var pauseBtn = document.querySelector('.pause-btn');
      if (pauseBtn) {
        var pauseIcon = pauseBtn.querySelector('use');
        var href = pauseIcon
          ? (pauseIcon.getAttribute('href') || pauseIcon.getAttribute('xlink:href') || '')
          : '';
        if (href.indexOf('play') !== -1) { pauseBtn.click(); }
      }
    } catch (e) { /* no-op */ }
  }

  /* ── Drift-corrected tick ──────────────────────────────────────────
   * setInterval is throttled / frozen on mobile (background tabs,
   * screen lock, CPU throttling). We store the absolute endTime and
   * compute remaining from Date.now() on every tick instead of
   * decrementing a counter, so the display is always accurate when
   * the phone wakes up.
   * ────────────────────────────────────────────────────────────────── */
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
    var msg = raw.replace(/^\s+|\s+$/g, '') || '\uD83C\uDF86 Happy New Year! \uD83C\uDF86';
    showZeroMessage(msg);
    playLaunchFanfare();
    triggerAutoLaunch();

    startBtn.textContent = 'Start Countdown';
    startBtn.className   = startBtn.className.replace(/\bactive\b/g, '').trim();
  }

  function startCountdown() {
    var secs = parseInt(durationInput.value, 10);
    if (!secs || secs < 1) {
      durationInput.focus();
      return;
    }

    endTime   = Date.now() + secs * 1000;
    isRunning = true;

    display.textContent = formatTime(secs);
    showOverlay();
    setUrgent(false);

    startBtn.textContent = 'Cancel';
    if (startBtn.className.indexOf('active') === -1) {
      startBtn.className += ' active';
    }

    timer = setInterval(tick, 1000);
  }

  function cancelCountdown() {
    clearInterval(timer);
    timer     = null;
    isRunning = false;
    endTime   = 0;

    hideOverlay();
    setUrgent(false);
    zeroMsg.className = zeroMsg.className.replace(/\bvisible\b/g, '').trim();

    startBtn.textContent = 'Start Countdown';
    startBtn.className   = startBtn.className.replace(/\bactive\b/g, '').trim();

    var v = parseInt(durationInput.value, 10);
    display.textContent = formatTime(isNaN(v) ? 0 : v);
  }

  /* ── Button: touchend + click for max compatibility ────────────────
   * touchend fires before click and skips the 300 ms delay on old iOS.
   * We flag it so the fallback click handler doesn't double-fire.
   * ────────────────────────────────────────────────────────────────── */
  var touchFired = false;

  function handleActivation(e) {
    if (e && e.preventDefault) { e.preventDefault(); }
    unlockAudio();
    if (isRunning) { cancelCountdown(); } else { startCountdown(); }
  }

  startBtn.addEventListener('touchend', function (e) {
    touchFired = true;
    handleActivation(e);
    setTimeout(function () { touchFired = false; }, 600);
  }, { passive: false });

  startBtn.addEventListener('click', function (e) {
    if (touchFired) { return; }
    handleActivation(e);
  });

  /* Live-preview while editing duration (idle only) */
  durationInput.addEventListener('input', function () {
    if (!isRunning) {
      var v = parseInt(this.value, 10);
      display.textContent = formatTime(isNaN(v) ? 0 : v);
    }
  });

  /* ── Page Visibility API: re-sync on return from background ────────
   * The browser may freeze JS while the app is backgrounded on mobile.
   * When the user returns, immediately recalculate from the wall clock.
   * ────────────────────────────────────────────────────────────────── */
  var visibilityChange =
    (typeof document.hidden !== 'undefined')           ? 'visibilitychange'
    : (typeof document.msHidden !== 'undefined')       ? 'msvisibilitychange'
    : (typeof document.webkitHidden !== 'undefined')   ? 'webkitvisibilitychange'
    : null;

  if (visibilityChange) {
    document.addEventListener(visibilityChange, function () {
      if (!isRunning) { return; }
      var isHidden = document.hidden || document.msHidden || document.webkitHidden;
      if (!isHidden) {
        tick(); /* immediate re-sync */
        if (Date.now() >= endTime) {
          clearInterval(timer);
          finish();
        }
      }
    });
  }

} /* end cdInit */

/* ── Boot after DOM is ready ── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', cdInit);
} else {
  cdInit();
}
