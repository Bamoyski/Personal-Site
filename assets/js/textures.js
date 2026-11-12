/**
 * Procedural PBR textures.
 *
 * Everything is generated on a canvas at load time so the page has no image
 * dependencies and the maps tile with the model. Roughness and normal maps
 * are derived from a height field, which is what makes the metal read as
 * brushed rather than painted.
 */

import * as THREE from 'three';

const cache = new Map();

function canvas(size) {
  const element = document.createElement('canvas');
  element.width = size;
  element.height = size;
  return element;
}

/* ------------------------------------------------------------------ *
 * Noise
 * ------------------------------------------------------------------ */
function hash(x, y, seed) {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x, y, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return (a + (b - a) * xf) * (1 - yf) + (c + (d - c) * xf) * yf;
}

function fbm(x, y, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}

/* ------------------------------------------------------------------ *
 * Height field -> normal map
 * ------------------------------------------------------------------ */
function heightToNormal(source, strength = 2.2) {
  const size = source.width;
  const ctx = source.getContext('2d');
  const data = ctx.getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext('2d');
  const image = octx.createImageData(size, size);
  const at = (x, y) => data[((y & (size - 1)) * size + (x & (size - 1))) * 4] / 255;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      image.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      image.data[i + 3] = 255;
    }
  }
  octx.putImageData(image, 0, 0);
  return out;
}

