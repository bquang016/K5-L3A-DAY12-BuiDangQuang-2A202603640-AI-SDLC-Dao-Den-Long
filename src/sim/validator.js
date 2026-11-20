const VALID_LANTERN_IDS = new Set(['L1', 'L2', 'L3', 'L4', 'L5']);
const BUTTON_FIELDS = ['jump', 'interact', 'pulse', 'dash'];

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

export function validateScenario(data) {
  if (!isPlainObject(data)) {
    throw new ValidationError('Scenario root must be a JSON object.');
  }

  if (data.player !== undefined) {
    if (!isPlainObject(data.player)) {
      throw new ValidationError('scenario.player must be an object.');
    }
    if (data.player.pos !== undefined && !isVec3(data.player.pos)) {
      throw new ValidationError('scenario.player.pos must be [x, y, z] of finite numbers.');
    }
    if (data.player.carried !== undefined && !isNonNegInt(data.player.carried)) {
      throw new ValidationError('scenario.player.carried must be a non-negative integer.');
    }
    if (data.player.flames !== undefined && !isNonNegInt(data.player.flames)) {
      throw new ValidationError('scenario.player.flames must be a non-negative integer.');
    }
  }

  if (data.random_motes !== undefined && typeof data.random_motes !== 'boolean') {
    throw new ValidationError('scenario.random_motes must be a boolean.');
  }
  if (data.random_shades !== undefined && typeof data.random_shades !== 'boolean') {
    throw new ValidationError('scenario.random_shades must be a boolean.');
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
        continue;
      }
      throw new ValidationError(`scenario.motes[${i}] must be [x,y,z] or {id?, pos:[x,y,z]}.`);
    }
  }

  if (data.shades !== undefined) {
    if (!Array.isArray(data.shades)) {
      throw new ValidationError('scenario.shades must be an array.');
    }
    for (let i = 0; i < data.shades.length; i += 1) {
      const s = data.shades[i];
      if (!isPlainObject(s) || !isVec3(s.pos)) {
        throw new ValidationError(`scenario.shades[${i}] must be {id?, pos:[x,y,z]}.`);
      }
      if (s.id !== undefined && (typeof s.id !== 'string' || s.id.length === 0)) {
        throw new ValidationError(`scenario.shades[${i}].id must be a non-empty string.`);
      }
    }
  }

  if (data.lanterns !== undefined) {
    if (!Array.isArray(data.lanterns)) {
      throw new ValidationError('scenario.lanterns must be an array.');
    }
    for (let i = 0; i < data.lanterns.length; i += 1) {
      const l = data.lanterns[i];
      if (!isPlainObject(l) || typeof l.id !== 'string' || !VALID_LANTERN_IDS.has(l.id)) {
        throw new ValidationError(`scenario.lanterns[${i}].id must be one of L1..L5.`);
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
    }
  }

  if (data.time_left_s !== undefined && (!isFiniteNumber(data.time_left_s) || data.time_left_s < 0)) {
    throw new ValidationError('scenario.time_left_s must be a non-negative finite number.');
  }
}
