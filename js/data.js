/* Lazy data loading: nothing except this loader is fetched on first paint.
   Game data loads on first Play, card chunks on first Learn/Library use,
   full notes and the photo library on first Library use. Photos are files
   under assets/photos/ and are only requested when an <img> showing them
   is actually rendered (loading="lazy" everywhere). */
(function () {
  'use strict';
  var cache = {};
  function fetchJSON(path) {
    if (cache[path]) return Promise.resolve(cache[path]);
    return fetch(path).then(function (r) { if (!r.ok) throw new Error('load failed: ' + path); return r.json(); })
      .then(function (j) { cache[path] = j; return j; });
  }
  function loadCards() {
    if (cache.__cards) return Promise.resolve(cache.__cards);
    return Promise.all([fetchJSON('data/cards-1-32.json'), fetchJSON('data/cards-33-64.json'), fetchJSON('data/cards-65-92.json')])
      .then(function (parts) { var all = [].concat(parts[0], parts[1], parts[2]); cache.__cards = all; return all; });
  }
  function cardById(id) {
    var all = cache.__cards || [];
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function loadItems() { return fetchJSON('data/items.json'); }
  function loadFullNotes() { return fetchJSON('data/full-notes.json'); }
  function loadPhotoLibrary() { return fetchJSON('data/photo-library.json'); }
  function loadPhotoMap() { return fetchJSON('data/photo-map.json'); }
  /* Yellow (verified) note for a game item, via the source VERMAP mapping. */
  function verifiedNoteFor(itemName, itemsData) {
    var id = itemsData && itemsData.vermap ? itemsData.vermap[itemName] : null;
    if (!id) return null;
    var card = cardById(id);
    return card ? { card: card, note: card.note || '' } : null;
  }
  function fullNoteFor(itemName, fullNotes) {
    if (!fullNotes) return null;
    var low = itemName.toLowerCase();
    for (var i = 0; i < fullNotes.length; i++) {
      var ks = fullNotes[i].k || [];
      for (var j = 0; j < ks.length; j++) if (low.indexOf(ks[j]) >= 0) return fullNotes[i];
    }
    return null;
  }
  window.OphthData = {
    fetchJSON: fetchJSON, loadCards: loadCards, cardById: cardById, loadItems: loadItems,
    loadFullNotes: loadFullNotes, loadPhotoLibrary: loadPhotoLibrary, loadPhotoMap: loadPhotoMap,
    verifiedNoteFor: verifiedNoteFor, fullNoteFor: fullNoteFor
  };
})();
