# Night Vault — Top-Down Stealth Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an original top-down stealth browser game ("Night Vault") for make.fun competition best-stealth-game-20261121-1759, as static files under game/, with 3 levels, guard vision cones, cover/shadows, collectibles + exit, deterministic ?shot= screenshot scenes, and a Node 22 main.ts that writes /output/dossier.json.

**Architecture:** Pure ES-module canvas game, no libraries, no network. Fixed 1/60 s simulation in world.js (DOM-free, testable in Node); render.js paints canvas; input.js keyboard + click-to-move; audio.js WebAudio bleeps; shots.js stages deterministic scenes by running the real rules with an autopilot (grid A* with cone-danger cost, replanned periodically).

**Tech Stack:** Vanilla JS ES modules, HTML canvas 2D, WebAudio, Node 22 stdlib only (main.ts / serve.ts).

**Spec:** competition kit at ~/workspace/makefun-sponsor/best-stealth-game-20261121-1759-kit/best-stealth-game-20261121-1759-kit/ (RULES.txt, competition.yaml); build dir ~/workspace/makefun-sponsor/best-stealth-game-20261121-1759-build/.

## Global Constraints

- Every game file written by the agent's own write/edit tools; never copy-paste or generate game code via a script/packer (transcript gate: thinking_reproduces needs >=30% authored lines; starter lines are excluded, so the game must be original code, not re-typed starter code).
- vendor/makefun-game.ts copied UNCHANGED from the kit starter.
- game/ static files only, no network requests, no external assets; index.html <= 1 MiB; game/ <= 993 entries / 48 MiB.
- screenshots/: 3 or 4 real renders, each <= 256 KiB, long side <= 1280, short side >= 480; first by name is the cover. Never fabricate screenshots.
- main.ts: Node 22 stdlib only; copies game/ + screenshots/ to MAKEFUN_OUTPUT_DIR (default /output); buildDossier caps: text_max_bytes 163840, screenshots max 4 / max_bytes 262144, game_max_files 993, game_max_bytes 50331648.
- No GitHub repo, no submit, no signing in this task; parent handles that. Never touch ~/workspace/makefun-sponsor/makefun-keypair.json.
- Deadline: 2026-11-22 12:59 WIB (05:59 UTC). All files authored after competition opening 2026-11-21 17:59 UTC.
- Design tokens (design-system skill, three-layer): primitives below, semantic aliases in config.js PALETTE, component use in render.js. Dark moody palette: deep navy floor, amber cones, cyan player, red alert.
- ui-ux-pro-max: HUD readable at a glance, high contrast text (>=4.5:1), no emoji as icons, keyboard + mouse alternatives for every action, reduced-motion respected (particles off when prefers-reduced-motion).

## Review Focus

- Autopilot must actually WIN level 1 for the ?shot=end scene (a staged win that never happens is the likeliest failure) — test in Node: autopilot completes level 1 within 300 s of simulated time.
- Line of sight through walls/crates must block detection (a guard seeing through a wall breaks the core fantasy) — test: player behind a wall inside a cone is not detected.
- Determinism: same seed twice gives an identical state hash — test twice, compare.
- Shot scenes must be real renders of the game's own code (start = title over level overview, play = mid-sneak near a cone, end = victory) — verify by headless Chromium capture, not by assertion alone.
- main.ts output must be byte-identical across two runs (grader runs it twice) — run twice, diff.

## File Structure

- `game/index.html` — canvas + status line, loads ./src/main.js as module.
- `game/src/config.js` — FIELD 1280x720, TILE 40, STEP 1/60, PLAYER/GUARD tuning, PALETTE tokens, SCREEN constants, BEST_KEY.
- `game/src/random.js` — createRandom(seed) mulberry32.
- `game/src/levels.js` — 3 level definitions: tile-map strings + guard patrols + names; parseLevel(index) -> {tiles, walls, shadows, crates, shards, exit, playerStart, guards}.
- `game/src/world.js` — createWorld(random, levelIndex): step(dt, input, sneak) -> events; guards patrol/chase/search; vision cones + LOS; detection meter; noise; collectibles; win/lose; stateHash().
- `game/src/render.js` — createRenderer(canvas): draw(state, screen, hud) — floor, walls, shadows, cones, entities, particles, lighting overlay, HUD, title/win/game-over screens.
- `game/src/input.js` — createInput(canvas): WASD/arrows + Shift sneak + click-to-move target + Space/Enter confirm + P/Esc pause; ACTION_CONFIRM / ACTION_PAUSE flags.
- `game/src/audio.js` — createAudio(): footstep blip, pickup chime, alert sting, caught thud, win jingle; muted until first user gesture; setMuted.
- `game/src/shots.js` — stageShot(name, world): autopilot (A* over tiles, cone-danger cost, replan every 0.5 s, hide in shadow when detection > 0.6); start/play/end scenes.
- `game/src/main.js` — boot, fixed-step loop, screens, ?shot= staging + window.__shotReady, localStorage best.
- `tests/world.test.mjs` — node:test suite for world/levels/shots (NOT under game/, so not in the dossier).
- `main.ts`, `serve.ts` (adapted starter structure), `shots.json`, `LICENSE` (own MIT, SPDX line), `README.md`, `screenshots/SCREENSHOTS-TODO.md`.

