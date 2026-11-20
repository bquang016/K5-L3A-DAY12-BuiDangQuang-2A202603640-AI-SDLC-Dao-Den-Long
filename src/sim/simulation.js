import {
  DEFAULT_TUNING,
  DT,
  GRAVITY,
  INITIAL_MOTE_COUNT,
  INITIAL_SHADE_COUNT,
  ISLAND_PLAYABLE_RADIUS,
  JUMP_VELOCITY,
  MOTE_REPLENISH_INTERVAL_TICKS,
  NIGHT1_LANTERNS,
  SHADE_SPAWN_INTERVAL_TICKS
} from './config.js';
import { clampToCircleXZ, distXZ, rotateMove, round3, roundPos3 } from './math.js';
import { createRng } from './prng.js';

function cloneTuning(tuning) {
  return {
    ...tuning,
    score: { ...tuning.score }
  };
}

/**
 * Pure 60Hz deterministic simulation for Đảo Đèn Lồng (Night 1 - Đảo Bến).
 * Completely independent from Three.js, DOM, wall-clock, or Math.random().
 */
export class LanternIslandSim {
  constructor({ seed = 1, night = 1, scenario = null, tuning = DEFAULT_TUNING } = {}) {
    this.seed = seed;
    this.night = night;
    this.tuning = cloneTuning(tuning);
    this.rng = createRng(seed);

    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing';
    this.score = 0;
    this.scoreBreakdown = {
      motes: 0,
      lanterns: 0,
      stuns: 0,
      timeBonus: 0,
      flameBonus: 0
    };

    this.prevButtons = { jump: false, interact: false, pulse: false };

    this.player = {
      pos: [0, 0, 0],
      flames: this.tuning.flames,
      carried: 0,
      vy: 0,
      grounded: true,
      invulnTicks: 0,
      pulseCooldownTicks: 0,
      facingYawDeg: 0
    };

    this.lanterns = NIGHT1_LANTERNS.map((l) => ({
      id: l.id,
      pos: [...l.pos],
      lit: false,
      deposited: 0
    }));

    this._nextMoteIndex = 1;
    this._usedMoteIds = new Set();
    this._nextShadeIndex = 1;
    this._usedShadeIds = new Set();

    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;

    this.motes = [];
    this.shades = [];

    this._applyScenario(scenario);

    this.initialTimeLeftS = scenario?.time_left_s ?? this.tuning.night1_duration_s;
    this.timeLeftS = this.initialTimeLeftS;

    this.effectiveBoundary = this._computeEffectiveBoundary();
  }

  _allocateMoteId() {
    while (this._usedMoteIds.has(`M${this._nextMoteIndex}`)) {
      this._nextMoteIndex += 1;
    }
    const id = `M${this._nextMoteIndex++}`;
    this._usedMoteIds.add(id);
    return id;
  }

  _allocateShadeId() {
    while (this._usedShadeIds.has(`S${this._nextShadeIndex}`)) {
      this._nextShadeIndex += 1;
    }
    const id = `S${this._nextShadeIndex++}`;
    this._usedShadeIds.add(id);
    return id;
  }

  _applyScenario(scenario) {
    if (scenario?.player) {
      if (scenario.player.pos) {
        this.player.pos = [...scenario.player.pos];
        this.player.grounded = this.player.pos[1] <= 0;
      }
      if (scenario.player.carried !== undefined) {
        this.player.carried = scenario.player.carried;
      }
      if (scenario.player.flames !== undefined) {
        this.player.flames = scenario.player.flames;
      }
    }

    if (scenario?.lanterns) {
      for (const override of scenario.lanterns) {
        const target = this.lanterns.find((l) => l.id === override.id);
        if (!target) continue;
        if (override.pos) {
          target.pos = [...override.pos];
        }
        if (override.deposited !== undefined) {
          target.deposited = override.deposited;
        }
        if (override.lit !== undefined) {
          target.lit = override.lit;
          if (override.lit && override.deposited === undefined) {
            target.deposited = Math.max(target.deposited, this.tuning.lantern_cost);
          }
        } else if (override.deposited !== undefined && override.deposited >= this.tuning.lantern_cost) {
          target.lit = true;
        }
      }
    }

    if (scenario?.motes !== undefined) {
      for (const item of scenario.motes) {
        if (Array.isArray(item)) {
          this.motes.push({ id: this._allocateMoteId(), pos: [item[0], item[1], item[2]] });
        } else {
          const id = item.id ?? this._allocateMoteId();
          this._usedMoteIds.add(id);
          this.motes.push({ id, pos: [item.pos[0], item.pos[1], item.pos[2]] });
        }
      }
    } else if (this.randomMotes) {
      for (let i = 0; i < INITIAL_MOTE_COUNT; i += 1) {
        this.motes.push({ id: this._allocateMoteId(), pos: this._sampleMotePos() });
      }
    }

    if (scenario?.shades !== undefined) {
      for (const item of scenario.shades) {
        const id = item.id ?? this._allocateShadeId();
        this._usedShadeIds.add(id);
        this.shades.push({
          id,
          pos: [item.pos[0], item.pos[1], item.pos[2]],
          state: 'chase',
          stunTicks: 0
        });
      }
    } else if (this.randomShades) {
      for (let i = 0; i < INITIAL_SHADE_COUNT; i += 1) {
        this.shades.push({
          id: this._allocateShadeId(),
          pos: this._sampleShadePos(30, 38, 12),
          state: 'chase',
          stunTicks: 0
        });
      }
    }
  }

