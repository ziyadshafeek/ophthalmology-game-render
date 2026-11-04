/* Voice engine: Local Piper (vits-web, on-device) with browser-voice fallback.
   FULL-NOTE GUARANTEE: every speak call goes through splitFull(), which splits
   text into sentences and queues EVERY sentence in order — nothing is
   summarised, truncated, or capped. Both engines chain chunk-by-chunk until
   the last sentence ends. stopSpeak() is only called on a user tap
   (Next / grade / screen change / mute / replay), never by a timer:
   the game timer is cleared during the answer reveal, so a reveal reading
   can never be cut off by the next round starting on its own.
   PHONE RULE (revised after browser voice gave zero sound on the user's
   phone, even on TEST VOICE): the phone's speechSynthesis engine cannot
   be relied on at all, so local Piper MUST work on phones too. Piper
   synthesis on the main thread blocks taps while it crunches a chunk,
   which is why it was disabled on phones before — so on phones Piper
   now runs in a Web Worker (js/piper-worker.js): the main thread only
   posts text and receives audio blobs, taps stay responsive, and the
   audio plays through a normal <audio> element, independent of the
   phone's broken speech engine. If the worker fails, main-thread Piper
   is tried as a fallback, then browser voice. Every speech button is
   also a toggle: tap while it is reading to stop it at once. */
