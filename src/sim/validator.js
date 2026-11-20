const LANTERN_COUNT_BY_NIGHT = { 1: 5, 2: 6, 3: 7 };
const BUTTON_FIELDS = ['jump', 'interact', 'pulse', 'dash', 'pause'];
const SHADE_STATES = new Set(['spawning', 'wander', 'chase', 'recoil', 'stunned', 'drain']);
const DRIFTER_STATES = new Set(['idle', 'chase', 'flee', 'removed']);
const MOTE_KINDS = new Set(['random', 'dropped']);

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVec3(value) {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

function isNonNegInt(value) {
  return Number.isInteger(value) && value >= 0;
}

export function validateInputs(data) {
  if (!isPlainObject(data)) {
    throw new ValidationError('Inputs root must be a JSON object.');
  }
  if (!Array.isArray(data.frames)) {
    throw new ValidationError('Inputs must contain a "frames" array.');
  }

  let prevTick = -1;
  for (let i = 0; i < data.frames.length; i += 1) {
    const frame = data.frames[i];
    if (!isPlainObject(frame)) {
      throw new ValidationError(`Frame at index ${i} must be an object.`);
    }
    if (!isNonNegInt(frame.tick)) {
      throw new ValidationError(`Frame[${i}].tick must be a non-negative integer.`);
    }
    if (frame.tick <= prevTick) {
      throw new ValidationError(
        `Frame[${i}].tick (${frame.tick}) must be strictly greater than previous tick (${prevTick}).`
      );
    }
    prevTick = frame.tick;

    if (frame.move !== undefined) {
      if (!Array.isArray(frame.move) || frame.move.length !== 2 || !frame.move.every(isFiniteNumber)) {
        throw new ValidationError(`Frame[${i}].move must be [x, z] of finite numbers.`);
      }
      if (frame.move[0] < -1 || frame.move[0] > 1 || frame.move[1] < -1 || frame.move[1] > 1) {
        throw new ValidationError(`Frame[${i}].move components must be within [-1, 1].`);
      }
    }

    if (frame.cam_yaw_deg !== undefined && !isFiniteNumber(frame.cam_yaw_deg)) {
      throw new ValidationError(`Frame[${i}].cam_yaw_deg must be a finite number.`);
    }

    for (const btn of BUTTON_FIELDS) {
      if (frame[btn] !== undefined && typeof frame[btn] !== 'boolean') {
        throw new ValidationError(`Frame[${i}].${btn} must be a boolean.`);
      }
    }
  }
}

export function validateScenario(data, night = 1) {
  if (!isPlainObject(data)) {
    throw new ValidationError('Scenario root must be a JSON object.');
  }

  const maxLanterns = LANTERN_COUNT_BY_NIGHT[night] || 5;
  const validLanternIds = new Set();
  for (let i = 1; i <= maxLanterns; i += 1) {
    validLanternIds.add(`L${i}`);
  }

  if (data.player !== undefined) {
    if (!isPlainObject(data.player)) {
      throw new ValidationError('scenario.player must be an object.');
    }
    if (data.player.pos !== undefined && !isVec3(data.player.pos)) {
      throw new ValidationError('scenario.player.pos must be [x, y, z] of finite numbers.');
    }
    for (const intField of [
      'carried',
      'flames',
      'invuln_ticks',
      'dash_cd_ticks',
      'pulse_cd_ticks',
      'charm_ticks',
      'successful_lights'
    ]) {
      if (data.player[intField] !== undefined && !isNonNegInt(data.player[intField])) {
        throw new ValidationError(`scenario.player.${intField} must be a non-negative integer.`);
      }
    }
  }

  for (const boolField of ['random_motes', 'random_shades', 'random_drifters', 'wind_enabled']) {
    if (data[boolField] !== undefined && typeof data[boolField] !== 'boolean') {
      throw new ValidationError(`scenario.${boolField} must be a boolean.`);
    }
  }

  if (data.motes !== undefined) {
    if (!Array.isArray(data.motes)) {
      throw new ValidationError('scenario.motes must be an array.');
    }
    for (let i = 0; i < data.motes.length; i += 1) {
      const m = data.motes[i];
      if (isVec3(m)) continue;
      if (isPlainObject(m) && isVec3(m.pos)) {
        if (m.id !== undefined && (typeof m.id !== 'string' || m.id.length === 0)) {
          throw new ValidationError(`scenario.motes[${i}].id must be a non-empty string.`);
        }
        if (m.kind !== undefined && !MOTE_KINDS.has(m.kind)) {
          throw new ValidationError(`scenario.motes[${i}].kind must be "random" or "dropped".`);
        }
        if (m.ttl_s !== undefined && (!isFiniteNumber(m.ttl_s) || m.ttl_s < 0)) {
          throw new ValidationError(`scenario.motes[${i}].ttl_s must be a non-negative number.`);
        }
        if (m.ttl_ticks !== undefined && !isNonNegInt(m.ttl_ticks)) {
          throw new ValidationError(`scenario.motes[${i}].ttl_ticks must be a non-negative integer.`);
        }
        continue;
      }
      throw new ValidationError(`scenario.motes[${i}] must be [x,y,z] or {id?, pos:[x,y,z], ...}.`);
    }
  }

  if (data.shades !== undefined) {
    if (!Array.isArray(data.shades)) {
      throw new ValidationError('scenario.shades must be an array.');
    }
    for (let i = 0; i < data.shades.length; i += 1) {
      const s = data.shades[i];
      if (!isPlainObject(s) || !isVec3(s.pos)) {
        throw new ValidationError(`scenario.shades[${i}] must be {id?, pos:[x,y,z], ...}.`);
      }
      if (s.id !== undefined && (typeof s.id !== 'string' || s.id.length === 0)) {
        throw new ValidationError(`scenario.shades[${i}].id must be a non-empty string.`);
      }
      if (s.state !== undefined && !SHADE_STATES.has(s.state)) {
        throw new ValidationError(`scenario.shades[${i}].state is invalid (${s.state}).`);
      }
      if (s.state_ticks_left !== undefined && !isNonNegInt(s.state_ticks_left)) {
        throw new ValidationError(`scenario.shades[${i}].state_ticks_left must be a non-negative integer.`);
      }
      if (
        s.target_lantern_id !== undefined &&
        s.target_lantern_id !== null &&
        (typeof s.target_lantern_id !== 'string' || !validLanternIds.has(s.target_lantern_id))
      ) {
        throw new ValidationError(
          `scenario.shades[${i}].target_lantern_id must be a valid lantern ID for night ${night}.`
        );
      }
    }
  }

  if (data.drifters !== undefined) {
    if (!Array.isArray(data.drifters)) {
      throw new ValidationError('scenario.drifters must be an array.');
    }
    for (let i = 0; i < data.drifters.length; i += 1) {
      const d = data.drifters[i];
      if (!isPlainObject(d) || !isVec3(d.pos)) {
        throw new ValidationError(`scenario.drifters[${i}] must be {id?, pos:[x,y,z], ...}.`);
      }
      if (d.id !== undefined && (typeof d.id !== 'string' || d.id.length === 0)) {
        throw new ValidationError(`scenario.drifters[${i}].id must be a non-empty string.`);
      }
      if (d.state !== undefined && !DRIFTER_STATES.has(d.state)) {
        throw new ValidationError(`scenario.drifters[${i}].state is invalid (${d.state}).`);
      }
      if (d.stolen !== undefined && !isNonNegInt(d.stolen)) {
        throw new ValidationError(`scenario.drifters[${i}].stolen must be a non-negative integer.`);
      }
      if (d.state_ticks_left !== undefined && !isNonNegInt(d.state_ticks_left)) {
        throw new ValidationError(`scenario.drifters[${i}].state_ticks_left must be a non-negative integer.`);
      }
    }
  }

  if (data.charms !== undefined) {
    if (!Array.isArray(data.charms)) {
      throw new ValidationError('scenario.charms must be an array.');
    }
    for (let i = 0; i < data.charms.length; i += 1) {
      const c = data.charms[i];
      if (!isPlainObject(c)) {
        throw new ValidationError(`scenario.charms[${i}] must be an object.`);
      }
      if (c.pos !== undefined && !isVec3(c.pos)) {
        throw new ValidationError(`scenario.charms[${i}].pos must be [x,y,z].`);
      }
      if (c.available !== undefined && typeof c.available !== 'boolean') {
        throw new ValidationError(`scenario.charms[${i}].available must be a boolean.`);
      }
      if (c.respawn_s !== undefined && (!isFiniteNumber(c.respawn_s) || c.respawn_s < 0)) {
        throw new ValidationError(`scenario.charms[${i}].respawn_s must be a non-negative number.`);
      }
      if (c.respawn_ticks !== undefined && !isNonNegInt(c.respawn_ticks)) {
        throw new ValidationError(`scenario.charms[${i}].respawn_ticks must be a non-negative integer.`);
      }
    }
  }

  if (data.lanterns !== undefined) {
    if (!Array.isArray(data.lanterns)) {
      throw new ValidationError('scenario.lanterns must be an array.');
    }
    for (let i = 0; i < data.lanterns.length; i += 1) {
      const l = data.lanterns[i];
      if (!isPlainObject(l) || typeof l.id !== 'string' || !validLanternIds.has(l.id)) {
        throw new ValidationError(
          `scenario.lanterns[${i}].id must be one of L1..L${maxLanterns} for night ${night}.`
        );
      }
      if (l.pos !== undefined && !isVec3(l.pos)) {
        throw new ValidationError(`scenario.lanterns[${i}].pos must be [x,y,z].`);
      }
      if (l.deposited !== undefined && !isNonNegInt(l.deposited)) {
        throw new ValidationError(`scenario.lanterns[${i}].deposited must be a non-negative integer.`);
      }
      if (l.lit !== undefined && typeof l.lit !== 'boolean') {
        throw new ValidationError(`scenario.lanterns[${i}].lit must be a boolean.`);
      }
      if (l.fuel !== undefined && (!isFiniteNumber(l.fuel) || l.fuel < 0 || l.fuel > 100)) {
        throw new ValidationError(`scenario.lanterns[${i}].fuel must be in [0, 100].`);
      }
      if (l.ever_lit !== undefined && typeof l.ever_lit !== 'boolean') {
        throw new ValidationError(`scenario.lanterns[${i}].ever_lit must be a boolean.`);
      }
    }
  }

  if (data.time_left_s !== undefined && (!isFiniteNumber(data.time_left_s) || data.time_left_s < 0)) {
    throw new ValidationError('scenario.time_left_s must be a non-negative finite number.');
  }
}
