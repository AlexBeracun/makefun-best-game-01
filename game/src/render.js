// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred, the margin filled with the backdrop
// colour. A night island: stars, sea at the edges, a stone lighthouse with a sweeping beam,
// moths with flapping wings, embers, particles and floating text. Canvas text for the HUD
// and the panels. The shake offset comes from the elapsed time, never Math.random, so a
// staged screenshot is the same every run.

import { FIELD, FONT, LIGHTHOUSE, PALETTE, PLAYER, SHOP, WAVES, shopCost } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_SHOP = 'shop';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const PANEL = { width: 640, line: 32 };
const SHOP_PANEL = { width: 780, row: 62, top: 176 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

function barColor(ratio) {
  if (ratio > 0.5) return '#7fd08a';
  if (ratio > 0.25) return '#f2c94c';
  return '#ff6b6b';
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('Score ');
  const waveLabel = cachedLabel('Wave ');
  const emberLabel = cachedLabel('◆ ');
  const finalLabel = cachedLabel('Score ');
  const bestLabel = cachedLabel('Best ');
  const killsLabel = cachedLabel('Moths banished ');
  const timeLabel = cachedLabel('Time ');

  // Fixed decoration, seeded once so the island looks the same every visit.
  const decorRandom = createRandom(20261118);
  const stars = [];
  for (let index = 0; index < 110; index += 1) {
    stars.push({ x: decorRandom() * FIELD.width, y: decorRandom() * FIELD.height * 0.55, size: 0.6 + decorRandom() * 1.6, twinkle: decorRandom() * Math.PI * 2 });
  }
  const rocks = [];
  for (let index = 0; index < 16; index += 1) {
    rocks.push({ x: decorRandom() * FIELD.width, y: decorRandom() * FIELD.height, size: 8 + decorRandom() * 22 });
  }
  const tufts = [];
  for (let index = 0; index < 26; index += 1) {
    tufts.push({ x: decorRandom() * FIELD.width, y: decorRandom() * FIELD.height });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, weight) {
    const key = `${weight || ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''}${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, width, height, radius) {
    context.beginPath();
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }

  function drawBackground(state) {
    const gradient = context.createLinearGradient(0, 0, 0, FIELD.height);
    gradient.addColorStop(0, '#0a1230');
    gradient.addColorStop(0.55, PALETTE.ground);
    gradient.addColorStop(1, PALETTE.groundEdge);
    context.fillStyle = gradient;
    context.fillRect(0, 0, FIELD.width, FIELD.height);

    for (const star of stars) {
      const alpha = 0.35 + 0.3 * Math.sin(state.elapsed * 1.4 + star.twinkle);
      context.globalAlpha = alpha;
      context.fillStyle = '#dfe8ff';
      context.fillRect(star.x, star.y, star.size, star.size);
    }
    context.globalAlpha = 1;

    // The sea hems the island on all four sides.
    context.strokeStyle = PALETTE.sea;
    context.lineWidth = 26;
    context.strokeRect(4, 4, FIELD.width - 8, FIELD.height - 8);
    context.strokeStyle = 'rgba(127, 227, 208, 0.25)';
    context.lineWidth = 2;
    context.strokeRect(18, 18, FIELD.width - 36, FIELD.height - 36);

    for (const rock of rocks) {
      context.fillStyle = PALETTE.rock;
      context.beginPath();
      context.ellipse(rock.x, rock.y, rock.size, rock.size * 0.62, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.strokeStyle = PALETTE.grass;
    context.lineWidth = 2;
    for (const tuft of tufts) {
      context.beginPath();
      context.moveTo(tuft.x, tuft.y);
      context.lineTo(tuft.x - 4, tuft.y - 9);
      context.moveTo(tuft.x + 3, tuft.y);
      context.lineTo(tuft.x + 5, tuft.y - 10);
      context.stroke();
    }

    // The lighthouse's warm glow on the grass.
    const glow = context.createRadialGradient(LIGHTHOUSE.x, LIGHTHOUSE.y, 10, LIGHTHOUSE.x, LIGHTHOUSE.y, 300);
    const lightRatio = 0.35 + 0.65 * (state.lighthouse.hp / LIGHTHOUSE.maxHp);
    glow.addColorStop(0, `rgba(255, 215, 106, ${0.22 * lightRatio})`);
    glow.addColorStop(1, 'rgba(255, 215, 106, 0)');
    context.fillStyle = glow;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
  }

  function drawLighthouse(state) {
    const x = LIGHTHOUSE.x;
    const y = LIGHTHOUSE.y;
    // The sweeping beam: two opposite wedges turning with the elapsed time.
    const angle = state.elapsed * 0.55;
    context.save();
    context.translate(x, y - 34);
    context.rotate(angle);
    const beam = context.createLinearGradient(0, 0, 520, 0);
    beam.addColorStop(0, 'rgba(255, 233, 168, 0.28)');
    beam.addColorStop(1, 'rgba(255, 233, 168, 0)');
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(520, -26);
    context.lineTo(520, 26);
    context.closePath();
    context.fill();
    context.rotate(Math.PI);
    context.fillStyle = beam;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(520, -26);
    context.lineTo(520, 26);
    context.closePath();
    context.fill();
    context.restore();

    // Stone tower, tapering up to the lamp room.
    context.fillStyle = PALETTE.lighthouseDark;
    context.beginPath();
    context.moveTo(x - 30, y + 30);
    context.lineTo(x - 18, y - 34);
    context.lineTo(x + 18, y - 34);
    context.lineTo(x + 30, y + 30);
    context.closePath();
    context.fill();
    context.fillStyle = PALETTE.lighthouse;
    context.beginPath();
    context.moveTo(x - 26, y + 30);
    context.lineTo(x - 16, y - 34);
    context.lineTo(x - 2, y - 34);
    context.lineTo(x - 8, y + 30);
    context.closePath();
    context.fill();
    // Lamp room and its light.
    context.fillStyle = '#2b3a5c';
    context.fillRect(x - 16, y - 52, 32, 20);
    const lampGlow = context.createRadialGradient(x, y - 42, 2, x, y - 42, 34);
    lampGlow.addColorStop(0, 'rgba(255, 233, 168, 0.95)');
    lampGlow.addColorStop(1, 'rgba(255, 233, 168, 0)');
    context.fillStyle = lampGlow;
    context.beginPath();
    context.arc(x, y - 42, 34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.light;
    context.beginPath();
    context.arc(x, y - 42, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b3a5c';
    context.fillRect(x - 20, y - 58, 40, 6);
    // Health ring around the base: the light's remaining strength.
    const ratio = state.lighthouse.hp / LIGHTHOUSE.maxHp;
    context.strokeStyle = barColor(ratio);
    context.lineWidth = 5;
    context.beginPath();
    context.arc(x, y, LIGHTHOUSE.radius + 8, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    context.stroke();
  }

  function drawMoth(enemy, state) {
    const flap = Math.sin(state.elapsed * 18 + enemy.phase);
    const wingSpread = 0.5 + 0.5 * Math.abs(flap);
    context.save();
    context.translate(enemy.x, enemy.y);
    context.rotate(Math.atan2(enemy.y - LIGHTHOUSE.y, enemy.x - LIGHTHOUSE.x) + Math.PI / 2);
    context.fillStyle = enemy.kind === 'queen' || enemy.kind === 'gloom' ? '#e8b4ff' : '#b9a7e6';
    context.globalAlpha = 0.85;
    context.beginPath();
    context.ellipse(-enemy.radius * 0.7, 0, enemy.radius * 0.75, enemy.radius * (0.35 + 0.45 * wingSpread), -0.5, 0, Math.PI * 2);
    context.ellipse(enemy.radius * 0.7, 0, enemy.radius * 0.75, enemy.radius * (0.35 + 0.45 * wingSpread), 0.5, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
    context.fillStyle = '#2a2140';
    context.beginPath();
    context.ellipse(0, 0, enemy.radius * 0.32, enemy.radius * 0.8, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffd76a';
    context.beginPath();
    context.arc(-enemy.radius * 0.12, -enemy.radius * 0.45, 2.4, 0, Math.PI * 2);
    context.arc(enemy.radius * 0.12, -enemy.radius * 0.45, 2.4, 0, Math.PI * 2);
    context.fill();
    context.restore();
    if (enemy.kind === 'queen') {
      context.strokeStyle = 'rgba(232, 180, 255, 0.7)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius + 10 + Math.sin(state.elapsed * 3) * 3, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawEnemy(enemy, state) {
    if (enemy.kind === 'moth' || enemy.kind === 'queen' || enemy.kind === 'gloom') {
      drawMoth(enemy, state);
    } else if (enemy.kind === 'wisp') {
      const pulse = 0.7 + 0.3 * Math.sin(state.elapsed * 6 + enemy.phase);
      context.fillStyle = 'rgba(127, 227, 208, 0.35)';
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius * 1.8 * pulse, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#7fe3d0';
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius * 0.6, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#0b1224';
      context.beginPath();
      context.arc(enemy.x - 3, enemy.y - 2, 2, 0, Math.PI * 2);
      context.arc(enemy.x + 3, enemy.y - 2, 2, 0, Math.PI * 2);
      context.fill();
    } else {
      // Beetle: a hard round shell with a shining back.
      context.fillStyle = '#e08a5a';
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8a4a28';
      context.beginPath();
      context.arc(enemy.x, enemy.y, enemy.radius * 0.7, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = '#e08a5a';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(enemy.x, enemy.y - enemy.radius * 0.7);
      context.lineTo(enemy.x, enemy.y + enemy.radius * 0.7);
      context.stroke();
      context.fillStyle = '#ffd76a';
      context.beginPath();
      context.arc(enemy.x - 5, enemy.y - 6, 2, 0, Math.PI * 2);
      context.arc(enemy.x + 5, enemy.y - 6, 2, 0, Math.PI * 2);
      context.fill();
    }
    if (enemy.hp < enemy.maxHp) {
      const width = enemy.radius * 2;
      const ratio = enemy.hp / enemy.maxHp;
      context.fillStyle = 'rgba(0, 0, 0, 0.5)';
      context.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 10, width, 4);
      context.fillStyle = barColor(ratio);
      context.fillRect(enemy.x - width / 2, enemy.y - enemy.radius - 10, width * ratio, 4);
    }
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.invulnerable > 0 && Math.floor(player.invulnerable * 10) % 2 === 0) return;
    // The keeper's own lantern light.
    const glow = context.createRadialGradient(player.x, player.y, 4, player.x, player.y, 70);
    glow.addColorStop(0, 'rgba(255, 215, 106, 0.35)');
    glow.addColorStop(1, 'rgba(255, 215, 106, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(player.x, player.y, 70, 0, Math.PI * 2);
    context.fill();
    // Cloak and hood.
    context.fillStyle = '#3a2f5a';
    context.beginPath();
    context.moveTo(player.x, player.y - PLAYER.radius);
    context.quadraticCurveTo(player.x + PLAYER.radius, player.y, player.x + PLAYER.radius * 0.8, player.y + PLAYER.radius);
    context.lineTo(player.x - PLAYER.radius * 0.8, player.y + PLAYER.radius);
    context.quadraticCurveTo(player.x - PLAYER.radius, player.y, player.x, player.y - PLAYER.radius);
    context.fill();
    context.fillStyle = '#ffd76a';
    context.beginPath();
    context.arc(player.x, player.y - 2, 5, 0, Math.PI * 2);
    context.fill();
    // Aim: a short golden line toward where the bolts will fly.
    context.strokeStyle = 'rgba(255, 233, 168, 0.8)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.aimAngle) * (PLAYER.radius + 2), player.y + Math.sin(player.aimAngle) * (PLAYER.radius + 2));
    context.lineTo(player.x + Math.cos(player.aimAngle) * (PLAYER.radius + 16), player.y + Math.sin(player.aimAngle) * (PLAYER.radius + 16));
    context.stroke();
  }

  function drawField(state) {
    drawBackground(state);
    for (const ember of state.embers) {
      if (!ember.active) continue;
      const bob = Math.sin(state.elapsed * 5 + ember.x) * 2;
      context.fillStyle = PALETTE.ember;
      context.save();
      context.translate(ember.x, ember.y + bob);
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, 8, 8);
      context.restore();
    }
    for (const orb of state.orbs) {
      if (!orb.active) continue;
      const pulse = 0.75 + 0.25 * Math.sin(state.elapsed * 8);
      context.fillStyle = `rgba(168, 85, 247, ${pulse})`;
      context.beginPath();
      context.arc(orb.x, orb.y, 8, 0, Math.PI * 2);
      context.fill();
    }
    for (const bullet of state.bullets) {
      if (!bullet.active) continue;
      context.strokeStyle = 'rgba(255, 233, 168, 0.5)';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(bullet.x - bullet.vx * 0.03, bullet.y - bullet.vy * 0.03);
      context.lineTo(bullet.x, bullet.y);
      context.stroke();
      context.fillStyle = PALETTE.bullet;
      context.beginPath();
      context.arc(bullet.x, bullet.y, PLAYER.bulletRadius, 0, Math.PI * 2);
      context.fill();
    }
    for (const enemy of state.enemies) {
      if (enemy.active) drawEnemy(enemy, state);
    }
    drawLighthouse(state);
    drawPlayer(state);
    for (const particle of state.particles) {
      if (!particle.active) continue;
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    context.globalAlpha = 1;
    for (const item of state.texts) {
      if (!item.active) continue;
      context.globalAlpha = Math.max(0, item.life / 0.9);
      text(item.text, item.x, item.y, 18, item.color, 'center', '700 ');
    }
    context.globalAlpha = 1;
  }

  function drawBar(x, y, width, height, ratio, color) {
    context.fillStyle = PALETTE.hudBar;
    roundRect(x, y, width, height, height / 2);
    context.fill();
    if (ratio > 0) {
      context.fillStyle = color;
      roundRect(x, y, Math.max(height, width * ratio), height, height / 2);
      context.fill();
    }
  }

  function drawHud(state) {
    context.textBaseline = 'top';
    text(scoreLabel(state.score), 24, 18, 26, PALETTE.text, 'left', '700 ');
    text(waveLabel(state.wave === 0 ? '—' : `${state.wave} / ${WAVES}`), FIELD.width / 2, 18, 26, PALETTE.text, 'center', '700 ');
    text(emberLabel(state.embersHeld), FIELD.width - 24, 18, 26, PALETTE.ember, 'right', '700 ');

    // Lighthouse health, top left under the score.
    text('LIGHT', 24, 56, 13, PALETTE.muted, 'left', '700 ');
    drawBar(78, 56, 150, 14, state.lighthouse.hp / LIGHTHOUSE.maxHp, barColor(state.lighthouse.hp / LIGHTHOUSE.maxHp));
    // Keeper health, under the light.
    text('KEEPER', 24, 78, 13, PALETTE.muted, 'left', '700 ');
    drawBar(78, 78, 150, 14, state.player.hp / state.player.maxHp, barColor(state.player.hp / state.player.maxHp));

    // Boss health, centred under the wave.
    let boss = null;
    for (const enemy of state.enemies) {
      if (enemy.active && (enemy.kind === 'queen' || enemy.kind === 'gloom')) boss = enemy;
    }
    if (boss) {
      const name = boss.kind === 'queen' ? 'THE MOTH QUEEN' : 'THE GLOOM MOTH';
      text(name, FIELD.width / 2, 56, 15, '#e8b4ff', 'center', '700 ');
      drawBar(FIELD.width / 2 - 160, 78, 320, 12, boss.hp / boss.maxHp, '#c65a8a');
    } else if (state.phase === 'wave') {
      const remaining = state.spawnLeft + state.enemies.filter((enemy) => enemy.active).length;
      text(`Moths left: ${remaining}`, FIELD.width / 2, 58, 15, PALETTE.muted, 'center');
    } else if (state.phase === 'intermission' && state.wave > 0) {
      text(`Next wave in ${Math.ceil(state.intermissionTimer)}s — press N to begin`, FIELD.width / 2, 58, 15, PALETTE.muted, 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = 150 + lines.length * PANEL.line + 64;
    const x = (FIELD.width - PANEL.width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(7, 10, 24, 0.72)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, PANEL.width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, FIELD.width / 2, y + 72, 46, accent || PALETTE.text, 'center', '700 ');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 128 + index * PANEL.line, 21, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 23, PALETTE.light, 'center', '700 ');
  }

  function drawShop(state, best) {
    context.fillStyle = 'rgba(7, 10, 24, 0.6)';
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    const x = (FIELD.width - SHOP_PANEL.width) / 2;
    const y = 92;
    const height = 520;
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, SHOP_PANEL.width, height, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, SHOP_PANEL.width, height, 16);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(`Wave ${state.wave} clear — dawn is ${WAVES - state.wave} wave${WAVES - state.wave === 1 ? '' : 's'} away`, FIELD.width / 2, y + 52, 30, PALETTE.text, 'center', '700 ');
    text(`Embers ◆ ${state.embersHeld}      Take your time — press N when ready`, FIELD.width / 2, y + 88, 19, PALETTE.ember, 'center', '700 ');
    text('Spend embers on the keeper — press 1–6 or click a row', FIELD.width / 2, y + 118, 17, PALETTE.muted, 'center');
    for (let index = 0; index < SHOP.length; index += 1) {
      const item = SHOP[index];
      const owned = item.id === 'repair' ? 0 : state.player.upgrades[item.id];
      const cost = shopCost(item, item.id === 'repair' ? Math.floor((LIGHTHOUSE.maxHp - state.lighthouse.hp) / 30) : owned);
      const rowY = SHOP_PANEL.top + index * SHOP_PANEL.row;
      const affordable = state.embersHeld >= cost && !(item.max !== 99 && owned >= item.max);
      const maxed = item.max !== 99 && owned >= item.max;
      context.fillStyle = affordable ? PALETTE.shop : 'rgba(22, 34, 60, 0.5)';
      roundRect(x + 24, rowY, SHOP_PANEL.width - 48, SHOP_PANEL.row - 10, 10);
      context.fill();
      text(`${index + 1}`, x + 48, rowY + 33, 20, PALETTE.muted, 'left', '700 ');
      text(item.name, x + 84, rowY + 28, 20, affordable ? PALETTE.text : PALETTE.muted, 'left', '700 ');
      text(item.desc, x + 84, rowY + 50, 15, PALETTE.muted, 'left');
      const right = maxed ? 'MAXED' : owned > 0 ? `Lv ${owned}  ◆ ${cost}` : `◆ ${cost}`;
      text(right, x + SHOP_PANEL.width - 48, rowY + 33, 19, maxed ? PALETTE.muted : affordable ? PALETTE.ember : '#5a6a8a', 'right', '700 ');
    }
    text('Press N or click anywhere to start the next wave', FIELD.width / 2, y + height - 24, 18, PALETTE.light, 'center', '700 ');
  }

  const TITLE_LINES = [
    'The moths come at night to snuff the lighthouse.',
    'Hold the light through 10 waves — then dawn breaks.',
    'Move with WASD or ← ↑ ↓ →. Aim with the mouse, hold click to fire.',
    'No mouse? Space fires at the nearest moth. P pauses, M mutes.',
    'Moths drop embers — spend them between waves. Bosses on waves 5 and 10.',
    '',
  ];
  const WIN_LINES = ['', '', '', '', ''];
  const OVER_LINES = ['', '', ''];

  /** Paint one frame: the field, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? Math.sin(state.elapsed * 127.1) * state.shake * 9 : 0;
    const shakeY = state.shake > 0 ? Math.cos(state.elapsed * 149.7) * state.shake * 9 : 0;
    context.setTransform(view.scale, 0, 0, view.scale, view.x + shakeX * view.scale, view.y + shakeY * view.scale);
    drawField(state);
    if (screen === SCREEN_TITLE) {
      TITLE_LINES[5] = best > 0 ? `Best score ${best}` : 'A new keeper takes up the lantern…';
      drawPanel('LANTERNKEEPER', TITLE_LINES, 'Click or press Space to begin', PALETTE.light);
      return;
    }
    drawHud(state);
    if (screen === SCREEN_SHOP) drawShop(state, best);
    else if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The moths wait in the dark.'], 'Press P to keep the watch', PALETTE.text);
    } else if (screen === SCREEN_WIN) {
      const minutes = Math.floor(state.playTime / 60);
      const seconds = Math.floor(state.playTime % 60);
      WIN_LINES[0] = finalLabel(state.score);
      WIN_LINES[1] = bestLabel(best);
      WIN_LINES[2] = killsLabel(state.kills);
      WIN_LINES[3] = timeLabel(`${minutes}:${String(seconds).padStart(2, '0')}`);
      WIN_LINES[4] = 'The Moth Queen is beaten. Dawn breaks over the shore.';
      drawPanel('DAWN BREAKS — YOU WIN', WIN_LINES, 'Click or press Space to keep the light', PALETTE.light);
    } else if (screen === SCREEN_OVER) {
      OVER_LINES[0] = finalLabel(state.score);
      OVER_LINES[1] = bestLabel(best);
      OVER_LINES[2] = `The light went out on wave ${Math.max(1, state.wave)}. ${state.kills} moths banished.`;
      drawPanel('THE LIGHT WENT OUT', OVER_LINES, 'Click or press Space to try again', PALETTE.danger);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, view };
}

/** Which shop row (0-5) a field point falls on, or -1: the shop's click target. */
export function shopRowAt(x, y) {
  const panelX = (FIELD.width - SHOP_PANEL.width) / 2;
  for (let index = 0; index < SHOP.length; index += 1) {
    const rowY = SHOP_PANEL.top + index * SHOP_PANEL.row;
    if (x >= panelX + 24 && x <= panelX + SHOP_PANEL.width - 24 && y >= rowY && y <= rowY + SHOP_PANEL.row - 10) return index;
  }
  return -1;
}