(function () {
  'use strict';
  var DEFAULTS = { mode: 'local', autoRead: true, rate: 0.95, sounds: true, muted: false };
  var settings = loadSettings();
  function loadSettings() {
    try {
      var raw = localStorage.getItem('ophth-settings');
      if (raw) { var p = JSON.parse(raw); var out = {}; Object.keys(DEFAULTS).forEach(function (k) { out[k] = (p[k] === undefined ? DEFAULTS[k] : p[k]); }); return out; }
    } catch (e) {}
    return Object.assign({}, DEFAULTS);
  }
  function saveSettings() { try { localStorage.setItem('ophth-settings', JSON.stringify(settings)); } catch (e) {} }
  window.OphthSettings = settings;
  window.saveOphthSettings = saveSettings;

  var PIPER_VOICE = 'en_US-amy-low';
  /* Voice log: written to #voiceLog in Settings (if present) so the user
     can read exactly what stopped voice, instead of guessing. Never
     throws, never blocks speech. */
  function vlog(msg) {
    try {
      var el = document.getElementById('voiceLog');
      if (!el) return;
      var lines = (el.textContent || '').split('\n').filter(Boolean);
      lines.push(msg);
      if (lines.length > 10) lines = lines.slice(-10);
      el.textContent = lines.join('\n');
    } catch (e) {}
  }
  var piper = { state: 'idle', pct: 0, mod: null, token: 0, audio: null, slow: false };
  var ttsOK = ('speechSynthesis' in window);
  var chosenVoice = null, voiceNatural = false, speaking = false;
  var isMobile = false;
  try { isMobile = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches) || /Android|iPhone|iPad|iPod/.test(navigator.userAgent || ''); } catch (e) {}
  function usePiper() {
    if (settings.mode === 'browser' || settings.mode === 'off') return false;
    if (isMobile) return wp.state === 'ready' || (wp.state === 'failed' && piper.state === 'ready' && !!piper.mod);
    return !piper.slow && piper.state === 'ready' && !!piper.mod;
  }
  function piperLoading() {
    if (settings.mode === 'browser' || settings.mode === 'off') return false;
    if (isMobile) return wp.state === 'loading' || (wp.state === 'failed' && piper.state === 'loading');
    return piper.state === 'loading';
  }
  function setSpeaking(v) {
    speaking = !!v;
    try { document.dispatchEvent(new CustomEvent(v ? 'ophth-voice-start' : 'ophth-voice-end')); } catch (e) {}
  }
  function isSpeaking() { return speaking; }

  /* Worker Piper (phones): synthesis runs off the main thread. */
  var wp = { state: 'idle', pct: 0, worker: null, token: 0, pending: {}, seq: 0 };
  var pendingChunks = null, pendingTokens = null;
  function piperState() {
    if (isMobile) {
      if (wp.state === 'failed' && piper.state !== 'idle') return piper.state;
      return wp.state;
    }
    return piper.state;
  }
  function piperProgress() {
    if (isMobile) {
      if (wp.state === 'failed' && piper.state !== 'idle') return piper.state === 'ready' ? 1 : (piper.pct || 0);
      return wp.state === 'ready' ? 1 : (wp.pct || 0);
    }
    return piper.state === 'ready' ? 1 : (piper.pct || 0);
  }
  function flushPending() {
    if (!pendingChunks || !pendingTokens) return;
    if (pendingTokens.st !== speechToken || pendingTokens.pt !== piper.token || pendingTokens.wt !== wp.token) { pendingChunks = null; pendingTokens = null; return; }
    var chunks = pendingChunks; pendingChunks = null; pendingTokens = null;
    piperSpeak(chunks);
  }
  function flushPendingToBrowser() {
    if (!pendingChunks || !pendingTokens) return;
    if (pendingTokens.st !== speechToken || pendingTokens.pt !== piper.token || pendingTokens.wt !== wp.token) { pendingChunks = null; pendingTokens = null; return; }
    var chunks = pendingChunks; pendingChunks = null; pendingTokens = null;
    if (ttsOK) { vlog('Local model failed — falling back to browser voice.'); browserSpeak(chunks); }
  }
  function initPiperWorker() {
    if (wp.state === 'loading' || wp.state === 'ready') return;
    if (typeof Worker === 'undefined') { wp.state = 'failed'; initPiperMain(); return; }
    wp.state = 'loading'; updateVoiceStatus();
    try {
      var w = new Worker('js/piper-worker.js', { type: 'module' });
      wp.worker = w;
      w.onmessage = function (ev) {
        var d = ev.data || {};
        if (d.type === 'progress') { wp.pct = d.pct || 0; updateVoiceStatus(); }
        else if (d.type === 'ready') { wp.state = 'ready'; wp.pct = 1; vlog('Local model ready (worker).'); updateVoiceStatus(); flushPending(); }
        else if (d.type === 'failed') { wp.state = 'failed'; vlog('Local worker failed: ' + (d.error || 'unknown')); updateVoiceStatus(); initPiperMain(); }
        else if (d.type === 'result') {
          var p = wp.pending[d.id]; if (p) { delete wp.pending[d.id]; if (d.error) p.reject(new Error(d.error)); else p.resolve(d.blob); }
        }
      };
      w.onerror = function () { if (wp.state !== 'ready') { wp.state = 'failed'; vlog('Local worker error (could not start).'); updateVoiceStatus(); initPiperMain(); } };
      w.postMessage({ type: 'init' });
    } catch (e) { wp.state = 'failed'; updateVoiceStatus(); initPiperMain(); }
  }
  function workerPredict(text) {
    return new Promise(function (resolve, reject) {
      if (!wp.worker || wp.state !== 'ready') { reject(new Error('worker not ready')); return; }
      var id = ++wp.seq; wp.pending[id] = { resolve: resolve, reject: reject };
      try { wp.worker.postMessage({ type: 'predict', id: id, text: text }); }
      catch (e) { delete wp.pending[id]; reject(e); }
    });
  }
  function initPiperMain() {
    if (piper.state === 'loading' || piper.state === 'ready') return;
    piper.state = 'loading';
    import('https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm').then(function (mod) {
      piper.mod = mod;
      return mod.download(PIPER_VOICE, function (pr) {
        var pct = null;
        if (typeof pr === 'number' && isFinite(pr)) pct = pr;
        else if (pr && pr.total) pct = pr.loaded / pr.total;
        else if (pr && pr.totalBytes) pct = pr.loadedBytes / pr.totalBytes;
        if (pct !== null && isFinite(pct)) { piper.pct = Math.max(piper.pct, Math.max(0, Math.min(1, pct))); updateVoiceStatus(); }
      });
    }).then(function () { piper.state = 'ready'; piper.pct = 1; vlog('Local model ready (main thread).'); updateVoiceStatus(); flushPending(); })
      .catch(function () { piper.state = 'failed'; vlog('Local model download failed.'); updateVoiceStatus(); if (wp.state === 'failed') flushPendingToBrowser(); });
  }
  function initPiper() {
    if (isMobile) initPiperWorker();
    else initPiperMain();
  }
  function expandAbbr(t) {
    return t
      .replace(/\bACIOL\b/g, 'anterior chamber intraocular lens').replace(/\bIOLs?\b/g, 'intraocular lens')
      .replace(/\bCNLDO\b/g, 'congenital nasolacrimal duct obstruction').replace(/\bDCR\b/g, 'D C R').replace(/\bDCT\b/g, 'D C T')
      .replace(/\bSICS\b/g, 'S I C S').replace(/\bICCE\b/g, 'I C C E').replace(/\bECCE\b/g, 'E C C E').replace(/\bPhaco\b/g, 'phaco')
      .replace(/\bIOP\b/g, 'I O P').replace(/\bAC\b/g, 'anterior chamber').replace(/\bCCC\b/g, 'C C C').replace(/\bPMMA\b/g, 'P M M A')
      .replace(/\bCRAO\b/g, 'C R A O').replace(/\bCRVO\b/g, 'C R V O').replace(/\bBRVO\b/g, 'B R V O').replace(/\bNLD\b/g, 'N L D')
      .replace(/\bHPMC\b/g, 'H P M C').replace(/\bNd:YAG\b/gi, 'N D Yag').replace(/\bVKC\b/g, 'V K C').replace(/\bARMD\b/g, 'A R M D')
      .replace(/(\d+)-0\b/g, '$1 oh').replace(/(\d+(?:\.\d+)?)\s*mm\b/g, '$1 millimetres').replace(/°/g, ' degrees ').replace(/×/g, ' times ').replace(/\s+/g, ' ');
  }
  /* Split into sentences, then merge into chunks of at most ~240 characters.
     Every sentence from the input appears in exactly one chunk, in order.
     Short chunks avoid the browser engine's long-utterance stalls and keep
     Piper synthesis fast, without dropping a single word. */
  function splitFull(text) {
    var clean = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!clean) return [];
    /* Protect dots that are NOT sentence ends, so splitting never breaks a
       word: decimals (2.8 mm) and abbreviations (St., Dr., e.g., i.e.). */
    var protectedText = clean
      .replace(/(\d)\.(\d)/g, '$1\u0002$2')
      .replace(/\b(St|Dr|No|Fig|vs|etc|approx|Sr|Jr)\./g, '$1\u0001')
      .replace(/\be\.g\./g, 'e\u0001g\u0001')
      .replace(/\bi\.e\./g, 'i\u0001e\u0001');
    var sentences = protectedText.match(/[^.!?]+[.!?]+["']?|[^.!?]+$/g) || [protectedText];
    sentences = sentences.map(function (s) { return s.replace(/\u0001/g, '.').replace(/\u0002/g, '.'); });
    sentences = sentences.map(function (s) { return s.trim(); }).filter(Boolean);
    var chunks = [], cur = '';
    sentences.forEach(function (s) {
      if (cur && (cur + ' ' + s).length > 200) { chunks.push(cur); cur = s; }
      else cur = cur ? (cur + ' ' + s) : s;
    });
    if (cur) chunks.push(cur);
    return chunks;
  }
  /* Watchdog: a voice chunk must never stall the chain forever. Some mobile
     browsers (notably Android Chrome) sometimes never fire onend for a
     speech utterance, and a Piper synthesis can hang on a slow network.
     If a chunk has not finished within its generous budget, move on to the
     next chunk instead of leaving the game apparently frozen. */
  function chunkBudgetMs(text) { return Math.max(25000, Math.min(90000, text.length * 180)); }
  function piperSpeak(chunks) {
    var tok = ++piper.token, i = 0; setSpeaking(true);
    (function next() {
      if (tok !== piper.token || settings.muted || i >= chunks.length) { setSpeaking(false); return; }
      var tx = expandAbbr(chunks[i++]), advanced = false, watchdog = null;
      function adv() { if (advanced) return; advanced = true; if (watchdog) clearTimeout(watchdog); next(); }
      watchdog = setTimeout(function () { if (!isMobile) piper.slow = true; adv(); }, chunkBudgetMs(tx));
      var predictP = (isMobile && wp.state === 'ready')
        ? workerPredict(tx)
        : piper.mod.predict({ text: tx, voiceId: PIPER_VOICE });
      predictP.then(function (blob) {
        if (tok !== piper.token) { adv(); return; }
        var url = URL.createObjectURL(blob), a = new Audio();
        piper.audio = a; a.src = url;
        try { a.playbackRate = settings.rate; a.preservesPitch = true; } catch (e) {}
        a.onended = function () { URL.revokeObjectURL(url); if (piper.audio === a) piper.audio = null; adv(); };
        a.onerror = function () { vlog('Local audio playback error.'); URL.revokeObjectURL(url); adv(); };
        var p = a.play(); if (p && p.catch) p.catch(function (e) { vlog('Local audio play blocked: ' + String((e && e.message) || e)); adv(); });
      }).catch(function (e) { vlog('Local synthesis failed: ' + String((e && e.message) || e)); adv(); });
    })();
  }
  var speechToken = 0;
  function browserSpeak(chunks) {
    if (!ttsOK) return;
    var tok = ++speechToken, i = 0, keepAlive = null; setSpeaking(true);
    /* Android Chrome can pause the speech queue when the page loses focus
       for a moment; a periodic resume keeps it moving without user taps. */
    keepAlive = setInterval(function () {
      if (tok !== speechToken) { clearInterval(keepAlive); return; }
      try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) {}
    }, 1000);
    (function next() {
      if (tok !== speechToken || settings.muted || i >= chunks.length) { if (keepAlive) clearInterval(keepAlive); setSpeaking(false); return; }
      var spoken = expandAbbr(chunks[i++]), advanced = false, watchdog = null;
      function adv() { if (advanced) return; advanced = true; if (watchdog) clearTimeout(watchdog); next(); }
      /* One chunk, spoken once — with a default-voice retry if the picked
         voice errors. A picked voice that silently fails was the most
         likely reason a phone heard nothing at all while the chain
         happily advanced chunk by chunk. On phones no voice is picked
         at all: the system default voice is the one that is guaranteed
         to work on that phone, and 'en' avoids failing on a missing
         en-IN voice pack. */
      function speakChunk(useDefault) {
        var u = new SpeechSynthesisUtterance(spoken);
        if (!useDefault && !isMobile && chosenVoice) { u.voice = chosenVoice; u.lang = chosenVoice.lang; }
        else u.lang = 'en';
        u.rate = settings.rate; u.pitch = 1;
        u.onend = adv;
        u.onerror = function () {
          vlog('Browser voice error on this chunk.');
          if (!useDefault && !isMobile && chosenVoice) { try { if (watchdog) clearTimeout(watchdog); } catch (e) {} speakChunk(true); }
          else adv();
        };
        /* Watchdog: kill the stuck utterance first, then move on — otherwise
           Android Chrome queues the next chunk behind a dead one and the
           voice runs minutes behind the game, or never at all. */
        watchdog = setTimeout(function () { try { speechSynthesis.cancel(); } catch (e) {} adv(); }, chunkBudgetMs(spoken));
        try { speechSynthesis.speak(u); } catch (e) { adv(); }
      }
      speakChunk(false);
    })();
  }
  /* Start a chunk chain after a short settle: Android Chrome stalls if a
     new utterance is fed in the same instant as a cancel. The token guard
     means a NEXT / mute / screen-change tap in that 150 ms still wins and
     no stale speech starts over the next question. */
  function startChunks(chunks) {
    if (!chunks.length) return;
    stopSpeak();
    var st = speechToken, pt = piper.token;
    var wt = wp.token;
    setTimeout(function () {
      if (st !== speechToken || pt !== piper.token || wt !== wp.token || settings.muted || settings.mode === 'off') return;
      if (usePiper()) piperSpeak(chunks);
      else if (piperLoading()) {
        /* Local model is still downloading — queue this reading and
           speak it the moment the model is ready, instead of falling
           back to a browser voice that produces zero sound on this
           phone. stopSpeak() clears the queue, so a moved-on question
           never speaks stale text. */
        pendingChunks = chunks; pendingTokens = { st: speechToken, pt: piper.token, wt: wp.token };
        vlog('Local model still loading — reading queued, will speak when ready.');
        setSpeaking(false);
      }
      else if (ttsOK) browserSpeak(chunks);
    }, 150);
  }
  /* Speak a whole text, fully, in the active voice mode. */
  function speakFullText(text) {
    if (settings.muted || settings.mode === 'off') { vlog('Voice blocked by setting: ' + (settings.muted ? 'muted' : 'mode off')); return; }
    startChunks(splitFull(text));
  }
  /* Speak an explicit list of texts, fully, in order (used for questions). */
  function speakTexts(texts) {
    if (settings.muted || settings.mode === 'off' || !texts || !texts.length) return;
    var chunks = [];
    texts.forEach(function (t) { splitFull(t).forEach(function (c) { chunks.push(c); }); });
    startChunks(chunks);
  }
  function stopSpeak() {
    try {
      setSpeaking(false);
      if (ttsOK) {
        try { speechSynthesis.cancel(); } catch (e) {}
        /* Flush a stuck Android queue: cancel alone sometimes leaves the
           engine believing it is still speaking. */
        try { speechSynthesis.pause(); } catch (e2) {}
        try { speechSynthesis.resume(); } catch (e3) {}
      }
      speechToken++;
      piper.token++;
      wp.token++;
      pendingChunks = null; pendingTokens = null;
      if (piper.audio) { try { piper.audio.pause(); } catch (e) {} piper.audio = null; }
    } catch (e) {}
  }
  function voiceScore(v) {
    var n = (v.name || '').toLowerCase(), l = (v.lang || '').toLowerCase(), s = 0;
    if (n.indexOf('natural') >= 0) s += 50; if (n.indexOf('neural') >= 0) s += 50;
    if (n.indexOf('premium') >= 0) s += 40; if (n.indexOf('enhanced') >= 0) s += 35;
    if (n.indexOf('google') >= 0) s += 30; if (n.indexOf('microsoft') >= 0) s += 25;
    if (l.indexOf('en-in') === 0) s += 30; else if (l.indexOf('en-gb') === 0) s += 25; else if (l.indexOf('en-us') === 0) s += 10;
    if (/neerja|heera|sonia|aria|jenny|libby|emma|zira/.test(n)) s += 20;
    return s;
  }
  function pickVoice() {
    if (!ttsOK) return;
    var vs = speechSynthesis.getVoices();
    var en = vs.filter(function (v) { return (v.lang || '').toLowerCase().indexOf('en') === 0; });
    var pool = en.length ? en : vs;
    if (!pool.length) { updateVoiceStatus(); return; }
    pool = pool.slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
    chosenVoice = pool[0]; voiceNatural = voiceScore(chosenVoice) >= 25;
    updateVoiceStatus();
  }
  function voiceStatusText() {
    if (settings.mode === 'off') return 'Voice is off. Turn it on in Voice mode to hear notes read aloud.';
    if (isMobile && settings.mode !== 'browser') {
      if (wp.state === 'ready') return 'Reading voice: local neural model (Piper · Amy, en-US) — generated on this device, works offline. Synthesis runs in a worker, so taps stay responsive.';
      if (wp.state === 'loading') return 'Local voice is loading on this phone… ' + Math.round((wp.pct || 0) * 100) + '%. Tap TEST VOICE and it will speak once loading finishes — this download happens once.';
      if (wp.state === 'failed' && piper.state === 'ready') return 'Reading voice: local neural model (Piper · Amy, en-US) — worker failed, main-thread model is used instead.';
      if (wp.state === 'failed' && piper.state === 'failed') return 'Local voice failed to load on this phone — browser voice is used instead, which may be silent on this device. Reopen the page to retry the download.';
      if (wp.state === 'failed') return 'Local voice worker failed — trying the main-thread model…';
      return 'Local voice is starting on this phone…';
    }
    if (settings.mode !== 'browser' && piper.state === 'ready') return 'Reading voice: local neural model (Piper · Amy, en-US) — generated on this device, works offline.';
    if (settings.mode !== 'browser' && piper.state === 'loading') return 'Reading voice: local neural model is initialising — browser voice is used until it is ready.';
    if (!ttsOK) return 'This browser has no text-to-speech, so notes cannot be read aloud on this device.';
    if (!chosenVoice) return 'Voice loads with your browser — tap 🔊 on a question if reading does not start.';
    if (voiceNatural) return 'Reading voice: ' + chosenVoice.name + ' (' + chosenVoice.lang + ') — the most natural voice on this device.';
    return 'No natural (neural) voice is available on this device, so reading uses the basic system voice — ' + chosenVoice.name + '. For a natural voice, open this page in Chrome or Edge.';
  }
  function updateVoiceStatus() {
    var el = document.getElementById('voiceStatus');
    if (el) el.textContent = voiceStatusText();
    /* Home line: the download must be visible without opening Settings,
       or the user cannot tell whether it is downloading, ready, or
       failed. */
    try {
      var hv = document.getElementById('homeVoiceLine');
      if (hv) {
        if (isMobile && settings.mode !== 'browser' && settings.mode !== 'off') {
          if (wp.state === 'ready' || piper.state === 'ready') hv.textContent = 'Local voice: ready';
          else if (wp.state === 'loading' || piper.state === 'loading') hv.textContent = 'Local voice: downloading… ' + Math.round(piperProgress() * 100) + '% — keep this tab open';
          else if (wp.state === 'failed' && piper.state === 'failed') hv.textContent = 'Local voice: download failed — reopen to retry';
          else hv.textContent = 'Local voice: starting…';
        } else if (settings.mode === 'off') hv.textContent = 'Voice: off';
        else hv.textContent = 'Voice: browser voice';
      }
    } catch (e) {}
  }
  function retryPiper() {
    /* Force a fresh download attempt even if a previous attempt is
       stuck in 'loading': terminate the old worker and start again. */
    try { if (wp.worker) wp.worker.terminate(); } catch (e) {}
    wp.worker = null; wp.state = 'idle'; wp.pct = 0; wp.pending = {};
    piper.state = 'idle'; piper.pct = 0; piper.mod = null;
    vlog('Retrying local voice download…');
    initPiper();
  }
  function prime() {
    /* Call synchronously inside a tap handler. Volume 0, blank text:
       nothing audible, but the engine has now spoken once from a real
       user gesture, which is what Android needs before later async
       speaks (question / reveal) are allowed to make a sound. The fast
       HTML version spoke synchronously from its Start tap; this site's
       first speak is async (data fetch + delays), which is the most
       likely reason it worked in HTML and never on this site. */
    try {
      if (ttsOK) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    } catch (e) {}
  }
  window.OphthVoice = {
    prime: prime, retryPiper: retryPiper,
    settings: settings, saveSettings: saveSettings, initPiper: initPiper, piperState: piperState, piperProgress: piperProgress,
    splitFull: splitFull, speakFullText: speakFullText, speakTexts: speakTexts, stopSpeak: stopSpeak, isSpeaking: isSpeaking,
    updateVoiceStatus: updateVoiceStatus, voiceStatusText: voiceStatusText
  };
  initPiper();
  if (ttsOK) {
    pickVoice();
    if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
})();
