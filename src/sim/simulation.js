import {
  CHARM_DURATION_TICKS,
  CHARM_RESPAWN_TICKS,
  CHARM_SPEED,
  DEFAULT_TUNING,
  DRIFTER_CHASE_SPEED,
  DRIFTER_DETECT_RADIUS,
  DRIFTER_DROP_FLEE_TICKS,
  DRIFTER_FLEE_SPEED,
  DRIFTER_FLEE_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_COUNT,
  DRIFTER_MAX_STEAL,
  DRIFTER_MIN_CARRIED,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_STEAL_RADIUS,
  DROPPED_MOTE_TTL_TICKS,
  DT,
  FALL_Y_THRESHOLD,
  GRAVITY,
  JUMP_VELOCITY,
  MOTE_INITIAL_COUNT,
  MOTE_MAX_COUNT,
  MOTE_SPAWN_INTERVAL_TICKS,
  PULSE_CENTER_Y_OFFSET,
  PULSE_PUSH_TICKS,
  RESPAWN_WAIT_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SHADE_DETECT_RADIUS,
  SHADE_FIRST_SPAWN_TICK,
  SHADE_LEASH_RADIUS,
  SHADE_RECOIL_M,
  SHADE_RECOIL_TICKS,
  SHADE_SPAWN_DELAY_TICKS,
  WIND_DURATION_TICKS,
  WIND_INTERVAL_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARNING_TICKS
} from './config.js';
import { getMapConfig, getSurfaceHeight, resolveHorizontalMove } from './maps.js';
import { distXZ, rotateMove, round3, roundPos3 } from './math.js';
import { createRng } from './prng.js';

function cloneTuning(tuning) {
  return {
    ...tuning,
    score: { ...tuning.score }
  };
}

