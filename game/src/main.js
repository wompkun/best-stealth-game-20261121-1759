// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, caught and floor clear, across three floors of rising difficulty.
//
// ?seed=N fixes the patrol timing. ?shot=start|play|end (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { BEST_KEY, STEP, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_WIN } from './config.js';
import { LEVELS } from './levels.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_PICKUP, EVENT_SPOTTED, EVENT_CAUGHT, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** How far the player walks between footstep ticks. */
const STEP_DISTANCE = 26;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best then lasts this visit only.
  }
}

function runShot(name) {
  const world = createWorld(createRandom(seed), 0);
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { best: readBest(), levelIndex: 0, totalLevels: LEVELS.length });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let levelIndex = 0;
  let world = createWorld(createRandom(seed + levelIndex * 7919), levelIndex);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastStepX = world.state.player.x;
  let lastStepY = world.state.player.y;
  let lastGuardStepAt = 0;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each pickup.
  function announce(message) {
    status.textContent = message;
  }

  function loadLevel(index) {
    levelIndex = index;
    world = createWorld(createRandom(seed + index * 7919), index);
    accumulator = 0;
    lastStepX = world.state.player.x;
    lastStepY = world.state.player.y;
  }

  function startGame() {
    audio.unlock();
    audio.click();
    loadLevel(0);
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.levelName}. Collect ${world.state.shards.length} shards, then reach the exit.`);
  }

  function nextLevel() {
    audio.click();
    loadLevel(levelIndex + 1);
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.levelName}.`);
  }

  function retryLevel() {
    audio.click();
    loadLevel(levelIndex);
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.levelName}.`);
  }

  function endCaught() {
    screen = SCREEN_OVER;
    audio.caught();
    announce(`Caught. ${world.state.shardsCollected} of ${world.state.shards.length} shards. Press R to try again.`);
  }

  function endWin() {
    const cleared = levelIndex + 1;
    if (cleared > best) {
      best = cleared;
      saveBest(best);
    }
    screen = SCREEN_WIN;
    audio.win();
    announce(`${world.state.levelName} clear. ${world.state.shardsCollected} shards in ${Math.floor(world.state.time)} seconds.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      audio.setMuted(!audio.muted);
      announce(audio.muted ? 'Sound off.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_OVER)) {
      retryLevel();
      return;
    }
    if (actions & ACTION_CONFIRM && screen === SCREEN_TITLE) startGame();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_OVER) retryLevel();
    else if (actions & ACTION_CONFIRM && screen === SCREEN_WIN) {
      if (levelIndex >= LEVELS.length - 1) startGame();
      else nextLevel();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function steer() {
    const keys = input.keysVector();
    if (keys.x !== 0 || keys.y !== 0) {
      input.clearClickTarget();
      const len = Math.hypot(keys.x, keys.y);
      return { x: keys.x / len, y: keys.y / len, sneak: input.sneak };
    }
    const target = input.clickTarget;
    if (target !== null) {
      const dx = target.x - world.state.player.x;
      const dy = target.y - world.state.player.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        input.clearClickTarget();
        return { x: 0, y: 0, sneak: input.sneak };
      }
      return { x: dx / d, y: dy / d, sneak: input.sneak };
    }
    return { x: 0, y: 0, sneak: input.sneak };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, {});
      return;
    }
    const move = steer();
    const events = world.step(STEP, move, { sneak: move.sneak });
    const player = world.state.player;
    if (Math.hypot(player.x - lastStepX, player.y - lastStepY) >= STEP_DISTANCE) {
      audio.step(world.state.time, move.sneak);
      lastStepX = player.x;
      lastStepY = player.y;
    }
    if (world.state.time - lastGuardStepAt > 0.5) {
      lastGuardStepAt = world.state.time;
      let nearest = Infinity;
      for (const guard of world.state.guards) {
        nearest = Math.min(nearest, Math.hypot(guard.x - player.x, guard.y - player.y));
      }
      if (nearest < 320) audio.guardStep(1 - nearest / 320);
    }
    if (events & EVENT_PICKUP) {
      audio.pickup();
      announce(`${world.state.shardsCollected} of ${world.state.shards.length} shards.`);
    }
    if (events & EVENT_SPOTTED) {
      audio.spotted();
      announce('Spotted! Break line of sight and hide in the dark.');
    }
    if (events & EVENT_CAUGHT) endCaught();
    else if (events & EVENT_WIN) endWin();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world, screen, { best, levelIndex, totalLevels: LEVELS.length });
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
  window.addEventListener('keydown', () => audio.unlock(), { once: true });

  announce('Night Vault. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
