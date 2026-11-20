import { round3 } from './math.js';

function ringPoints(cx, cz, radius, count, startDeg = 0, y = 0) {
  const pts = [];
  const stepDeg = 360 / count;
  for (let i = 0; i < count; i += 1) {
    const rad = ((startDeg + i * stepDeg) * Math.PI) / 180;
    pts.push([round3(cx + radius * Math.cos(rad)), y, round3(cz + radius * Math.sin(rad))]);
  }
  return pts;
}

function normalizeXZ(dx, dz) {
  const len = Math.hypot(dx, dz);
  return len > 0 ? [dx / len, dz / len] : [0, 1];
}

const NIGHT1_MAP = {
  night: 1,
  name: 'Đảo Bến',
  durationS: 240,
  spawnPos: [0, 0, 0],
  shadeSpeed: 4.0,
  shadeIntervalTicks: 480,
  shadeMax: 6,
  hasDrifters: false,
  hasWind: false,
  lanterns: [
    { id: 'L1', pos: [0, 0, 25] },
    { id: 'L2', pos: [23.8, 0, 7.7] },
    { id: 'L3', pos: [14.7, 0, -20.2] },
    { id: 'L4', pos: [-14.7, 0, -20.2] },
    { id: 'L5', pos: [-23.8, 0, 7.7] }
  ],
  moteSpawns: [
    ...ringPoints(0, 0, 12, 8, 0, 0),
    ...ringPoints(0, 0, 33, 16, 0, 0)
  ],
  shadeSpawns: ringPoints(0, 0, 37, 12, 15, 0),
  jumpPads: [],
  charms: [],
  bellTower: null,
  ramps: [],
  surfaceHeight(x, z) {
    return Math.hypot(x, z) <= 40 ? 0 : null;
  }
};

const NIGHT2_MAP = {
  night: 2,
  name: 'Đảo Cau',
  durationS: 270,
  spawnPos: [0, 0, 0],
  shadeSpeed: 4.0,
  shadeIntervalTicks: 420,
  shadeMax: 8,
  hasDrifters: true,
  hasWind: false,
  lanterns: [
    { id: 'L1', pos: [0, 0, 20] },
    { id: 'L2', pos: [17, 0, -10] },
    { id: 'L3', pos: [-17, 0, -10] },
    { id: 'L4', pos: [70, 0, 20] },
    { id: 'L5', pos: [87, 0, -10] },
    { id: 'L6', pos: [53, 0, -10] }
  ],
  moteSpawns: [
    ...ringPoints(0, 0, 10, 4, 0, 0),
    ...ringPoints(0, 0, 22, 8, 0, 0),
    ...ringPoints(70, 0, 10, 4, 0, 0),
    ...ringPoints(70, 0, 22, 8, 0, 0)
  ],
  shadeSpawns: [
    ...ringPoints(0, 0, 26, 8, 22.5, 0),
    ...ringPoints(70, 0, 26, 8, 22.5, 0)
  ],
  jumpPads: [
    {
      pos: [20, 0, 18],
      radius: 1.0,
      vy: 14.0,
      horizSpeed: 24.0,
      dir: normalizeXZ(70 - 20, 0 - 18)
    },
    {
      pos: [50, 0, -18],
      radius: 1.0,
      vy: 14.0,
      horizSpeed: 24.0,
      dir: normalizeXZ(0 - 50, 0 - -18)
    }
  ],
  charms: [{ id: 'C1', pos: [35, 0, 0] }],
  bellTower: null,
  ramps: [],
  surfaceHeight(x, z) {
    if (Math.hypot(x, z) <= 28) return 0;
    if (Math.hypot(x - 70, z) <= 28) return 0;
    if (x >= 26 && x <= 44 && z >= -2 && z <= 2) return 0;
    return null;
  }
};

function createNight3Ramps() {
  return [30, 150].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return {
      deg,
      cos: Math.cos(rad),
      sin: Math.sin(rad),
      innerR: 24,
      outerR: 30,
      halfWidth: 1.5,
      topY: 3.0
    };
  });
}

const NIGHT3_RAMPS = createNight3Ramps();