function dist3D(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function idSortKey(a, b) {
  const ma = /^([A-Za-z]+)(\d+)$/.exec(a.id);
  const mb = /^([A-Za-z]+)(\d+)$/.exec(b.id);
  if (ma && mb && ma[1] === mb[1]) {
    return Number.parseInt(ma[2], 10) - Number.parseInt(mb[2], 10);
  }
  return a.id.localeCompare(b.id);
}

/**
 * Pure 60Hz deterministic simulation for Đảo Đèn Lồng (Contract v1.1, Nights 1-3).
 */
export class LanternIslandSim {
  constructor({ seed = 1, night = 1, scenario = null, tuning = DEFAULT_TUNING } = {}) {
    this.seed = seed;
    this.night = night;
    this.tuning = cloneTuning(tuning);
    this.map = getMapConfig(night);
    this.rng = createRng(seed);

    this.tick = 0;
    this.simTick = 0;
    this.state = 'playing';
    this.score = 0;
    this.scoreBreakdown = {
      deposits: 0,
      lanterns: 0,
      stuns: 0,
      timeBonus: 0,
      flameBonus: 0
    };

    this.prevButtons = {
      jump: false,
      interact: false,
      pulse: false,
      dash: false,
      pause: false
    };

    const spawn = this.map.spawnPos;
    this.player = {
      pos: [spawn[0], spawn[1], spawn[2]],
      vel: [0, 0, 0],
      grounded: true,
      flames: this.tuning.flames,
      carried: 0,
      invulnTicks: 0,
      dashCdTicks: 0,
      dashActiveTicks: 0,
      dashDir: [0, 1],
      pulseCdTicks: 0,
      charmTicks: 0,
      respawnWaitTicks: 0,
      launched: false,
      launchVelXZ: [0, 0],
      facingDir: [0, 1],
      facingYawDeg: 0
    };

    this.lanterns = this.map.lanterns.map((l) => ({
      id: l.id,
      pos: [...l.pos],
      lit: false,
      deposited: 0
    }));

    this._nextMoteIndex = 1;
    this._usedMoteIds = new Set();
    this._nextShadeIndex = 1;
    this._usedShadeIds = new Set();
    this._nextDrifterIndex = 1;
    this._usedDrifterIds = new Set();
    this._nextCharmIndex = 1;
    this._usedCharmIds = new Set();

    this.randomMotes = scenario?.random_motes ?? true;
    this.randomShades = scenario?.random_shades ?? true;
    this.randomDrifters = scenario?.random_drifters ?? this.map.hasDrifters;
    this.windEnabled = scenario?.wind_enabled ?? this.map.hasWind;

    this.wind = {
      active: false,
      warning: false,
      dirDeg: 0,
      dirVec: [1, 0]
    };

    this.motes = [];
    this.shades = [];
    this.drifters = [];
    this.charms = [];

    this._applyScenario(scenario);

    this.initialTimeLeftS = scenario?.time_left_s ?? this.map.durationS;
    this.timeLeftS = this.initialTimeLeftS;
    this._allowVoidShades = Boolean(scenario?.shades !== undefined && !this.randomShades);
  }

  _allocateId(prefix, usedSet, counterKey) {
    while (usedSet.has(`${prefix}${this[counterKey]}`)) {
      this[counterKey] += 1;
    }
    const id = `${prefix}${this[counterKey]++}`;
    usedSet.add(id);
    return id;
  }

  _applyScenario(scenario) {
    if (scenario?.player) {
      const sp = scenario.player;
      if (sp.pos) {
        this.player.pos = [sp.pos[0], sp.pos[1], sp.pos[2]];
        const surf = getSurfaceHeight(this.map, sp.pos[0], sp.pos[2]);
        this.player.grounded = surf !== null && Math.abs(sp.pos[1] - surf) <= 0.05;
      }
      if (sp.carried !== undefined) this.player.carried = sp.carried;
      if (sp.flames !== undefined) this.player.flames = sp.flames;
      if (sp.invuln_ticks !== undefined) this.player.invulnTicks = sp.invuln_ticks;
      if (sp.dash_cd_ticks !== undefined) this.player.dashCdTicks = sp.dash_cd_ticks;
      if (sp.pulse_cd_ticks !== undefined) this.player.pulseCdTicks = sp.pulse_cd_ticks;
      if (sp.charm_ticks !== undefined) this.player.charmTicks = sp.charm_ticks;
    }

    if (scenario?.lanterns) {
      for (const override of scenario.lanterns) {
        const target = this.lanterns.find((l) => l.id === override.id);
        if (!target) continue;
        if (override.pos) target.pos = [...override.pos];
        if (override.deposited !== undefined) target.deposited = override.deposited;
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
          this.motes.push({
            id: this._allocateId('M', this._usedMoteIds, '_nextMoteIndex'),
            pos: [item[0], item[1], item[2]],
            kind: 'random',
            ttlTicks: null,
            createdSimTick: -1
          });
        } else {
          const id = item.id ?? this._allocateId('M', this._usedMoteIds, '_nextMoteIndex');
          this._usedMoteIds.add(id);
          const kind = item.kind ?? 'random';
          let ttlTicks = null;
          if (item.ttl_ticks !== undefined) ttlTicks = item.ttl_ticks;
          else if (item.ttl_s !== undefined) ttlTicks = Math.round(item.ttl_s * 60);
          else if (kind === 'dropped') ttlTicks = DROPPED_MOTE_TTL_TICKS;
          this.motes.push({
            id,
            pos: [item.pos[0], item.pos[1], item.pos[2]],
            kind,
            ttlTicks,
            createdSimTick: -1
          });
        }
      }
    } else if (this.randomMotes) {
      const pool = this.map.moteSpawns.map((pt) => [...pt]);
      for (let i = pool.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.rng.next() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const initialCount = Math.min(MOTE_INITIAL_COUNT, pool.length);
      for (let i = 0; i < initialCount; i += 1) {
        this.motes.push({
          id: this._allocateId('M', this._usedMoteIds, '_nextMoteIndex'),
          pos: pool[i],
          kind: 'random',
          ttlTicks: null,
          createdSimTick: -1
        });
      }
    }

    if (scenario?.shades !== undefined) {
      for (const item of scenario.shades) {
        const id = item.id ?? this._allocateId('S', this._usedShadeIds, '_nextShadeIndex');
        this._usedShadeIds.add(id);
        const state =
          item.state ??
          (distXZ(item.pos, this.player.pos) <= SHADE_DETECT_RADIUS ? 'chase' : 'wander');
        const stateTicksLeft =
          item.state_ticks_left ??
          (state === 'spawning'
            ? SHADE_SPAWN_DELAY_TICKS
            : state === 'stunned'
              ? Math.round(this.tuning.pulse_stun_s * 60)
              : state === 'recoil'
                ? SHADE_RECOIL_TICKS
                : 0);
        const surfY = getSurfaceHeight(this.map, item.pos[0], item.pos[2]) ?? 0;
        const shadeY = item.pos[1];
        const yOffset = shadeY - surfY;
        this.shades.push({
          id,
          pos: [item.pos[0], shadeY, item.pos[2]],
          yOffset,
          state,
          stateTicksLeft,
          inSafePush: false,
          safePushTicks: 0,
          pulsePushTicksLeft: 0,
          pulsePushDir: [1, 0],
          pulsePushStep: 0,
          recoilDir: [1, 0],
          wanderAngle: this.rng.range(0, Math.PI * 2),
          wanderTimer: 60,
          createdSimTick: -1
        });
      }
    }

    if (scenario?.drifters !== undefined) {
      for (const item of scenario.drifters) {
        const id = item.id ?? this._allocateId('D', this._usedDrifterIds, '_nextDrifterIndex');
        this._usedDrifterIds.add(id);
        const state = item.state ?? 'idle';
        this.drifters.push({
          id,
          pos: [item.pos[0], item.pos[1], item.pos[2]],
          state,
          stolen: item.stolen ?? 0,
          stateTicksLeft: item.state_ticks_left ?? (state === 'flee' ? DRIFTER_FLEE_TICKS : 0),
          hasStolen: (item.stolen ?? 0) > 0,
          orbitAngle: this.rng.range(0, Math.PI * 2),
          createdSimTick: -1
        });
      }
    }

    if (scenario?.charms !== undefined) {
      for (const item of scenario.charms) {
        const id = item.id ?? this._allocateId('C', this._usedCharmIds, '_nextCharmIndex');
        this._usedCharmIds.add(id);
        let respawnTicks = 0;
        if (item.respawn_ticks !== undefined) respawnTicks = item.respawn_ticks;
        else if (item.respawn_s !== undefined) respawnTicks = Math.round(item.respawn_s * 60);
        const available = item.available ?? respawnTicks <= 0;
        this.charms.push({
          id,
          pos: item.pos ? [...item.pos] : [35, 0, 0],
          available,
          respawnTicks: available ? 0 : respawnTicks
        });
      }
    } else {
      for (const c of this.map.charms) {
        this._usedCharmIds.add(c.id);
        this.charms.push({
          id: c.id,
          pos: [...c.pos],
          available: true,
          respawnTicks: 0
        });
      }
    }
  }

  _projectOutsideSafeZones(pos, allowVoid) {
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
          const targetDx = l.pos[0] + (dx / d) * safeR - pos[0];
          const targetDz = l.pos[2] + (dz / d) * safeR - pos[2];
          const res = resolveHorizontalMove(this.map, pos, targetDx, targetDz, {
            currentY: Math.max(0, pos[1] - 1.0),
            allowVoid
          });
          pos[0] = res.x;
          pos[2] = res.z;
        }
      }
    }
  }

  _isInsideAnySafeZone(pos) {
    const safeR = this.tuning.safe_radius;
    for (const l of this.lanterns) {
      if (l.lit && distXZ(pos, l.pos) < safeR - 1e-6) {
        return l;
      }
    }
    return null;
  }

  _spawnDroppedMote(x, y, z) {
    this.motes.push({
      id: this._allocateId('M', this._usedMoteIds, '_nextMoteIndex'),
      pos: [x, y, z],
      kind: 'dropped',
      ttlTicks: DROPPED_MOTE_TTL_TICKS,
      createdSimTick: this.simTick
    });
  }

  _spawnDroppedRingMotes(centerPos, count) {
    const fallbackY = getSurfaceHeight(this.map, centerPos[0], centerPos[2]) ?? Math.max(0, centerPos[1]);
    for (let i = 0; i < count; i += 1) {
      let placed = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const angle = this.rng.range(0, Math.PI * 2);
        const radius = this.rng.range(1.5, 2.5);
        const cx = centerPos[0] + Math.cos(angle) * radius;
        const cz = centerPos[2] + Math.sin(angle) * radius;
        const h = getSurfaceHeight(this.map, cx, cz);
        if (h !== null) {
          placed = [cx, h, cz];
          break;
        }
      }
      if (!placed) {
        placed = [centerPos[0], fallbackY, centerPos[2]];
      }
      this._spawnDroppedMote(placed[0], placed[1], placed[2]);
    }
  }

  _spawnSingleShade() {
    const validPoints = [];
    for (const pt of this.map.shadeSpawns) {
      if (distXZ(pt, this.player.pos) < 15.0) continue;
      if (this._isInsideAnySafeZone(pt)) continue;
      validPoints.push(pt);
    }
    if (validPoints.length === 0) return null;

    const chosen = validPoints[Math.floor(this.rng.next() * validPoints.length)];
    const id = this._allocateId('S', this._usedShadeIds, '_nextShadeIndex');
    this.shades.push({
      id,
      pos: [chosen[0], chosen[1] + 0.8, chosen[2]],
      yOffset: 0.8,
      state: 'spawning',
      stateTicksLeft: SHADE_SPAWN_DELAY_TICKS,
      inSafePush: false,
      safePushTicks: 0,
      pulsePushTicksLeft: 0,
      pulsePushDir: [1, 0],
      pulsePushStep: 0,
      recoilDir: [1, 0],
      wanderAngle: this.rng.range(0, Math.PI * 2),
      wanderTimer: 60,
      createdSimTick: this.simTick
    });
    return id;
  }

  step(input = {}) {
    if (this.state === 'won' || this.state === 'lost') {
      return [];
    }

    // Step 1: Read input & process pause first
    this.tick += 1;
    const events = [];
    const emit = (name, data) => {
      events.push({ type: 'event', tick: this.tick, name, data });
    };

    const pauseBtn = Boolean(input.pause);
    const pausePressed = pauseBtn && !this.prevButtons.pause;
    this.prevButtons.pause = pauseBtn;

    if (pausePressed) {
      if (this.state === 'playing') {
        this.state = 'paused';
        emit('paused', {});
        return events;
      }
      if (this.state === 'paused') {
        this.state = 'playing';
        emit('resumed', {});
      }
    }

    if (this.state === 'paused') {
      return events;
    }

    this.simTick += 1;

    const jumpBtn = Boolean(input.jump);
    const interactBtn = Boolean(input.interact);
    const pulseBtn = Boolean(input.pulse);
    const dashBtn = Boolean(input.dash);

    const jumpPressed = jumpBtn && !this.prevButtons.jump;
    const interactPressed = interactBtn && !this.prevButtons.interact;
    const pulsePressed = pulseBtn && !this.prevButtons.pulse;
    const dashPressed = dashBtn && !this.prevButtons.dash;

    this.prevButtons.jump = jumpBtn;
    this.prevButtons.interact = interactBtn;
    this.prevButtons.pulse = pulseBtn;
    this.prevButtons.dash = dashBtn;

    // Step 2: Decrement timers (time, cooldowns, invuln, stun/recoil/spawn, charm, dropped TTL, respawn, wind)
    this.timeLeftS = Math.max(0, this.initialTimeLeftS - this.simTick / 60);

    if (this.player.invulnTicks > 0) this.player.invulnTicks -= 1;
    if (this.player.dashCdTicks > 0) this.player.dashCdTicks -= 1;
    if (this.player.pulseCdTicks > 0) this.player.pulseCdTicks -= 1;
    if (this.player.charmTicks > 0) this.player.charmTicks -= 1;

    if (this.player.respawnWaitTicks > 0) {
      this.player.respawnWaitTicks -= 1;
      if (this.player.respawnWaitTicks === 0) {
        const sp = this.map.spawnPos;
        this.player.pos = [sp[0], sp[1], sp[2]];
        this.player.vel = [0, 0, 0];
        this.player.grounded = true;
        this.player.launched = false;
        this.player.dashActiveTicks = 0;
        this.player.invulnTicks = Math.round(this.tuning.invuln_s * 60);
      }
    }

    for (const shade of this.shades) {
      if (shade.stateTicksLeft > 0) {
        shade.stateTicksLeft -= 1;
        if (shade.stateTicksLeft === 0 && ['spawning', 'stunned', 'recoil'].includes(shade.state)) {
          shade.state = 'wander';
          shade.inSafePush = false;
          shade.safePushTicks = 0;
        }
      }
    }

    for (let i = this.motes.length - 1; i >= 0; i -= 1) {
      const m = this.motes[i];
      if (m.kind === 'dropped' && m.ttlTicks !== null) {
        m.ttlTicks -= 1;
        if (m.ttlTicks <= 0) {
          this.motes.splice(i, 1);
        }
      }
    }

    for (const charm of this.charms) {
      if (!charm.available && charm.respawnTicks > 0) {
        charm.respawnTicks -= 1;
        if (charm.respawnTicks <= 0) {
          charm.respawnTicks = 0;
          charm.available = true;
        }
      }
    }

    for (let i = this.drifters.length - 1; i >= 0; i -= 1) {
      const d = this.drifters[i];
      if (d.state === 'flee' && d.stateTicksLeft > 0) {
        d.stateTicksLeft -= 1;
        if (d.stateTicksLeft === 0) {
          this.drifters.splice(i, 1);
        }
      }
    }

    if (this.windEnabled) {
      const cyclePos = this.simTick % WIND_INTERVAL_TICKS;
      if (cyclePos === WIND_INTERVAL_TICKS - WIND_WARNING_TICKS) {
        this.wind.dirDeg = round3(this.rng.range(0, 360));
        const rad = (this.wind.dirDeg * Math.PI) / 180;
        this.wind.dirVec = [Math.cos(rad), Math.sin(rad)];
        this.wind.warning = true;
        this.wind.active = false;
      } else if (this.simTick >= WIND_INTERVAL_TICKS && cyclePos === 0) {
        if (!this.wind.warning) {
          this.wind.dirDeg = round3(this.rng.range(0, 360));
          const rad = (this.wind.dirDeg * Math.PI) / 180;
          this.wind.dirVec = [Math.cos(rad), Math.sin(rad)];
        }
        this.wind.warning = false;
        this.wind.active = true;
      } else if (this.wind.active && cyclePos >= WIND_DURATION_TICKS) {
        this.wind.active = false;
      }
    }

    // Step 3: Move Mây (jump, dash, jump pads, wind) and check fall off island
    if (this.player.respawnWaitTicks === 0) {
      const moveVec = rotateMove(input.move ?? [0, 0], input.cam_yaw_deg ?? 0);
      const moveLen = Math.hypot(moveVec[0], moveVec[1]);
      if (moveLen > 1e-6) {
        const ux = moveVec[0] / moveLen;
        const uz = moveVec[1] / moveLen;
        this.player.facingDir = [ux, uz];
        this.player.facingYawDeg = (Math.atan2(ux, uz) * 180) / Math.PI;
      }

      // Dash activation
      const charmActive = this.player.charmTicks > 0;
      const dashDurationTicks = Math.round(this.tuning.dash_duration_s * 60);
      const dashCooldownTicks = Math.round(this.tuning.dash_cooldown_s * 60);
      if (dashPressed && this.player.dashActiveTicks <= 0 && (charmActive || this.player.dashCdTicks <= 0)) {
        this.player.dashActiveTicks = dashDurationTicks;
        this.player.dashCdTicks = charmActive ? 0 : dashCooldownTicks;
        this.player.dashDir = moveLen > 1e-6
          ? [moveVec[0] / moveLen, moveVec[1] / moveLen]
          : [...this.player.facingDir];
        this.player.vel[1] = 0;
        emit('dash', {});
      }

      let vx = 0;
      let vz = 0;
      const isDashing = this.player.dashActiveTicks > 0;
      if (isDashing) {
        vx = this.player.dashDir[0] * this.tuning.dash_speed;
        vz = this.player.dashDir[1] * this.tuning.dash_speed;
        this.player.vel[1] = 0;
        this.player.dashActiveTicks -= 1;
      } else if (this.player.launched) {
        vx = this.player.launchVelXZ[0];
        vz = this.player.launchVelXZ[1];
      } else {
        const speed = charmActive ? CHARM_SPEED : this.tuning.player_speed;
        vx = moveVec[0] * speed;
        vz = moveVec[1] * speed;
      }

      if (this.windEnabled && this.wind.active) {
        vx += this.wind.dirVec[0] * WIND_PUSH_SPEED;
        vz += this.wind.dirVec[1] * WIND_PUSH_SPEED;
      }

      // Jump check (grounded only, not while dashing)
      if (jumpPressed && this.player.grounded && !isDashing) {
        this.player.vel[1] = JUMP_VELOCITY;
        this.player.grounded = false;
      }

      const prevY = this.player.pos[1];
      const dx = vx * DT;
      const dz = vz * DT;

      const resolved = resolveHorizontalMove(this.map, this.player.pos, dx, dz, {
        currentY: prevY,
        allowVoid: this.tuning.fall_enabled
      });
      this.player.pos[0] = resolved.x;
      this.player.pos[2] = resolved.z;

      const surfY = getSurfaceHeight(this.map, this.player.pos[0], this.player.pos[2]);

      if (isDashing) {
        // Hold altitude during dash; if grounded on ramp, smoothly follow surface down/up
        if (surfY !== null && this.player.grounded && Math.abs(this.player.pos[1] - surfY) <= 0.35) {
          this.player.pos[1] = surfY;
        } else if (surfY === null || this.player.pos[1] > surfY + 0.05) {
          this.player.grounded = false;
        }
      } else {
        if (this.player.grounded && surfY !== null && Math.abs(prevY - surfY) <= 0.35 && this.player.vel[1] <= 0) {
          this.player.pos[1] = surfY;
          this.player.vel[1] = 0;
        } else {
          this.player.grounded = false;
          this.player.vel[1] -= GRAVITY * DT;
          this.player.pos[1] += this.player.vel[1] * DT;

          if (surfY !== null && prevY >= surfY - 0.15 && this.player.pos[1] <= surfY && this.player.vel[1] <= 0) {
            this.player.pos[1] = surfY;
            this.player.vel[1] = 0;
            this.player.grounded = true;
            this.player.launched = false;
          }
        }
      }

      this.player.vel[0] = vx;
      this.player.vel[2] = vz;

      // Jump pad check
      if (this.player.grounded && !this.player.launched) {
        for (const pad of this.map.jumpPads) {
          if (
            distXZ(this.player.pos, pad.pos) <= pad.radius + 1e-9 &&
            Math.abs(this.player.pos[1] - pad.pos[1]) <= 0.8
          ) {
            this.player.vel[1] = pad.vy;
            this.player.grounded = false;
            this.player.launched = true;
            this.player.launchVelXZ = [pad.dir[0] * pad.horizSpeed, pad.dir[1] * pad.horizSpeed];
            this.player.dashActiveTicks = 0;
            this.player.facingDir = [...pad.dir];
            this.player.facingYawDeg = (Math.atan2(pad.dir[0], pad.dir[1]) * 180) / Math.PI;
            break;
          }
        }
      }

      // Fall check (Y < -10)
      if (this.tuning.fall_enabled && this.player.pos[1] < FALL_Y_THRESHOLD) {
        this.player.flames = Math.max(0, this.player.flames - 1);
        const lost = this.player.carried;
        this.player.carried = 0;
        this.player.vel = [0, 0, 0];
        this.player.launched = false;
        this.player.dashActiveTicks = 0;
        emit('player_hit', {
          by: 'fall',
          flames: this.player.flames,
          dropped: 0,
          lost
        });
        if (this.player.flames > 0) {
          this.player.respawnWaitTicks = RESPAWN_WAIT_TICKS;
        }
      }
    }

    // Step 4: Pick up motes and charms (only if alive & not awaiting respawn)
    if (this.player.respawnWaitTicks === 0 && this.player.flames > 0) {
      if (this.player.carried < this.tuning.carry_capacity && this.motes.length > 0) {
        const pickupR = this.tuning.pickup_radius + 1e-9;
        for (let i = 0; i < this.motes.length; ) {
          if (this.player.carried >= this.tuning.carry_capacity) break;
          const m = this.motes[i];
          if (
            m.createdSimTick < this.simTick &&
            distXZ(this.player.pos, m.pos) <= pickupR &&
            Math.abs(this.player.pos[1] - m.pos[1]) <= 1.5
          ) {
            this.motes.splice(i, 1);
            this.player.carried += 1;
            emit('mote_picked', { carried: this.player.carried });
          } else {
            i += 1;
          }
        }
      }

      for (const charm of this.charms) {
        if (
          charm.available &&
          distXZ(this.player.pos, charm.pos) <= this.tuning.pickup_radius + 1e-9 &&
          Math.abs(this.player.pos[1] - charm.pos[1]) <= 1.5
        ) {
          charm.available = false;
          charm.respawnTicks = CHARM_RESPAWN_TICKS;
          this.player.charmTicks = CHARM_DURATION_TICKS;
          this.player.dashCdTicks = 0;
          emit('charm_picked', { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS });
        }
      }
    }

    // Step 5: Interact with closest unlit lantern
    if (interactPressed && this.player.carried > 0 && this.player.respawnWaitTicks === 0 && this.player.flames > 0) {
      const candidates = [];
      for (const l of this.lanterns) {
        if (l.lit) continue;
        const d = distXZ(this.player.pos, l.pos);
        if (d <= this.tuning.interact_radius + 1e-9) {
          candidates.push({ lantern: l, dist: d });
        }
      }
      if (candidates.length > 0) {
        candidates.sort((a, b) => a.dist - b.dist || idSortKey(a.lantern, b.lantern));
        const target = candidates[0].lantern;
        const needed = Math.max(0, this.tuning.lantern_cost - target.deposited);
        const amount = Math.min(this.player.carried, needed);
        if (amount > 0) {
          this.player.carried -= amount;
          target.deposited += amount;
          const depScore = amount * this.tuning.score.per_mote;
          this.score += depScore;
          this.scoreBreakdown.deposits += depScore;
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

    // Step 6: Update safe zones (push shades inside lit lanterns outward within <= 30 ticks, no damage)
    const safeR = this.tuning.safe_radius;
    for (const shade of this.shades) {
      const violating = this._isInsideAnySafeZone(shade.pos);
      if (violating) {
        shade.inSafePush = true;
        if (shade.safePushTicks <= 0) {
          shade.safePushTicks = SAFE_PUSH_MAX_TICKS;
        }
        if (shade.state !== 'stunned') {
          shade.state = 'recoil';
          shade.stateTicksLeft = shade.safePushTicks;
        }
        let dx = shade.pos[0] - violating.pos[0];
        let dz = shade.pos[2] - violating.pos[2];
        let d = Math.hypot(dx, dz);
        if (d < 1e-9) {
          dx = 1;
          dz = 0;
          d = 1;
        }
        const remaining = safeR - d + 0.02;
        const pushAmt = Math.min(remaining, Math.max(0.25, remaining / shade.safePushTicks));
        const res = resolveHorizontalMove(
          this.map,
          shade.pos,
          (dx / d) * pushAmt,
          (dz / d) * pushAmt,
          { currentY: Math.max(0, shade.pos[1] - 1.0), allowVoid: this._allowVoidShades }
        );
        shade.pos[0] = res.x;
        shade.pos[2] = res.z;
        shade.safePushTicks = Math.max(0, shade.safePushTicks - 1);
      } else if (shade.inSafePush) {
        shade.inSafePush = false;
        shade.safePushTicks = 0;
        if (shade.state === 'recoil' && shade.stateTicksLeft > 0) {
          shade.state = 'wander';
          shade.stateTicksLeft = 0;
        }
      }
    }

    // Step 7: Radiant Pulse
    if (
      pulsePressed &&
      this.player.respawnWaitTicks === 0 &&
      this.player.flames > 0 &&
      this.player.carried >= this.tuning.pulse_cost &&
      this.player.pulseCdTicks <= 0
    ) {
      this.player.carried -= this.tuning.pulse_cost;
      this.player.pulseCdTicks = Math.round(this.tuning.pulse_cooldown_s * 60);
      const pulseCenter = [
        this.player.pos[0],
        this.player.pos[1] + PULSE_CENTER_Y_OFFSET,
        this.player.pos[2]
      ];
      const pulseR = this.tuning.pulse_radius + 1e-9;
      const stunTicks = Math.round(this.tuning.pulse_stun_s * 60);
      const pushStep = this.tuning.pulse_push_m / PULSE_PUSH_TICKS;
      const stunnedIds = [];

      const sortedShades = [...this.shades].sort(idSortKey);
      for (const shade of sortedShades) {
        if (dist3D(pulseCenter, shade.pos) <= pulseR) {
          stunnedIds.push(shade.id);
          shade.state = 'stunned';
          shade.stateTicksLeft = stunTicks;

          let dx = shade.pos[0] - this.player.pos[0];
          let dz = shade.pos[2] - this.player.pos[2];
          let d = Math.hypot(dx, dz);
          if (d < 1e-9) {
            dx = 1;
            dz = 0;
            d = 1;
          }
          shade.pulsePushDir = [dx / d, dz / d];
          shade.pulsePushTicksLeft = PULSE_PUSH_TICKS;
          shade.pulsePushStep = pushStep;

          this.score += this.tuning.score.per_stun;
          this.scoreBreakdown.stuns += this.tuning.score.per_stun;
        }
      }

      const sortedDrifters = [...this.drifters].sort(idSortKey);
      for (const d of sortedDrifters) {
        if (dist3D(pulseCenter, d.pos) <= pulseR) {
          if (d.state === 'chase') {
            d.state = 'flee';
            d.stateTicksLeft = DRIFTER_FLEE_TICKS;
          } else if (d.state === 'flee' && d.stolen > 0) {
            const amount = d.stolen;
            const groundY = getSurfaceHeight(this.map, d.pos[0], d.pos[2]) ?? 0;
            for (let k = 0; k < amount; k += 1) {
              this._spawnDroppedMote(d.pos[0], groundY, d.pos[2]);
            }
            emit('drifter_drop', { drifter_id: d.id, amount });
            d.stolen = 0;
            d.stateTicksLeft = DRIFTER_DROP_FLEE_TICKS;
          }
        }
      }

      emit('pulse', { stunned_ids: stunnedIds });
    }

    // Step 8: Move Shades and Drifters
    const shadeStep = this.map.shadeSpeed * DT;
    const recoilStep = SHADE_RECOIL_M / SHADE_RECOIL_TICKS;

    for (const shade of this.shades) {
      if (shade.state === 'spawning') continue;

      if (shade.state === 'stunned') {
        if (shade.pulsePushTicksLeft > 0) {
          const res = resolveHorizontalMove(
            this.map,
            shade.pos,
            shade.pulsePushDir[0] * shade.pulsePushStep,
            shade.pulsePushDir[1] * shade.pulsePushStep,
            { currentY: Math.max(0, shade.pos[1] - 1.0), allowVoid: this._allowVoidShades }
          );
          shade.pos[0] = res.x;
          shade.pos[2] = res.z;
          this._projectOutsideSafeZones(shade.pos, this._allowVoidShades);
          shade.pulsePushTicksLeft = res.blocked ? 0 : shade.pulsePushTicksLeft - 1;
        }
        continue;
      }

      if (shade.state === 'recoil') {
        if (!shade.inSafePush && shade.stateTicksLeft > 0) {
          const res = resolveHorizontalMove(
            this.map,
            shade.pos,
            shade.recoilDir[0] * recoilStep,
            shade.recoilDir[1] * recoilStep,
            { currentY: Math.max(0, shade.pos[1] - 1.0), allowVoid: this._allowVoidShades }
          );
          shade.pos[0] = res.x;
          shade.pos[2] = res.z;
          this._projectOutsideSafeZones(shade.pos, this._allowVoidShades);
        }
        continue;
      }

      const dPlayer = distXZ(shade.pos, this.player.pos);
      if (shade.state === 'wander' && dPlayer <= SHADE_DETECT_RADIUS && this.player.respawnWaitTicks === 0) {
        shade.state = 'chase';
      } else if (shade.state === 'chase' && (dPlayer > SHADE_LEASH_RADIUS || this.player.respawnWaitTicks > 0)) {
        shade.state = 'wander';
      }

      if (shade.state === 'chase') {
        const dx = this.player.pos[0] - shade.pos[0];
        const dz = this.player.pos[2] - shade.pos[2];
        const d = Math.hypot(dx, dz);
        if (d > 1e-9) {
          const moveDist = Math.min(shadeStep, d);
          const res = resolveHorizontalMove(
            this.map,
            shade.pos,
            (dx / d) * moveDist,
            (dz / d) * moveDist,
            { currentY: Math.max(0, shade.pos[1] - 1.0), allowVoid: this._allowVoidShades }
          );
          shade.pos[0] = res.x;
          shade.pos[2] = res.z;
        }
      } else {
        // wander
        shade.wanderTimer -= 1;
        if (shade.wanderTimer <= 0) {
          shade.wanderAngle = this.rng.range(0, Math.PI * 2);
          shade.wanderTimer = 90 + Math.floor(this.rng.next() * 90);
        }
        const wStep = shadeStep * 0.55;
        const res = resolveHorizontalMove(
          this.map,
          shade.pos,
          Math.cos(shade.wanderAngle) * wStep,
          Math.sin(shade.wanderAngle) * wStep,
          { currentY: Math.max(0, shade.pos[1] - 1.0), allowVoid: this._allowVoidShades }
        );
        shade.pos[0] = res.x;
        shade.pos[2] = res.z;
        if (res.blocked) {
          shade.wanderAngle += Math.PI * 0.75;
        }
      }

      this._projectOutsideSafeZones(shade.pos, this._allowVoidShades);
      const groundH = getSurfaceHeight(this.map, shade.pos[0], shade.pos[2]);
      if (groundH !== null) {
        shade.pos[1] = groundH + (shade.yOffset ?? 0.8);
      }
    }

    // Move Drifters (hovering silk ribbons, unaffected by ground gaps or safe zones)
    for (const d of this.drifters) {
      if (d.state === 'removed') continue;

      if (d.state !== 'flee') {
        const canChase =
          this.player.respawnWaitTicks === 0 &&
          this.player.carried >= DRIFTER_MIN_CARRIED &&
          distXZ(d.pos, this.player.pos) <= DRIFTER_DETECT_RADIUS;
        d.state = canChase ? 'chase' : 'idle';
      }

      if (d.state === 'idle') {
        d.orbitAngle += 0.025;
        const step = DRIFTER_IDLE_SPEED * DT;
        d.pos[0] += Math.cos(d.orbitAngle) * step;
        d.pos[2] += Math.sin(d.orbitAngle) * step;
      } else if (d.state === 'chase') {
        const dx = this.player.pos[0] - d.pos[0];
        const dz = this.player.pos[2] - d.pos[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 1e-9) {
          const step = Math.min(DRIFTER_CHASE_SPEED * DT, dist);
          d.pos[0] += (dx / dist) * step;
          d.pos[2] += (dz / dist) * step;
        }
      } else if (d.state === 'flee') {
        let dx = d.pos[0] - this.player.pos[0];
        let dz = d.pos[2] - this.player.pos[2];
        let dist = Math.hypot(dx, dz);
        if (dist < 1e-9) {
          dx = 1;
          dz = 0;
          dist = 1;
        }
        const step = DRIFTER_FLEE_SPEED * DT;
        d.pos[0] += (dx / dist) * step;
        d.pos[2] += (dz / dist) * step;
      }
    }

    // Step 9: Collisions — Drifter steal first, then Shade hit (sorted by id ascending)
    if (this.player.respawnWaitTicks === 0 && this.player.flames > 0) {
      const sortedDrifters = [...this.drifters].sort(idSortKey);
      for (const d of sortedDrifters) {
        if (
          d.createdSimTick < this.simTick &&
          d.state === 'chase' &&
          !d.hasStolen &&
          distXZ(this.player.pos, d.pos) <= DRIFTER_STEAL_RADIUS + 1e-9
        ) {
          const amount = Math.min(DRIFTER_MAX_STEAL, this.player.carried);
          this.player.carried -= amount;
          d.stolen = amount;
          d.hasStolen = true;
          d.state = 'flee';
          d.stateTicksLeft = DRIFTER_FLEE_TICKS;
          emit('drifter_steal', {
            drifter_id: d.id,
            amount,
            carried: this.player.carried
          });
        }
      }

      if (this.player.invulnTicks <= 0) {
        const hitR = this.tuning.shade_hit_radius + 1e-9;
        const sortedShades = [...this.shades].sort(idSortKey);
        for (const shade of sortedShades) {
          if (
            shade.createdSimTick < this.simTick &&
            (shade.state === 'chase' || shade.state === 'wander') &&
            !shade.inSafePush &&
            distXZ(this.player.pos, shade.pos) <= hitR &&
            Math.abs(this.player.pos[1] - shade.pos[1]) <= 1.5 + 1e-9
          ) {
            this.player.flames = Math.max(0, this.player.flames - 1);
            this.player.invulnTicks = Math.round(this.tuning.invuln_s * 60);

            const dropped = Math.floor(this.player.carried * this.tuning.hit_drop_ratio);
            this.player.carried -= dropped;
            if (dropped > 0) {
              this._spawnDroppedRingMotes(this.player.pos, dropped);
            }

            let rx = shade.pos[0] - this.player.pos[0];
            let rz = shade.pos[2] - this.player.pos[2];
            let rd = Math.hypot(rx, rz);
            if (rd < 1e-9) {
              rx = 1;
              rz = 0;
              rd = 1;
            }
            shade.state = 'recoil';
            shade.stateTicksLeft = SHADE_RECOIL_TICKS;
            shade.recoilDir = [rx / rd, rz / rd];

            emit('player_hit', {
              by: 'shade',
              flames: this.player.flames,
              dropped
            });
            break;
          }
        }
      }
    }

    // Step 10: Scheduled spawns (entities spawned here interact starting next tick)
    if (this.randomMotes && this.simTick % MOTE_SPAWN_INTERVAL_TICKS === 0 && this.motes.length < MOTE_MAX_COUNT) {
      const emptySpawns = this.map.moteSpawns.filter(
        (pt) => !this.motes.some((m) => distXZ(m.pos, pt) < 0.5)
      );
      if (emptySpawns.length > 0) {
        const chosen = emptySpawns[Math.floor(this.rng.next() * emptySpawns.length)];
        this.motes.push({
          id: this._allocateId('M', this._usedMoteIds, '_nextMoteIndex'),
          pos: [...chosen],
          kind: 'random',
          ttlTicks: null,
          createdSimTick: this.simTick
        });
      }
    }

    if (this.randomShades && this.simTick >= SHADE_FIRST_SPAWN_TICK) {
      if (this.simTick === SHADE_FIRST_SPAWN_TICK) {
        for (let i = 0; i < 2; i += 1) {
          if (this.shades.length >= this.map.shadeMax) break;
          const id = this._spawnSingleShade();
          if (id) emit('shade_spawned', { id });
        }
      } else if ((this.simTick - SHADE_FIRST_SPAWN_TICK) % this.map.shadeIntervalTicks === 0) {
        if (this.shades.length < this.map.shadeMax) {
          const id = this._spawnSingleShade();
          if (id) emit('shade_spawned', { id });
        }
      }
    }

    if (
      this.randomDrifters &&
      this.simTick > 0 &&
      this.simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0 &&
      this.drifters.length < DRIFTER_MAX_COUNT
    ) {
      const pts = this.map.shadeSpawns;
      const chosen = pts[Math.floor(this.rng.next() * pts.length)];
      const id = this._allocateId('D', this._usedDrifterIds, '_nextDrifterIndex');
      this.drifters.push({
        id,
        pos: [chosen[0], chosen[1] + 1.5, chosen[2]],
        state: 'idle',
        stolen: 0,
        stateTicksLeft: 0,
        hasStolen: false,
        orbitAngle: this.rng.range(0, Math.PI * 2),
        createdSimTick: this.simTick
      });
    }

    // Step 11: Win / Loss checks
    if (this.player.flames <= 0) {
      this.state = 'lost';
      emit('game_over', { result: 'lost', reason: 'no_flames' });
      return events;
    }

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

    if (this.timeLeftS <= 1e-9) {
      this.timeLeftS = 0;
      this.state = 'lost';
      emit('game_over', { result: 'lost', reason: 'dawn' });
      return events;
    }

    return events;
  }

  getSnapshot() {
    return {
      type: 'snapshot',
      tick: this.tick,
      sim_tick: this.simTick,
      night: this.night,
      state: this.state,
      time_left_s: round3(this.timeLeftS),
      score: this.score,
      wind: {
        active: this.wind.active,
        dir_deg: round3(this.wind.dirDeg)
      },
      player: {
        pos: roundPos3(this.player.pos),
        vel: roundPos3(this.player.vel),
        grounded: this.player.grounded,
        flames: this.player.flames,
        carried: this.player.carried,
        invuln: this.player.invulnTicks > 0,
        dash_cd_s: round3(this.player.dashCdTicks / 60),
        pulse_cd_s: round3(this.player.pulseCdTicks / 60),
        charm_s: round3(this.player.charmTicks / 60)
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
      drifters: this.drifters.map((d) => ({
        id: d.id,
        pos: roundPos3(d.pos),
        state: d.state,
        stolen: d.stolen
      })),
      charms: this.charms.map((c) => ({
        id: c.id,
        available: c.available,
        respawn_s: round3(c.respawnTicks / 60)
      })),
      motes_active: this.motes.length,
      motes: this.motes.map((m) => ({
        id: m.id,
        pos: roundPos3(m.pos),
        kind: m.kind,
        ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / 60)
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
