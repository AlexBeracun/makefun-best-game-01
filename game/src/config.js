// Lanternkeeper — every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size. One night, ten waves: hold the light until dawn.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The lighthouse stands at the centre of the island; everything defends it. */
export const LIGHTHOUSE = { x: 640, y: 360, radius: 36, maxHp: 100 };

export const PLAYER = {
  radius: 14,
  speed: 265,
  maxHp: 100,
  fireInterval: 0.26,
  bulletSpeed: 640,
  bulletRadius: 5,
  damage: 1,
  pickupRadius: 92,
  collectRadius: 26,
  invulnerable: 0.6,
};

/** Waves: 10 nights of moths. Wave 5 brings the Gloom Moth, wave 10 the Moth Queen. */
export const WAVES = 10;
export const INTERMISSION_SECONDS = 8;

/** Enemy kinds, each with its own behaviour, health and reward. */
export const ENEMY = {
  moth: { radius: 13, hp: 2, speed: 78, damage: 6, score: 10, embers: 1, color: '#b9a7e6' },
  wisp: { radius: 11, hp: 3, speed: 128, damage: 5, score: 15, embers: 1, color: '#7fe3d0' },
  beetle: { radius: 19, hp: 9, speed: 46, damage: 12, score: 25, embers: 3, color: '#e08a5a' },
  gloom: { radius: 30, hp: 90, speed: 34, damage: 20, score: 200, embers: 12, color: '#c65a8a' },
  queen: { radius: 46, hp: 260, speed: 26, damage: 25, score: 500, embers: 30, color: '#e8b4ff' },
};

/** How many of each kind a wave fields, before the wave's size multiplier. */
export function waveComp(wave) {
  const moths = 5 + wave * 2;
  const wisps = wave >= 3 ? 2 + wave : 0;
  const beetles = wave >= 2 ? 1 + Math.floor(wave / 2) : 0;
  const boss = wave === 5 ? 'gloom' : wave === 10 ? 'queen' : null;
  return { moths, wisps, beetles, boss };
}

/** Seconds between spawns inside a wave; later waves press harder. */
export function spawnInterval(wave) {
  return Math.max(0.35, 1.15 - wave * 0.07);
}

/** The shop: six upgrades, bought with embers between waves. */
export const SHOP = [
  { id: 'damage', name: 'Brighter Bolt', desc: '+1 bolt damage', base: 8, growth: 1.5, max: 8 },
  { id: 'rapid', name: 'Rapid Wick', desc: '+25% fire rate', base: 10, growth: 1.5, max: 6 },
  { id: 'swift', name: 'Swift Boots', desc: '+12% move speed', base: 6, growth: 1.5, max: 5 },
  { id: 'glass', name: 'Reinforced Glass', desc: '+25 max health, heal 25', base: 8, growth: 1.5, max: 6 },
  { id: 'twin', name: 'Twin Flame', desc: '+1 bolt per shot', base: 22, growth: 2.0, max: 2 },
  { id: 'repair', name: 'Repair Lantern', desc: 'Restore 30 lighthouse health', base: 10, growth: 1.4, max: 99 },
];

export function shopCost(item, owned) {
  return Math.round(item.base * item.growth ** owned);
}

/** Pool sizes: everything is allocated once, at boot, and reused. */
export const POOL = { enemies: 96, bullets: 128, orbs: 64, embers: 160, particles: 320, texts: 24 };

export const PALETTE = {
  backdrop: '#070a18',
  ground: '#101a2e',
  groundEdge: '#0b1224',
  sea: '#0a2036',
  rock: '#1d2a44',
  grass: '#1e3a2f',
  lighthouse: '#f4e3c2',
  lighthouseDark: '#c9a86a',
  light: '#ffd76a',
  lightSoft: '#ffe9a8',
  player: '#ffd76a',
  playerRing: '#fff3c4',
  bullet: '#ffe9a8',
  ember: '#ff9d45',
  text: '#f2ead8',
  muted: '#93a0bd',
  danger: '#ff6b6b',
  panel: '#141c30',
  panelEdge: '#2b3a5c',
  hudBar: '#22304f',
  shop: '#16223c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'lanternkeeper.best';
