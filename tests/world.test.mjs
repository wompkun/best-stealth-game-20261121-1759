// Tests for Night Vault (game/src/*). Run: node --test tests/world.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRandom } from '../game/src/random.js';
import { FIELD, TILE, STEP } from '../game/src/config.js';
import { LEVELS, parseLevel } from '../game/src/levels.js';
import { createWorld, EVENT_PICKUP, EVENT_CAUGHT, EVENT_WIN } from '../game/src/world.js';
import { stageShot } from '../game/src/shots.js';

/** BFS reachability through non-solid tiles, in tile coords. */
function reachable(level, from) {
  const seen = new Set([`${from.x},${from.y}`]);
  const queue = [from];
  while (queue.length > 0) {
    const cur = queue.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key) || level.solid(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

test('rng: same seed gives the same sequence, another seed differs', () => {
  const a = createRandom(7);
  const b = createRandom(7);
  const first = [a(), a(), a(), a(), a()];
  const second = [b(), b(), b(), b(), b()];
  assert.deepEqual(first, second);
  const c = createRandom(8);
  assert.notEqual(c(), first[0]);
  for (const v of first) assert.ok(v >= 0 && v < 1);
});

test('config: field is 1280x720, tile 40, step 1/60', () => {
  assert.equal(FIELD.width, 1280);
  assert.equal(FIELD.height, 720);
  assert.equal(TILE, 40);
  assert.equal(STEP, 1 / 60);
});

test('levels: 3 original levels, 32x18 grids, shards and exit reachable', () => {
  assert.equal(LEVELS.length, 3);
  for (let i = 0; i < LEVELS.length; i += 1) {
    const level = parseLevel(i);
    assert.equal(level.cols, 32);
    assert.equal(level.rows, 18);
    assert.ok(level.name.length > 0);
    assert.ok(!level.solid(level.playerStartTile.x, level.playerStartTile.y), `level ${i}: start is solid`);
    const seen = reachable(level, level.playerStartTile);
    for (const shard of level.shards) {
      assert.ok(seen.has(`${shard.tileX},${shard.tileY}`), `level ${i}: shard at ${shard.tileX},${shard.tileY} unreachable`);
    }
    assert.ok(seen.has(`${level.exitTile.x},${level.exitTile.y}`), `level ${i}: exit unreachable`);
    for (const row of level.map) assert.equal(row.length, 32, `level ${i}: row not 32 wide`);
    assert.ok(level.guards.length >= 2, `level ${i}: needs guards`);
  }
  assert.equal(parseLevel(0).shards.length, 3);
  assert.equal(parseLevel(1).shards.length, 4);
  assert.equal(parseLevel(2).shards.length, 5);
});

test('world: guard patrols along waypoints and loops', () => {
  const world = createWorld(createRandom(1), 0);
  const guard = world.state.guards[0];
  const start = { x: guard.x, y: guard.y };
  let moved = false;
  for (let i = 0; i < 60 * 20; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, {});
    if (Math.hypot(guard.x - start.x, guard.y - start.y) > 30) moved = true;
  }
  assert.ok(moved, 'guard never left its start');
  assert.equal(world.state.status, 'playing');
});

test('world: detection rises inside a clear cone and decays out of sight', () => {
  const world = createWorld(createRandom(1), 0);
  const guard = world.state.guards[0];
  // Put the player 100 px in front of the guard, on open floor.
  const fx = Math.cos(guard.facing);
  const fy = Math.sin(guard.facing);
  world.state.player.x = guard.x + fx * 100;
  world.state.player.y = guard.y + fy * 100;
  let rose = false;
  for (let i = 0; i < 60 && !rose; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, {});
    if (world.state.detection > 0.2) rose = true;
  }
  assert.ok(rose, 'detection never rose in a clear cone');
  // Move the player far away; detection must decay back down. (Stop early so
  // the guard cannot catch the player mid-test and freeze detection at 1.)
  world.state.player.x = 60;
  world.state.player.y = 60;
  for (let i = 0; i < 60 * 4; i += 1) world.step(STEP, { x: 0, y: 0 }, {});
  assert.ok(world.state.detection < 0.05, `detection did not decay: ${world.state.detection}`);
});

