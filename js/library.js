/* Library: rendered only when Library is first opened — never on page load.
   Cards tab: all 92 verified cards with their full yellow notes and photos
   (lazy-loaded; the 16 text-only cards carry the verified text-only label).
   Full notes tab: all 55 transcribed notes, verbatim, with their photos.
   Photos tab: all 64 photo-library entries. One search box filters the
   visible tab; the count line reports how many entries are shown. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  var rendered = { cards: false, notes: false, photos: false };
  var currentTab = 'cards';

  function renderCards(cards) {
    var box = $('libCards'); box.innerHTML = '';
    cards.forEach(function (c) {
      var d = document.createElement('div'); d.className = 'libCard';
      d.dataset.search = (c.n + ' ' + c.c + ' ' + c.q + ' ' + c.u + ' ' + c.note).toLowerCase();
      var html = '<h3>' + esc(c.id) + ' · ' + esc(c.n) + '</h3><span class="pcCat">' + esc((c.c || '').toUpperCase()) + '</span>';
      if (c.photo) html += '<div><img src="' + esc(c.photo) + '" alt="Photograph: ' + esc(c.n) + '" loading="lazy" decoding="async"></div>';
      else html += '<p class="textOnly">Image not verified — text only</p>';
      html += '<p><b>Cue:</b> ' + esc(c.q) + '</p><p><b>Use:</b> ' + esc(c.u) + '</p>';
      if (c.note) html += '<div class="yellowNote">🟨 VERIFIED NOTE: ' + esc(c.note) + '</div>';
      d.innerHTML = html; box.appendChild(d);
    });
    rendered.cards = true;
  }
  function renderNotes(notes) {
    var box = $('libNotes'); box.innerHTML = '';
    notes.forEach(function (f) {
      var d = document.createElement('details'); d.className = 'noteCard';
      d.dataset.search = (f.t + ' ' + f.b.replace(/<[^>]+>/g, ' ')).toLowerCase();
      var s = document.createElement('summary'); s.textContent = f.t; d.appendChild(s);
      var b = document.createElement('div'); b.className = 'noteBody';
      if (f.photos && f.photos.length) {
        var ph = document.createElement('div'); ph.className = 'libPhotos';
        f.photos.forEach(function (src) {
          var im = document.createElement('img'); im.src = src; im.loading = 'lazy'; im.decoding = 'async'; im.alt = 'Photograph: ' + f.t; ph.appendChild(im);
        });
        b.appendChild(ph);
      }
      var tx = document.createElement('div'); tx.innerHTML = f.b; b.appendChild(tx);
      d.appendChild(b); box.appendChild(d);
    });
    rendered.notes = true;
  }
  function renderPhotos(photos) {
    var box = $('libPhotos'); box.innerHTML = '';
    photos.forEach(function (p) {
      var d = document.createElement('div'); d.className = 'photoCard';
      d.dataset.search = (p.n + ' ' + p.c + ' ' + p.q + ' ' + p.u).toLowerCase();
      var html = '';
      if (p.photo) html += '<img src="' + esc(p.photo) + '" alt="Photograph: ' + esc(p.n) + '" loading="lazy" decoding="async">';
      html += '<div class="pcBody"><h4>' + esc(p.n) + '</h4><span class="pcCat">' + esc((p.c || '').toUpperCase()) + '</span>';
      html += '<p><b>Cue:</b> ' + esc(p.q) + '</p><p><b>Use:</b> ' + esc(p.u) + '</p></div>';
      d.innerHTML = html; box.appendChild(d);
    });
    rendered.photos = true;
  }
  function showTab(tab) {
    currentTab = tab;
    $('libCards').style.display = tab === 'cards' ? '' : 'none';
    $('libNotes').style.display = tab === 'notes' ? '' : 'none';
    $('libPhotos').style.display = tab === 'photos' ? '' : 'none';
    $('libTabs').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('sel', c.dataset.tab === tab); });
    applySearch();
  }
  function applySearch() {
    var q = $('libSearch').value.toLowerCase().trim();
    var box = currentTab === 'cards' ? $('libCards') : currentTab === 'notes' ? $('libNotes') : $('libPhotos');
    var shown = 0;
    box.querySelectorAll('.libCard,.noteCard,.photoCard').forEach(function (c) {
      var hit = !q || (c.dataset.search || '').indexOf(q) >= 0;
      c.style.display = hit ? '' : 'none'; if (hit) shown++;
    });
    $('libCount').textContent = shown + ' ENTRIES SHOWN';
  }
  function openLibrary() {
    OphthVoice.stopSpeak();
    if (window.OphthGame) OphthGame.stopGame();
    OphthShow('libraryScreen');
    if (!rendered.cards) {
      OphthData.loadCards().then(function (cards) { renderCards(cards); $('libCount').textContent = cards.length + ' CARDS'; });
    }
    showTab(currentTab);
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('libBtn').onclick = function () { OphthAudio.sfx('click'); openLibrary(); };
    $('libBack').onclick = function () { OphthHome(); };
    $('libSearch').addEventListener('input', applySearch);
    $('libTabs').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      var tab = b.dataset.tab;
      if (tab === 'notes' && !rendered.notes) OphthData.loadFullNotes().then(function (n) { renderNotes(n); showTab(tab); });
      else if (tab === 'photos' && !rendered.photos) OphthData.loadPhotoLibrary().then(function (p) { renderPhotos(p); showTab(tab); });
      else showTab(tab);
    });
  });
  window.OphthLibrary = { renderCards: renderCards, renderNotes: renderNotes, renderPhotos: renderPhotos };
})();
