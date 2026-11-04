# Ophthalmology — Instrument Arena (multi-file build)

Static site. Open `index.html` from any static host (Render static site:
publish directory = this folder). No build step, no server code.

## Screens

- **Home** — only Play, Learn, Library, Settings. One short line.
- **Game** — 3 levels (L1 8×15s, L2 8×12s, Boss 10×8s), photo/clue,
  4 options, timer, lives, score, combo indicator, icon-only power-ups
  (50:50, +5s, shield, hint). No mechanic paragraphs anywhere.
- **Answer reveal** — correct answer, use, viva fact, and the FULL yellow
  (verified) note in yellow, plus the expandable full transcribed note.
- **Learn** — card front/back, tap to flip, Got it / Still learning.
  Automatic spaced repetition (miss returns in 2–3 cards, correct pushes
  8+ away, mastered after 2 in a row). No interval buttons, no explanation
  text. Decks: All 92, Quick 25, Photos only, New 65–92.
- **Library** — search + 3 tabs: Cards (92), Full notes (55), Photos (64).
- **Results** — score, rank, Play Again. Short.
- **Settings** — the ONLY place for voice/sound controls (plus one small
  speaker icon in-game and one in Learn): Voice mode (Local Piper /
  Browser natural / Off), Auto-read, Voice speed, Sounds, Mute.

## Speed comes only from splitting + lazy loading — nothing was cut

- First paint loads only `index.html` (~9 KB) + `css/style.css` (~13 KB)
  + small JS. No card data, no photos, no 92-card render on load.
- Game data (`data/items.json`, 26 KB) loads on first Play.
- Card chunks (`data/cards-1-32/33-64/65-92.json`, 85 KB total) load on
  first Learn/Library use. Full notes (43 KB) and photo library (18 KB)
  load on first Library tab use.
- The 76 photos are files under `assets/photos/` (4.5 MB on disk, original
  JPEG bytes, de-duplicated by SHA-256 — the same bytes referenced by
  several source structures are stored once). An `<img>` is only requested
  when its card/round is actually shown, with `loading="lazy"`.
- Total site on disk: ~4.8 MB (was one 23 MB HTML file).

## Voice: full notes, both modes, no timer cut-off

- On answer reveal, voice reads name + use + viva fact + the ENTIRE
  yellow note, sentence by sentence, in Local Piper mode (vits-web,
  `en_US-amy-low`, loaded behind the boot screen only — there is no
  "downloading voice model" UI anywhere) or Browser natural mode.
- On Learn flip, voice reads the ENTIRE card back (name + use + full
  yellow note).
- Text is split into ≤240-char sentence chunks; every sentence is queued
  in order — nothing summarised or truncated. Decimals (2.8 mm) and
  abbreviations (St., Dr., e.g.) are protected so splitting never breaks
  a word. Spoken text uses abbreviation expansion only (IOL →
  "intraocular lens"); displayed text is never changed.
- The game timer is cleared on reveal and the next round starts ONLY when
  the player taps NEXT, so a reading is never cut off by a timer or an
  automatic advance. Voice stops only on a user tap (Next, grade, screen
  change, mute, replay) — both engines use a token guard so a cancelled
  chain cannot resume.
- One deliberate flow change vs the source: on a fatal wrong answer the
  source auto-opened Game Over after 900 ms (which would cut the reveal
  reading). Here the reveal shows "SEE RESULTS ▶" and results open on tap.

## Content preserved exactly (verified by extraction script)

- 92 cards (ids 1–92, no gaps), 65 yellow notes, 76 photos, 57 game
  items, 55 full notes, 64 photo-library entries — all copied verbatim
  from the source build (0 text mismatches on re-check).
- No drug cards. Note: the source library's 55 full notes include two
  drug-topic notes (Trypan Blue, Viscoelastic) — they are notes, not
  cards, and were kept verbatim under the no-cutting rule.
- Verified gaps preserved, not fixed: card 55 blurred lid-clamp lines,
  card 6 universal-speculum conflict warning, heading-only cards
  (79–82) with no invented description, and the 16 text-only cards
  (66, 70, 71, 74, 77, 79, 80, 81, 82, 83, 85, 88, 89, 90, 91, 92)
  labelled "Image not verified — text only".

## Verification (see `_builder/`)

- `node --check` passes on all 7 JS files.
- DOM audit: every `getElementById`/`$(…)` target exists, except
  `bootVoiceLine`, which is created dynamically by the boot sequence
  itself and is always null-guarded before use. Every button in
  `index.html` is wired.
- Stub play-through (`_builder/stub-test.js`, fake DOM, no browser):
  25/25 assertions pass — 4-option rounds, reveal panel, exact full-reveal
  chunk count (12/12 in the sampled round, note 1,979 chars), no
  auto-advance during reveal, Learn flip + grading, Library 92/55/64,
  search filtering, Settings persistence, voice-off silence.
- NOT verified (needs a real browser, which generic subagents cannot
  drive): actual Piper model download/playback on a device, browser
  voice selection on the user's phone, and visual layout on small
  screens. Recommend one live pass on the phone before sharing widely.

## Files

```
index.html  render.yaml  README.md
css/style.css
js/voice.js  js/audio.js  js/data.js  js/app.js  js/game.js  js/learn.js  js/library.js
data/cards-1-32.json  data/cards-33-64.json  data/cards-65-92.json
data/items.json  data/full-notes.json  data/photo-library.json  data/photo-map.json
assets/photos/photo-01.jpg … photo-92.jpg (76 files)
_builder/extract.js  _builder/stub-test.js  _builder/manifest.json
```
