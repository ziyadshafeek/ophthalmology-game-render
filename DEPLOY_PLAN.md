# Ophthalmology Game — Render Deploy Plan

**Status at plan time (2026-11-04, ~15:56 IST): builder folder did not exist yet.**
Checked repeatedly; this plan created the directory so the deploy step is ready.
**No GitHub repo and no Render service has been created yet. No Render URL exists yet — do not invent one.**
This file contains no credentials and is safe to leave in the repo.

## 0. Non-negotiable rule (user clarification, 2026-11-04)

**Render hosting is ONLY for fast loading. Nothing else changes.**

The Render version must contain, FULLY, with nothing cut or trimmed for speed:

- **All 92 cards**
- **All 65 yellow notes**
- **All 76 photos**
- **Voice reading the FULL notes** (not summaries, not shortened scripts)
- **Learn Mode** (complete)
- **The 3-level game** (complete, all levels)

Speed comes from **hosting + splitting / lazy-loading only**:

- ✅ ALLOWED: hosting the same content on Render's CDN; splitting one huge
  single file into `index.html` + `css/` + `js/` + `assets/`; lazy-loading
  photos (load on demand / as they come into view); deferring non-critical JS.
- ❌ FORBIDDEN for speed: dropping any card, note, or photo; shortening any
  note or voice script; removing or merging any level or Learn Mode section;
  substituting a different / lower-detail photo; deleting content to hit a
  file-size target.

**A fast deploy that is missing anything above is a FAILED deploy, even if it
loads quickly. Completeness outranks load time, every time.**

The deploy step must not edit game content. It only pushes what the builder
produced and points Render at it. If a count below does not match, stop and
report the mismatch — do not "fix" it by trimming to make the numbers line up.

## 1. What the builder must deliver (expected layout)

```
ophthalmology-render/
  index.html          # entry point, at repo root
  css/                # stylesheets, split out of the single file
  js/                 # game logic, split out of the single file
  assets/             # photos and any other media
  DEPLOY_PLAN.md      # this file (deploy docs only, not game content)
```

Rules for the deploy step:

