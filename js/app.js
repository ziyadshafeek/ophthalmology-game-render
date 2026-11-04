/* Boot screen + screen router + Settings wiring.
   The boot screen is the only loading UI: the local voice model loads
   behind it and the boot bar simply waits for it (max 25s, skip anytime).
   No "downloading voice model" UI exists anywhere else. */
(function () {
  'use strict';
  var SCREENS = ['homeScreen', 'gameScreen', 'resultsScreen', 'learnScreen', 'libraryScreen', 'settingsScreen'];
  function $(id) { return document.getElementById(id); }
  function showScreen(id) {
    SCREENS.forEach(function (s) { var el = $(s); if (el) el.classList.toggle('on', s === id); });
    window.scrollTo(0, 0);
  }
  window.OphthShow = showScreen;
  function goHome() {
    try { if (window.OphthVoice) OphthVoice.stopSpeak(); } catch (e) {}
    try { if (window.OphthGame) OphthGame.stopGame(); } catch (e2) {}
    try { if (window.OphthGame && OphthGame.refreshResume) OphthGame.refreshResume(); } catch (e3) {}
    showScreen('homeScreen');
    var best = window.OphthGame ? OphthGame.bestScore() : 0;
    var bl = $('bestLine');
    if (bl) bl.innerHTML = best ? ('BEST SCORE THIS SESSION: <strong>' + best + '</strong>') : '';
  }
  window.OphthHome = goHome;

  /* ---------- Boot ---------- */
  var bootDone = false;
  function finishBoot() {
    if (bootDone) return; bootDone = true;
    var boot = $('bootScreen');
    if (boot) { boot.classList.add('done'); setTimeout(function () { if (boot.parentNode) boot.parentNode.removeChild(boot); }, 600); }
  }
  (function boot() {
    var boot = $('bootScreen'); if (!boot) return;
    $('bootSkip').onclick = finishBoot;
    boot.addEventListener('click', function (e) { if (e.target === boot) finishBoot(); });
    var lines = [
      ['> OPHTHALMO·OS kernel ............ <span class="dim">OK</span>', 10],
      ['> Cybernetic interface ........... <span class="dim">neon HUD · ONLINE</span>', 24],
      ['> Instrument database ............ <span class="dim">57 playable · 92 cards</span>', 40],
      ['> Photo archive .................. <span class="dim">76 images linked</span>', 54],
      ['> Neural voice engine ............ <span class="dim" id="bootVoiceLine">neural core initialising…</span>', 68],
      ['> Spaced-repetition core ......... <span class="dim">Learn Mode armed</span>', 84],
      ['> Arena systems .................. <span class="dim">ONLINE</span>', 100]
    ];
    var li = 0, log = $('bootLog'), bar = $('bootBar'), pct = $('bootPct'), t0 = Date.now();
    var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    function appendLine(i) {
      var div = document.createElement('div'); div.innerHTML = lines[i][0]; log.appendChild(div);
      bar.style.width = lines[i][1] + '%'; pct.textContent = lines[i][1] + '%';
    }
    function step() {
      if (bootDone) return;
      if (li >= lines.length) { setTimeout(finishBoot, reduced ? 50 : 420); return; }
      if (li === 4) { appendLine(4); li = 5; waitVoice(); return; }
      appendLine(li); li++; setTimeout(step, reduced ? 30 : 330);
    }
    function waitVoice() {
      /* The boot screen must never hold the game hostage on a slow phone:
         wait at most ~5 seconds for the local voice model, then go in
         anyway — the model keeps loading in the background and the browser
         voice covers until it is ready. */
      var iv = setInterval(function () {
        if (bootDone) { clearInterval(iv); return; }
        var st = OphthVoice.piperState(), p = OphthVoice.piperProgress();
        var w = Math.round(68 + 14 * (st === 'ready' ? 1 : p));
        bar.style.width = w + '%'; pct.textContent = w + '%';
        if (st === 'ready' || st === 'failed' || Date.now() - t0 > 5000) {
          clearInterval(iv);
          var bl = document.getElementById('bootVoiceLine');
          if (bl) bl.textContent = (st === 'ready') ? 'local neural core · ONLINE' : 'browser voice core · ONLINE';
          setTimeout(step, reduced ? 30 : 330);
        }
      }, 200);
    }
    setTimeout(step, 120);
    setTimeout(finishBoot, 8000);
  })();

  /* ---------- Home + Settings wiring ---------- */
  function syncSettingsUI() {
    var st = OphthSettings;
    $('voiceMode').value = st.mode;
    $('autoRead').checked = !!st.autoRead;
    $('voiceSpeed').value = st.rate;
    $('voiceSpeedVal').textContent = Number(st.rate).toFixed(2).replace(/0$/, '') + '×';
    $('soundsOn').checked = !!st.sounds;
    $('muteBtn').textContent = st.muted ? '🔇 VOICE: OFF' : '🎙️ VOICE: ON';
    OphthVoice.updateVoiceStatus();
  }
  /* Fullscreen toggle, cross-browser: standard API plus webkit/moz/ms
     fallbacks. On iOS Safari there is no element fullscreen API, so the
     button there scrolls to the top and lets the browser chrome collapse;
     true fullscreen on iPhone comes from Add to Home Screen (the meta tags
     in index.html declare the app capable of that). */
  function fsEl() { return document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement || null; }
  function toggleFullscreen() {
    try {
      if (fsEl()) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } else {
        var el = document.documentElement;
        if (el.requestFullscreen) { var p = el.requestFullscreen(); if (p && p.catch) p.catch(function () {}); }
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
        else window.scrollTo(0, 0);
      }
    } catch (e) {}
    syncFsButtons();
  }
  function syncFsButtons() {
    var on = !!fsEl();
    ['fsBtnHome', 'fsBtnGame'].forEach(function (id) {
      var b = $(id); if (b) b.textContent = on ? '⛶ EXIT FULLSCREEN' : '⛶ FULL SCREEN';
    });
  }
  document.addEventListener('fullscreenchange', syncFsButtons);
  document.addEventListener('webkitfullscreenchange', syncFsButtons);
  document.addEventListener('mozfullscreenchange', syncFsButtons);
  document.addEventListener('MSFullscreenChange', syncFsButtons);
  document.addEventListener('DOMContentLoaded', function () {
    syncFsButtons();
    ['fsBtnHome', 'fsBtnGame'].forEach(function (id) {
      var b = $(id); if (b) b.onclick = function () { OphthAudio.sfx('click'); toggleFullscreen(); };
    });
    syncSettingsUI();
    $('settingsBtn').onclick = function () { OphthAudio.sfx('click'); showScreen('settingsScreen'); syncSettingsUI(); };
    $('settingsBack').onclick = function () { goHome(); };
    $('voiceMode').onchange = function () { OphthSettings.mode = this.value; saveOphthSettings(); OphthVoice.updateVoiceStatus(); };
    $('autoRead').onchange = function () { OphthSettings.autoRead = this.checked; saveOphthSettings(); if (!this.checked) OphthVoice.stopSpeak(); };
    $('voiceSpeed').oninput = function () { OphthSettings.rate = parseFloat(this.value); saveOphthSettings(); $('voiceSpeedVal').textContent = OphthSettings.rate.toFixed(2).replace(/0$/, '') + '×'; };
    $('soundsOn').onchange = function () { OphthSettings.sounds = this.checked; saveOphthSettings(); if (this.checked) OphthAudio.sfx('click'); };
    $('muteBtn').onclick = function () {
      OphthSettings.muted = !OphthSettings.muted; saveOphthSettings();
      if (OphthSettings.muted) OphthVoice.stopSpeak();
      syncSettingsUI();
    };
  });
})();
