/* Piper worker: runs the local neural voice model OFF the main thread.
   The page's main thread only posts text and receives audio blobs, so
   taps, timers and scrolling stay responsive while the phone CPU
   synthesises a chunk. This is what makes local voice usable on phones:
   the old main-thread predict() blocked the whole page while it
   crunched a chunk. Runs as a module worker (type: 'module'). */
'use strict';
var PIPER_VOICE = 'en_US-amy-low';
var mod = null, ready = false, loading = false;
function post(m) { try { self.postMessage(m); } catch (e) {} }
self.onmessage = async function (ev) {
  var d = ev.data || {};
  if (d.type === 'init') {
    if (ready || loading) { post({ type: ready ? 'ready' : 'loading' }); return; }
    loading = true;
    try {
      mod = await import('https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm');
      await mod.download(PIPER_VOICE, function (pr) {
        if (pr && pr.total) post({ type: 'progress', pct: pr.loaded / pr.total });
      });
      ready = true; loading = false;
      post({ type: 'ready' });
    } catch (e) {
      loading = false;
      post({ type: 'failed', error: String((e && e.message) || e) });
    }
    return;
  }
  if (d.type === 'predict') {
    if (!ready || !mod) { post({ type: 'result', id: d.id, error: 'not-ready' }); return; }
    try {
      var blob = await mod.predict({ text: d.text, voiceId: PIPER_VOICE });
      post({ type: 'result', id: d.id, blob: blob });
    } catch (e) {
      post({ type: 'result', id: d.id, error: String((e && e.message) || e) });
    }
    return;
  }
};
