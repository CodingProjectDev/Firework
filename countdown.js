(function () {
  /* ── DOM refs ── */
  const startBtn       = document.getElementById('countdown-start-btn');
  const durationInput  = document.getElementById('countdown-duration');
  const messageInput   = document.getElementById('countdown-message');
  const overlay        = document.querySelector('.countdown-overlay');
  const display        = document.getElementById('countdown-display');
  const zeroMsg        = document.getElementById('countdown-zero-msg');
  const zeroText       = document.getElementById('countdown-zero-text');

  /* ── State ── */
  let timer      = null;
  let remaining  = 0;
  let isRunning  = false;

  /* ── Audio: simple beep via Web Audio API ── */
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function playBeep(freq, dur, vol) {
    try {
      const ctx  = getAudioCtx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type      = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + dur);
    } catch (e) { /* audio not available */ }
  }

  function playTickBeep()   { playBeep(880, 0.07, 0.18); }
  function playUrgentBeep() { playBeep(1320, 0.12, 0.28); }
  function playLaunchFanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => playBeep(f, 0.22, 0.35), i * 100);
    });
  }

  /* ── Helpers ── */
  function formatTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function showOverlay() { overlay.classList.remove('hide'); }
  function hideOverlay() { overlay.classList.add('hide'); }

  function setUrgent(on) {
    display.classList.toggle('urgent', on);
  }

  function showZeroMessage(msg) {
    zeroText.textContent = msg || '🎆 Happy New Year! 🎆';
    zeroMsg.classList.add('visible');
    /* auto-dismiss after 5 s */
    setTimeout(() => zeroMsg.classList.remove('visible'), 5000);
  }

  function triggerAutoLaunch() {
    /* Interact with the existing fireworks UI toggles if available */
    try {
      const autoLaunchCheck = document.querySelector('.auto-launch');
      if (autoLaunchCheck && !autoLaunchCheck.checked) {
        autoLaunchCheck.click();
      }
      const finaleCheck = document.querySelector('.finale-mode');
      if (finaleCheck && !finaleCheck.checked) {
        finaleCheck.click();
      }
      /* Resume simulation if currently paused */
      const pauseBtn = document.querySelector('.pause-btn');
      if (pauseBtn) {
        const pauseIcon = pauseBtn.querySelector('use');
        const href = pauseIcon
          ? (pauseIcon.getAttribute('href') || pauseIcon.getAttribute('xlink:href'))
          : '';
        if (href && href.includes('play')) {
          pauseBtn.click();
        }
      }
    } catch (e) { /* no-op if API unavailable */ }
  }

  /* ── Core countdown logic ── */
  function tick() {
    if (remaining <= 0) {
      finish();
      return;
    }

    remaining--;
    display.textContent = formatTime(remaining);

    /* Urgency threshold: last 10 seconds */
    if (remaining <= 10) {
      setUrgent(true);
      playUrgentBeep();
    } else {
      playTickBeep();
    }

    if (remaining <= 0) {
      finish();
    }
  }

  function finish() {
    clearInterval(timer);
    timer     = null;
    isRunning = false;

    hideOverlay();
    setUrgent(false);

    /* 1. Show launch message */
    const msg = (messageInput.value.trim()) || '🎆 Happy New Year! 🎆';
    showZeroMessage(msg);

    /* 2. Play fanfare */
    playLaunchFanfare();

    /* 3. Auto-launch fireworks */
    triggerAutoLaunch();

    /* Reset button */
    startBtn.textContent = 'Start Countdown';
    startBtn.classList.remove('active');
  }

  function startCountdown() {
    const secs = parseInt(durationInput.value, 10);
    if (!secs || secs < 1) {
      durationInput.focus();
      return;
    }

    remaining = secs;
    display.textContent = formatTime(remaining);
    showOverlay();
    setUrgent(false);

    startBtn.textContent = 'Cancel';
    startBtn.classList.add('active');
    isRunning = true;

    /* Unlock AudioContext on first user gesture */
    getAudioCtx();

    timer = setInterval(tick, 1000);
  }

  function cancelCountdown() {
    clearInterval(timer);
    timer     = null;
    isRunning = false;
    remaining = 0;

    hideOverlay();
    setUrgent(false);
    zeroMsg.classList.remove('visible');

    startBtn.textContent = 'Start Countdown';
    startBtn.classList.remove('active');
  }

  /* ── Button handler ── */
  startBtn.addEventListener('click', function () {
    if (isRunning) {
      cancelCountdown();
    } else {
      startCountdown();
    }
  });

  /* Live-preview the time display while user edits the duration field */
  durationInput.addEventListener('input', function () {
    if (!isRunning) {
      const v = parseInt(this.value, 10);
      display.textContent = formatTime(isNaN(v) ? 0 : v);
    }
  });

}());