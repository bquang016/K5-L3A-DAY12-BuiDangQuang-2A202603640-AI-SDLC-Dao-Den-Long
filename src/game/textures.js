import * as THREE from 'three';
import { PALETTE } from '../sim/config.js';

const cache = {};

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = Number.parseInt(clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function clampByte(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hash2D(x, y, seed) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function makeCanvasPair(size, repeatX, repeatY, paintFn) {
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bumpCtx = bumpCanvas.getContext('2d');

  paintFn(colorCtx, bumpCtx, size);

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeatX, repeatY);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(repeatX, repeatY);
  bumpMap.anisotropy = 4;

  return { map, bumpMap };
}

export function getGrassTextures() {
  if (cache.grass) return cache.grass;
  const [r, g, b] = hexToRgb(PALETTE.grass);
  cache.grass = makeCanvasPair(256, 10, 10, (cCtx, bCtx, size) => {
    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const n1 = hash2D(x >> 2, y >> 2, 11);
        const n2 = hash2D(x, y, 29);
        const delta = (n1 * 0.65 + n2 * 0.35 - 0.5) * 24; // +-5% RGB modulation
        const idx = (y * size + x) * 4;
        cImg.data[idx] = clampByte(r + delta * 0.8);
        cImg.data[idx + 1] = clampByte(g + delta * 1.1);
        cImg.data[idx + 2] = clampByte(b + delta * 0.8);
        cImg.data[idx + 3] = 255;

        const bv = clampByte(128 + delta * 3.5);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  });
  return cache.grass;
}

export function getSandTextures() {
  if (cache.sand) return cache.sand;
  const [r, g, b] = hexToRgb(PALETTE.sand);
  cache.sand = makeCanvasPair(256, 12, 12, (cCtx, bCtx, size) => {
    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const ripple = Math.sin((x + y * 0.5) * 0.14) * 6;
        const grain = (hash2D(x, y, 47) - 0.5) * 18;
        const delta = ripple + grain;
        const idx = (y * size + x) * 4;
        cImg.data[idx] = clampByte(r + delta);
        cImg.data[idx + 1] = clampByte(g + delta * 0.9);
        cImg.data[idx + 2] = clampByte(b + delta * 0.75);
        cImg.data[idx + 3] = 255;

        const bv = clampByte(128 + delta * 3);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  });
  return cache.sand;
}

export function getWoodTextures() {
  if (cache.wood) return cache.wood;
  const [r, g, b] = hexToRgb(PALETTE.wood);
  cache.wood = makeCanvasPair(256, 3, 3, (cCtx, bCtx, size) => {
    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      const seam = y % 32 === 0 || y % 32 === 1;
      for (let x = 0; x < size; x += 1) {
        const grain = Math.sin(y * 0.55 + hash2D(x >> 3, y >> 2, 71) * 4) * 10;
        const plankShift = (hash2D(0, Math.floor(y / 32), 97) - 0.5) * 14;
        const delta = seam ? -22 : grain + plankShift;
        const idx = (y * size + x) * 4;
        cImg.data[idx] = clampByte(r + delta);
        cImg.data[idx + 1] = clampByte(g + delta * 0.75);
        cImg.data[idx + 2] = clampByte(b + delta * 0.55);
        cImg.data[idx + 3] = 255;

        const bv = seam ? 40 : clampByte(140 + grain * 3.5);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  });
  return cache.wood;
}

export function getStoneTextures() {
  if (cache.stone) return cache.stone;
  const [r, g, b] = hexToRgb('#4d4759');
  cache.stone = makeCanvasPair(256, 4, 4, (cCtx, bCtx, size) => {
    const cImg = cCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    for (let y = 0; y < size; y += 1) {
      const row = Math.floor(y / 32);
      const mortarY = y % 32 <= 1;
      for (let x = 0; x < size; x += 1) {
        const offsetX = (row % 2) * 32;
        const mortarX = (x + offsetX) % 64 <= 1;
        const mortar = mortarX || mortarY;
        const noise = (hash2D(x >> 1, y >> 1, 131) - 0.5) * 20;
        const blockTint = (hash2D(Math.floor((x + offsetX) / 64), row, 151) - 0.5) * 14;
        const delta = mortar ? -22 : noise + blockTint;
        const idx = (y * size + x) * 4;
        cImg.data[idx] = clampByte(r + delta);
        cImg.data[idx + 1] = clampByte(g + delta);
        cImg.data[idx + 2] = clampByte(b + delta * 1.1);
        cImg.data[idx + 3] = 255;

        const bv = mortar ? 55 : clampByte(150 + noise * 3);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }
    cCtx.putImageData(cImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
  });
  return cache.stone;
}

export function getGlowTexture(innerHex, outerHex) {
  const key = `glow:${innerHex}:${outerHex}`;
  if (cache[key]) return cache[key];

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, innerHex);
  grad.addColorStop(0.35, outerHex);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache[key] = tex;
  return tex;
}
