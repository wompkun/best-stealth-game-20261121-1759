// The three floors of the Meridian Archive, an original setting: a night courier
// slips through a museum archive after closing to recover data shards and leave
// through the service exit. Each map row is four 8-character chunks (32 tiles):
//   '#' wall   'c' crate (solid, blocks sight)   's' shadow (floor, hides you)
//   '.' open floor   'P' player start   'D' data shard   'E' exit
// Guard patrols are waypoint lists in tile coordinates; tuning rises per floor.

import { TILE } from './config.js';

const tileCentre = (tx, ty) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

function guard(waypoints, speed, range, coneHalf) {
  return {
    waypoints: waypoints.map(([tx, ty]) => tileCentre(tx, ty)),
    speed,
    range,
    coneHalf,
  };
}

export const LEVELS = [
  {
    name: 'Floor 1 — The Lobby',
    map: [
      '########' + '########' + '########' + '########',
      '#P....s.' + '......D.' + '........' + '....E..#',
      '#.......' + '........' + '........' + '.......#',
      '#..####.' + '....s...' + '....####' + '....c..#',
      '#..####.' + '........' + '....####' + '.......#',
      '#.......' + '....D...' + '........' + '.......#',
      '#..c....' + '........' + '....s...' + '.......#',
      '#.......' + '........' + '........' + '.......#',
      '#..s....' + '....####' + '........' + '....####',
      '#.......' + '....####' + '........' + '....####',
      '#.......' + '........' + '........' + '.......#',
      '#....D..' + '........' + '....c...' + '.......#',
      '#.......' + '........' + '........' + '.......#',
      '#..####.' + '....s...' + '....####' + '.......#',
      '#..####.' + '........' + '....####' + '....c..#',
      '#.......' + '........' + '........' + '.......#',
      '#.s.....' + '........' + '........' + '.......#',
      '########' + '########' + '########' + '########',
    ],
    guards: [
      guard([[10, 2], [22, 2]], 55, 210, 0.61),
      guard([[6, 15], [25, 15]], 55, 210, 0.61),
    ],
  },
  {
    name: 'Floor 2 — The Vault Floor',
    map: [
      '########' + '########' + '########' + '########',
      '#P....s.' + '........' + '....####' + '....E..#',
      '#.......' + '........' + '....####' + '.......#',
      '#..####.' + '....D...' + '....####' + '....s..#',
      '#..####.' + '........' + '........' + '.......#',
      '#.......' + '....c...' + '........' + '....c..#',
      '#..s....' + '........' + '####....' + '.......#',
      '#.......' + '........' + '####....' + '..D....#',
      '#.......' + '....####' + '........' + '.......#',
      '#..D....' + '....####' + '........' + '....s..#',
      '#.......' + '........' + '........' + '.......#',
      '#....c..' + '........' + '....####' + '.......#',
      '#.......' + '........' + '....####' + '.......#',
      '#..####.' + '....s...' + '........' + '.......#',
      '#..####.' + '........' + '........' + '....c..#',
      '#.......' + '........' + '........' + '.......#',
      '#....D..' + 's.......' + '........' + '.......#',
      '########' + '########' + '########' + '########',
    ],
    guards: [
      guard([[4, 2], [14, 2]], 68, 235, 0.61),
      guard([[24, 5], [24, 14]], 68, 235, 0.61),
      guard([[8, 12], [18, 12]], 68, 235, 0.61),
    ],
  },
  {
    name: "Floor 3 — The Director's Wing",
    map: [
      '########' + '########' + '########' + '########',
      '#P..s...' + '....####' + '........' + '....E..#',
      '#.......' + '....####' + '........' + '.......#',
      '#..####.' + '....D...' + '....c...' + '....s..#',
      '#..####.' + '........' + '........' + '.......#',
      '#.......' + '........' + '####....' + '.......#',
      '#..s....' + '....c...' + '####....' + '..D....#',
      '#.......' + '........' + '........' + '.......#',
      '#..D....' + '....####' + '........' + '....####',
      '#.......' + '....####' + '........' + '....####',
      '#.......' + '........' + '....s...' + '.......#',
      '#....c..' + '........' + '....####' + '.......#',
      '#.......' + '........' + '....####' + '..D....#',
      '#..####.' + '....s...' + '........' + '.......#',
      '#..####.' + '........' + '........' + '....c..#',
      '#.......' + '........' + '........' + '.......#',
      '#....D..' + 's.......' + '........' + '.......#',
      '########' + '########' + '########' + '########',
    ],
    guards: [
      guard([[4, 2], [10, 2]], 82, 255, 0.58),
      guard([[22, 3], [22, 9]], 82, 255, 0.58),
      guard([[6, 13], [18, 13]], 82, 255, 0.58),
      guard([[14, 10], [28, 10]], 82, 255, 0.58),
    ],
  },
];

/**
 * Parse a level into the shape world.js and shots.js use: tile helpers plus
 * pixel-space entities. Out-of-bounds tiles count as solid.
 */
export function parseLevel(index) {
  const def = LEVELS[index];
  const rows = def.map.length;
  const cols = def.map[0].length;
  const at = (tx, ty) => (tx < 0 || ty < 0 || tx >= cols || ty >= rows ? '#' : def.map[ty][tx]);
  const shards = [];
  let playerStart = { x: 1, y: 1 };
  let exit = { x: cols - 2, y: 1 };
  for (let ty = 0; ty < rows; ty += 1) {
    for (let tx = 0; tx < cols; tx += 1) {
      const ch = def.map[ty][tx];
      if (ch === 'P') playerStart = { x: tx, y: ty };
      else if (ch === 'D') shards.push({ x: tx, y: ty, taken: false });
      else if (ch === 'E') exit = { x: tx, y: ty };
    }
  }
  return {
    name: def.name,
    index,
    map: def.map,
    cols,
    rows,
    solid(tx, ty) {
      const ch = at(tx, ty);
      return ch === '#' || ch === 'c';
    },
    shadow(tx, ty) {
      return at(tx, ty) === 's';
    },
    tileAt(tx, ty) {
      return at(tx, ty);
    },
    playerStart: tileCentre(playerStart.x, playerStart.y),
    playerStartTile: playerStart,
    shards: shards.map((s) => ({ ...tileCentre(s.x, s.y), tileX: s.x, tileY: s.y, taken: false })),
    exit: tileCentre(exit.x, exit.y),
    exitTile: exit,
    guards: def.guards.map((g) => ({ ...g, waypoints: g.waypoints.map((w) => ({ ...w })) })),
  };
}
