export function round3(n) {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

export function roundPos3(pos) {
  return [round3(pos[0]), round3(pos[1]), round3(pos[2])];
}

export function distXZ(a, b) {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

export function clampToCircleXZ(pos, maxRadius) {
  const r = Math.hypot(pos[0], pos[2]);
  if (r > maxRadius && r > 0) {
    const scale = maxRadius / r;
    pos[0] *= scale;
    pos[2] *= scale;
  }
}

/**
 * Transform [x, z] input movement by camera yaw in degrees per Test Contract v1.0:
 *   x' = x*cos(theta) + z*sin(theta)
 *   z' = -x*sin(theta) + z*cos(theta)
 * Vectors longer than 1 are normalized to unit length.
 */
export function rotateMove(move = [0, 0], camYawDeg = 0) {
  let x = move[0] ?? 0;
  let z = move[1] ?? 0;
  const len = Math.hypot(x, z);
  if (len > 1) {
    x /= len;
    z /= len;
  }
  if (x === 0 && z === 0) {
    return [0, 0];
  }
  const theta = (camYawDeg * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return [x * cos + z * sin, -x * sin + z * cos];
}
