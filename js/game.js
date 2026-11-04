/* 3-level arena, mechanics identical to the source build:
   L1 8×15s (difficulty ≤1), L2 8×12s (difficulty ≤2), Boss 10×8s (difficulty ≥2).
   Score: (100 + 5×seconds left) × multiplier (1 + floor(combo/3), capped ×5).
   3 lives, shield absorbs one miss, +250 on level clear, every 5-combo adds
   one 50:50 and one +5s. Power-ups start at 1 each. Ranks: 3500 Consultant,
   2200 Senior Resident, 1100 Resident, else Intern.
   REVEAL VOICE: on every reveal the FULL yellow (verified) note is read aloud
   in full — name, use, viva fact, then the entire yellow note, sentence by
   sentence, in Piper or browser mode. The timer is cleared on reveal and the
   next round starts only when the player taps NEXT, so the reading is never
   cut off by a timer or an automatic advance. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  var G = null, DATA = null, CARDS = null, FULLNOTES = null, PHOTOMAP = null;
  var best = 0, lastRevealText = '', lastQuestionText = '', revealed = false;

  function ensureData() {
    if (DATA) return Promise.resolve(DATA);
    return Promise.all([OphthData.loadItems(), OphthData.loadCards(), OphthData.loadFullNotes(), OphthData.loadPhotoMap()])
      .then(function (parts) { DATA = parts[0]; CARDS = parts[1]; FULLNOTES = parts[2]; PHOTOMAP = parts[3]; return DATA; });
  }
  function stopGame() { if (G && G.timer) clearInterval(G.timer); OphthVoice.stopSpeak(); G = null; }
  function mult() { return Math.min(5, 1 + Math.floor(G.combo / 3)); }
  function curQ() {
    var item = G.queue[G.qi];
    var mode = G.level === 2 ? (G.qi % 3 === 2 ? 'trap' : (G.qi % 2 ? 'use' : 'id')) : (G.qi % 2 ? 'use' : 'id');
    return { item: item, mode: mode };
  }
  function photoFor(item) { return PHOTOMAP ? (PHOTOMAP[item.n] || null) : null; }
  function verifiedFor(item) { return OphthData.verifiedNoteFor(item.n, DATA); }

  function newGame() {
    ensureData().then(function () {
      G = { level: 0, score: 0, lives: 3, combo: 0, bestCombo: 0, correct: 0, answered: 0, queue: [], qi: 0, timer: null, remain: 0, total: 0, locked: false, shield: false, pw: { fifty: 1, time: 1, shield: 1, hint: 1 }, spotter: false };
      OphthShow('gameScreen');
      buildLevel(0);
    });
  }
  function buildLevel(lv) {
    G.level = lv;
    var L = DATA.levels[lv];
    var pool = lv === 2 ? DATA.items.filter(function (x) { return x.d >= 2; }) : DATA.items.filter(function (x) { return x.d <= L.maxD; });
    G.queue = shuffle(pool).slice(0, L.count); G.qi = 0;
    $('lvlVal').textContent = L.name;
    updateHUD(); showQuestion();
  }
  function updateHUD() {
    $('scoreVal').textContent = G.score;
    $('comboVal').textContent = G.combo;
    $('comboMult').textContent = '×' + mult();
    $('comboPill').classList.toggle('hot', G.combo >= 3);
    var h = '';
    for (var i = 0; i < 3; i++) h += '<span class="' + (i < G.lives ? 'beat' : 'lost') + '">❤️</span>';
    $('hearts').innerHTML = h;
    $('cFifty').textContent = G.pw.fifty; $('cTime').textContent = G.pw.time;
    $('cShield').textContent = G.pw.shield; $('cHint').textContent = G.pw.hint;
    $('pwFifty').disabled = G.pw.fifty <= 0 || G.locked;
    $('pwTime').disabled = G.pw.time <= 0 || G.locked;
    $('pwShield').disabled = G.pw.shield <= 0 || G.shield;
    $('pwHint').disabled = G.pw.hint <= 0 || G.locked;
    $('pwShield').classList.toggle('activeShield', G.shield);
    var L = DATA.levels[G.level], d = '';
    for (var i = 0; i < L.count; i++) d += '<span class="dot ' + (i < G.qi ? 'done' : i === G.qi ? 'now' : '') + '"></span>';
    $('dots').innerHTML = d;
    $('qCount').textContent = 'ROUND ' + Math.min(G.qi + 1, L.count) + ' / ' + L.count + (G.level === 2 ? ' · 👑 BOSS' : '');
  }
  function makeOpts(correct, pool) {
    var wrong = shuffle(pool.filter(function (x) { return x !== correct; })).slice(0, 3);
    return shuffle([correct].concat(wrong).map(function (t) { return { txt: t, correct: t === correct }; }));
  }
  function showQuestion() {
    OphthVoice.stopSpeak();
    G.locked = false; revealed = false;
    var q = curQ(), it = q.item, L = DATA.levels[G.level];
    $('hintBox').classList.remove('on');
    $('feedback').classList.remove('on');
    var photo = photoFor(it), stage = $('photoStage'), pimg = $('photoImg'), pcap = $('photoCap');
    G.spotter = !!(photo && q.mode === 'id');
    if (photo) { stage.style.display = 'block'; pimg.src = photo; pimg.alt = 'Photograph of the instrument for this round — identify it'; pcap.style.display = 'none'; }
    else { stage.style.display = 'none'; pimg.removeAttribute('src'); }
    var opts = [];
    if (G.spotter) {
      $('qTag').textContent = '📸 PHOTO SPOTTER'; $('qTag').className = 'tag';
      $('qTitle').textContent = 'Name the instrument in the photo!';
      $('qClue').textContent = 'Real photograph from your flashcards — no name given, just like a viva spotter.';
      opts = makeOpts(it.n, DATA.items.map(function (x) { return x.n; }));
    } else if (q.mode === 'id') {
      $('qTag').textContent = '🎯 IDENTIFY THE INSTRUMENT'; $('qTag').className = 'tag';
      $('qTitle').textContent = 'Name that instrument!';
      $('qClue').textContent = it.clue;
      opts = makeOpts(it.n, DATA.items.map(function (x) { return x.n; }));
    } else if (q.mode === 'use') {
      $('qTag').textContent = '🔧 WHAT IS IT FOR?'; $('qTag').className = 'tag useTag';
      $('qTitle').textContent = it.n;
      $('qClue').textContent = 'Which job does this instrument actually do?';
      opts = makeOpts(it.use, DATA.items.map(function (x) { return x.use; }).concat(DATA.falseUses));
    } else {
      $('qTag').textContent = '👑 BOSS TRAP — WHICH IS TRUE?'; $('qTag').className = 'tag bossTag';
      $('qTitle').textContent = it.n + ' — spot the true viva fact';
      $('qClue').textContent = it.clue;
      opts = makeOpts(it.fact, DATA.items.filter(function (x) { return x !== it; }).map(function (x) { return x.fact; }));
    }
    $('pointsTag').textContent = (100 * mult()) + ' PTS + TIME BONUS';
    /* A fresh round always starts at the top of the screen, so the question
       is never left below the previous round's answer on a phone. */
    try { window.scrollTo(0, 0); } catch (e) {}
    var box = $('opts'); box.innerHTML = '';
    opts.forEach(function (o, i) {
      var b = document.createElement('button'); b.className = 'opt';
      b.innerHTML = '<span class="key">' + (i + 1) + '</span><span></span>';
      b.querySelectorAll('span')[1].textContent = o.txt;
      b.dataset.correct = o.correct ? '1' : '0';
      b.onclick = function () { answer(b); };
      box.appendChild(b);
    });
    startTimer(L.time); updateHUD();
    if (OphthSettings.autoRead && !OphthSettings.muted && OphthSettings.mode !== 'off') {
      setTimeout(function () { if (G && !G.locked) { try { speakRound(); } catch (e) {} } }, 400);
    }
  }
  function curSpeechTexts() {
    var q = curQ(), it = q.item, texts = [];
    if (G.spotter) texts.push('Photo spotter round. Look at the photo, and name the instrument.');
    else if (q.mode === 'id') { texts.push('Identify the instrument.'); texts.push(it.clue); }
    else if (q.mode === 'use') { texts.push('What is it for? The instrument is: ' + it.n + '.'); texts.push('Which job does this instrument actually do?'); }
    else { texts.push('Boss trap round. Which of these statements is true? The instrument is: ' + it.n + '.'); texts.push(it.clue); }
    texts.push('Your options are.');
    document.querySelectorAll('.opt').forEach(function (b, i) {
      var sp = b.querySelectorAll('span');
      if (sp[1]) texts.push('Option ' + (i + 1) + '. ' + sp[1].textContent);
    });
    return texts;
  }
  function speakRound() { lastQuestionText = curSpeechTexts().join(' '); OphthVoice.speakTexts(curSpeechTexts()); }
  function startTimer(sec) {
    clearInterval(G.timer); G.total = sec; G.remain = sec; var lastTick = 99; tickUI();
    G.timer = setInterval(function () {
      G.remain = Math.max(0, G.remain - .1); tickUI();
      var s = Math.ceil(G.remain);
      if (s <= 3 && s < lastTick && G.remain > 0) { lastTick = s; OphthAudio.sfx('tick'); }
      if (G.remain <= 0) { clearInterval(G.timer); timeoutAnswer(); }
    }, 100);
  }
  function tickUI() {
    var pct = G.total ? G.remain / G.total * 100 : 0;
    $('timerBar').style.width = pct + '%';
    $('timerText').textContent = G.remain.toFixed(1) + 's';
    $('timerWrap').classList.toggle('low', pct < 32);
  }
  function timeoutAnswer() {
    if (G.locked) return;
    G.locked = true; OphthVoice.stopSpeak();
    markCorrect(); resolve(false, curQ(), '⏰ TIME UP! ');
  }
  function markCorrect() {
    document.querySelectorAll('.opt').forEach(function (b) { b.disabled = true; if (b.dataset.correct === '1') b.classList.add('correct'); });
  }
  function answer(btn) {
    if (G.locked) return;
    G.locked = true; clearInterval(G.timer); OphthVoice.stopSpeak();
    var good = btn.dataset.correct === '1';
    if (!good) btn.classList.add('wrong');
    markCorrect(); resolve(good, curQ(), good ? '' : '✖ WRONG — that was a look-alike. ');
  }
  function revealTextFor(it, good, prefix) {
    var v = verifiedFor(it);
    var parts = [];
    parts.push((good ? 'Correct. ' : prefix + 'Correct answer: ') + it.n + '.');
    parts.push('Use: ' + it.use);
    parts.push('Viva fact: ' + it.fact);
    if (v && v.note) parts.push('Verified note: ' + v.note);
    return parts.join(' ');
  }
  function resolve(good, q, prefix) {
    G.answered++;
    var it = q.item;
    var pcap = $('photoCap');
    if (pcap && photoFor(it)) { var v0 = verifiedFor(it); pcap.textContent = '📸 ' + (v0 ? v0.card.n : it.n); pcap.style.display = 'block'; }
    var fb = $('feedback');
    var full = OphthData.fullNoteFor(it.n, FULLNOTES);
    if (full) { $('fbFullSum').textContent = '📖 READ THE FULL NOTES — ' + full.t; $('fbFullBody').innerHTML = full.b; $('fbFull').style.display = 'block'; }
    else $('fbFull').style.display = 'none';
    var v = verifiedFor(it);
    if (good) {
      G.correct++; G.combo++; G.bestCombo = Math.max(G.bestCombo, G.combo);
      var gain = Math.round((100 + Math.round(G.remain * 5)) * mult());
      G.score += gain;
      OphthAudio.sfx(G.combo > 0 && G.combo % 3 === 0 ? 'combo' : 'correct');
      if (G.combo > 0 && G.combo % 5 === 0) { G.pw.fifty++; G.pw.time++; }
      fb.className = 'feedback on good';
      $('fbTitle').textContent = '✔ CORRECT — ' + it.n;
    } else if (G.shield) {
      G.shield = false;
      fb.className = 'feedback on good';
      $('fbTitle').textContent = '🛡️ SHIELD USED! That mistake cost you nothing — this time.';
      OphthAudio.sfx('power');
    } else {
      G.lives--; G.combo = 0;
      OphthAudio.sfx('wrong');
      fb.className = 'feedback on bad';
      $('fbTitle').textContent = prefix + 'Correct answer: ' + it.n;
    }
    $('fbUse').textContent = it.use;
    $('fbFact').textContent = '★ VIVA FACT: ' + it.fact;
    var noteEl = $('fbNote');
    if (v && v.note) { noteEl.textContent = '🟨 VERIFIED NOTE: ' + v.note; noteEl.style.display = 'block'; }
    else { noteEl.textContent = ''; noteEl.style.display = 'none'; }
    revealed = true;
    var last = G.qi >= DATA.levels[G.level].count - 1;
    var outOfLives = (!good && !G.shield && G.lives <= 0);
    $('nextBtn').textContent = outOfLives ? 'SEE RESULTS ▶' : (last ? (G.level >= 2 ? 'FINISH ▶' : 'CLEAR LEVEL ▶') : 'NEXT ▶');
    /* The answer panel is shown FIRST, and scrolled into view, before any
       voice or sound work runs. That way a voice engine that stalls or
       throws on a phone can never leave the player staring at a frozen
       question with NEXT hidden below the fold — the bug reported on the
       first option tap. The NEXT button is always reachable after this. */
    fb.classList.add('on');
    updateHUD();
    try {
      if (fb.scrollIntoView) fb.scrollIntoView({ behavior: 'smooth', block: 'start' });
      else window.scrollTo(0, fb.offsetTop || 0);
    } catch (e) {}
    /* The reveal reading: the ENTIRE yellow note, in full, in the active
       voice mode. It starts here and runs to the last sentence unless the
       player taps NEXT, REPLAY (restarts it), QUIT, or mute. */
    lastRevealText = revealTextFor(it, good, prefix);
    if (OphthSettings.autoRead && !OphthSettings.muted && OphthSettings.mode !== 'off') {
      try { OphthVoice.speakFullText(lastRevealText); } catch (e) {}
    }
  }
  function nextRound() {
    OphthAudio.sfx('click');
    OphthVoice.stopSpeak(); /* user tapped NEXT: the only allowed cut-off */
    if (!G) return;
    if (G.lives <= 0) { gameOver(); return; }
    if (G.qi < DATA.levels[G.level].count - 1) { G.qi++; showQuestion(); return; }
    if (G.level < 2) {
      var L = DATA.levels[G.level + 1];
      G.score += 250;
      $('lvlKick').textContent = 'LEVEL ' + (G.level + 1) + ' CLEARED · +250 BONUS';
      $('lvlTitle').textContent = L.title;
      $('lvlDesc').textContent = L.desc;
      $('lvlBonus').textContent = 'SCORE ' + G.score + ' · LIVES ' + G.lives + ' · BEST COMBO ' + G.bestCombo;
      var ov = $('levelOverlay'); ov.classList.add('on');
      OphthAudio.sfx('level');
      setTimeout(function () { ov.classList.remove('on'); buildLevel(G.level + 1); }, 2400);
    } else victory();
  }
  function fillEnd() {
    best = Math.max(best, G.score);
    $('stScore').textContent = G.score;
    $('stCombo').textContent = G.bestCombo;
    $('stAcc').textContent = (G.answered ? Math.round(G.correct / G.answered * 100) : 0) + '%';
    $('stRounds').textContent = G.correct + ' / ' + G.answered;
    $('rankLine').textContent = 'RANK: ' + (G.score >= 3500 ? '🏆 CONSULTANT' : G.score >= 2200 ? '⭐ SENIOR RESIDENT' : G.score >= 1100 ? '🎓 RESIDENT' : '🩺 INTERN — KEEP GRINDING');
  }
  function gameOver() {
    if (G) clearInterval(G.timer);
    OphthVoice.stopSpeak(); OphthAudio.sfx('over');
    $('endKick').textContent = 'GAME OVER';
    $('endTitle').textContent = '💀 FLATLINED';
    $('endDesc').textContent = 'You ran out of lives in ' + DATA.levels[G.level].title + '. Run it back and take the arena.';
    fillEnd(); OphthShow('resultsScreen');
  }
  function victory() {
    OphthVoice.stopSpeak(); OphthAudio.sfx('win');
    $('endKick').textContent = '👑 BOSS DEFEATED';
    $('endTitle').textContent = 'ARENA CLEARED!';
    $('endDesc').textContent = 'You beat the Consultant boss round. That is a full viva instrument set, played at speed.';
    fillEnd(); OphthShow('resultsScreen');
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('playBtn').onclick = function () { OphthAudio.ac(); OphthAudio.sfx('level'); newGame(); };
    $('againBtn').onclick = function () { OphthAudio.sfx('click'); newGame(); };
    $('menuBtn').onclick = function () { OphthHome(); };
    $('quitGameBtn').onclick = function () { OphthVoice.stopSpeak(); OphthHome(); };
    $('nextBtn').onclick = nextRound;
    $('replayRevealBtn').onclick = function () { if (lastRevealText) OphthVoice.speakFullText(lastRevealText); };
    $('speakerBtn').onclick = function () {
      if (revealed && lastRevealText) OphthVoice.speakFullText(lastRevealText);
      else if (G && !G.locked) speakRound();
      else if (G) speakRound();
    };
    $('pwFifty').onclick = function () {
      if (!G || G.locked || G.pw.fifty <= 0) return;
      G.pw.fifty--; OphthAudio.sfx('power');
      var wrong = shuffle([].slice.call(document.querySelectorAll('.opt')).filter(function (b) { return b.dataset.correct !== '1' && !b.classList.contains('eliminated'); }));
      wrong.slice(0, 2).forEach(function (b) { b.classList.add('eliminated'); b.disabled = true; });
      updateHUD();
    };
    $('pwTime').onclick = function () {
      if (!G || G.locked || G.pw.time <= 0) return;
      G.pw.time--; G.remain += 5; G.total += 5; OphthAudio.sfx('power'); tickUI(); updateHUD();
    };
    $('pwShield').onclick = function () {
      if (!G || G.shield || G.pw.shield <= 0) return;
      G.pw.shield--; G.shield = true; OphthAudio.sfx('power'); updateHUD();
    };
    $('pwHint').onclick = function () {
      if (!G || G.locked || G.pw.hint <= 0) return;
      G.pw.hint--; OphthAudio.sfx('power');
      var q = curQ(), hb = $('hintBox');
      hb.textContent = '💡 ' + (G.spotter ? q.item.clue : (q.mode === 'use' ? q.item.fact : q.item.use));
      hb.classList.add('on'); updateHUD();
    };
    document.addEventListener('keydown', function (e) {
      if (!G || G.locked || !$('gameScreen').classList.contains('on')) return;
      var idx = ['1', '2', '3', '4', 'a', 'b', 'c', 'd'].indexOf(e.key.toLowerCase());
      if (idx < 0) return; if (idx > 3) idx -= 4;
      var b = document.querySelectorAll('.opt')[idx];
      if (b && !b.disabled) b.click();
    });
  });
  window.OphthGame = { newGame: newGame, stopGame: stopGame, bestScore: function () { return best; }, revealTextFor: revealTextFor, _mult: mult, _shuffle: shuffle, _makeOpts: makeOpts };
})();