---

### Task 1: Seeded RNG + config + levels (TDD)

**Files:**
- Create: `game/src/random.js`, `game/src/config.js`, `game/src/levels.js`
- Test: `tests/world.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `createRandom(seed) -> () => [0,1)`; `FIELD {width:1280,height:720}`, `TILE 40`, `STEP 1/60`, `PALETTE`, `SCREEN_TITLE/PLAY/PAUSED/OVER/WIN`; `parseLevel(i) -> {name, cols, rows, solid(x,y), shadow(x,y), shards:[{x,y,taken}], exit:{x,y}, playerStart:{x,y}, guards:[{x,y,waypoints:[{x,y}],speed,range,coneHalf}]}`.

- [ ] **Step 1: Write the failing test** — `tests/world.test.mjs`: RNG same seed gives same first 5 values; different seed differs; parseLevel(0) returns 32x18 grid, player start on floor, every shard and the exit reachable from the start by BFS through non-solid tiles (same for levels 1 and 2); level names are original (no commercial-game names).
- [ ] **Step 2: Run test to verify it fails** — `node --test tests/world.test.mjs`; expect module-not-found failures.
- [ ] **Step 3: Implement** `createRandom` (mulberry32), `config.js` tokens, `levels.js` with 3 original maps (32x18 strings; `#` wall, `c` crate, `s` shadow, `.` floor, `P` start, `D` shard, `E` exit) and guard patrols; level 1: 2 guards, 3 shards; level 2: 3 guards, 4 shards; level 3: 4 guards, 5 shards, faster/longer vision.
- [ ] **Step 4: Run test to verify it passes** — `node --test tests/world.test.mjs`; expect all pass, including BFS reachability for all 3 levels.
- [ ] **Step 5: Commit** — n/a (no git repo in this task; skip).

### Task 2: World simulation (TDD)

**Files:**
- Create: `game/src/world.js`
- Test: `tests/world.test.mjs` (extend)

**Interfaces:**
- Consumes: `createRandom`, `parseLevel`, config tuning.
- Produces: `createWorld(random, levelIndex)` with `.state`, `.step(dt, move, opts) -> events`, `.stateHash()`; events `EVENT_PICKUP=1, EVENT_SPOTTED=2, EVENT_CAUGHT=4, EVENT_WIN=8, EVENT_LEVEL=16`; guard states `patrol | suspicious | chase | search`; `state.detection` 0..1 (max over guards); player caught when an alerted guard within 26 px.

- [ ] **Step 1: Write failing tests** — guard patrol moves along waypoints and loops; player inside a guard cone with clear LOS raises detection, and detection decays to 0 out of sight; player behind a solid wall inside the cone does NOT raise detection; player in a shadow tile raises detection at most 0.35x the open rate; collecting a shard sets taken + EVENT_PICKUP; reaching exit with all shards gives EVENT_WIN, without all shards does not; an alerted guard adjacent to the player gives EVENT_CAUGHT; running (non-sneak) within noise radius raises guard suspicion; same seed stepped twice gives identical stateHash.
- [ ] **Step 2: Run test to verify it fails** — expect module-not-found.
- [ ] **Step 3: Implement** `world.js`: tile helpers, LOS (grid DDA / Bresenham through solid tiles), cone test (angle + range + LOS), detection build/decay rates, guard state machine (patrol -> suspicious at detection>=0.35 -> chase at >=1 -> search on lost sight 3 s -> patrol), noise events, shard pickup radius 26, exit radius 30, particles array (pickup/caught bursts), win/lose flags, deterministic stateHash (JSON of rounded positions + detection + flags, hashed).
- [ ] **Step 4: Run tests** — `node --test tests/world.test.mjs`; all pass.
- [ ] **Step 5: Self-review** — no DOM references in world.js (grep for document/window).

### Task 3: Renderer + input + audio + main loop

**Files:**
- Create: `game/src/render.js`, `game/src/input.js`, `game/src/audio.js`, `game/src/main.js`, `game/index.html`
- Test: manual headless check (Task 5) + node syntax check `node --check` per module.

**Interfaces:**
- Consumes: world.js state shape; config PALETTE/SCREEN.
- Produces: `createRenderer(canvas).draw(state, screen, hud)`; `createInput(canvas)` with `.moveVec()`, `.sneak`, `.clickTarget`, `.takeActions()`; `createAudio()` with `.blip/.chime/.sting/.thud/.jingle/.setMuted`; main loop with ?shot= staging and `window.__shotReady`.

