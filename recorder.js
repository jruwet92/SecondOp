/**
 * recorder.js
 * Handles mic recording, live visualiser bars, and playback.
 * Uses RecordRTC (loaded via <script> tag from cdnjs) for reliable cross-browser recording.
 *
 * Exposes on window:
 *   Recorder.toggle()          — start or stop recording
 *   Recorder.play()            — play/pause the last recording
 *   Recorder.getBlob()         — returns the recorded Blob (or null)
 *   Recorder.onStateChange     — set this to a callback(state) where state is 'idle' | 'recording' | 'done'
 */
(function () {
  // ── DOM refs (grabbed once, after DOM is ready) ──
  let micBtn, micLabel, recWrapper, recDone, playBtn;
  let bars = [];

  // ── State ─────────────────────────────────────
  let recordRTC   = null;   // RecordRTC instance
  let stream      = null;   // MediaStream from mic
  let audioCtx    = null;   // AudioContext for analyser
  let analyser    = null;
  let animFrame   = null;
  let blob        = null;   // last recorded Blob
  let state       = 'idle'; // idle | recording | done
  let audioEl     = null;   // current <audio> for playback

  // ── Init (call after DOM ready) ───────────────
  function init() {
    micBtn     = document.getElementById('micBtn');
    micLabel   = document.getElementById('micLabel');
    recWrapper = document.getElementById('recWrapper');
    recDone    = document.getElementById('recDone');
    playBtn    = document.getElementById('playBtn');
    bars       = document.querySelectorAll('.rec-bar');
  }

  // ── Visualiser ────────────────────────────────
  function startVisualiser() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const count = bars.length;

    function draw() {
      analyser.getByteFrequencyData(dataArray);
      for (let i = 0; i < count; i++) {
        const bin   = Math.floor(i * dataArray.length / count);
        const value = dataArray[bin];                        // 0–255
        bars[i].style.height = (4 + (value / 255) * 48) + 'px';
      }
      animFrame = requestAnimationFrame(draw);
    }
    draw();
  }

  function stopVisualiser() {
    if (animFrame)  cancelAnimationFrame(animFrame);
    if (audioCtx)   audioCtx.close();
    animFrame = null;
    audioCtx  = null;
    analyser  = null;
    // reset bars to minimum
    bars.forEach(b => b.style.height = '4px');
  }

  // ── UI helpers ────────────────────────────────
  function setUI(s) {
    if (s === 'recording') {
      micBtn.classList.add('recording');
      micLabel.textContent = "Arrêter l'enregistrement";
      recWrapper.classList.add('visible');
      recDone.style.display = 'none';
    } else if (s === 'done') {
      micBtn.classList.remove('recording');
      micLabel.textContent = 'Reenregistrer';
      recWrapper.classList.remove('visible');
      recDone.style.display = 'flex';
    } else {
      // idle
      micBtn.classList.remove('recording');
      micLabel.textContent = 'Enregistrer un message vocal';
      recWrapper.classList.remove('visible');
      recDone.style.display = 'none';
    }
  }

  // ── Public API ────────────────────────────────
  window.Recorder = {
    onStateChange: null,   // user sets this

    /** Start or stop recording */
    async toggle() {
      if (!micBtn) init(); // lazy init

      if (state === 'recording') {
        // ── STOP ──
        recordRTC.stopRecording(function () {
          blob = recordRTC.getBlob();
          console.log('Recorder: blob ready, size=' + blob.size + ' type=' + blob.type);

          // clean up mic stream
          if (stream) stream.getTracks().forEach(t => t.stop());
          stream = null;

          stopVisualiser();
          state = 'done';
          setUI('done');
          if (window.Recorder.onStateChange) window.Recorder.onStateChange('done');
        });
        return;
      }

      // ── START ──
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.error('Mic access denied', err);
        alert("Impossible d'accéder au microphone. Veuillez vérifier vos paramètres.");
        return;
      }

      // RecordRTC handles mimeType detection internally — just pass the stream
      recordRTC = new RecordRTC(stream, {
        type: 'audio',
        // let RecordRTC pick the best codec automatically
      });
      recordRTC.startRecording();

      startVisualiser();
      state = 'recording';
      setUI('recording');
      if (window.Recorder.onStateChange) window.Recorder.onStateChange('recording');
    },

    /** Play or pause the last recording */
    play() {
      if (!blob || blob.size === 0) {
        alert('Aucun enregistrement trouvé.');
        return;
      }

      // If already playing, pause
      if (audioEl && !audioEl.paused) {
        audioEl.pause();
        playBtn.textContent = '▶';
        return;
      }

      // If paused mid-play, resume
      if (audioEl && audioEl.paused && audioEl.currentTime > 0) {
        audioEl.play();
        playBtn.textContent = '⏸';
        return;
      }

      // Fresh play
      const url = URL.createObjectURL(blob);
      audioEl = new Audio(url);
      audioEl.onended = function () {
        playBtn.textContent = '▶';
        URL.revokeObjectURL(url);
        audioEl = null;
      };
      audioEl.play();
      playBtn.textContent = '⏸';
    },

    /** Returns the recorded Blob, or null */
    getBlob() {
      return blob;
    }
  };

  // Auto-init once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
