/* Short WebAudio sound effects (same tones as the source build). Gated by the
   Sounds setting in Settings; the context is created/resumed on a user tap. */
(function () {
  'use strict';
  var AC = null;
  function ac() {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (AC && AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(f, t0, d, type, v) {
    if (!window.OphthSettings || !window.OphthSettings.sounds) return;
    var c = ac(); if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(v || .16, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t0 + d);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + d);
  }
  function sfx(k) {
    if (k === 'click') tone(660, 0, .07, 'square', .07);
    if (k === 'correct') { tone(523, 0, .12); tone(659, .08, .12); tone(784, .16, .2); }
    if (k === 'wrong') { tone(180, 0, .25, 'sawtooth', .18); tone(120, .05, .3, 'sawtooth', .14); }
    if (k === 'combo') { tone(700, 0, .08); tone(880, .06, .08); tone(1100, .12, .08); tone(1400, .18, .16); }
    if (k === 'level') { tone(392, 0, .14); tone(523, .12, .14); tone(659, .24, .14); tone(784, .36, .3); }
    if (k === 'over') { tone(440, 0, .25, 'triangle', .16); tone(349, .22, .25, 'triangle', .16); tone(262, .44, .45, 'triangle', .16); }
    if (k === 'win') { tone(523, 0, .15); tone(659, .13, .15); tone(784, .26, .15); tone(1046, .39, .4); }
    if (k === 'power') { tone(880, 0, .09, 'square', .09); tone(1320, .07, .14, 'square', .09); }
    if (k === 'tick') tone(1050, 0, .05, 'square', .06);
  }
  window.OphthAudio = { ac: ac, sfx: sfx };
})();