- [ ] **Step 1: Write render.js** — draw floor tiles + grid, shadow zones (dark blue translucent), crates (amber-edged boxes), walls (raised, edge highlight), shards (pulsing diamonds), exit (green glowing door), player (cyan circle + facing tick), guards (red/amber circles + facing tick), vision cones (translucent gradient wedges, yellow calm / orange suspicious / red chase, clipped by walls via ray fan), lighting overlay (radial gradient darkness around player), particles, HUD (top bar: level name, shards x/y, alert bar, timer; detection ring around player when >0), screens: title (game name, controls, best), paused, game over, win (level complete / all levels).
- [ ] **Step 2: Write input.js** — WASD/arrows held vector (normalized), Shift sneak, click sets clickTarget (world coords via canvas scale), Space/Enter confirm, P/Esc pause, blur clears keys, preventDefault on game keys.
- [ ] **Step 3: Write audio.js** — lazy AudioContext on first gesture; oscillator blips: footstep (short 180 Hz square, quiet, throttled), pickup (two-note chime), spotted sting (rising saw), caught thud (low sine drop), win jingle (4 notes); master gain + mute toggle (M).
- [ ] **Step 4: Write main.js + index.html** — boot world level 0, fixed-step loop (accumulator, MAX_FRAME 0.25), screens title/play/paused/over/win, level progression, restart (R), best in localStorage, ?shot= staging via shots.js (Task 4) painting twice then `window.__shotReady = true`; announce via #status aria-live.
- [ ] **Step 5: Verify** — `node --check` each module; serve and capture a ?shot=start render in headless Chromium (Task 5) and confirm no console errors.

### Task 4: Screenshot scenes + autopilot (TDD)

**Files:**
- Create: `game/src/shots.js`
- Test: `tests/world.test.mjs` (extend)

**Interfaces:**
- Consumes: world.js, config.
- Produces: `stageShot(name, world) -> {screen, best}`; autopilot wins level 1 (end scene) and survives play scene.

- [ ] **Step 1: Write failing tests** — autopilot on level 1 (seed 1) reaches EVENT_WIN within 300 s simulated; autopilot on level 1 for 20 s is alive (not caught) and has moved from start; stageShot('start') returns SCREEN_TITLE; stageShot('end') returns SCREEN_WIN; stageShot twice with same seed gives identical stateHash.
- [ ] **Step 2: Run test to verify it fails** — expect module-not-found.
- [ ] **Step 3: Implement** `shots.js`: A* over tile grid (cost 1 + 12 if tile inside any guard cone now + 6 if within 60 px of a guard), replan every 0.5 s or on target reached; target = nearest untaken shard, then exit; if detection > 0.6, target = nearest shadow tile and wait (stand still) until detection < 0.15; steering: move toward next path node centre, sneak when any guard within 180 px. start: step world 5 s with no input, SCREEN_TITLE. play: autopilot 11 s, SCREEN_PLAY (the win comes at ~21 s, so 11 s is the mid-sneak frame). end: autopilot up to 300 s until EVENT_WIN, SCREEN_WIN.
- [ ] **Step 4: Run tests** — `node --test tests/world.test.mjs`; all pass, including the autopilot win.
- [ ] **Step 5: Tune** — if autopilot fails, first widen level-1 cover/shadow or slow guards (levels.js), not the autopilot's danger weights alone; re-run.

### Task 5: Hand-in files + verification

**Files:**
- Create: `main.ts`, `serve.ts`, `shots.json`, `README.md`, `screenshots/SCREENSHOTS-TODO.md`
- Modify: `LICENSE` (own copyright line)
- Test: kit check + determinism checks.

- [ ] **Step 1: Write main.ts** — adapt starter structure (same imports, same buildDossier caps); **write serve.ts** (adapt starter static server); **write shots.json** (3 shots, ?shot=start|play|end &seed=1); **write README.md** (how to play, controls, run, shots); **write LICENSE** (MIT, SPDX line, own copyright); **write screenshots/SCREENSHOTS-TODO.md** (the 3 ?shot= URLs for the parent to capture).
- [ ] **Step 2: Determinism check** — `node --test tests/world.test.mjs` (includes double-run hash test); run main.ts twice to two tmp dirs and `diff -r` the outputs (must be identical).
- [ ] **Step 3: Headless capture** — serve game/ with `node serve.ts --port 8901`; capture 3 real renders with headless Chromium (`--headless --screenshot --window-size=1280,720` on each ?shot= URL, waiting for __shotReady via --virtual-time-budget or --timeout); save as screenshots/1-start.jpg etc. only if they are real renders; check each <= 256 KiB, long side <= 1280, short side >= 480 (convert/resize if needed with a real tool, never a placeholder).
- [ ] **Step 4: Kit check** — from the kit dir run `node cli/makefun.mjs check --kit <kit dir> --repo <build dir>`; fix every failure until 0 failed; report exact output.
- [ ] **Step 5: Final self-review** — re-read plan vs build: every global constraint met; controls listed; three shot URLs reported.
