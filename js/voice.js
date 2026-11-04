/* Voice engine: Local Piper (vits-web, on-device) with browser-voice fallback.
   FULL-NOTE GUARANTEE: every speak call goes through splitFull(), which splits
   text into sentences and queues EVERY sentence in order — nothing is
   summarised, truncated, or capped. Both engines chain chunk-by-chunk until
   the last sentence ends. stopSpeak() is only called on a user tap
   (Next / grade / screen change / mute / replay), never by a timer:
   the game timer is cleared during the answer reveal, so a reveal reading
   can never be cut off by the next round starting on its own. */
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
  var piper = { state: 'idle', pct: 0, mod: null, token: 0, audio: null };
  var ttsOK = ('speechSynthesis' in window);
  var chosenVoice = null, voiceNatural = false;

  function piperState() { return piper.state; }
  function piperProgress() { return piper.state === 'ready' ? 1 : (piper.pct || 0); }
  function initPiper() {
    if (piper.state === 'loading' || piper.state === 'ready') return;
    piper.state = 'loading';
    import('https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm').then(function (mod) {
      piper.mod = mod;
      return mod.download(PIPER_VOICE, function (pr) { if (pr && pr.total) piper.pct = Math.max(piper.pct, pr.loaded / pr.total); });
    }).then(function () { piper.state = 'ready'; piper.pct = 1; updateVoiceStatus(); })
      .catch(function () { piper.state = 'failed'; updateVoiceStatus(); });
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
      if (cur && (cur + ' ' + s).length > 240) { chunks.push(cur); cur = s; }
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
    var tok = ++piper.token, i = 0;
    (function next() {
      if (tok !== piper.token || settings.muted || i >= chunks.length) return;
      var tx = expandAbbr(chunks[i++]), advanced = false, watchdog = null;
      function adv() { if (advanced) return; advanced = true; if (watchdog) clearTimeout(watchdog); next(); }
      watchdog = setTimeout(adv, chunkBudgetMs(tx));
      piper.mod.predict({ text: tx, voiceId: PIPER_VOICE }).then(function (blob) {
        if (tok !== piper.token) { adv(); return; }
        var url = URL.createObjectURL(blob), a = new Audio();
        piper.audio = a; a.src = url;
        try { a.playbackRate = settings.rate; a.preservesPitch = true; } catch (e) {}
        a.onended = function () { URL.revokeObjectURL(url); if (piper.audio === a) piper.audio = null; adv(); };
        a.onerror = function () { URL.revokeObjectURL(url); adv(); };
        var p = a.play(); if (p && p.catch) p.catch(adv);
      }).catch(adv);
    })();
  }
  var speechToken = 0;
  function browserSpeak(chunks) {
    if (!ttsOK) return;
    var tok = ++speechToken, i = 0, keepAlive = null;
    /* Android Chrome can pause the speech queue when the page loses focus
       for a moment; a periodic resume keeps it moving without user taps. */
    keepAlive = setInterval(function () {
      if (tok !== speechToken) { clearInterval(keepAlive); return; }
      try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch (e) {}
    }, 1000);
    (function next() {
      if (tok !== speechToken || settings.muted || i >= chunks.length) { if (i >= chunks.length) clearInterval(keepAlive); return; }
      var spoken = expandAbbr(chunks[i++]), advanced = false, watchdog = null;
      function adv() { if (advanced) return; advanced = true; if (watchdog) clearTimeout(watchdog); next(); }
      var u = new SpeechSynthesisUtterance(spoken);
      if (chosenVoice) { u.voice = chosenVoice; u.lang = chosenVoice.lang; } else u.lang = 'en-IN';
      u.rate = settings.rate; u.pitch = 1;
      u.onend = adv; u.onerror = adv;
      watchdog = setTimeout(adv, chunkBudgetMs(spoken));
      try { speechSynthesis.speak(u); } catch (e) { adv(); }
    })();
  }
  /* Speak a whole text, fully, in the active voice mode. */
  function speakFullText(text) {
    if (settings.muted || settings.mode === 'off') return;
    var chunks = splitFull(text);
    if (!chunks.length) return;
    stopSpeak();
    if (settings.mode !== 'browser' && piper.state === 'ready' && piper.mod) piperSpeak(chunks);
    else if (ttsOK) browserSpeak(chunks);
  }
  /* Speak an explicit list of texts, fully, in order (used for questions). */
  function speakTexts(texts) {
    if (settings.muted || settings.mode === 'off' || !texts || !texts.length) return;
    var chunks = [];
    texts.forEach(function (t) { splitFull(t).forEach(function (c) { chunks.push(c); }); });
    if (!chunks.length) return;
    stopSpeak();
    if (settings.mode !== 'browser' && piper.state === 'ready' && piper.mod) piperSpeak(chunks);
    else if (ttsOK) browserSpeak(chunks);
  }
  function stopSpeak() {
    try {
      if (ttsOK) { try { speechSynthesis.cancel(); } catch (e) {} }
      speechToken++;
      piper.token++;
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
  }
  window.OphthVoice = {
    settings: settings, saveSettings: saveSettings, initPiper: initPiper, piperState: piperState, piperProgress: piperProgress,
    splitFull: splitFull, speakFullText: speakFullText, speakTexts: speakTexts, stopSpeak: stopSpeak,
    updateVoiceStatus: updateVoiceStatus, voiceStatusText: voiceStatusText
  };
  initPiper();
  if (ttsOK) {
    pickVoice();
    if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.addEventListener('voiceschanged', pickVoice);
  }
})();
