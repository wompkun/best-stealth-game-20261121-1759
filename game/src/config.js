// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical
// area; the renderer scales it to the window, so no rule below depends on the screen size.
// Tokens are three-layer (design-system): primitives in PALETTE, semantic names in the
// gameplay constants, component use in render.js.

// ---- primitive tokens -------------------------------------------------------
export const FIELD = { width: 1280, height: 720 };
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 165,
  sneakSpeed: 88,
  /** Noise radius while walking; sneaking is silent. Guards inside it get suspicious. */
  noiseRadius: 95,
};

export const GUARD = {
  radius: 14,
  /** Seconds a guard waits at each patrol waypoint, looking around. */
  waypointPause: 1.2,
  /** Chase speed multiplier over patrol speed. */
  chaseMultiplier: 1.65,
  /** Suspicious-move speed multiplier over patrol speed. */
  suspiciousMultiplier: 1.3,
  /** Seconds of lost sight before a chasing guard gives up and searches. */
  loseSightSeconds: 3,
  /** Seconds a guard searches the last seen spot before returning to patrol. */
  searchSeconds: 4,
  /** Distance at which an alerted guard catches the player. */
  catchDistance: 27,
};

/** Detection: 0 = unseen, 1 = spotted. Rates are per second of exposure. */
export const DETECTION = {
  /** Base build rate while the player stands in a cone with clear sight. */
  build: 1.15,
  /** Closer is scarier: inside this range the build rate is multiplied. */
  closeRange: 90,
  closeMultiplier: 1.35,
  /** Standing in a shadow multiplies the build rate by this. */
  shadowMultiplier: 0.32,
  /** Sneaking multiplies the build rate by this. */
  sneakMultiplier: 0.6,
  /** How fast detection fades while unseen. */
  decay: 0.55,
  /** Detection at which a guard turns suspicious and investigates. */
  suspiciousAt: 0.35,
};

export const PICKUP_RADIUS = 26;
export const EXIT_RADIUS = 30;

export const PALETTE = {
  // Surfaces
  floor: '#171c26',
  floorAlt: '#1b212e',
  floorLine: '#232b3b',
  wall: '#3a4358',
  wallTop: '#4d5878',
  crate: '#5a4632',
  crateEdge: '#c98f4e',
  shadowZone: '#0b0f1c',
  // Actors
  player: '#59d8e8',
  playerRing: '#bff3fa',
  guardCalm: '#e8b13c',
  guardSuspicious: '#ef7d2e',
  guardAlert: '#e5484d',
  shard: '#7dffb0',
  exit: '#37e08b',
  exitDark: '#0f5c36',
  // Vision cones
  coneCalm: 'rgba(232, 177, 60, 0.20)',
  coneSuspicious: 'rgba(239, 125, 46, 0.30)',
  coneAlert: 'rgba(229, 72, 77, 0.34)',
  coneEdge: 'rgba(232, 177, 60, 0.55)',
  // Light and dark
  darkness: 'rgba(4, 6, 12, 0.62)',
  lightWarm: 'rgba(255, 214, 130, 0.10)',
  // Interface
  panel: '#12161f',
  panelEdge: '#2c3547',
  text: '#eef1f5',
  muted: '#9aa5b8',
  danger: '#e5484d',
  ok: '#37e08b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Screen names shared by main.js, render.js and shots.js. */
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

/** Where the best result is kept between visits (this browser only). */
export const BEST_KEY = 'night-vault.best';