1. `index.html` must be at the root. All `css/`, `js/`, and `assets/`
   references in it must be relative paths (no absolute local paths, no
   `file://` paths, no references to the builder's working folder).
2. Do not rename, move, or delete builder files to make the deploy "simpler".
3. If the builder delivers a single-file build instead of the split layout,
   do NOT deploy it as-is and do NOT split it in the deploy step — hand it
   back to the builder for the split layout. The split is the speed mechanism.

## 2. Verification checklist (run BEFORE pushing, and again AFTER deploy)

### Pre-push checklist (against the builder output in this folder)

- [ ] `index.html` exists at root; `css/`, `js/`, `assets/` exist.
- [ ] Card count = **92 / 92** — every card present, in order, no gaps in ids.
- [ ] Yellow notes = **65 / 65**.
- [ ] Photos = **76 / 76** — count the photo files/references, including any
      remote-URL photos the builder kept as URLs; do not count a placeholder
      or "photo coming soon" entry as a photo.
- [ ] Voice = full notes: voice script/source covers the full note text for
      every card that has a note, not an abbreviated version.
- [ ] Learn Mode present and complete (all cards reachable in Learn Mode).
- [ ] 3-level game present and complete (all 3 levels playable, all cards
      reachable through gameplay, no level gated off or emptied).
- [ ] Spot-check play: start the game from `index.html`, play through each
      level entry point, open Learn Mode, trigger voice on at least one
      full note, and confirm photos render for photo cards.
- [ ] No content was removed, shortened, or replaced in this folder during
      deploy prep. If anything differs from the builder's delivery, restore
      the builder's version and report it.

### Post-deploy checklist (against the live Render URL, once it exists)

- [ ] Live URL loads `index.html` (the game, not a directory listing, not a
      Render "not found" page).
- [ ] Same counts on live as pre-push: 92 cards, 65 yellow notes, 76 photos.
- [ ] Learn Mode works live; all 3 levels work live; voice reads a full note live.
- [ ] Photos load live (including lazy-loaded ones — scroll / play far enough
      to trigger them; a photo that only loads locally is a failure).
- [ ] Load time is better than the single-file version AND nothing above is
      missing. If load time is better but anything is missing, the deploy
      fails the checklist — report the missing item, do not ship it.

## 3. Repo suggestion

- **Repo name:** `ophthalmology-game-render`
  (alternative, only if that name is taken: `ophthalmology-game`)
- **Owner:** same account used for the user's prior GitHub pushes.
- **Branch:** `main`
- **Visibility:** public, matching the prior push pattern, unless the parent
  explicitly chooses private (private works only if Render's GitHub
  connection can see the repo — verify that in the dashboard before relying
  on it).
- **Contents:** exactly the builder's split site (Section 1) plus this plan file.
  No secrets, keys, or credentials go in the repo — ever.

## 4. Push pattern that works from this VM (verdict)

### What was verified in this prep step

- Read-only GitHub API checks via the stored `custom.github` credential
  (dynamic-credentials surrogate pattern) **succeeded**: the credential
  attaches correctly and the API responds. This proves the auth path, not
  write access.
- The official GitHub MCP connector (`/opt/hatch/bin/github status`)
  reports **not_connected** — do not rely on it for this push.
- The Secure Vault website-login list shows no entries; that list is for
  website logins, not API connectors, so it does not contradict the
  working `custom.github` API credential above.

### The pattern to use (normal turn only)

Use the **Git Data API push script pattern** already proven on this VM
(e.g. `~/workspace/anvil-ab-push.py`):

1. Python script importing `dynamic_credentials` from
   `/opt/muse/skills/custom-connector-setup/bin`, calling
   `add_surrogate_to_request(...)` with credential `custom.github` and
   `allowed_hosts=["api.github.com"]`, and `read_json_response(...)` for
   urllib responses. Never paste a raw token, never write an auth file,
   never pass a secret flag.
2. Flow: GET branch ref → GET commit → GET tree (recursive) → POST blobs
   for changed files only (base64) → POST tree (with `base_tree`) →
   POST commit → PATCH ref (or POST ref if the branch does not exist).
3. **Empty-repo seeding (known gotcha):** an empty repo returns 409 on
   `/git/blobs`. Seed it first with one file via `PUT /repos/{repo}/contents/...`
   (e.g. a README), then run the Git Data API flow.
4. Do NOT use plain `git push` from this VM for this job (no git remote
   credentials are configured here) and do NOT use the `gh` CLI (its
   connector is not connected).

### Why the push was NOT done in this prep step

Pushes from background / subagent turns have historically returned
**403 `proactivity_read_only_preparation`**. This prep turn is that same
background class, so a write attempt here was expected to fail — and a
"probe" write that succeeded would itself have created a repo, which this
task forbids ("do not create a repo yet"). So:

- **No write probe was attempted.** The read-only check above is the
  evidence that the credential path works; write access must be exercised
  from a **normal user turn** by the parent.
- If a normal-turn push still returns 403, the blocker is the turn type /
  write permission, not the credential — report the exact error and do not
  retry it from a background turn.

## 5. Render service settings (exact)

There is **no Render connector and no Render credential** in this workspace
(connector search and skill search found nothing for Render; see Section 7).
Render creation is therefore a **manual dashboard step** (or a live-browser
step by an agent that can use the browser). It cannot be done from this
prep turn via an API.

In the Render dashboard:

1. **New → Static Site** → connect/connect to the repo from Section 3.
2. Settings:

   | Setting           | Value                          |
   | ----------------- | ------------------------------ |
   | Name              | `ophthalmology-game-render`    |
   | Branch            | `main`                         |
   | Root Directory    | (leave blank / repo root)      |
   | Build Command     | (leave blank — none)           |
   | Publish Directory | `.` (a single dot = repo root) |
   | Auto-Deploy       | On (so later pushes redeploy)  |
   | Environment vars  | None — this is a static game, no backend, no secrets |

   Rationale: the site is already built (pre-split HTML/CSS/JS), so there is
   nothing to build. A blank build command + publish directory `.` serves
   `index.html` from the root, with `css/`, `js/`, and `assets/` alongside it.
   (Public Render guides confirm the same pair for already-built sites:
   build command blank, publish directory `.`.)
3. Click **Create Static Site** and wait for the first deploy to succeed.
4. The live URL is whatever Render assigns for that service name
   (pattern: `https://<service-name>.onrender.com`). **Record the exact URL
   only after Render shows it — never guess or pre-fill it.**

### Optional: Blueprint (`render.yaml`, only if the parent wants infra-as-code)

If a `render.yaml` is added to the repo root, the static-site equivalent is:

```yaml
services:
  - type: web
    name: ophthalmology-game-render
    env: static
    buildCommand: ""
    staticPublishPath: .
```

Dashboard creation (above) is the primary path; do not add this file unless
the parent asks for Blueprint deploys, and verify it against the dashboard
after the first deploy either way. Do not let a Blueprint file change the
build/publish settings away from Section 5's table.

## 6. Exact steps for the later deploy step (in order — this is the fast path)

1. **Confirm builder output.** Re-run the Section 2 pre-push checklist.
   All counts must match (92 / 65 / 76 / Learn Mode / 3 levels / full voice).
   If the folder is still empty, stop — there is nothing to deploy.
2. **Push from a normal turn.** Adapt the Git Data API script pattern
   (Section 4) with `ROOT = ~/workspace/ophthalmology-render`,
   `REPO = <owner>/ophthalmology-game-render`, `BRANCH = main`.
   Seed the repo first if it is empty (Section 4, step 3).
   Verify by reading the repo tree back after the push.
3. **Create the Render static site** (Section 5) from the dashboard.
   This is the manual / live-browser step the parent must arrange.
4. **Verify live.** Run the Section 2 post-deploy checklist against the real
   Render URL. Check completeness first, speed second.
5. **Report only what is live-verified:** the exact Render URL, the
   pre-push counts, the post-deploy counts, and load behaviour in plain
   words. If any checklist item fails, report it as not shipped.

## 7. Connection state and blockers (as found in this prep step)

| Item | State |
| ---- | ----- |
| GitHub API credential (`custom.github`, surrogate pattern) | Read check OK — attaches and responds. Write access NOT proven from a background turn (see Section 4). |
| GitHub MCP connector (`/opt/hatch/bin/github`) | `not_connected` — do not use for this push. |
| Render connector / skill / credential | **None found.** Connector search for "Render static site": no matches. Skill search: no Render skill. No Render credential exists to reuse. |
| GitHub repo `ophthalmology-game-render` | **Not created yet** (by design — this task forbids creating it in prep). |
| Render service / URL | **Not created yet. No URL exists to report.** |
| Builder output (`~/workspace/ophthalmology-render/`) | Directory created by this plan; **empty at plan time** — builder files had not arrived after repeated checks. |

### Blocker summary for the parent

1. **Builder output missing** — the deploy step cannot run until the
   parallel builder writes `index.html`, `css/`, `js/`, and `assets/` here.
2. **Push must run from a normal turn** — background-turn writes are
   expected to fail with 403. The parent (or a normal-turn agent) must run
   the adapted Git Data API script.
3. **Render service creation is manual** — no Render connector exists, so
   the parent must create the static site in the Render dashboard (or via a
   live-browser agent) with the exact settings in Section 5, then hand the
   real URL back for the post-deploy checklist.

Nothing else blocks the plan: the settings, the push pattern, and the
full-content verification checklist above are ready to execute as soon as
items 1–3 are cleared.
