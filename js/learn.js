/* Learn Mode: automatic spaced repetition over the full 92-card deck.
   No interval buttons to pick — the engine schedules for you: a miss returns
   after 2–3 other cards, a correct answer pushes the card 8+ cards away, and
   a card leaves the deck only after two correct answers in a row.
   VOICE: on flip, the ENTIRE card back is read aloud in full — name, use,
   and the complete yellow note — in Piper or browser mode. Flipping stops
   the front reading (a user tap); grading or leaving Learn stops the back
   reading (also user taps). Nothing else cuts it off. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var L = null, CARDS = null;
  function deckFor(kind) {
    var d = CARDS.slice();
    if (kind === 'photo') d = d.filter(function (v) { return !!v.photo; });
    else if (kind === 'new') d = d.filter(function (v) { return v.id > 64; });
    else if (kind === 'quick') d = shuffle(d).slice(0, 25);
    return d;
  }
  function startLearn(kind) {
    var cards = deckFor(kind || 'all');
    L = { kind: kind || 'all', total: cards.length, queue: shuffle(cards).map(function (v) { return { v: v, streak: 0 }; }), cur: null, flipped: false, reviews: 0, got: 0, mastered: 0 };
    $('learnDone').classList.remove('on');
    $('learnPlay').style.display = 'block';
    nextCard(true);
  }
  function updStats(nextTxt) {
    $('lsMastered').textContent = L.mastered + ' / ' + L.total;
    $('lsRotation').textContent = L.queue.length + (L.cur ? 1 : 0);
    $('lsReviews').textContent = L.reviews;
    $('lsAcc').textContent = L.reviews ? Math.round(100 * L.got / L.reviews) + '%' : '—';
    $('lsNext').textContent = nextTxt || '—';
    $('learnProg').style.width = (L.total ? Math.round(100 * L.mastered / L.total) : 0) + '%';
  }
  function backText(v) {
    var parts = ['Name: ' + v.n + '.'];
    if (v.u) parts.push('Use: ' + v.u);
    if (v.note) parts.push('Verified note: ' + v.note);
    return parts.join(' ');
  }
  function nextCard(first) {
    if (!L.queue.length) { L.cur = null; finishLearn(); return; }
    L.cur = L.queue.shift(); L.flipped = false;
    var v = L.cur.v, fc = $('flipCard');
    fc.classList.remove('flipped');
    $('lfTag').textContent = 'CARD ' + v.id + ' · ' + (v.c || 'INSTRUMENT') + ' · FRONT';
    var im = $('lfImg');
    if (v.photo) { im.src = v.photo; im.alt = 'Photograph: ' + v.n; im.style.display = 'block'; }
    else { im.removeAttribute('src'); im.style.display = 'none'; }
    $('lfQ').textContent = v.photo ? '📸 Name this instrument — and its use' : 'Name this instrument — and its use';
    $('lfCue').textContent = v.q || '';
    $('lbName').textContent = v.n;
    $('lbUse').textContent = v.u || '';
    var nb = $('lbNote');
    if (v.note) { nb.style.display = 'block'; nb.textContent = '🟨 VERIFIED NOTE: ' + v.note; }
    else { nb.style.display = 'none'; nb.textContent = ''; }
    $('gradeMiss').disabled = true; $('gradeGot').disabled = true;
    updStats(first ? 'first card' : 'in ~' + Math.min(3, L.queue.length + 1) + ' cards if missed');
    if (OphthSettings.autoRead && !OphthSettings.muted && OphthSettings.mode !== 'off') {
      setTimeout(function () {
        if (!L || !L.cur || L.flipped) return;
        OphthVoice.speakFullText('Flashcard. ' + (v.photo ? 'Look at the photo. ' : '') + v.q + ' Name the instrument, and say what it is used for.');
      }, 80);
    }
  }
  function flip() {
    if (!L || !L.cur || L.flipped) return;
    L.flipped = true;
    $('flipCard').classList.add('flipped');
    $('gradeMiss').disabled = false; $('gradeGot').disabled = false;
    OphthAudio.sfx('click');
    /* Flip = user tap: stop the front reading, then read the FULL back. */
    if (OphthSettings.autoRead && !OphthSettings.muted && OphthSettings.mode !== 'off') {
      OphthVoice.speakFullText(backText(L.cur.v));
    }
  }
  function grade(gotIt) {
    if (!L || !L.cur || !L.flipped) return;
    OphthVoice.stopSpeak(); /* user tap */
    var c = L.cur; L.reviews++; L.cur = null; var msg;
    if (gotIt) {
      L.got++; c.streak++;
      if (c.streak >= 2) { L.mastered++; msg = 'mastered ✓ — out of the deck'; }
      else { L.queue.splice(Math.min(L.queue.length, 8 + Math.floor(Math.random() * 3)), 0, c); msg = 'right once — returns in ~9 cards'; }
      OphthAudio.sfx('correct');
    } else {
      c.streak = 0;
      L.queue.splice(Math.min(L.queue.length, 2 + Math.floor(Math.random() * 2)), 0, c);
      msg = 'missed — returns in ~3 cards';
      OphthAudio.sfx('wrong');
    }
    if (!L.queue.length && !L.cur) { finishLearn(); updStats(msg); return; }
    nextCard(false); updStats(msg);
  }
  function finishLearn() {
    $('learnPlay').style.display = 'none';
    var d = $('learnDone'); d.classList.add('on');
    $('learnDoneTxt').textContent = 'You mastered all ' + L.total + ' cards in ' + L.reviews + ' reviews (' + (L.reviews ? Math.round(100 * L.got / L.reviews) : 0) + '% first-flip accuracy).';
    OphthAudio.sfx('win'); OphthVoice.stopSpeak();
  }
  function openLearn() {
    OphthVoice.stopSpeak();
    if (window.OphthGame) OphthGame.stopGame();
    OphthData.loadCards().then(function (cards) {
      CARDS = cards;
      OphthShow('learnScreen');
      var sel = $('learnChips').querySelector('.chip.sel');
      startLearn(sel ? sel.dataset.deck : 'all');
    });
  }
  function closeLearn() {
    OphthVoice.stopSpeak();
    OphthShow('homeScreen');
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('learnBtn').onclick = function () { OphthAudio.ac(); OphthAudio.sfx('level'); openLearn(); };
    $('learnExit').onclick = closeLearn;
    $('flipCard').onclick = flip;
    $('flipCard').onkeydown = function (e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } };
    $('gradeMiss').onclick = function () { grade(false); };
    $('gradeGot').onclick = function () { grade(true); };
    $('learnSpeakerBtn').onclick = function () {
      if (!L || !L.cur) return;
      if (L.flipped) OphthVoice.speakFullText(backText(L.cur.v));
      else OphthVoice.speakFullText('Flashcard. ' + L.cur.v.q + ' Name the instrument, and say what it is used for.');
    };
    $('learnChips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      $('learnChips').querySelectorAll('.chip').forEach(function (c) { c.classList.remove('sel'); });
      b.classList.add('sel'); startLearn(b.dataset.deck);
    });
    $('learnAgain').onclick = function () { startLearn(L ? L.kind : 'all'); };
    $('learnToGame').onclick = function () { closeLearn(); $('playBtn').click(); };
    document.addEventListener('keydown', function (e) {
      if (!$('learnScreen').classList.contains('on') || !L) return;
      if (e.key === ' ') { e.preventDefault(); flip(); }
      if (L.flipped && (e.key === '1' || e.key.toLowerCase() === 'g')) grade(true);
      if (L.flipped && (e.key === '2' || e.key.toLowerCase() === 'm')) grade(false);
    });
  });
  window.OphthLearn = { backText: backText, deckFor: deckFor };
})();
