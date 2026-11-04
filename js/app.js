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
    if (window.OphthVoice) OphthVoice.stopSpeak();
    if (window.OphthGame) OphthGame.stopGame();
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
      var iv = setInterval(function () {
        if (bootDone) { clearInterval(iv); return; }
        var st = OphthVoice.piperState(), p = OphthVoice.piperProgress();
        var w = Math.round(68 + 14 * (st === 'ready' ? 1 : p));
        bar.style.width = w + '%'; pct.textContent = w + '%';
        if (st === 'ready' || st === 'failed' || Date.now() - t0 > 25000) {
          clearInterval(iv);
          var bl = document.getElementById('bootVoiceLine');
          if (bl) bl.textContent = (st === 'ready') ? 'local neural core · ONLINE' : 'browser voice core · ONLINE';
          setTimeout(step, reduced ? 30 : 330);
        }
      }, 200);
    }
    setTimeout(step, 120);
    setTimeout(finishBoot, 30000);
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
  document.addEventListener('DOMContentLoaded', function () {
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
