/**
 * Parametric chassis builder for the exploded view.
 *
 * Dimensions come from the vendor documentation, not from guesswork:
 *   OptiPlex 3090 SFF    290 × 92.6 × 292.8 mm  (H × W × D)
 *   OptiPlex 7050 Micro  182 × 183 × 179 mm
 *   ThinkCentre M910q    36.5 × 182.9 × 179 mm
 *
 * Base colours are sampled from the real product photographs so the exploded
 * model and the photography agree on tone.
 *
 * Units are centimetres.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ------------------------------------------------------------------ *
 * Palette, sampled from the product photographs
 * ------------------------------------------------------------------ */
const PALETTE = {
  sff: { body: 0x3a3d3d, front: 0x232525, metal: 0xa8aeb4 },
  micro: { body: 0x2c2d2c, front: 0x1e1f1e, metal: 0x9aa09b },
  tiny: { body: 0x161617, front: 0x201f20, metal: 0x93979b },
};

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */
const rbox = (w, h, d, r = 0.12) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001));

/** Box-projected UVs so texel density is the same on every panel. */
function applyBoxUV(geometry, scale = 0.25) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  if (!position || !normal) return geometry;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function mesh(geometry, material, position, rotation) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(position[0], position[1], position[2]);
  if (rotation) m.rotation.set(rotation[0], rotation[1], rotation[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function slab(w, h, d, material, position, radius = 0.12) {
  return mesh(applyBoxUV(rbox(w, h, d, radius)), material, position);
}

function instances(geometry, material, placements, { shadow = true } = {}) {
  const group = new THREE.InstancedMesh(geometry, material, placements.length);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  placements.forEach((place, index) => {
    position.set(place.p[0], place.p[1], place.p[2]);
    euler.set(place.r ? place.r[0] : 0, place.r ? place.r[1] : 0, place.r ? place.r[2] : 0);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    group.setMatrixAt(index, matrix);
  });
  group.instanceMatrix.needsUpdate = true;
  group.castShadow = shadow;
  group.receiveShadow = true;
  return group;
}

/** A round hole, used as an alpha mask so panels are genuinely perforated. */
let holeTexture = null;
function holeMask() {
  if (holeTexture) return holeTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.24, size / 2, size / 2, size * 0.44);
  gradient.addColorStop(0, '#000000');
  gradient.addColorStop(0.84, '#000000');
  gradient.addColorStop(0.95, '#707070');
  gradient.addColorStop(1, '#ffffff');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  ctx.fill();
  holeTexture = new THREE.CanvasTexture(canvas);
  holeTexture.wrapS = THREE.RepeatWrapping;
  holeTexture.wrapT = THREE.RepeatWrapping;
  holeTexture.needsUpdate = true;
  return holeTexture;
}

/** A punched sheet: real holes with a dark cavity behind them. */
function perfSheet(width, height, cols, rows, material, holeMaterial, depth = 0.3) {
  const group = new THREE.Group();
  const backing = mesh(new THREE.PlaneGeometry(width, height), holeMaterial, [0, 0, -depth]);
  backing.castShadow = false;
  group.add(backing);

  const mask = holeMask().clone();
  mask.repeat.set(cols, rows);
  mask.needsUpdate = true;

  const plateMaterial = material.clone();
  plateMaterial.alphaMap = mask;
  plateMaterial.alphaTest = 0.5;
  plateMaterial.transparent = false;
  plateMaterial.side = THREE.DoubleSide;
  plateMaterial.needsUpdate = true;

  const plate = mesh(new THREE.PlaneGeometry(width, height), plateMaterial);
  plate.castShadow = false;
  group.add(plate);
  group.userData.mask = mask;
  return group;
}

/* ------------------------------------------------------------------ *
 * Materials
 * ------------------------------------------------------------------ */
function makeMaterials(palette) {
  const body = new THREE.MeshPhysicalMaterial({
    color: palette.body,
    metalness: 0.55,
    roughness: 0.46,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
    envMapIntensity: 1.7,
  });
  const front = new THREE.MeshPhysicalMaterial({
    color: palette.front,
    metalness: 0.08,
    roughness: 0.6,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
    sheen: 0.2,
    sheenColor: new THREE.Color(0x8f9ec4),
    sheenRoughness: 0.7,
    envMapIntensity: 1.3,
  });
  const metal = new THREE.MeshPhysicalMaterial({
    color: palette.metal,
    metalness: 1,
    roughness: 0.29,
    envMapIntensity: 1.8,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x090a0c, metalness: 0.22, roughness: 0.9 });
  const hole = new THREE.MeshStandardMaterial({ color: 0x020203, metalness: 0.04, roughness: 1 });
  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xd6dae1,
    metalness: 1,
    roughness: 0.14,
    clearcoat: 0.5,
    envMapIntensity: 1.7,
  });
  const pcb = new THREE.MeshPhysicalMaterial({
    color: 0x12211b,
    metalness: 0.08,
    roughness: 0.52,
    clearcoat: 0.6,
    clearcoatRoughness: 0.16,
    envMapIntensity: 0.95,
  });
  const chip = new THREE.MeshPhysicalMaterial({
    color: 0x0f1114,
    metalness: 0.3,
    roughness: 0.38,
    clearcoat: 0.45,
  });
  const copper = new THREE.MeshStandardMaterial({ color: 0xa9682f, metalness: 1, roughness: 0.36 });
  const indigo = new THREE.MeshPhysicalMaterial({
    color: 0x5a5ee0,
    metalness: 0.9,
    roughness: 0.26,
    clearcoat: 0.5,
    emissive: 0x2a2c96,
    emissiveIntensity: 0.22,
  });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0, roughness: 0.96 });

  return { body, front, metal, dark, hole, chrome, pcb, chip, copper, indigo, rubber };
}