  _computeEffectiveBoundary() {
    let maxR = 0;
    const points = [
      this.player.pos,
      ...this.lanterns.map((l) => l.pos),
      ...this.motes.map((m) => m.pos),
      ...this.shades.map((s) => s.pos)
    ];
    for (const p of points) {
      const r = Math.hypot(p[0], p[2]);
      if (r > maxR) maxR = r;
    }
    return Math.max(ISLAND_PLAYABLE_RADIUS, maxR + 20);
  }

  _sampleMotePos() {
    const minPlayerDist = this.tuning.pickup_radius + 2;
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(5, 40);
      const pos = [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
      if (distXZ(pos, this.player.pos) > minPlayerDist) {
        return pos;
      }
    }
    const angle = this.rng.range(0, Math.PI * 2);
    const radius = this.rng.range(12, 40);
    return [Math.cos(angle) * radius, 0, Math.sin(angle) * radius];
  }

  _isOutsideLitLanterns(pos, margin = 0) {
    const threshold = this.tuning.safe_radius + margin;
    for (const l of this.lanterns) {
      if (l.lit && distXZ(pos, l.pos) < threshold) {
        return false;
      }
    }
    return true;
  }

  _sampleShadePos(minR, maxR, minPlayerDist) {
    let fallback = [minR, 1.0, 0];
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const angle = this.rng.range(0, Math.PI * 2);
      const radius = this.rng.range(minR, maxR);
      const candidate = [Math.cos(angle) * radius, 1.0, Math.sin(angle) * radius];
      fallback = candidate;
      if (distXZ(candidate, this.player.pos) >= minPlayerDist && this._isOutsideLitLanterns(candidate, 1)) {
        return candidate;
      }
    }
    this._projectOutsideLitLanterns(fallback);
    clampToCircleXZ(fallback, this.effectiveBoundary);
    return fallback;
  }

  _projectOutsideLitLanterns(pos) {
    const safeR = this.tuning.safe_radius;
    for (let pass = 0; pass < 2; pass += 1) {
      for (const l of this.lanterns) {
        if (!l.lit) continue;
        let dx = pos[0] - l.pos[0];
        let dz = pos[2] - l.pos[2];
        let d = Math.hypot(dx, dz);
        if (d < safeR) {
          if (d < 1e-9) {
            dx = 1;
            dz = 0;
            d = 1;
          }
          pos[0] = l.pos[0] + (dx / d) * safeR;
          pos[2] = l.pos[2] + (dz / d) * safeR;
        }
      }
    }
  }

  step(input = {}) {
    if (this.state !== 'playing') {
      return [];
    }

    this.tick += 1;
    this.simTick += 1;
    const events = [];
    const emit = (name, data) => {
      events.push({ type: 'event', tick: this.tick, name, data });
    };

    const jumpBtn = Boolean(input.jump);
    const interactBtn = Boolean(input.interact);
    const pulseBtn = Boolean(input.pulse);

    const jumpPressed = jumpBtn && !this.prevButtons.jump;
    const interactPressed = interactBtn && !this.prevButtons.interact;
    const pulsePressed = pulseBtn && !this.prevButtons.pulse;

    this.prevButtons.jump = jumpBtn;
    this.prevButtons.interact = interactBtn;
    this.prevButtons.pulse = pulseBtn;

    // 1. Cooldowns & stun timers
    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.pulseCooldownTicks > 0) this.player.pulseCooldownTicks -= 1;

    for (const shade of this.shades) {
      if (shade.stunTicks > 0) {
        shade.stunTicks -= 1;
        if (shade.stunTicks <= 0) {
          shade.stunTicks = 0;
          shade.state = 'chase';
        }
      }
    }

    // 2. Player movement & jump
    const moveVec = rotateMove(input.move ?? [0, 0], input.cam_yaw_deg ?? 0);
    if (moveVec[0] !== 0 || moveVec[1] !== 0) {
      this.player.pos[0] += moveVec[0] * this.tuning.player_speed * DT;
      this.player.pos[2] += moveVec[1] * this.tuning.player_speed * DT;
      this.player.facingYawDeg = (Math.atan2(moveVec[0], moveVec[1]) * 180) / Math.PI;
      clampToCircleXZ(this.player.pos, this.effectiveBoundary);
    }

    if (jumpPressed && this.player.grounded) {
      this.player.vy = JUMP_VELOCITY;
      this.player.grounded = false;
    }
    if (!this.player.grounded || this.player.pos[1] > 0) {
      this.player.vy -= GRAVITY * DT;
      this.player.pos[1] += this.player.vy * DT;
      if (this.player.pos[1] <= 0) {
        this.player.pos[1] = 0;
        this.player.vy = 0;
        this.player.grounded = true;
      }
    }

    // 3. Mote pickup
    if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
      const pickupR = this.tuning.pickup_radius + 1e-9;
      for (let i = 0; i < this.motes.length; ) {
        if (this.player.carried >= this.tuning.carry_capacity) break;
        if (distXZ(this.player.pos, this.motes[i].pos) <= pickupR) {
          this.motes.splice(i, 1);
          this.player.carried += 1;
          this.score += this.tuning.score.per_mote;
          this.scoreBreakdown.motes += this.tuning.score.per_mote;
          emit('mote_picked', { carried: this.player.carried });
        } else {
          i += 1;
        }
      }
    }

    // 4. Interact (deposit into closest unlit lantern in interact_radius)
    if (interactPressed && this.player.carried > 0) {
      const candidates = [];
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(this.player.pos, l.pos);
        if (d <= this.tuning.interact_radius + 1e-9) {
          candidates.push({ lantern: l, dist: d });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.dist - b.dist || a.lantern.id.localeCompare(b.lantern.id));
        const target = candidates[0].lantern;
        const needed = Math.max(0, this.tuning.lantern_cost - target.deposited);
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          target.deposited += amount;
          emit('deposit', { lantern_id: target.id, amount, deposited: target.deposited });
          if (target.deposited >= this.tuning.lantern_cost && !target.lit) {
            target.lit = true;
            this.score += this.tuning.score.per_lantern;
            this.scoreBreakdown.lanterns += this.tuning.score.per_lantern;
            emit('lantern_lit', { lantern_id: target.id });
          }
        }
      }
    }

    // 5. Pulse
    if (pulsePressed && this.player.carried >= this.tuning.pulse_cost && this.player.pulseCooldownTicks <= 0) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCooldownTicks = Math.round(this.tuning.pulse_cooldown_s * 60);
      const stunnedIds = [];
      const stunTicks = Math.round(this.tuning.pulse_stun_s * 60);
      const pulseR = this.tuning.pulse_radius + 1e-9;

      for (const shade of this.shades) {
        if (distXZ(this.player.pos, shade.pos) <= pulseR) {
          stunnedIds.push(shade.id);
          shade.state = 'stunned';
          shade.stunTicks = stunTicks;

          let dx = shade.pos[0] - this.player.pos[0];
          let dz = shade.pos[2] - this.player.pos[2];
          let d = Math.hypot(dx, dz);
          if (d < 1e-9) {
            dx = 1;
            dz = 0;
            d = 1;
          }
          shade.pos[0] += (dx / d) * this.tuning.pulse_push_m;
          shade.pos[2] += (dz / d) * this.tuning.pulse_push_m;
          this._projectOutsideLitLanterns(shade.pos);
          clampToCircleXZ(shade.pos, this.effectiveBoundary);

          this.score += this.tuning.score.per_stun;
          this.scoreBreakdown.stuns += this.tuning.score.per_stun;
        }
      }

      emit('pulse', { stunned_ids: stunnedIds });
    }

    // 6. Time update & Win check
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.tick / 60);
    if (this.lanterns.every((l) => l.lit)) {
      const timeBonus = Math.floor(this.timeLeftS) * this.tuning.score.per_second_left;
      const flameBonus = this.player.flames * this.tuning.score.per_flame_left;
      this.scoreBreakdown.timeBonus = timeBonus;
      this.scoreBreakdown.flameBonus = flameBonus;
      this.score += timeBonus + flameBonus;
      this.state = 'won';
      emit('game_over', { result: 'won', reason: 'all_lit' });
      return events;
    }

    // 7. Shade movement & safe-zone enforcement
    const shadeStep = this.tuning.shade_speed * DT;
    const safeR = this.tuning.safe_radius;

    for (const shade of this.shades) {
      if (shade.state === 'stunned') continue;

      let fleeX = 0;
      let fleeZ = 0;
      let violating = false;

      for (const l of this.lanterns) {
        if (!l.lit) continue;
        const dx = shade.pos[0] - l.pos[0];
        const dz = shade.pos[2] - l.pos[2];
        const d = Math.hypot(dx, dz);
        if (d < safeR - 1e-6) {
          violating = true;
          if (d < 1e-9) {
            fleeX += 1;
          } else {
            fleeX += dx / d;
            fleeZ += dz / d;
          }
        }
      }

      if (violating) {
        shade.state = 'flee';
        let fLen = Math.hypot(fleeX, fleeZ);
        if (fLen < 1e-9) {
          fleeX = 1;
          fleeZ = 0;
          fLen = 1;
        }
        shade.pos[0] += (fleeX / fLen) * shadeStep;
        shade.pos[2] += (fleeZ / fLen) * shadeStep;
        clampToCircleXZ(shade.pos, this.effectiveBoundary);
      } else {
        shade.state = 'chase';
        const dx = this.player.pos[0] - shade.pos[0];
        const dz = this.player.pos[2] - shade.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-9) {
          const moveDist = Math.min(shadeStep, d);
          shade.pos[0] += (dx / d) * moveDist;
          shade.pos[2] += (dz / d) * moveDist;
        }
        this._projectOutsideLitLanterns(shade.pos);
        clampToCircleXZ(shade.pos, this.effectiveBoundary);
      }
    }

    // 8. Shade-player hit check
    if (this.player.invulnTicks <= 0) {
      const hitR = this.tuning.shade_hit_radius + 1e-9;
      for (const shade of this.shades) {
        if (shade.state === 'stunned') continue;
        if (distXZ(this.player.pos, shade.pos) <= hitR) {
          this.player.flames = Math.max(0, this.player.flames - 1);
          this.player.invulnTicks = Math.round(this.tuning.invuln_s * 60);
          const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
          this.player.carried -= dropped;
          emit('player_hit', {
            by: 'shade',
            flames: this.player.flames,
            dropped
          });
          if (this.player.flames <= 0) {
            this.state = 'lost';
            emit('game_over', { result: 'lost', reason: 'no_flames' });
            return events;
          }
          break;
        }
      }
    }

    // 9. Random spawners (only if enabled)
    if (this.randomMotes && this.tick % MOTE_REPLENISH_INTERVAL_TICKS === 0 && this.motes.length < INITIAL_MOTE_COUNT) {
      this.motes.push({
        id: this._allocateMoteId(),
        pos: this._sampleMotePos()
      });
    }

    if (this.randomShades && this.tick % SHADE_SPAWN_INTERVAL_TICKS === 0) {
      const litCount = this.lanterns.filter((l) => l.lit).length;
      const maxShades = Math.min(6, 3 + litCount);
      if (this.shades.length < maxShades) {
        const id = this._allocateShadeId();
        const pos = this._sampleShadePos(36, 42, 15);
        this.shades.push({ id, pos, state: 'chase', stunTicks: 0 });
        emit('shade_spawned', { id });
      }
    }

    // 10. Dawn check
    if (this.timeLeftS <= 1e-9) {
      this.timeLeftS = 0;
      this.state = 'lost';
      emit('game_over', { result: 'lost', reason: 'dawn' });
    }

    return events;
  }

  getSnapshot() {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      player: {
        pos: roundPos3(this.player.pos),
        flames: this.player.flames,
        carried: this.player.carried
      },
      lanterns: this.lanterns.map((l) => ({
        id: l.id,
        pos: roundPos3(l.pos),
        lit: l.lit,
        deposited: l.deposited
      })),
      shades: this.shades.map((s) => ({
        id: s.id,
        pos: roundPos3(s.pos),
        state: s.state
      })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundPos3(m.pos)
      }))
    };
  }

  getEndRecord() {
    return {
      type: 'end',
      ticks: this.tick,
      state: this.state,
      score: this.score
    };
  }
}