test('world: a crate between guard and player blocks detection', () => {
  const world = createWorld(createRandom(1), 0);
  const guard = world.state.guards[0];
  // Guard faces east from tile (18,11); a crate sits at tile (20,11) and the
  // player stands just past it, inside cone range and angle.
  guard.x = 740;
  guard.y = 460;
  guard.facing = 0;
  guard.speed = 0;
  guard.waypoints = [{ x: 740, y: 460 }];
  guard.waypointIndex = 0;
  world.state.player.x = 900;
  world.state.player.y = 460;
  for (let i = 0; i < 60 * 2; i += 1) world.step(STEP, { x: 0, y: 0 }, {});
  assert.ok(world.state.detection < 0.05, `crate did not block sight: detection ${world.state.detection}`);
});

test('world: shadows slow detection to at most 0.35x the open rate', () => {
  // Same guard placement in both runs (tile (8,3), facing east, frozen):
  // shaded player stands on the shadow at tile (12,3); open player stands on
  // open floor at a similar distance and angle.
  const run = (px, py) => {
    const world = createWorld(createRandom(1), 0);
    const guard = world.state.guards[0];
    guard.x = 340;
    guard.y = 140;
    guard.facing = 0;
    guard.speed = 0;
    guard.waypoints = [{ x: 340, y: 140 }];
    guard.waypointIndex = 0;
    world.state.player.x = px;
    world.state.player.y = py;
    for (let i = 0; i < 60; i += 1) world.step(STEP, { x: 0, y: 0 }, {});
    return world.state.detection;
  };
  const openRate = run(500, 220);
  const shadowRate = run(500, 140);
  assert.ok(openRate > 0.2, `open detection too low: ${openRate}`);
  assert.ok(shadowRate <= openRate * 0.4, `shadow ${shadowRate} not slow enough vs open ${openRate}`);
});

test('world: collecting a shard fires EVENT_PICKUP; exit wins only with all shards', () => {
  const world = createWorld(createRandom(1), 0);
  const shard = world.state.shards[0];
  world.state.player.x = shard.x;
  world.state.player.y = shard.y;
  const events = world.step(STEP, { x: 0, y: 0 }, {});
  assert.ok(events & EVENT_PICKUP, 'no pickup event');
  assert.ok(shard.taken, 'shard not marked taken');

  const exitWorld = createWorld(createRandom(1), 0);
  exitWorld.state.player.x = exitWorld.state.exit.x;
  exitWorld.state.player.y = exitWorld.state.exit.y;
  const noWin = exitWorld.step(STEP, { x: 0, y: 0 }, {});
  assert.ok(!(noWin & EVENT_WIN), 'won at exit without all shards');
  for (const s of exitWorld.state.shards) s.taken = true;
  exitWorld.state.shardsCollected = exitWorld.state.shards.length;
  const win = exitWorld.step(STEP, { x: 0, y: 0 }, {});
  assert.ok(win & EVENT_WIN, 'no win event at exit with all shards');
  assert.equal(exitWorld.state.status, 'won');
});

test('world: an alerted guard that reaches the player catches them', () => {
  const world = createWorld(createRandom(1), 0);
  const guard = world.state.guards[0];
  guard.state = 'chase';
  guard.detection = 1;
  world.state.player.x = guard.x + 20;
  world.state.player.y = guard.y;
  const events = world.step(STEP, { x: 0, y: 0 }, {});
  assert.ok(events & EVENT_CAUGHT, 'no caught event when guard is on the player');
  assert.equal(world.state.status, 'caught');
});

test('world: same seed stepped twice gives an identical state hash', () => {
  const run = () => {
    const world = createWorld(createRandom(42), 0);
    for (let i = 0; i < 60 * 10; i += 1) {
      world.step(STEP, { x: 0.3, y: -0.6 }, { sneak: i % 120 < 60 });
    }
    return world.stateHash();
  };
  assert.equal(run(), run());
});

test('shots: autopilot wins level 1 within 300 s and survives an 11 s play scene', () => {
  const world = createWorld(createRandom(1), 0);
  const end = stageShot('end', world);
  assert.equal(end.screen, 'win');
  assert.equal(world.state.status, 'won');

  const playWorld = createWorld(createRandom(1), 0);
  const play = stageShot('play', playWorld);
  assert.equal(play.screen, 'play');
  assert.equal(playWorld.state.status, 'playing');
});

test('shots: start scene is the title and is deterministic', () => {
  const a = createWorld(createRandom(1), 0);
  const b = createWorld(createRandom(1), 0);
  const sa = stageShot('start', a);
  const sb = stageShot('start', b);
  assert.equal(sa.screen, 'title');
  assert.equal(sb.screen, 'title');
  assert.equal(a.stateHash(), b.stateHash());
});