/* ------------------------------------------------------------------ *
 * Shared sub-assemblies
 * ------------------------------------------------------------------ */
function buildFan(radius, material, bladeMaterial, blades = 9) {
  const group = new THREE.Group();
  group.add(mesh(new THREE.TorusGeometry(radius, radius * 0.12, 8, 28), material));
  const hub = mesh(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 0.24, 16), bladeMaterial);
  hub.rotation.x = Math.PI / 2;
  group.add(hub);
  const bladeGeo = new THREE.BoxGeometry(radius * 0.8, radius * 0.32, 0.14);
  const bladeMesh = new THREE.InstancedMesh(bladeGeo, bladeMaterial, blades);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < blades; i += 1) {
    const angle = (Math.PI * 2 * i) / blades;
    position.set(Math.cos(angle) * radius * 0.55, Math.sin(angle) * radius * 0.55, 0);
    euler.set(0.25, 0, angle + 0.62);
    quaternion.setFromEuler(euler);
    matrix.compose(position, quaternion, scale);
    bladeMesh.setMatrixAt(i, matrix);
  }
  bladeMesh.instanceMatrix.needsUpdate = true;
  bladeMesh.castShadow = true;
  group.add(bladeMesh);
  group.userData.blades = bladeMesh;
  return group;
}

function buildHeatsink(width, depth, fins, material) {
  const stack = new THREE.Group();
  stack.add(slab(width, 0.5, depth, material, [0, -0.9, 0], 0.08));
  const finGeo = new THREE.BoxGeometry(width * 0.94, 1.7, 0.12);
  const finMesh = new THREE.InstancedMesh(finGeo, material, fins);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < fins; i += 1) {
    matrix.makeTranslation(0, 0.1, -depth / 2 + (depth * (i + 0.5)) / fins);
    finMesh.setMatrixAt(i, matrix);
  }
  finMesh.instanceMatrix.needsUpdate = true;
  finMesh.castShadow = true;
  stack.add(finMesh);
  return stack;
}

function buildPsu(width, height, depth, mats) {
  const group = new THREE.Group();
  group.add(slab(width, height, depth, mats.body, [0, 0, 0], 0.2));
  const grille = perfSheet(width * 0.55, depth * 0.5, 7, 7, mats.metal, mats.hole, 0.3);
  grille.rotation.x = -Math.PI / 2;
  grille.position.set(0, height / 2 + 0.06, 0);
  group.add(grille);
  group.add(slab(2.4, 1.8, 0.6, mats.dark, [-width / 2 + 2.2, -height / 2 + 1.6, -depth / 2 - 0.1], 0.08));
  group.add(slab(4.4, 1.2, 1.6, mats.dark, [width / 2 - 2.6, height / 2 - 1, depth / 2 + 0.2], 0.06));
  group.add(slab(4.2, 2.6, 0.12, mats.chrome, [0, -height / 2 + 3, -depth / 2 - 0.3], 0.04));
  return group;
}

function buildMotherboard(width, height, mats, withIo) {
  const group = new THREE.Group();
  group.add(slab(width, height, 0.22, mats.pcb, [0, 0, 0], 0.04));
  group.add(slab(3.6, 3.6, 0.8, mats.metal, [width * 0.22, -height * 0.1, 0.42], 0.12));
  for (let i = 0; i < 5; i += 1) {
    group.add(slab(1.5, 2.6, 0.7, mats.metal, [-width * 0.3 + i * 2.1, height * 0.3, 0.4], 0.1));
  }
  group.add(slab(1.6, 1.6, 0.35, mats.chip, [-width * 0.22, -height * 0.22, 0.3], 0.05));
  group.add(slab(1.2, 1.2, 0.3, mats.chip, [-width * 0.34, -height * 0.3, 0.28], 0.05));
  const m2 = new THREE.Group();
  m2.add(slab(8, 2.2, 0.2, mats.pcb, [0, 0, 0], 0.04));
  m2.add(slab(1.6, 1.6, 0.3, mats.chip, [2.4, 0, 0.2], 0.05));
  m2.add(slab(1.4, 1.4, 0.28, mats.chip, [0.4, 0, 0.2], 0.05));
  m2.position.set(-width * 0.1, -height * 0.36, 0.2);
  group.add(m2);
  if (withIo) {
    const io = new THREE.Group();
    io.add(slab(4.4, 1.8, 2.2, mats.metal, [0, 0, 0], 0.1));
    io.add(slab(1.4, 1.1, 0.3, mats.dark, [0, 0, 1.2], 0.04));
    io.position.set(width / 2 - 2.4, height / 2 - 2.4, 0.4);
    group.add(io);
  }
  return group;
}