const NIGHT3_MAP = {
  night: 3,
  name: 'Đảo Chuông',
  durationS: 300,
  spawnPos: [0, 0, -15],
  shadeSpeed: 4.5,
  shadeIntervalTicks: 360,
  shadeMax: 10,
  hasDrifters: true,
  hasWind: true,
  lanterns: [
    { id: 'L1', pos: [0, 6, 6] },
    { id: 'L2', pos: [18, 3, 10] },
    { id: 'L3', pos: [-18, 3, 10] },
    { id: 'L4', pos: [35, 0, -10] },
    { id: 'L5', pos: [-35, 0, -10] },
    { id: 'L6', pos: [20, 0, -35] },
    { id: 'L7', pos: [-20, 0, -35] }
  ],
  moteSpawns: [
    ...ringPoints(0, 0, 34, 18, 0, 0),
    ...[20, 40, 60, 80, 100, 120, 140, 160].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return [round3(18 * Math.cos(rad)), 3, round3(18 * Math.sin(rad))];
    }),
    ...[45, 135, 225, 315].map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return [round3(5 * Math.cos(rad)), 6, round3(5 * Math.sin(rad))];
    })
  ],
  shadeSpawns: ringPoints(0, 0, 43, 16, 0, 0),
  jumpPads: [
    {
      pos: [0, 3, 13],
      radius: 1.0,
      vy: 12.0,
      horizSpeed: 8.0,
      dir: [0, -1]
    }
  ],
  charms: [
    { id: 'C1', pos: [30, 0, 25] },
    { id: 'C2', pos: [-30, 0, 25] }
  ],
  bellTower: { x: 0, z: 0, radius: 2.0, bottomY: 6.0, topY: 14.0 },
  ramps: NIGHT3_RAMPS,
  surfaceHeight(x, z) {
    const r = Math.hypot(x, z);
    if (r > 45) return null;
    if (r <= 8) return 6;
    if (r >= 12 && r <= 24 && z > 0) return 3;

    for (const ramp of NIGHT3_RAMPS) {
      const s = x * ramp.cos + z * ramp.sin;
      const perp = Math.abs(-x * ramp.sin + z * ramp.cos);
      if (s >= 23.8 && s <= ramp.outerR && perp <= ramp.halfWidth) {
        if (s <= ramp.innerR) return ramp.topY;
        return ramp.topY * ((ramp.outerR - s) / (ramp.outerR - ramp.innerR));
      }
    }
    return 0;
  }
};

export const MAP_CONFIGS = {
  1: NIGHT1_MAP,
  2: NIGHT2_MAP,
  3: NIGHT3_MAP
};

export function getMapConfig(night = 1) {
  const map = MAP_CONFIGS[night];
  if (!map) {
    throw new Error(`Unsupported night: ${night}. Expected 1, 2, or 3.`);
  }
  return map;
}

export function getSurfaceHeight(map, x, z) {
  return map.surfaceHeight(x, z);
}

function pushOutBellTower(map, x, z, currentY) {
  if (!map.bellTower || currentY >= map.bellTower.topY) {
    return [x, z, false];
  }
  const dx = x - map.bellTower.x;
  const dz = z - map.bellTower.z;
  const dist = Math.hypot(dx, dz);
  if (dist < map.bellTower.radius) {
    if (dist < 1e-9) {
      return [map.bellTower.x + map.bellTower.radius, map.bellTower.z, true];
    }
    const scale = map.bellTower.radius / dist;
    return [map.bellTower.x + dx * scale, map.bellTower.z + dz * scale, true];
  }
  return [x, z, false];
}

function isStepWalkable(map, x, z, currentY, allowVoid, stepTolerance) {
  if (map.bellTower && currentY < map.bellTower.topY) {
    if (Math.hypot(x - map.bellTower.x, z - map.bellTower.z) < map.bellTower.radius - 1e-6) {
      return false;
    }
  }
  const h = map.surfaceHeight(x, z);
  if (h === null) return allowVoid;
  return h <= currentY + stepTolerance;
}

/**
 * Resolves horizontal displacement (dx, dz) against Night 3 cliffs, Bell Tower,
 * and walkable boundaries (when allowVoid is false).
 */
export function resolveHorizontalMove(
  map,
  pos,
  dx,
  dz,
  { currentY = pos[1], allowVoid = true, stepTolerance = 0.35 } = {}
) {
  if (dx === 0 && dz === 0) {
    const [tx, tz, pushed] = pushOutBellTower(map, pos[0], pos[2], currentY);
    return { x: tx, z: tz, blocked: pushed };
  }

  let targetX = pos[0] + dx;
  let targetZ = pos[2] + dz;
  let blocked = false;

  const towerRes = pushOutBellTower(map, targetX, targetZ, currentY);
  targetX = towerRes[0];
  targetZ = towerRes[1];
  if (towerRes[2]) blocked = true;

  if (isStepWalkable(map, targetX, targetZ, currentY, allowVoid, stepTolerance)) {
    return { x: targetX, z: targetZ, blocked };
  }

  // Try sliding along X, then Z
  const slideX = pushOutBellTower(map, pos[0] + dx, pos[2], currentY);
  if (isStepWalkable(map, slideX[0], slideX[1], currentY, allowVoid, stepTolerance)) {
    return { x: slideX[0], z: slideX[1], blocked: true };
  }

  const slideZ = pushOutBellTower(map, pos[0], pos[2] + dz, currentY);
  if (isStepWalkable(map, slideZ[0], slideZ[1], currentY, allowVoid, stepTolerance)) {
    return { x: slideZ[0], z: slideZ[1], blocked: true };
  }

  return { x: pos[0], z: pos[2], blocked: true };
}
