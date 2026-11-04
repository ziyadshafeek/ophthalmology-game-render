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
  /* Long sound test: ignores the Sounds setting entirely (a test that
     respects the setting it is testing would be silent exactly when
     the setting is off — the diagnostic bug in v11/v12). Plays a loud
     scale, repeating for 5 seconds, so the user has time to press
     volume-up DURING the sound: on Android, volume buttons only
     change media volume while media is playing, so a 0.4-second beep
     is over before the user can raise it. */
  function testSound() {
    try {
      var c = ac(); if (!c || c.state === 'closed') return;
      var notes = [523, 659, 784, 1046, 784, 659, 523];
      var start = c.currentTime + 0.05, i = 0;
      function one() {
        if (i >= notes.length * 2) return;
        var f = notes[i % notes.length];
        var o = c.createOscillator(), g = c.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(.18, c.currentTime);
        g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .35);
        o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + .35);
        i++;
        setTimeout(one, 450);
      }
      one();
    } catch (e) {}
  }
  window.OphthAudio = { ac: ac, sfx: sfx, testSound: testSound };
})();