function buildDimm(count, mats, height = 3.6) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const stick = new THREE.Group();
    stick.add(slab(0.42, height, 13.2, mats.pcb, [0, 0, 0], 0.05));
    stick.add(slab(0.28, height * 0.34, 12.6, mats.chip, [0, height * 0.3, 0], 0.05));
    stick.add(slab(0.3, 0.5, 1.6, mats.indigo, [0, height * 0.5, -5.4], 0.05));
    stick.position.set(i * 0.85, 0, 0);
    group.add(stick);
  }
  return group;
}

function buildDrive(width, height, depth, mats, withTray) {
  const group = new THREE.Group();
  group.add(slab(width, height, depth, mats.metal, [0, 0, 0], 0.06));
  if (withTray) {
    group.add(slab(width * 0.98, height * 0.35, depth * 0.98, mats.dark, [0, height / 2 + 0.1, 0], 0.04));
    group.add(slab(width * 0.7, height * 0.2, 0.14, mats.metal, [0, -height * 0.1, depth / 2 + 0.02], 0.03));
  }
  group.add(slab(width * 0.6, height * 0.4, 0.08, mats.chrome, [0, 0, depth / 2 + 0.04], 0.02));
  group.add(slab(width * 0.5, height * 0.25, 0.6, mats.copper, [0, -height / 2 + 0.1, depth / 2 - 0.2], 0.02));
  return group;
}

/** A half-length low-profile card, mounted flat the way it sits in a tower. */
function buildGpu(mats) {
  const group = new THREE.Group();
  const length = 17;
  const width = 11.2;
  group.add(slab(width, 1.5, length, mats.body, [0, 0, 0], 0.08));
  group.add(slab(width * 0.92, 0.6, 2.6, mats.dark, [0, 0.85, -length / 2 + 2.2], 0.06));
  group.add(slab(3.2, 0.5, 4.6, mats.copper, [width / 2 - 1.4, -0.6, length / 2 - 2.6], 0.04));
  const fan = buildFan(3.6, mats.dark, mats.chip, 11);
  fan.position.set(-1.6, -0.95, -1.4);
  fan.rotation.x = Math.PI / 2;
  group.add(fan);
  group.userData.fan = fan;
  group.add(slab(width * 0.96, 4.2, 0.4, mats.metal, [0, 0.6, -length / 2 - 0.2], 0.05));
  group.add(slab(1.9, 1.2, 0.6, mats.dark, [-1.6, 1.1, -length / 2 - 0.3], 0.05));
  group.add(slab(1.9, 1.2, 0.6, mats.dark, [1.6, 1.1, -length / 2 - 0.3], 0.05));
  return group;
}

