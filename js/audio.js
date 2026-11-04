/* Short WebAudio sound effects (same tones as the source build). Gated by the
   Sounds setting in Settings; the context is created/resumed on a user tap.
   HARD RULE: sound must NEVER throw and NEVER block the game. A closed or
   suspended AudioContext on a phone (battery saver, backgrounding, a
   browser that closes contexts) used to make o.start() throw, and because
   nextRound() called sfx() first, that one throw froze the whole game on
   the NEXT button. Every call here is now guarded, and a closed context
   is recreated instead of reused. */
(function () {
  'use strict';
  var AC = null;
  function ac() {
    try {
      if (!AC || AC.state === 'closed') {
        try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
      }
      if (AC && AC.state === 'suspended') {
        var p = AC.resume(); if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { AC = null; }
    return AC;
  }
  function tone(f, t0, d, type, v) {
    try {
      if (!window.OphthSettings || !window.OphthSettings.sounds) return;
      var c = ac(); if (!c || c.state === 'closed') return;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(v || .16, c.currentTime + t0);
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + t0 + d);
      o.connect(g); g.connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + d);
    } catch (e) {}
  }
  function sfx(k) {
    try {
      if (k === 'click') tone(660, 0, .07, 'square', .07);
      if (k === 'correct') { tone(523, 0, .12); tone(659, .08, .12); tone(784, .16, .2); }
      if (k === 'wrong') { tone(180, 0, .25, 'sawtooth', .18); tone(120, .05, .3, 'sawtooth', .14); }
      if (k === 'combo') { tone(700, 0, .08); tone(880, .06, .08); tone(1100, .12, .08); tone(1400, .18, .16); }
      if (k === 'level') { tone(392, 0, .14); tone(523, .12, .14); tone(659, .24, .14); tone(784, .36, .3); }
      if (k === 'over') { tone(440, 0, .25, 'triangle', .16); tone(349, .22, .25, 'triangle', .16); tone(262, .44, .45, 'triangle', .16); }
      if (k === 'win') { tone(523, 0, .15); tone(659, .13, .15); tone(784, .26, .15); tone(1046, .39, .4); }
      if (k === 'power') { tone(880, 0, .09, 'square', .09); tone(1320, .07, .14, 'square', .09); }
      if (k === 'tick') tone(1050, 0, .05, 'square', .06);
    } catch (e) {}
  }
  window.OphthAudio = { ac: ac, sfx: sfx };
})();
