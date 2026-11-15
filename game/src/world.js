// The game's rules and state, with no drawing and no browser in it: the keeper, the
// lighthouse, the moths and the waves, the shop, the embers and the particles. step()
// advances one fixed step and returns what happened as bit flags, so the caller can react
// (sounds, announcements) without the world knowing about screens or sound. The pools are
// allocated once, at boot, and reused; nothing here allocates during a wave.

import {
  ENEMY,
  FIELD,
  INTERMISSION_SECONDS,
  LIGHTHOUSE,
  PLAYER,
  POOL,
  SHOP,
  STEP,
  WAVES,
  shopCost,
  spawnInterval,
  waveComp,
} from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HIT = 2;
export const EVENT_LIGHT_HIT = 4;
export const EVENT_KILL = 8;
export const EVENT_PICKUP = 16;
export const EVENT_WAVE_CLEAR = 32;
export const EVENT_BOSS = 64;
export const EVENT_OVER = 128;
export const EVENT_WIN = 256;
export const EVENT_TICK = 512;

function overlaps(ax, ay, ar, bx, by, br) {
  const dx = ax - bx;
  const dy = ay - by;
  const reach = ar + br;
  return dx * dx + dy * dy < reach * reach;
}

export function createWorld(random) {
  const player = {
    x: LIGHTHOUSE.x,
    y: LIGHTHOUSE.y + 120,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    fireTimer: 0,
    invulnerable: 0,
    aimAngle: -Math.PI / 2,
    upgrades: { damage: 0, rapid: 0, swift: 0, glass: 0, twin: 0 },
  };
  const lighthouse = { hp: LIGHTHOUSE.maxHp };

  const enemies = [];
  for (let index = 0; index < POOL.enemies; index += 1) {
    enemies.push({ active: false, kind: 'moth', x: 0, y: 0, hp: 1, maxHp: 1, radius: 10, speed: 0, damage: 0, score: 0, embers: 0, phase: 0, attackTimer: 0, spawnTimer: 0, burstTimer: 0 });
  }
  const bullets = [];
  for (let index = 0; index < POOL.bullets; index += 1) {
    bullets.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 1 });
  }
  const orbs = [];
  for (let index = 0; index < POOL.orbs; index += 1) {
    orbs.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, damage: 5, life: 0 });
  }
  const embers = [];
  for (let index = 0; index < POOL.embers; index += 1) {
    embers.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, value: 1 });
  }
  const particles = [];
  for (let index = 0; index < POOL.particles; index += 1) {
    particles.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 2, color: '#ffffff' });
  }
  const texts = [];
  for (let index = 0; index < POOL.texts; index += 1) {
    texts.push({ active: false, x: 0, y: 0, life: 0, text: '', color: '#ffffff' });
  }
  const spawnQueue = [];
  for (let index = 0; index < 256; index += 1) spawnQueue.push('moth');

  const state = {
    player,
    lighthouse,
    enemies,
    bullets,
    orbs,
    embers,
    particles,
    texts,
    score: 0,
    best: 0,
    embersHeld: 0,
    kills: 0,
    wave: 0,
    phase: 'intermission',
    intermissionTimer: INTERMISSION_SECONDS,
    spawnTimer: 0,
    spawnLeft: 0,
    elapsed: 0,
    playTime: 0,
    shake: 0,
    bossName: '',
  };

  function free(pool) {
    for (let index = 0; index < pool.length; index += 1) if (!pool[index].active) return pool[index];
    return null;
  }

  function burst(x, y, color, count, speed) {
    for (let index = 0; index < count; index += 1) {
      const particle = free(particles);
      if (particle === null) return;
      const angle = random() * Math.PI * 2;
      const velocity = speed * (0.3 + random() * 0.7);
      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.vx = Math.cos(angle) * velocity;
      particle.vy = Math.sin(angle) * velocity;
      particle.maxLife = 0.4 + random() * 0.4;
      particle.life = particle.maxLife;
      particle.size = 2 + random() * 3;
      particle.color = color;
    }
  }

  function floatText(x, y, text, color) {
    const item = free(texts);
    if (item === null) return;
    item.active = true;
    item.x = x;
    item.y = y;
    item.life = 0.9;
    item.text = text;
    item.color = color;
  }

  function reset() {
    player.x = LIGHTHOUSE.x;
    player.y = LIGHTHOUSE.y + 120;
    player.hp = PLAYER.maxHp;
    player.maxHp = PLAYER.maxHp;
    player.fireTimer = 0;
    player.invulnerable = 0;
    player.aimAngle = -Math.PI / 2;
    player.upgrades = { damage: 0, rapid: 0, swift: 0, glass: 0, twin: 0 };
    lighthouse.hp = LIGHTHOUSE.maxHp;
    for (const enemy of enemies) enemy.active = false;
    for (const bullet of bullets) bullet.active = false;
    for (const orb of orbs) orb.active = false;
    for (const ember of embers) ember.active = false;
    for (const particle of particles) particle.active = false;
    for (const item of texts) item.active = false;
    state.score = 0;
    state.embersHeld = 0;
    state.kills = 0;
    state.wave = 0;
    state.phase = 'intermission';
    state.intermissionTimer = INTERMISSION_SECONDS;
    state.spawnTimer = 0;
    state.spawnLeft = 0;
    state.elapsed = 0;
    state.playTime = 0;
    state.shake = 0;
    state.bossName = '';
    // A few moths drift across the island behind the title screen.
    for (let index = 0; index < 6; index += 1) spawnEnemy('moth', true);
  }

  function edgePoint() {
    const side = Math.floor(random() * 4);
    if (side === 0) return { x: random() * FIELD.width, y: -30 };
    if (side === 1) return { x: FIELD.width + 30, y: random() * FIELD.height };
    if (side === 2) return { x: random() * FIELD.width, y: FIELD.height + 30 };
    return { x: -30, y: random() * FIELD.height };
  }

  function spawnEnemy(kind, ambient) {
    const enemy = free(enemies);
    if (enemy === null) return null;
    const def = ENEMY[kind];
    const point = ambient ? { x: random() * FIELD.width, y: random() * FIELD.height } : edgePoint();
    enemy.active = true;
    enemy.kind = kind;
    enemy.x = point.x;
    enemy.y = point.y;
    enemy.maxHp = def.hp;
    enemy.hp = def.hp;
    enemy.radius = def.radius;
    enemy.speed = def.speed * (0.9 + random() * 0.2);
    enemy.damage = def.damage;
    enemy.score = def.score;
    enemy.embers = def.embers;
    enemy.phase = random() * Math.PI * 2;
    enemy.attackTimer = 0;
    enemy.spawnTimer = kind === 'queen' ? 5 : kind === 'gloom' ? 7 : 0;
    enemy.burstTimer = kind === 'queen' ? 3.5 : 0;
    return enemy;
  }

  function startWave(wave) {
    const comp = waveComp(wave);
    let count = 0;
    for (let index = 0; index < comp.moths; index += 1) spawnQueue[count++] = 'moth';
    for (let index = 0; index < comp.wisps; index += 1) spawnQueue[count++] = 'wisp';
    for (let index = 0; index < comp.beetles; index += 1) spawnQueue[count++] = 'beetle';
    if (comp.boss) spawnQueue[count++] = comp.boss;
    // Shuffle the queue so the wave never arrives in one tidy kind at a time.
    for (let index = count - 1; index > 0; index -= 1) {
      const other = Math.floor(random() * (index + 1));
      const temp = spawnQueue[index];
      spawnQueue[index] = spawnQueue[other];
      spawnQueue[other] = temp;
    }
    state.wave = wave;
    state.phase = 'wave';
    state.spawnLeft = count;
    state.spawnTimer = 0.5;
    state.bossName = comp.boss === 'queen' ? 'The Moth Queen' : comp.boss === 'gloom' ? 'The Gloom Moth' : '';
  }

  function dropEmbers(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      const ember = free(embers);
      if (ember === null) return;
      const angle = random() * Math.PI * 2;
      ember.active = true;
      ember.x = x;
      ember.y = y;
      ember.vx = Math.cos(angle) * (30 + random() * 60);
      ember.vy = Math.sin(angle) * (30 + random() * 60);
      ember.value = 1;
    }
  }

  function killEnemy(enemy, events) {
    enemy.active = false;
    state.kills += 1;
    state.score += enemy.score;
    dropEmbers(enemy.x, enemy.y, enemy.embers);
    burst(enemy.x, enemy.y, ENEMY[enemy.kind].color, enemy.kind === 'queen' || enemy.kind === 'gloom' ? 40 : 12, 160);
    floatText(enemy.x, enemy.y - enemy.radius, `+${enemy.score}`, '#ffd76a');
    return events | EVENT_KILL;
  }

  function fireBolt(angle, damage) {
    const bullet = free(bullets);
    if (bullet === null) return false;
    bullet.active = true;
    bullet.x = player.x + Math.cos(angle) * (PLAYER.radius + 6);
    bullet.y = player.y + Math.sin(angle) * (PLAYER.radius + 6);
    bullet.vx = Math.cos(angle) * PLAYER.bulletSpeed;
    bullet.vy = Math.sin(angle) * PLAYER.bulletSpeed;
    bullet.damage = damage;
    return true;
  }

  function playerSpeed() {
    return PLAYER.speed * (1 + 0.12 * player.upgrades.swift);
  }

  function fireInterval() {
    return PLAYER.fireInterval / (1 + 0.25 * player.upgrades.rapid);
  }

  function boltDamage() {
    return PLAYER.damage + player.upgrades.damage;
  }

  function boltCount() {
    return 1 + player.upgrades.twin;
  }

  /** Buy a shop upgrade by index; returns true when the purchase went through. */
  function buyUpgrade(index) {
    if (state.phase !== 'intermission' || index < 0 || index >= SHOP.length) return false;
    const item = SHOP[index];
    const owned = item.id === 'repair' ? 0 : player.upgrades[item.id];
    if (item.max !== 99 && owned >= item.max) return false;
    const cost = shopCost(item, item.id === 'repair' ? Math.floor((LIGHTHOUSE.maxHp - lighthouse.hp) / 30) : owned);
    if (state.embersHeld < cost) return false;
    state.embersHeld -= cost;
    if (item.id === 'repair') {
      lighthouse.hp = Math.min(LIGHTHOUSE.maxHp, lighthouse.hp + 30);
    } else if (item.id === 'glass') {
      player.maxHp += 25;
      player.hp = Math.min(player.maxHp, player.hp + 25);
      player.upgrades.glass += 1;
    } else {
      player.upgrades[item.id] += 1;
    }
    burst(player.x, player.y, '#ffd76a', 16, 120);
    return true;
  }

  function aliveEnemies() {
    let count = 0;
    for (const enemy of enemies) if (enemy.active) count += 1;
    return count;
  }

  function nearestEnemy(x, y) {
    let best = null;
    let bestDistance = Infinity;
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = enemy;
      }
    }
    return best;
  }

  /**
   * One fixed step. `input` is { move: {x, y}, aimAngle, firing }. With `harmless` set (the
   * title screen's backdrop) moths drift but nothing can be hurt and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (state.phase === 'wave') state.playTime += dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.8);

    // The keeper moves, kept on the island and out of the lighthouse's stone base.
    const speed = playerSpeed();
    player.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, player.x + input.move.x * speed * dt));
    player.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, player.y + input.move.y * speed * dt));
    const fromLight = Math.hypot(player.x - LIGHTHOUSE.x, player.y - LIGHTHOUSE.y);
    const minDistance = LIGHTHOUSE.radius + PLAYER.radius + 4;
    if (fromLight < minDistance && fromLight > 0) {
      player.x = LIGHTHOUSE.x + ((player.x - LIGHTHOUSE.x) / fromLight) * minDistance;
      player.y = LIGHTHOUSE.y + ((player.y - LIGHTHOUSE.y) / fromLight) * minDistance;
    }
    player.aimAngle = input.aimAngle;
    if (player.invulnerable > 0) player.invulnerable = Math.max(0, player.invulnerable - dt);

    // Firing: one bolt per interval, more bolts with the Twin Flame upgrade.
    player.fireTimer -= dt;
    if (input.firing && player.fireTimer <= 0 && !harmless) {
      const count = boltCount();
      const spread = 0.14;
      let fired = false;
      for (let index = 0; index < count; index += 1) {
        const offset = (index - (count - 1) / 2) * spread;
        if (fireBolt(player.aimAngle + offset, boltDamage())) fired = true;
      }
      if (fired) {
        player.fireTimer = fireInterval();
        events |= EVENT_SHOOT;
      }
    }

    if (state.phase === 'intermission') {
      state.intermissionTimer -= dt;
      if (harmless) {
        // The title screen's backdrop: keep a few moths drifting across the island.
        state.spawnTimer -= dt;
        if (aliveEnemies() < 6 && state.spawnTimer <= 0) {
          spawnEnemy('moth', true);
          state.spawnTimer = 1.2;
        }
      } else if (state.intermissionTimer <= 0) {
        startWave(state.wave + 1);
        if (state.bossName) events |= EVENT_BOSS;
      }
    } else if (state.phase === 'wave') {
      state.spawnTimer -= dt;
      if (state.spawnLeft > 0 && state.spawnTimer <= 0) {
        state.spawnLeft -= 1;
        const kind = spawnQueue[state.spawnLeft];
        const spawned = spawnEnemy(kind, false);
        if (spawned && (kind === 'queen' || kind === 'gloom')) events |= EVENT_BOSS;
        state.spawnTimer += spawnInterval(state.wave);
      }
      if (state.spawnLeft === 0 && aliveEnemies() === 0) {
        const bonus = 50 * state.wave;
        state.score += bonus;
        floatText(LIGHTHOUSE.x, LIGHTHOUSE.y - 70, `Wave ${state.wave} clear! +${bonus}`, '#7fe3d0');
        if (state.wave >= WAVES) {
          state.phase = 'won';
          events |= EVENT_WIN;
        } else {
          state.phase = 'intermission';
          state.intermissionTimer = INTERMISSION_SECONDS;
          events |= EVENT_WAVE_CLEAR;
        }
      }
    }

    // Enemies: drift toward the light, or toward the keeper when he is close; wisps weave.
    for (let index = 0; index < enemies.length; index += 1) {
      const enemy = enemies[index];
      if (!enemy.active) continue;
      const toPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      const targetX = toPlayer < 150 ? player.x : LIGHTHOUSE.x;
      const targetY = toPlayer < 150 ? player.y : LIGHTHOUSE.y;
      let dx = targetX - enemy.x;
      let dy = targetY - enemy.y;
      const distance = Math.hypot(dx, dy) || 1;
      dx /= distance;
      dy /= distance;
      if (enemy.kind === 'wisp') {
        const wobble = Math.sin(state.elapsed * 3.2 + enemy.phase) * 0.7;
        const px = -dy;
        const py = dx;
        dx += px * wobble;
        dy += py * wobble;
        const length = Math.hypot(dx, dy) || 1;
        dx /= length;
        dy /= length;
      }
      enemy.x += dx * enemy.speed * dt;
      enemy.y += dy * enemy.speed * dt;
      if (enemy.attackTimer > 0) enemy.attackTimer -= dt;

      // Bosses call for help and throw dark orbs.
      if ((enemy.kind === 'queen' || enemy.kind === 'gloom') && !harmless) {
        enemy.spawnTimer -= dt;
        if (enemy.spawnTimer <= 0) {
          const count = enemy.kind === 'queen' ? 3 : 2;
          for (let spawn = 0; spawn < count; spawn += 1) {
            const moth = spawnEnemy('moth', false);
            if (moth) {
              moth.x = enemy.x + (random() - 0.5) * 80;
              moth.y = enemy.y + (random() - 0.5) * 80;
            }
          }
          enemy.spawnTimer = enemy.kind === 'queen' ? 5 : 7;
        }
        if (enemy.kind === 'queen') {
          enemy.burstTimer -= dt;
          if (enemy.burstTimer <= 0) {
            enemy.burstTimer = 3.5;
            for (let orb = 0; orb < 8; orb += 1) {
              const shot = free(orbs);
              if (shot === null) break;
              const angle = (orb / 8) * Math.PI * 2 + random() * 0.3;
              shot.active = true;
              shot.x = enemy.x;
              shot.y = enemy.y;
              shot.vx = Math.cos(angle) * 150;
              shot.vy = Math.sin(angle) * 150;
              shot.damage = 8;
              shot.life = 6;
            }
            burst(enemy.x, enemy.y, '#e8b4ff', 10, 100);
          }
        }
      }

      // Reaching the lighthouse snuffs a little of the light — and burns the moth out.
      if (overlaps(enemy.x, enemy.y, enemy.radius, LIGHTHOUSE.x, LIGHTHOUSE.y, LIGHTHOUSE.radius)) {
        enemy.active = false;
        burst(enemy.x, enemy.y, '#ffd76a', 14, 140);
        if (!harmless) {
          lighthouse.hp -= enemy.damage;
          state.shake = 0.5;
          events |= EVENT_LIGHT_HIT;
          if (lighthouse.hp <= 0) {
            lighthouse.hp = 0;
            state.phase = 'over';
            events |= EVENT_OVER;
          }
        }
        continue;
      }
      // Touching the keeper hurts him, and knocks the moth back.
      if (!harmless && enemy.attackTimer <= 0 && overlaps(enemy.x, enemy.y, enemy.radius, player.x, player.y, PLAYER.radius)) {
        enemy.attackTimer = 0.9;
        enemy.x -= dx * 34;
        enemy.y -= dy * 34;
        if (player.invulnerable === 0) {
          player.hp -= enemy.damage;
          player.invulnerable = PLAYER.invulnerable;
          state.shake = 0.35;
          burst(player.x, player.y, '#ff6b6b', 12, 150);
          events |= EVENT_HIT;
          if (player.hp <= 0) {
            player.hp = 0;
            state.phase = 'over';
            events |= EVENT_OVER;
          }
        }
      }
    }

    // Gentle separation so moths do not pile into one dot.
    for (let a = 0; a < enemies.length; a += 1) {
      const first = enemies[a];
      if (!first.active) continue;
      for (let b = a + 1; b < enemies.length; b += 1) {
        const second = enemies[b];
        if (!second.active) continue;
        const dx = second.x - first.x;
        const dy = second.y - first.y;
        const distance = Math.hypot(dx, dy);
        const min = first.radius + second.radius - 2;
        if (distance > 0 && distance < min) {
          const push = ((min - distance) / 2 / distance) * 0.5;
          first.x -= dx * push;
          first.y -= dy * push;
          second.x += dx * push;
          second.y += dy * push;
        }
      }
    }

    // Bolts fly, and burst whatever moth they touch.
    for (let index = 0; index < bullets.length; index += 1) {
      const bullet = bullets[index];
      if (!bullet.active) continue;
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < -20 || bullet.x > FIELD.width + 20 || bullet.y < -20 || bullet.y > FIELD.height + 20) {
        bullet.active = false;
        continue;
      }
      for (let other = 0; other < enemies.length; other += 1) {
        const enemy = enemies[other];
        if (!enemy.active) continue;
        if (overlaps(bullet.x, bullet.y, PLAYER.bulletRadius, enemy.x, enemy.y, enemy.radius)) {
          bullet.active = false;
          enemy.hp -= bullet.damage;
          burst(bullet.x, bullet.y, '#ffe9a8', 4, 90);
          if (enemy.hp <= 0) events = killEnemy(enemy, events);
          else events |= EVENT_TICK;
          break;
        }
      }
    }

    // Dark orbs drift on, hurting keeper or lighthouse, then fade.
    for (let index = 0; index < orbs.length; index += 1) {
      const orb = orbs[index];
      if (!orb.active) continue;
      orb.x += orb.vx * dt;
      orb.y += orb.vy * dt;
      orb.life -= dt;
      if (orb.life <= 0 || orb.x < -20 || orb.x > FIELD.width + 20 || orb.y < -20 || orb.y > FIELD.height + 20) {
        orb.active = false;
        continue;
      }
      if (!harmless && overlaps(orb.x, orb.y, 8, player.x, player.y, PLAYER.radius) && player.invulnerable === 0) {
        orb.active = false;
        player.hp -= orb.damage;
        player.invulnerable = PLAYER.invulnerable;
        events |= EVENT_HIT;
        if (player.hp <= 0) {
          player.hp = 0;
          state.phase = 'over';
          events |= EVENT_OVER;
        }
        continue;
      }
      if (!harmless && overlaps(orb.x, orb.y, 8, LIGHTHOUSE.x, LIGHTHOUSE.y, LIGHTHOUSE.radius)) {
        orb.active = false;
        lighthouse.hp -= orb.damage;
        state.shake = 0.4;
        events |= EVENT_LIGHT_HIT;
        if (lighthouse.hp <= 0) {
          lighthouse.hp = 0;
          state.phase = 'over';
          events |= EVENT_OVER;
        }
      }
    }

    // Embers drift, then fly to the keeper when he comes near.
    for (let index = 0; index < embers.length; index += 1) {
      const ember = embers[index];
      if (!ember.active) continue;
      const dx = player.x - ember.x;
      const dy = player.y - ember.y;
      const distance = Math.hypot(dx, dy) || 1;
      if (distance < PLAYER.pickupRadius) {
        ember.vx += (dx / distance) * 900 * dt;
        ember.vy += (dy / distance) * 900 * dt;
      } else {
        ember.vx *= 1 - 2 * dt;
        ember.vy *= 1 - 2 * dt;
      }
      ember.x += ember.vx * dt;
      ember.y += ember.vy * dt;
      if (distance < PLAYER.collectRadius) {
        ember.active = false;
        state.embersHeld += ember.value;
        state.score += 1;
        events |= EVENT_PICKUP;
      }
    }

    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      if (!particle.active) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 1 - 2.5 * dt;
      particle.vy *= 1 - 2.5 * dt;
    }
    for (let index = 0; index < texts.length; index += 1) {
      const item = texts[index];
      if (!item.active) continue;
      item.life -= dt;
      item.y -= 34 * dt;
      if (item.life <= 0) item.active = false;
    }

    return events;
  }

  reset();
  return { state, reset, step, startWave, buyUpgrade, aliveEnemies, nearestEnemy, playerSpeed, fireInterval, boltDamage, boltCount };
}