/** A rear-panel port: a recessed socket with a visible tongue. */
function port(type, mats, scale = 1) {
  const group = new THREE.Group();
  const s = scale;
  switch (type) {
    case 'usb-a':
      group.add(slab(1.35 * s, 0.62 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.05));
      group.add(slab(1.15 * s, 0.42 * s, 0.5 * s, mats.dark, [0, 0, 0.42 * s], 0.03));
      break;
    case 'usb-c':
    case 'usbc':
      group.add(slab(0.95 * s, 0.42 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.05));
      group.add(slab(0.78 * s, 0.26 * s, 0.5 * s, mats.dark, [0, 0, 0.42 * s], 0.03));
      break;
    case 'rj45':
      group.add(slab(1.7 * s, 1.5 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.06));
      group.add(slab(1.25 * s, 1.0 * s, 0.5 * s, mats.dark, [0, 0, 0.42 * s], 0.04));
      break;
    case 'dp':
      group.add(slab(1.7 * s, 0.8 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.04));
      group.add(slab(1.45 * s, 0.55 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'hdmi':
      group.add(slab(1.7 * s, 0.75 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.04));
      group.add(slab(1.45 * s, 0.5 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'vga':
      group.add(slab(1.9 * s, 1.3 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.05));
      group.add(slab(1.4 * s, 0.9 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'serial':
      group.add(slab(1.8 * s, 0.9 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.04));
      group.add(slab(1.35 * s, 0.5 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'audio':
      group.add(slab(0.95 * s, 0.95 * s, 0.9 * s, mats.metal, [0, 0, 0], 0.08));
      group.add(slab(0.55 * s, 0.55 * s, 0.4 * s, mats.hole, [0, 0, 0.4 * s], 0.06));
      break;
    case 'power':
      group.add(slab(2.3 * s, 1.9 * s, 1.0 * s, mats.dark, [0, 0, 0], 0.06));
      group.add(slab(1.6 * s, 1.2 * s, 0.5 * s, mats.hole, [0, 0, 0.45 * s], 0.04));
      break;
    default:
      break;
  }
  return group;
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

/** Dell OptiPlex 3090 SFF — 290 × 92.6 × 292.8 mm. */
function buildSff(mats, detailed) {
  const W = 9.26;
  const H = 29.0;
  const D = 29.28;
  const group = new THREE.Group();
  const parts = [];
  const spinners = [];

  const register = (obj, explode) => {
    obj.userData.explode = new THREE.Vector3(explode[0], explode[1], explode[2]);
    obj.userData.base = obj.position.clone();
    parts.push(obj);
    return obj;
  };

  const leftPanel = new THREE.Group();
  leftPanel.add(slab(0.4, H, D, mats.body, [-W / 2 + 0.2, 0, 0], 0.08));
  register(leftPanel, [-2.0, 0, 0]);

  const rightCover = new THREE.Group();
  rightCover.add(slab(0.5, H, D, mats.body, [W / 2 - 0.25, 0, 0], 0.1));
  const coverMesh = perfSheet(D * 0.42, H * 0.5, detailed ? 14 : 8, detailed ? 16 : 9, mats.body, mats.hole, 0.35);
  coverMesh.rotation.y = Math.PI / 2;
  coverMesh.position.set(W / 2 + 0.02, 1.5, 1.5);
  rightCover.add(coverMesh);
  register(rightCover, [2.1, 0, 0]);

  const topPanel = new THREE.Group();
  topPanel.add(slab(W, 0.45, D, mats.body, [0, H / 2 - 0.22, 0], 0.08));
  topPanel.add(slab(2.6, 0.1, 1.6, mats.chrome, [W * 0.1, H / 2 + 0.02, D * 0.3], 0.04));
  register(topPanel, [0, 2.1, 0]);

  const bottomPanel = new THREE.Group();
  bottomPanel.add(slab(W, 0.45, D, mats.body, [0, -H / 2 + 0.22, 0], 0.08));
  bottomPanel.add(
    instances(
      new THREE.CylinderGeometry(0.7, 0.8, 0.4, 14),
      mats.rubber,
      [
        { p: [-W / 2 + 1.1, -H / 2 - 0.05, D / 2 - 1.6] },
        { p: [W / 2 - 1.1, -H / 2 - 0.05, D / 2 - 1.6] },
        { p: [-W / 2 + 1.1, -H / 2 - 0.05, -D / 2 + 1.6] },
        { p: [W / 2 - 1.1, -H / 2 - 0.05, -D / 2 + 1.6] },
      ]
    )
  );
  register(bottomPanel, [0, -1.8, 0]);

  const rearPanel = new THREE.Group();
  rearPanel.add(slab(W, H, 0.45, mats.body, [0, 0, -D / 2 + 0.22], 0.08));
  const sffPorts = [
    ['power', -W / 2 + 2.0, -H / 2 + 2.0],
    ['usb-a', W / 2 - 2.6, -H / 2 + 2.0],
    ['usb-a', W / 2 - 1.2, -H / 2 + 2.0],
    ['rj45', W / 2 - 2.6, -H / 2 + 4.2],
    ['dp', W / 2 - 1.6, -H / 2 + 4.2],
    ['audio', -W / 2 + 2.2, -H / 2 + 4.4],
  ];
  sffPorts.forEach(([type, x, y]) => {
    const socket = port(type, mats);
    socket.rotation.y = Math.PI;
    socket.position.set(x, y, -D / 2);
    rearPanel.add(socket);
  });
  register(rearPanel, [0, 0, -2.0]);

  /* front bezel: perforated field, port strip, optical slot, badge */
  const bezel = new THREE.Group();
  bezel.add(slab(W, H, 0.9, mats.front, [0, 0, D / 2 - 0.35], 0.16));
  const frontPerf = perfSheet(W * 0.52, H * 0.66, detailed ? 6 : 4, detailed ? 20 : 11, mats.front, mats.hole, 0.35);
  frontPerf.position.set(-W * 0.22, -1.5, D / 2 + 0.12);
  bezel.add(frontPerf);
  // vertical control strip
  bezel.add(slab(W * 0.3, H * 0.66, 0.35, mats.front, [W * 0.32, -1.5, D / 2 + 0.12], 0.08));
  const power = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.35, 18), mats.metal, [W * 0.32, H * 0.34, D / 2 + 0.22]);
  power.rotation.x = Math.PI / 2;
  bezel.add(power);
  const ring = mesh(new THREE.TorusGeometry(0.42, 0.05, 8, 20), mats.indigo, [W * 0.32, H * 0.34, D / 2 + 0.3]);
  bezel.add(ring);
  // optical drive slot
  bezel.add(slab(W * 0.22, 0.5, 0.3, mats.dark, [W * 0.32, H * 0.22, D / 2 + 0.16], 0.05));
  // front usb + audio
  bezel.add(slab(0.7, 0.35, 0.2, mats.metal, [W * 0.32, H * 0.12, D / 2 + 0.18], 0.04));
  const jack = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.24, 12), mats.hole, [W * 0.32, H * 0.04, D / 2 + 0.18]);
  jack.rotation.x = Math.PI / 2;
  bezel.add(jack);
  // badge
  bezel.add(slab(W * 0.5, 1.6, 0.14, mats.chrome, [-W * 0.16, -H * 0.3, D / 2 + 0.14], 0.06));
  register(bezel, [0, 0, 2.9]);
  group.add(leftPanel, rightCover, topPanel, bottomPanel, rearPanel, bezel);

  /* internals */
  const psu = new THREE.Group();
  const psuBody = buildPsu(6.8, 4.2, 7.6, mats);
  psuBody.position.set(0, H / 2 - 3.4, -D / 2 + 5.4);
  psu.add(psuBody);
  register(psu, [-1.5, 2.2, -1.0]);
  group.add(psu);

  const mobo = new THREE.Group();
  const board = buildMotherboard(24.4, 24.4, mats, true);
  board.rotation.y = Math.PI / 2;
  board.position.set(W / 2 - 0.6, 1.5, 1.5);
  mobo.add(board);
  const cpu = new THREE.Group();
  cpu.add(slab(4.4, 4.4, 0.6, mats.pcb, [0, 0, 0], 0.06));
  const sink = buildHeatsink(7.2, 7.2, detailed ? 16 : 9, mats.metal);
  sink.position.set(0, 2.2, 0);
  cpu.add(sink);
  const cpuFan = buildFan(4.4, mats.dark, mats.chip, detailed ? 9 : 7);
  cpuFan.rotation.x = -Math.PI / 2;
  cpuFan.position.set(0, 4.4, 0);
  cpu.add(cpuFan);
  spinners.push(cpuFan.userData.blades);
  cpu.position.set(W / 2 - 1.4, 8.5, 2.5);
  mobo.add(cpu);
  const dimms = buildDimm(2, mats);
  dimms.position.set(W / 2 - 1.6, 10.5, -4.5);
  mobo.add(dimms);
  register(mobo, [2.1, 0, 0]);
  group.add(mobo);

  const gpu = new THREE.Group();
  const card = buildGpu(mats);
  gpu.add(card);
  gpu.position.set(0, -H / 2 + 2.4, 1.5);
  spinners.push(card.userData.fan.userData.blades);
  register(gpu, [0, -1.5, 2.1]);
  group.add(gpu);

  const hdd = new THREE.Group();
  const d1 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d1.position.set(-1.2, -H / 2 + 2.4, D / 2 - 8.5);
  const d2 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d2.position.set(-1.2, -H / 2 + 5.4, D / 2 - 8.5);
  hdd.add(d1, d2);
  register(hdd, [0, -1.0, 1.9]);
  group.add(hdd);

  const intake = new THREE.Group();
  const fan = buildFan(4.6, mats.dark, mats.chip, detailed ? 9 : 7);
  fan.position.set(0, -H / 2 + 3.4, D / 2 - 2.2);
  intake.add(fan);
  spinners.push(fan.userData.blades);
  register(intake, [0, 0, 1.7]);
  group.add(intake);

  return { group, parts, spinners, size: [W, H, D] };
}

/** Dell OptiPlex 7050 Micro — 182 × 183 × 179 mm. */
function buildMicro(mats, detailed) {
  const W = 18.3;
  const H = 18.2;
  const D = 17.9;
  const group = new THREE.Group();
  const parts = [];
  const spinners = [];

  const register = (obj, explode) => {
    obj.userData.explode = new THREE.Vector3(explode[0], explode[1], explode[2]);
    obj.userData.base = obj.position.clone();
    parts.push(obj);
    return obj;
  };

  const leftPanel = new THREE.Group();
  leftPanel.add(slab(0.4, H, D, mats.body, [-W / 2 + 0.2, 0, 0], 0.08));
  register(leftPanel, [-2.0, 0, 0]);

  const rightCover = new THREE.Group();
  rightCover.add(slab(0.5, H, D, mats.body, [W / 2 - 0.25, 0, 0], 0.1));
  const coverMesh = perfSheet(W * 0.44, H * 0.46, detailed ? 12 : 7, detailed ? 12 : 7, mats.body, mats.hole, 0.35);
  coverMesh.rotation.y = Math.PI / 2;
  coverMesh.position.set(W / 2 + 0.02, 0, 0);
  rightCover.add(coverMesh);
  register(rightCover, [2.1, 0, 0]);

  const topPanel = new THREE.Group();
  topPanel.add(slab(W, 0.45, D, mats.body, [0, H / 2 - 0.22, 0], 0.08));
  topPanel.add(slab(2.6, 0.1, 1.6, mats.chrome, [-W * 0.24, H / 2 + 0.02, D * 0.26], 0.04));
  register(topPanel, [0, 2.1, 0]);

  const bottomPanel = new THREE.Group();
  bottomPanel.add(slab(W, 0.45, D, mats.body, [0, -H / 2 + 0.22, 0], 0.08));
  bottomPanel.add(
    instances(
      new THREE.CylinderGeometry(0.9, 1.0, 0.5, 14),
      mats.rubber,
      [
        { p: [-W / 2 + 1.8, -H / 2 - 0.05, D / 2 - 2.0] },
        { p: [W / 2 - 1.8, -H / 2 - 0.05, D / 2 - 2.0] },
        { p: [-W / 2 + 1.8, -H / 2 - 0.05, -D / 2 + 2.0] },
        { p: [W / 2 - 1.8, -H / 2 - 0.05, -D / 2 + 2.0] },
      ]
    )
  );
  register(bottomPanel, [0, -1.8, 0]);

  const rearPanel = new THREE.Group();
  rearPanel.add(slab(W, H, 0.45, mats.body, [0, 0, -D / 2 + 0.22], 0.08));
  const microPorts = [
    ['power', -W / 2 + 2.4, -H / 2 + 2.2],
    ['usb-a', -W / 2 + 4.6, -H / 2 + 2.2],
    ['usb-a', -W / 2 + 6.0, -H / 2 + 2.2],
    ['rj45', W / 2 - 2.6, -H / 2 + 2.2],
    ['dp', W / 2 - 4.2, -H / 2 + 2.2],
    ['hdmi', W / 2 - 5.8, -H / 2 + 2.2],
    ['vga', W / 2 - 7.4, -H / 2 + 2.2],
    ['serial', -W / 2 + 2.4, -H / 2 + 4.6],
    ['audio', W / 2 - 2.4, -H / 2 + 4.8],
  ];
  microPorts.forEach(([type, x, y]) => {
    const socket = port(type, mats);
    socket.rotation.y = Math.PI;
    socket.position.set(x, y, -D / 2);
    rearPanel.add(socket);
  });
  register(rearPanel, [0, 0, -2.0]);

  const bezel = new THREE.Group();
  bezel.add(slab(W, H, 0.8, mats.front, [0, 0, D / 2 - 0.3], 0.16));
  const frontPerf = perfSheet(W * 0.66, H * 0.72, detailed ? 18 : 10, detailed ? 18 : 10, mats.front, mats.hole, 0.35);
  frontPerf.position.set(-W * 0.12, 0, D / 2 + 0.12);
  bezel.add(frontPerf);
  // chrome badge
  bezel.add(slab(0.7, 6.2, 0.14, mats.chrome, [W * 0.34, 1.2, D / 2 + 0.14], 0.06));
  bezel.add(slab(1.1, 1.3, 0.16, mats.chrome, [W * 0.34, -2.4, D / 2 + 0.14], 0.06));
  const power = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.35, 18), mats.metal, [W * 0.34, H * 0.33, D / 2 + 0.2]);
  power.rotation.x = Math.PI / 2;
  bezel.add(power);
  const ring = mesh(new THREE.TorusGeometry(0.45, 0.05, 8, 20), mats.indigo, [W * 0.34, H * 0.33, D / 2 + 0.28]);
  bezel.add(ring);
  register(bezel, [0, 0, 2.9]);
  group.add(leftPanel, rightCover, topPanel, bottomPanel, rearPanel, bezel);

  const psu = new THREE.Group();
  const psuBody = buildPsu(13.5, 5.4, 10.5, mats);
  psuBody.position.set(0, -H / 2 + 3.4, -D / 2 + 6.2);
  psu.add(psuBody);
  register(psu, [-1.5, -1.9, -1.0]);
  group.add(psu);

  const mobo = new THREE.Group();
  const board = buildMotherboard(17.4, 17.2, mats, true);
  board.rotation.y = Math.PI / 2;
  board.position.set(W / 2 - 0.6, 0.5, 0);
  mobo.add(board);
  const cpu = new THREE.Group();
  cpu.add(slab(4.2, 4.2, 0.6, mats.pcb, [0, 0, 0], 0.06));
  const sink = buildHeatsink(6.8, 6.8, detailed ? 15 : 9, mats.metal);
  sink.position.set(0, 2.0, 0);
  cpu.add(sink);
  const cpuFan = buildFan(4.2, mats.dark, mats.chip, detailed ? 9 : 7);
  cpuFan.rotation.x = -Math.PI / 2;
  cpuFan.position.set(0, 4.0, 0);
  cpu.add(cpuFan);
  spinners.push(cpuFan.userData.blades);
  cpu.position.set(W / 2 - 1.4, 4.5, 0.5);
  mobo.add(cpu);
  const dimms = buildDimm(4, mats);
  dimms.position.set(W / 2 - 1.6, 5.5, -3.5);
  mobo.add(dimms);
  register(mobo, [2.1, 0, 0]);
  group.add(mobo);

  const hdd = new THREE.Group();
  const d1 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d1.position.set(-2.0, H / 2 - 2.8, -2.0);
  const d2 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d2.position.set(-2.0, H / 2 - 5.8, -2.0);
  hdd.add(d1, d2);
  register(hdd, [-1.9, 1.1, -0.8]);
  group.add(hdd);

  const ssd = new THREE.Group();
  const s1 = buildDrive(10, 0.7, 7, mats, false);
  s1.position.set(2.4, -H / 2 + 2.0, 3.0);
  const s2 = buildDrive(10, 0.7, 7, mats, false);
  s2.position.set(2.4, -H / 2 + 3.0, 3.0);
  ssd.add(s1, s2);
  register(ssd, [1.9, -1.1, 1.1]);
  group.add(ssd);

  const intake = new THREE.Group();
  const fan = buildFan(4.4, mats.dark, mats.chip, detailed ? 9 : 7);
  fan.position.set(-2.6, -H / 2 + 3.0, D / 2 - 2.2);
  intake.add(fan);
  spinners.push(fan.userData.blades);
  register(intake, [0, 0, 1.7]);
  group.add(intake);

  return { group, parts, spinners, size: [W, H, D] };
}

/** Lenovo ThinkCentre M910q Tiny — 36.5 × 182.9 × 179 mm. */
function buildTiny(mats, detailed) {
  const W = 18.29;
  const H = 3.65;
  const D = 17.9;
  const group = new THREE.Group();
  const parts = [];
  const spinners = [];

  const register = (obj, explode) => {
    obj.userData.explode = new THREE.Vector3(explode[0], explode[1], explode[2]);
    obj.userData.base = obj.position.clone();
    parts.push(obj);
    return obj;
  };

  const base = new THREE.Group();
  base.add(slab(W, H, D, mats.body, [0, 0, 0], 0.18));
  register(base, [0, -1.7, 0]);

  const top = new THREE.Group();
  top.add(slab(W - 0.3, 0.3, D - 0.3, mats.body, [0, H / 2 - 0.1, 0], 0.1));
  const vent = perfSheet(W * 0.46, D * 0.5, detailed ? 18 : 9, detailed ? 15 : 8, mats.body, mats.hole, 0.3);
  vent.rotation.x = -Math.PI / 2;
  vent.position.set(0, H / 2 + 0.06, -1);
  top.add(vent);
  register(top, [0, 1.7, 0]);

  const front = new THREE.Group();
  front.add(slab(W - 0.2, H - 0.2, 0.6, mats.front, [0, 0, D / 2 - 0.2], 0.14));
  const frontPerf = perfSheet(W * 0.5, H * 0.56, detailed ? 22 : 11, detailed ? 5 : 3, mats.front, mats.hole, 0.3);
  frontPerf.position.set(-W * 0.2, 0, D / 2 + 0.1);
  front.add(frontPerf);
  const power = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.35, 18), mats.metal, [W * 0.34, 0, D / 2 + 0.18]);
  power.rotation.x = Math.PI / 2;
  front.add(power);
  const led = mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 20), mats.indigo, [W * 0.34, 0, D / 2 + 0.26]);
  front.add(led);
  // the red accent stripe and the wordmark
  front.add(slab(0.5, H * 0.5, 0.1, mats.indigo, [W * 0.08, 0, D / 2 + 0.12], 0.03));
  front.add(slab(2.4, 0.3, 0.1, mats.chrome, [W * 0.16, 0.85, D / 2 + 0.12], 0.04));
  register(front, [0, 0, 2.3]);
  group.add(front);

  const rear = new THREE.Group();
  rear.add(slab(W - 0.4, H - 0.4, 0.5, mats.body, [0, 0, -D / 2 + 0.2], 0.1));
  const tinyPorts = [
    ['usbc', -W / 2 + 2.4, 0],
    ['usb-a', -W / 2 + 3.8, 0],
    ['usb-a', -W / 2 + 5.0, 0],
    ['rj45', W / 2 - 2.6, 0],
    ['dp', W / 2 - 4.2, 0],
    ['hdmi', W / 2 - 5.8, 0],
    ['audio', W / 2 - 7.4, 0],
  ];
  tinyPorts.forEach(([type, x, y]) => {
    const socket = port(type, mats);
    socket.rotation.y = Math.PI;
    socket.position.set(x, y, -D / 2 + 0.45);
    rear.add(socket);
  });
  register(rear, [0, 0, -2.0]);
  group.add(rear);

  const mobo = new THREE.Group();
  const board = buildMotherboard(17.2, 15.4, mats, false);
  board.rotation.x = -Math.PI / 2;
  board.position.set(0, -1.1, -1);
  mobo.add(board);
  const cpu = new THREE.Group();
  cpu.add(slab(3.6, 0.5, 3.6, mats.pcb, [0, 0, 0], 0.06));
  const sink = buildHeatsink(5.4, 5.4, detailed ? 14 : 8, mats.metal);
  sink.position.set(0, 1.6, 0);
  cpu.add(sink);
  const blower = buildFan(3.4, mats.dark, mats.chip, detailed ? 9 : 7);
  blower.position.set(0, 2.8, 0);
  cpu.add(blower);
  spinners.push(blower.userData.blades);
  cpu.position.set(-3.6, -0.95, -1);
  mobo.add(cpu);
  const dimms = buildDimm(2, mats, 2.6);
  dimms.rotation.y = Math.PI / 2;
  dimms.position.set(2.1, -0.7, -1);
  mobo.add(dimms);
  register(mobo, [0, 1.1, 0]);
  group.add(mobo);

  const riser = new THREE.Group();
  riser.add(slab(7, 0.25, 8, mats.pcb, [0, 0, 0], 0.05));
  riser.add(slab(2.2, 0.5, 1.6, mats.chip, [0, 0.3, 0], 0.05));
  riser.position.set(5.5, -0.4, 3.2);
  register(riser, [2.0, 0.8, 1.0]);
  group.add(riser);

  const nic = new THREE.Group();
  nic.add(slab(3.4, 0.22, 4.2, mats.pcb, [0, 0, 0], 0.05));
  nic.add(slab(2.2, 0.6, 2.2, mats.metal, [0, 0.4, 0], 0.08));
  nic.position.set(-6.5, -0.4, 5.5);
  register(nic, [-1.9, 0.9, 1.4]);
  group.add(nic);

  const bay = new THREE.Group();
  bay.add(buildDrive(10, 0.7, 7, mats, false));
  bay.position.set(4.0, -0.9, -4.5);
  register(bay, [1.9, 0.5, -1.4]);
  group.add(bay);

  const stand = new THREE.Group();
  stand.add(slab(W * 0.8, 0.7, 4.5, mats.front, [0, -H / 2 - 0.4, 2.0], 0.2));
  stand.add(slab(W * 0.8, 0.5, 1.4, mats.front, [0, -H / 2 - 0.35, -1.6], 0.18));
  register(stand, [0, -1.1, 0]);
  group.add(stand);

  return { group, parts, spinners, size: [W, H, D] };
}