function grayscale(ctx, size, value) {
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i += 1) {
    const v = Math.max(0, Math.min(255, value(i % size, Math.floor(i / size)) * 255));
    image.data[i * 4] = v;
    image.data[i * 4 + 1] = v;
    image.data[i * 4 + 2] = v;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

/* ------------------------------------------------------------------ *
 * Texture builders
 * ------------------------------------------------------------------ */

/** Brushed steel: fine directional streaks plus a few deeper scratches. */
function brushedHeight(size = 512) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  // fine brush lines
  for (let i = 0; i < 2600; i += 1) {
    const y = Math.random() * size;
    const shade = 96 + Math.random() * 64;
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.06 + Math.random() * 0.18})`;
    ctx.lineWidth = Math.random() < 0.85 ? 1 : 2;
    ctx.beginPath();
    ctx.moveTo(-10, y);
    ctx.lineTo(size + 10, y + (Math.random() - 0.5) * 1.5);
    ctx.stroke();
  }
  // deeper random scratches
  for (let i = 0; i < 26; i += 1) {
    const y = Math.random() * size;
    const x = Math.random() * size;
    const len = 20 + Math.random() * 120;
    ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? 60 : 200},${128},${128},0.25)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (Math.random() - 0.5) * 3);
    ctx.stroke();
  }
  // broad tonal drift
  const drift = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = (fbm(x / 90, y / 90, 3, 7) - 0.5) * 40;
      const i = (y * size + x) * 4;
      drift.data[i] = Math.max(0, Math.min(255, drift.data[i] + n));
      drift.data[i + 1] = drift.data[i];
      drift.data[i + 2] = drift.data[i];
    }
  }
  ctx.putImageData(drift, 0, 0);
  return c;
}

/** Painted sheet metal: micro speckle with a faint orange-peel structure. */
function paintedHeight(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grayscale(ctx, size, (x, y) => 0.5 + (fbm(x / 14, y / 14, 3, 21) - 0.5) * 0.9);
  return c;
}

/** Moulded plastic: fine grain. */
function plasticHeight(size = 256) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grayscale(ctx, size, (x, y) => 0.5 + (hash(x, y, 91) - 0.5) * 0.7 + (fbm(x / 30, y / 30, 2, 3) - 0.5) * 0.3);
  return c;
}

/** Roughness variation: blotchy wear over the brushed pattern. */
function wearRoughness(size = 256, base = 0.55, range = 0.3) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  grayscale(ctx, size, (x, y) => {
    const blotch = fbm(x / 40, y / 40, 4, 55);
    const grain = (hash(x, y, 13) - 0.5) * 0.08;
    return base + (blotch - 0.5) * range + grain;
  });
  return c;
}

/** A circuit board: solder mask, traces, pads, silkscreen. */
function pcbTexture(size = 512) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d1a15';
  ctx.fillRect(0, 0, size, size);

  // subtle mask mottling
  const image = ctx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = fbm(x / 50, y / 50, 3, 31) * 26;
      const i = (y * size + x) * 4;
      image.data[i] = Math.min(255, image.data[i] + n * 0.5);
      image.data[i + 1] = Math.min(255, image.data[i + 1] + n);
      image.data[i + 2] = Math.min(255, image.data[i + 2] + n * 0.6);
    }
  }
  ctx.putImageData(image, 0, 0);

  // traces
  ctx.lineCap = 'round';
  for (let i = 0; i < 260; i += 1) {
    ctx.strokeStyle = `rgba(150,190,165,${0.05 + Math.random() * 0.14})`;
    ctx.lineWidth = Math.random() < 0.75 ? 1.4 : 2.6;
    let x = Math.random() * size;
    let y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 3 + Math.floor(Math.random() * 5);
    for (let s = 0; s < steps; s += 1) {
      const dir = Math.floor(Math.random() * 4);
      const len = 20 + Math.random() * 90;
      if (dir === 0) x += len;
      else if (dir === 1) x -= len;
      else if (dir === 2) y += len;
      else y -= len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // vias and pads
  for (let i = 0; i < 420; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1.6 + Math.random() * 2.6;
    ctx.fillStyle = `rgba(198,160,86,${0.25 + Math.random() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(8,14,11,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  // silkscreen
  ctx.fillStyle = 'rgba(215,225,220,0.24)';
  ctx.font = '9px monospace';
  for (let i = 0; i < 90; i += 1) {
    const labels = ['C', 'R', 'U', 'J', 'L', 'TP', 'FB', 'D', 'Q'];
    ctx.fillText(labels[Math.floor(Math.random() * labels.length)] + Math.floor(Math.random() * 90), Math.random() * size, Math.random() * size);
  }
  return c;
}

/* ------------------------------------------------------------------ *
 * Public helpers
 * ------------------------------------------------------------------ */
function texture(source, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const tex = new THREE.CanvasTexture(source);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.anisotropy = aniso;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function memo(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

/** Brushed aluminium / steel maps. */
export function brushedMaps() {
  return memo('brushed', () => {
    const height = brushedHeight(512);
    return {
      normalMap: texture(heightToNormal(height, 1.2), { repeat: 4 }),
      roughnessMap: texture(wearRoughness(256, 0.88, 0.22), { repeat: 4 }),
    };
  });
}

/** Painted steel chassis maps. */
export function paintedMaps() {
  return memo('painted', () => {
    const height = paintedHeight(256);
    return {
      normalMap: texture(heightToNormal(height, 0.45), { repeat: 12 }),
      roughnessMap: texture(wearRoughness(256, 0.92, 0.13), { repeat: 12 }),
    };
  });
}

/** Moulded plastic maps. */
export function plasticMaps() {
  return memo('plastic', () => {
    const height = plasticHeight(256);
    return {
      normalMap: texture(heightToNormal(height, 0.7), { repeat: 16 }),
      roughnessMap: texture(wearRoughness(256, 0.95, 0.09), { repeat: 16 }),
    };
  });
}

/** Circuit board maps. */
export function pcbMaps() {
  return memo('pcb', () => ({
    map: texture(pcbTexture(512), { srgb: true, repeat: 1 }),
    roughnessMap: texture(wearRoughness(256, 0.9, 0.16), { repeat: 1 }),
  }));
}

export function disposeTextures() {
  cache.forEach((entry) => {
    Object.values(entry).forEach((tex) => tex?.dispose?.());
  });
  cache.clear();
}