const BUILDERS = { sff: buildSff, micro: buildMicro, tiny: buildTiny };

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */
export function buildChassis(preset = 'sff', { detailed = true } = {}) {
  const mats = makeMaterials(PALETTE[preset] || PALETTE.sff);
  const builder = BUILDERS[preset] || BUILDERS.sff;
  const built = builder(mats, detailed);

  const root = new THREE.Group();
  root.add(built.group);

  const maxDim = Math.max(...built.size);
  root.scale.setScalar(10 / maxDim);

  const localBox = new THREE.Box3().setFromObject(built.group);
  const explodeExtent = { x: 0, y: 0, z: 0 };
  built.parts.forEach((part) => {
    explodeExtent.x = Math.max(explodeExtent.x, Math.abs(part.userData.explode.x));
    explodeExtent.y = Math.max(explodeExtent.y, Math.abs(part.userData.explode.y));
    explodeExtent.z = Math.max(explodeExtent.z, Math.abs(part.userData.explode.z));
  });

  let explodeAmount = 0;

  function setExplode(amount) {
    explodeAmount = amount;
    built.parts.forEach((part) => {
      part.position.set(
        part.userData.base.x + part.userData.explode.x * amount,
        part.userData.base.y + part.userData.explode.y * amount,
        part.userData.base.z + part.userData.explode.z * amount
      );
    });
  }

  function update(delta, motion = 1) {
    if (motion <= 0) return;
    built.spinners.forEach((blades) => {
      blades.rotation.z += delta * 4.2 * motion;
    });
  }

  function dispose() {
    root.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (object.material.alphaMap) object.material.alphaMap.dispose();
        object.material.dispose();
      }
    });
    Object.values(mats).forEach((material) => material.dispose());
  }

  function halfExtents() {
    const size = localBox.getSize(new THREE.Vector3());
    const centre = localBox.getCenter(new THREE.Vector3());
    return {
      x: size.x / 2 + explodeExtent.x * explodeAmount,
      y: size.y / 2 + explodeExtent.y * explodeAmount,
      z: size.z / 2 + explodeExtent.z * explodeAmount,
      centre,
    };
  }

  return { root, setExplode, update, dispose, size: built.size, halfExtents };
}
