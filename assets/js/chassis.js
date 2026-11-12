/**
 * Parametric business-desktop chassis builder.
 *
 * Three presets — Dell OptiPlex 3090 SFF, Lenovo ThinkCentre M910q Tiny and
 * Dell OptiPlex 7050 Micro. Everything is built from primitives and
 * instanced detail so there is no external model dependency and the draw
 * call count stays low.
 *
 * Units are centimetres.
 */

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { brushedMaps, paintedMaps, plasticMaps, pcbMaps } from './textures.js';

/* ------------------------------------------------------------------ *
 * Shared materials
 * ------------------------------------------------------------------ */
function makeMaterials() {
  const brushed = brushedMaps();
  const painted = paintedMaps();
  const plastic = plasticMaps();
  const pcb = pcbMaps();

  const normalScale = (v) => new THREE.Vector2(v, v);

  return {
    /* painted steel chassis — paint is a dielectric, not a metal */
    case: new THREE.MeshPhysicalMaterial({
      color: 0x0c0e11,
      metalness: 0.14,
      roughness: 0.52,
      clearcoat: 0.32,
      clearcoatRoughness: 0.34,
      normalMap: painted.normalMap,
      normalScale: normalScale(0.55),
      roughnessMap: painted.roughnessMap,
      envMapIntensity: 0.8,
    }),
    /* moulded front bezel */
    bezel: new THREE.MeshPhysicalMaterial({
      color: 0x0c0d10,
      metalness: 0.08,
      roughness: 0.52,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
      normalMap: plastic.normalMap,
      normalScale: normalScale(0.7),
      roughnessMap: plastic.roughnessMap,
      envMapIntensity: 0.85,
    }),
    plastic: new THREE.MeshPhysicalMaterial({
      color: 0x101216,
      metalness: 0.04,
      roughness: 0.6,
      clearcoat: 0.28,
      clearcoatRoughness: 0.5,
      normalMap: plastic.normalMap,
      normalScale: normalScale(0.6),
      roughnessMap: plastic.roughnessMap,
      envMapIntensity: 0.75,
    }),
    /* interior: matte, absorbs light */
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0b0d, metalness: 0.25, roughness: 0.88 }),
    hole: new THREE.MeshStandardMaterial({ color: 0x030304, metalness: 0.05, roughness: 1 }),
    /* brushed aluminium */
    steel: new THREE.MeshPhysicalMaterial({
      color: 0xb4b9c1,
      metalness: 1,
      roughness: 0.3,
      normalMap: brushed.normalMap,
      normalScale: normalScale(0.8),
      roughnessMap: brushed.roughnessMap,
      envMapIntensity: 1.3,
    }),
    /* chrome trim */
    chrome: new THREE.MeshPhysicalMaterial({
      color: 0xdfe3e9,
      metalness: 1,
      roughness: 0.17,
      clearcoat: 0.5,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.3,
    }),
    /* circuit board with solder mask */
    pcb: new THREE.MeshPhysicalMaterial({
      map: pcb.map,
      metalness: 0.08,
      roughness: 0.62,
      clearcoat: 0.45,
      clearcoatRoughness: 0.28,
      roughnessMap: pcb.roughnessMap,
      envMapIntensity: 0.85,
    }),
    chip: new THREE.MeshPhysicalMaterial({ color: 0x111317, metalness: 0.35, roughness: 0.42, clearcoat: 0.3 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xa9682f, metalness: 1, roughness: 0.38 }),
    /* anodised indigo accent */
    indigo: new THREE.MeshPhysicalMaterial({
      color: 0x5a5ee0,
      metalness: 0.88,
      roughness: 0.3,
      clearcoat: 0.4,
      clearcoatRoughness: 0.18,
      emissive: 0x3a3cc0,
      emissiveIntensity: 0.18,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x0c0d0f, metalness: 0, roughness: 0.95 }),
    label: new THREE.MeshStandardMaterial({ color: 0x6f757d, metalness: 0.05, roughness: 0.92 }),
    ledGreen: new THREE.MeshBasicMaterial({ color: 0x8effd8, toneMapped: false }),
    ledAmber: new THREE.MeshBasicMaterial({ color: 0xffc37a, toneMapped: false }),
    ledBlue: new THREE.MeshBasicMaterial({ color: 0x93a3ff, toneMapped: false }),
  };
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */
const rbox = (w, h, d, r = 0.12) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, Math.min(w, h, d) / 2 - 0.001));

function mesh(geometry, material, position, rotation) {
  const m = new THREE.Mesh(geometry, material);
  if (position) m.position.set(position[0], position[1], position[2]);
  if (rotation) m.rotation.set(rotation[0], rotation[1], rotation[2]);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function slab(w, h, d, material, position, radius = 0.12) {
  return mesh(rbox(w, h, d, radius), material, position);
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

/**
 * A perforated sheet. The holes are real gaps between raised lands sitting
 * over a dark backing plate, so they read as depth rather than as dots.
 */
function perfSheet(width, height, cols, rows, material, holeMaterial, depth = 0.35) {
  const group = new THREE.Group();
  const pitchX = width / cols;
  const pitchY = height / rows;
  const landX = pitchX * 0.58;
  const landY = pitchY * 0.58;

  const backing = mesh(new THREE.PlaneGeometry(width, height), holeMaterial, [0, 0, -depth * 0.6]);
  backing.castShadow = false;
  group.add(backing);

  const landGeo = new THREE.BoxGeometry(landX, landY, depth);
  const placements = [];
  for (let c = 0; c < cols; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      placements.push({
        p: [-width / 2 + pitchX * (c + 0.5), -height / 2 + pitchY * (r + 0.5), 0],
      });
    }
  }
  const lands = instances(landGeo, material, placements, { shadow: false });
  group.add(lands);
  return group;
}

/** A run of instanced slots (vents) laid out in a line. */
function slotRun(count, spacing, size, material) {
  return instances(new THREE.BoxGeometry(size[0], size[1], size[2]), material, Array.from(
    { length: count },
    (_, i) => ({ p: [(i - (count - 1) / 2) * spacing, 0, 0] })
  ), { shadow: false });
}

/** Instanced screws with a slot head. */
function screws(positions, material, radius = 0.34) {
  const head = instances(
    new THREE.CylinderGeometry(radius, radius * 0.9, 0.18, 10),
    material,
    positions.map((p) => ({ p, r: [Math.PI / 2, 0, 0] })),
    { shadow: false }
  );
  const slot = instances(
    new THREE.BoxGeometry(radius * 1.7, 0.05, radius * 0.32),
    material,
    positions.map((p) => ({ p: [p[0], p[1], p[2] + 0.09] })),
    { shadow: false }
  );
  const group = new THREE.Group();
  group.add(head, slot);
  return group;
}

/** A soft cable following a curve. */
function cable(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const geometry = new THREE.TubeGeometry(curve, 24, radius, 7, false);
  return mesh(geometry, material);
}

/* ------------------------------------------------------------------ *
 * Shared sub-assemblies
 * ------------------------------------------------------------------ */
function buildFan(radius, material, bladeMaterial, blades = 9) {
  const group = new THREE.Group();
  const ring = mesh(new THREE.TorusGeometry(radius, radius * 0.12, 8, 28), material);
  group.add(ring);
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
  group.add(slab(width, height, depth, mats.case, [0, 0, 0], 0.2));
  // top vent grille
  const grille = perfSheet(width * 0.55, depth * 0.5, 7, 7, mats.steel, mats.hole, 0.3);
  grille.rotation.x = -Math.PI / 2;
  grille.position.set(0, height / 2 + 0.06, 0);
  group.add(grille);
  // rear IEC inlet with pins
  group.add(slab(2.4, 1.8, 0.6, mats.dark, [-width / 2 + 2.2, -height / 2 + 1.6, -depth / 2 - 0.1], 0.08));
  group.add(
    instances(
      new THREE.BoxGeometry(0.2, 0.7, 0.2),
      mats.steel,
      [
        { p: [-width / 2 + 1.75, -height / 2 + 1.6, -depth / 2 - 0.35] },
        { p: [-width / 2 + 2.65, -height / 2 + 1.6, -depth / 2 - 0.35] },
      ],
      { shadow: false }
    )
  );
  // 24-pin shroud
  group.add(slab(4.4, 1.2, 1.6, mats.dark, [width / 2 - 2.6, height / 2 - 1, depth / 2 + 0.2], 0.06));
  // spec label
  group.add(slab(4.2, 2.6, 0.12, mats.label, [0, -height / 2 + 3, -depth / 2 - 0.3], 0.04));
  return group;
}

function buildMotherboard(width, height, mats, withIo) {
  const group = new THREE.Group();
  group.add(slab(width, height, 0.22, mats.pcb, [0, 0, 0], 0.04));
  // chipset heatsink
  group.add(slab(3.6, 3.6, 0.8, mats.steel, [width * 0.22, -height * 0.1, 0.42], 0.12));
  // VRM heatsinks along the top edge
  const vrm = new THREE.Group();
  for (let i = 0; i < 5; i += 1) {
    vrm.add(slab(1.5, 2.6, 0.7, mats.steel, [-width * 0.3 + i * 2.1, height * 0.3, 0.4], 0.1));
  }
  group.add(vrm);
  // discrete chips
  group.add(slab(1.6, 1.6, 0.35, mats.chip, [-width * 0.22, -height * 0.22, 0.3], 0.05));
  group.add(slab(1.2, 1.2, 0.3, mats.chip, [-width * 0.34, -height * 0.3, 0.28], 0.05));
  // M.2 module
  const m2 = new THREE.Group();
  m2.add(slab(8, 2.2, 0.2, mats.pcb, [0, 0, 0], 0.04));
  m2.add(slab(1.6, 1.6, 0.3, mats.chip, [2.4, 0, 0.2], 0.05));
  m2.add(slab(1.4, 1.4, 0.28, mats.chip, [0.4, 0, 0.2], 0.05));
  m2.position.set(-width * 0.1, -height * 0.36, 0.2);
  group.add(m2);
  if (withIo) {
    const io = new THREE.Group();
    io.add(slab(4.4, 1.8, 2.2, mats.steel, [0, 0, 0], 0.1));
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

/** A low profile blower cooler that lies flat inside a one litre chassis. */
function buildFlatCooler(width, mats, detailed) {
  const group = new THREE.Group();
  group.add(slab(width, 0.55, width, mats.chip, [0, 0, 0], 0.08));
  const finGeo = new THREE.BoxGeometry(width * 0.92, 0.8, 0.1);
  const finCount = detailed ? 12 : 7;
  const finMesh = new THREE.InstancedMesh(finGeo, mats.steel, finCount);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < finCount; i += 1) {
    matrix.makeTranslation(0, 0.55, -width / 2 + (width * (i + 0.5)) / finCount);
    finMesh.setMatrixAt(i, matrix);
  }
  finMesh.instanceMatrix.needsUpdate = true;
  finMesh.castShadow = true;
  group.add(finMesh);
  // blower sits on top of the fins
  const blower = buildFan(width * 0.36, mats.dark, mats.chip, detailed ? 9 : 7);
  blower.position.set(0, 1.1, 0);
  blower.rotation.x = -Math.PI / 2;
  group.add(blower);
  group.userData.blades = blower.userData.blades;
  return group;
}

function buildDrive(width, height, depth, mats, withTray) {
  const group = new THREE.Group();
  group.add(slab(width, height, depth, mats.steel, [0, 0, 0], 0.06));
  if (withTray) {
    group.add(slab(width * 0.98, height * 0.35, depth * 0.98, mats.dark, [0, height / 2 + 0.1, 0], 0.04));
    group.add(slab(width * 0.7, height * 0.2, 0.14, mats.steel, [0, -height * 0.1, depth / 2 + 0.02], 0.03));
  }
  group.add(slab(width * 0.6, height * 0.4, 0.08, mats.label, [0, 0, depth / 2 + 0.04], 0.02));
  group.add(slab(width * 0.5, height * 0.25, 0.6, mats.copper, [0, -height / 2 + 0.1, depth / 2 - 0.2], 0.02));
  return group;
}

/**
 * A low-profile half-length graphics card, mounted horizontally the way it
 * sits in a tower: length front-to-back, bracket at the rear, fans facing
 * down into the intake.
 */
function buildGpu(mats) {
  const group = new THREE.Group();
  const length = 17;
  const width = 11.2;

  // printed circuit board
  group.add(slab(width, 1.5, length, mats.case, [0, 0, 0], 0.08));
  // shroud along the top edge
  group.add(slab(width * 0.92, 0.6, 2.6, mats.dark, [0, 0.85, -length / 2 + 2.2], 0.06));
  // PCIe gold fingers
  group.add(slab(3.2, 0.5, 4.6, mats.copper, [width / 2 - 1.4, -0.6, length / 2 - 2.6], 0.04));
  // cooler fan on the underside
  const fan = buildFan(3.6, mats.dark, mats.chip, 11);
  fan.position.set(-1.6, -0.95, -1.4);
  fan.rotation.x = Math.PI / 2;
  group.add(fan);
  group.userData.fan = fan;
  // rear bracket
  group.add(slab(width * 0.96, 4.4, 0.4, mats.steel, [0, 0.6, -length / 2 - 0.2], 0.05));
  group.add(slab(1.9, 1.2, 0.6, mats.dark, [-1.6, 1.1, -length / 2 - 0.3], 0.05));
  group.add(slab(1.9, 1.2, 0.6, mats.dark, [1.6, 1.1, -length / 2 - 0.3], 0.05));
  return group;
}

/** A rear-panel port: recessed socket with a visible tongue. */
function port(type, mats, scale = 1) {
  const group = new THREE.Group();
  const s = scale;
  switch (type) {
    case 'usb-a':
      group.add(slab(1.35 * s, 0.62 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.05));
      group.add(slab(1.15 * s, 0.42 * s, 0.5 * s, mats.dark, [0, 0, 0.42 * s], 0.03));
      group.add(slab(0.16 * s, 0.34 * s, 0.34 * s, mats.steel, [-0.4 * s, 0, 0.6 * s], 0.02));
      group.add(slab(0.16 * s, 0.34 * s, 0.34 * s, mats.steel, [0.4 * s, 0, 0.6 * s], 0.02));
      break;
    case 'usb-c':
    case 'usbc':
      group.add(slab(0.95 * s, 0.42 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.05));
      group.add(slab(0.78 * s, 0.26 * s, 0.5 * s, mats.dark, [0, 0, 0.42 * s], 0.03));
      break;
    case 'rj45':
      group.add(slab(1.7 * s, 1.5 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.06));
      group.add(slab(1.25 * s, 1.0 * s, 0.5 * s, mats.dark, [0, 0, 0.42 * s], 0.04));
      group.add(slab(0.5 * s, 0.4 * s, 0.3 * s, mats.steel, [0, -0.45 * s, 0.55 * s], 0.03));
      break;
    case 'dp':
      group.add(slab(1.7 * s, 0.8 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.04));
      group.add(slab(1.45 * s, 0.55 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'hdmi':
      group.add(slab(1.7 * s, 0.75 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.04));
      group.add(slab(1.45 * s, 0.5 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'vga':
      group.add(slab(1.9 * s, 1.3 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.05));
      group.add(slab(1.4 * s, 0.9 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'serial':
      group.add(slab(1.8 * s, 0.9 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.04));
      group.add(slab(1.35 * s, 0.5 * s, 0.4 * s, mats.dark, [0, 0, 0.4 * s], 0.03));
      break;
    case 'audio':
      group.add(slab(0.95 * s, 0.95 * s, 0.9 * s, mats.steel, [0, 0, 0], 0.08));
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
function buildSff(mats, detailed) {
  const W = 17.8;
  const H = 36.8;
  const D = 29.0;
  const group = new THREE.Group();
  const parts = [];
  const spinners = [];

  const register = (obj, explode) => {
    obj.userData.explode = new THREE.Vector3(explode[0], explode[1], explode[2]);
    obj.userData.base = obj.position.clone();
    parts.push(obj);
    return obj;
  };

  /* --- shell --- */
  const leftPanel = new THREE.Group();
  leftPanel.add(slab(0.45, H, D, mats.case, [-W / 2 + 0.22, 0, 0], 0.1));
  register(leftPanel, [-3.2, 0, 0]);

  const rightCover = new THREE.Group();
  rightCover.add(slab(0.6, H, D, mats.case, [W / 2 - 0.3, 0, 0], 0.12));
  const coverMesh = perfSheet(W * 0.4, H * 0.46, detailed ? 11 : 6, detailed ? 17 : 9, mats.case, mats.hole, 0.4);
  coverMesh.rotation.y = Math.PI / 2;
  coverMesh.position.set(W / 2 + 0.02, 2, 0);
  rightCover.add(coverMesh);
  // captive thumbscrews
  rightCover.add(
    screws(
      [
        [W / 2 + 0.34, H / 2 - 2.5, D / 2 - 3],
        [W / 2 + 0.34, -H / 2 + 2.5, D / 2 - 3],
      ],
      mats.steel,
      0.42
    )
  );
  register(rightCover, [3.2, 0, 0]);

  const topPanel = new THREE.Group();
  topPanel.add(slab(W, 0.5, D, mats.case, [0, H / 2 - 0.25, 0], 0.1));
  // stamped vents on the lid
  const lidVents = slotRun(detailed ? 14 : 7, 0.92, [0.42, 0.08, 5.4], mats.hole);
  lidVents.position.set(0, H / 2 + 0.02, -5);
  topPanel.add(lidVents);
  // product label
  topPanel.add(slab(2.6, 0.1, 1.6, mats.label, [W * 0.3, H / 2 + 0.03, D * 0.3], 0.04));
  topPanel.add(slab(0.9, 0.12, 0.55, mats.indigo, [-W * 0.32, H / 2 + 0.04, D * 0.3], 0.05));
  register(topPanel, [0, 3.0, 0]);

  const bottomPanel = new THREE.Group();
  bottomPanel.add(slab(W, 0.5, D, mats.case, [0, -H / 2 + 0.25, 0], 0.1));
  // rubber feet
  bottomPanel.add(
    instances(
      new THREE.CylinderGeometry(1.1, 1.25, 0.6, 14),
      mats.rubber,
      [
        { p: [-W / 2 + 1.6, -H / 2 - 0.05, D / 2 - 2] },
        { p: [W / 2 - 1.6, -H / 2 - 0.05, D / 2 - 2] },
        { p: [-W / 2 + 1.6, -H / 2 - 0.05, -D / 2 + 2] },
        { p: [W / 2 - 1.6, -H / 2 - 0.05, -D / 2 + 2] },
      ]
    )
  );
  register(bottomPanel, [0, -2.6, 0]);

  const rearPanel = new THREE.Group();
  rearPanel.add(slab(W, H, 0.5, mats.case, [0, 0, -D / 2 + 0.25], 0.1));
  register(rearPanel, [0, 0, -3.0]);

  // rear I/O cluster, laid out to match the port map
  const rearPorts = [
    ['power', -7.6, -13.5],
    ['usb-c', -5.4, -13.5],
    ['usb-c', -3.9, -13.5],
    ['usb-a', -2.0, -13.5],
    ['usb-a', -0.5, -13.5],
    ['usb-a', 1.0, -13.5],
    ['usb-a', 2.5, -13.5],
    ['rj45', 4.6, -13.5],
    ['dp', 6.6, -12.2],
    ['hdmi', 6.6, -10.4],
    ['audio', 6.9, -15.4],
    ['serial', -7.6, -10.8],
  ];
  rearPorts.forEach(([type, x, y]) => {
    const socket = port(type, mats);
    socket.rotation.y = Math.PI;
    socket.position.set(x, y, -D / 2);
    rearPanel.add(socket);
  });

  group.add(leftPanel, rightCover, topPanel, bottomPanel, rearPanel);

  /* --- front bezel --- */
  const bezel = new THREE.Group();
  bezel.add(slab(W, H, 1.1, mats.bezel, [0, 0, D / 2 - 0.3], 0.2));
  // perforated intake field on the left third
  const perf = perfSheet(W * 0.28, H * 0.6, detailed ? 12 : 7, detailed ? 28 : 14, mats.bezel, mats.hole, 0.45);
  perf.position.set(-W * 0.3, -1, D / 2 + 0.26);
  bezel.add(perf);
  // chrome Dell-style vertical badge
  bezel.add(slab(0.55, 9.5, 0.28, mats.chrome, [W * 0.16, 2, D / 2 + 0.3], 0.12));
  bezel.add(slab(0.9, 1.5, 0.3, mats.chrome, [W * 0.16, -1.6, D / 2 + 0.3], 0.14));
  // slim optical drive slot with a tray lip
  bezel.add(slab(W * 0.44, 0.75, 0.5, mats.dark, [W * 0.06, H * 0.31, D / 2 + 0.28], 0.06));
  bezel.add(slab(W * 0.4, 0.16, 0.56, mats.steel, [W * 0.06, H * 0.31 - 0.3, D / 2 + 0.3], 0.04));
  // power button
  const power = mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.5, 20), mats.steel, [W * 0.3, H * 0.41, D / 2 + 0.32]);
  power.rotation.x = Math.PI / 2;
  bezel.add(power);
  const powerRing = mesh(new THREE.TorusGeometry(0.95, 0.11, 8, 24), mats.ledBlue, [W * 0.3, H * 0.41, D / 2 + 0.42]);
  bezel.add(powerRing);
  // front ports behind a flap
  bezel.add(slab(4.6, 1.5, 0.5, mats.dark, [W * 0.12, -H * 0.28, D / 2 + 0.28], 0.08));
  bezel.add(slab(0.9, 0.5, 0.16, mats.steel, [W * 0.06, -H * 0.28, D / 2 + 0.5], 0.04));
  const jack = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4, 14), mats.hole, [W * 0.34, -H * 0.28, D / 2 + 0.36]);
  jack.rotation.x = Math.PI / 2;
  bezel.add(jack);
  register(bezel, [0, 0, 4.2]);
  group.add(bezel);

  /* --- internals --- */
  const mobo = new THREE.Group();
  const board = buildMotherboard(24.4, 24.4, mats, true);
  board.rotation.y = Math.PI / 2;
  board.position.set(2.6, 0, 0);
  mobo.add(board);
  const cpu = new THREE.Group();
  cpu.add(slab(4.4, 4.4, 0.6, mats.pcb, [0, 0, 0], 0.06));
  const sink = buildHeatsink(7.2, 7.2, detailed ? 16 : 9, mats.steel);
  sink.position.set(0, 2.2, 0);
  cpu.add(sink);
  const cpuFan = buildFan(4.4, mats.dark, mats.chip, detailed ? 9 : 7);
  cpuFan.rotation.x = -Math.PI / 2;
  cpuFan.position.set(0, 4.4, 0);
  cpu.add(cpuFan);
  cpu.position.set(2.2, 6, 2.4);
  mobo.add(cpu);
  spinners.push(cpuFan.userData.blades);
  const dimms = buildDimm(4, mats);
  dimms.position.set(2.2, 9.5, -4);
  mobo.add(dimms);
  register(mobo, [-3.4, 0, 0]);
  group.add(mobo);

  const psu = new THREE.Group();
  const psuBody = buildPsu(14.5, 8.6, 13, mats);
  psuBody.position.set(-1.5, H / 2 - 7, -D / 2 + 8);
  psu.add(psuBody);
  register(psu, [-2.0, 3.2, -1.5]);
  group.add(psu);

  const gpu = new THREE.Group();
  const card = buildGpu(mats);
  gpu.add(card);
  gpu.position.set(-2.4, -H / 2 + 2.6, -2.2);
  spinners.push(card.userData.fan.userData.blades);
  register(gpu, [0, -1.6, 3.0]);
  group.add(gpu);

  const hdd = new THREE.Group();
  const d1 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d1.position.set(-3.4, -H / 2 + 5, -D / 2 + 9);
  const d2 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d2.position.set(-3.4, -H / 2 + 8, -D / 2 + 9);
  hdd.add(d1, d2);
  register(hdd, [-3.6, -1.2, -1.5]);
  group.add(hdd);

  const ssd = new THREE.Group();
  const s1 = buildDrive(10, 0.7, 7, mats, false);
  s1.position.set(3.5, -H / 2 + 3.5, D / 2 - 6);
  const s2 = buildDrive(10, 0.7, 7, mats, false);
  s2.position.set(3.5, -H / 2 + 4.6, D / 2 - 6);
  ssd.add(s1, s2);
  register(ssd, [3.0, -1.0, 2.0]);
  group.add(ssd);

  const intake = new THREE.Group();
  const fan = buildFan(4.6, mats.dark, mats.chip, detailed ? 9 : 7);
  fan.position.set(-4.2, -H / 2 + 4.5, D / 2 - 2.6);
  intake.add(fan);
  spinners.push(fan.userData.blades);
  register(intake, [0, 0, 2.6]);
  group.add(intake);

  /* --- cabling --- */
  const wires = new THREE.Group();
  wires.add(
    cable(
      [
        [-1.5, H / 2 - 8, -D / 2 + 10],
        [0, H / 2 - 12, -D / 2 + 13],
        [1.4, H / 2 - 16, -4],
        [1.8, H / 2 - 18, 2],
      ],
      0.42,
      mats.dark
    )
  );
  wires.add(
    cable(
      [
        [-2.4, -H / 2 + 8, -D / 2 + 10],
        [-1.2, -H / 2 + 12, -2],
        [0.6, -H / 2 + 11, 4],
        [1.6, -H / 2 + 6, 3],
      ],
      0.34,
      mats.dark
    )
  );
  wires.add(
    cable(
      [
        [2.2, 6, 2.4],
        [1.8, 2, 4.5],
        [1.2, -2, 4],
      ],
      0.26,
      mats.dark
    )
  );
  register(wires, [0, 0, 0]);
  group.add(wires);

  return { group, parts, spinners, size: [W, H, D] };
}

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
  base.add(slab(W, H, D, mats.case, [0, 0, 0], 0.2));
  register(base, [0, -2.4, 0]);
  group.add(base);

  const top = new THREE.Group();
  top.add(slab(W - 0.3, 0.35, D - 0.3, mats.case, [0, H / 2 - 0.1, 0], 0.12));
  const vent = perfSheet(W * 0.46, D * 0.5, detailed ? 18 : 9, detailed ? 15 : 8, mats.case, mats.hole, 0.4);
  vent.rotation.x = -Math.PI / 2;
  vent.position.set(0, H / 2 + 0.08, -1);
  top.add(vent);
  register(top, [0, 2.6, 0]);
  group.add(top);

  const front = new THREE.Group();
  front.add(slab(W - 0.2, H - 0.2, 0.7, mats.bezel, [0, 0, D / 2 - 0.2], 0.18));
  // perforated field across the left two thirds of the face
  const perf = perfSheet(W * 0.58, H * 0.58, detailed ? 22 : 11, detailed ? 6 : 3, mats.bezel, mats.hole, 0.4);
  perf.position.set(-W * 0.17, 0, D / 2 + 0.17);
  front.add(perf);
  // power button, front right
  const power = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 18), mats.steel, [W * 0.38, 0, D / 2 + 0.2]);
  power.rotation.x = Math.PI / 2;
  front.add(power);
  const led = mesh(new THREE.TorusGeometry(0.48, 0.08, 8, 20), mats.ledBlue, [W * 0.38, 0, D / 2 + 0.3]);
  front.add(led);
  // wordmark plate
  front.add(slab(2.6, 0.4, 0.16, mats.label, [W * 0.12, 0.9, D / 2 + 0.2], 0.04));
  front.add(slab(0.5, 0.24, 0.14, mats.indigo, [W * 0.29, 0.9, D / 2 + 0.2], 0.04));
  register(front, [0, 0, 3.4]);
  group.add(front);

  const rear = new THREE.Group();
  rear.add(slab(W - 0.4, H - 0.4, 0.5, mats.case, [0, 0, -D / 2 + 0.2], 0.12));
  // external DC barrel socket
  rear.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.5, 14), mats.dark, [W * 0.4, 0, -D / 2 - 0.1]));
  rear.children[0].rotation.x = Math.PI / 2;

  const tinyPorts = [
    ['usb-c', -6.8, -0.1],
    ['usb-a', -5.2, -0.1],
    ['usb-a', -3.7, -0.1],
    ['usb-a', -2.2, -0.1],
    ['usb-a', -0.7, -0.1],
    ['rj45', 1.0, -0.1],
    ['dp', 3.0, 0.5],
    ['dp', 3.0, -0.7],
    ['hdmi', 5.0, -0.1],
    ['audio', 7.2, -0.1],
  ];
  tinyPorts.forEach(([type, x, y]) => {
    const socket = port(type, mats);
    socket.rotation.y = Math.PI;
    socket.position.set(x, y, -D / 2 - 0.05);
    rear.add(socket);
  });

  register(rear, [0, 0, -3.0]);
  group.add(rear);

  /* --- internals --- */
  const mobo = new THREE.Group();
  const board = buildMotherboard(17.2, 15.4, mats, false);
  board.rotation.x = -Math.PI / 2;
  board.position.set(0, -1.1, -1);
  mobo.add(board);
  const cpu = new THREE.Group();
  cpu.add(slab(3.6, 0.4, 3.6, mats.pcb, [0, 0, 0], 0.06));
  const cooler = buildFlatCooler(5.2, mats, detailed);
  cooler.position.set(0, 0.15, 0);
  cpu.add(cooler);
  spinners.push(cooler.userData.blades);
  cpu.position.set(-3.6, -0.95, -1);
  mobo.add(cpu);
  const dimms = buildDimm(2, mats, 2.6);
  dimms.rotation.y = Math.PI / 2;
  dimms.position.set(2.1, -0.7, -1);
  mobo.add(dimms);
  register(mobo, [0, 1.8, 0]);
  group.add(mobo);

  const riser = new THREE.Group();
  riser.add(slab(7, 0.25, 8, mats.pcb, [0, 0, 0], 0.05));
  riser.add(slab(2.2, 0.5, 1.6, mats.chip, [0, 0.3, 0], 0.05));
  riser.position.set(5.5, -0.4, 3.2);
  register(riser, [3.2, 1.2, 1.6]);
  group.add(riser);

  const nic = new THREE.Group();
  nic.add(slab(3.4, 0.22, 4.2, mats.pcb, [0, 0, 0], 0.05));
  nic.add(slab(2.2, 0.6, 2.2, mats.steel, [0, 0.4, 0], 0.08));
  nic.position.set(-6.5, -0.4, 5.5);
  register(nic, [-3.0, 1.4, 2.2]);
  group.add(nic);

  const bay = new THREE.Group();
  bay.add(buildDrive(10, 0.7, 7, mats, false));
  bay.position.set(4.0, -0.9, -4.5);
  register(bay, [3.0, 0.8, -2.2]);
  group.add(bay);

  const wires = new THREE.Group();
  wires.add(
    cable(
      [
        [-3.5, -0.4, -1],
        [-1.5, -0.2, 2.5],
        [2.0, -0.5, 2.0],
        [5.0, -0.4, 3.2],
      ],
      0.24,
      mats.dark
    )
  );
  register(wires, [0, 0, 0]);
  group.add(wires);

  /* --- vertical stand --- */
  const stand = new THREE.Group();
  stand.add(slab(W * 0.8, 0.7, 4.5, mats.plastic, [0, -H / 2 - 0.4, 2.0], 0.2));
  stand.add(slab(W * 0.8, 0.5, 1.4, mats.plastic, [0, -H / 2 - 0.35, -1.6], 0.18));
  stand.add(slab(W * 0.2, 1.2, 1.6, mats.rubber, [0, -H / 2 - 0.05, -1.6], 0.12));
  register(stand, [0, -1.6, 0]);
  group.add(stand);

  return { group, parts, spinners, size: [W, H, D] };
}

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
  leftPanel.add(slab(0.45, H, D, mats.case, [-W / 2 + 0.22, 0, 0], 0.1));
  register(leftPanel, [-3.0, 0, 0]);
  group.add(leftPanel);

  const rightCover = new THREE.Group();
  rightCover.add(slab(0.6, H, D, mats.case, [W / 2 - 0.3, 0, 0], 0.12));
  const coverMesh = perfSheet(W * 0.44, H * 0.48, detailed ? 12 : 6, detailed ? 12 : 6, mats.case, mats.hole, 0.4);
  coverMesh.rotation.y = Math.PI / 2;
  coverMesh.position.set(W / 2 + 0.02, 0, 0);
  rightCover.add(coverMesh);
  register(rightCover, [3.0, 0, 0]);
  group.add(rightCover);

  const topPanel = new THREE.Group();
  topPanel.add(slab(W, 0.5, D, mats.case, [0, H / 2 - 0.25, 0], 0.1));
  topPanel.add(slab(3.2, 0.1, 2.0, mats.label, [-W * 0.26, H / 2 + 0.03, D * 0.24], 0.04));
  register(topPanel, [0, 2.8, 0]);
  group.add(topPanel);

  const bottomPanel = new THREE.Group();
  bottomPanel.add(slab(W, 0.5, D, mats.case, [0, -H / 2 + 0.25, 0], 0.1));
  bottomPanel.add(
    instances(
      new THREE.CylinderGeometry(1.05, 1.2, 0.55, 14),
      mats.rubber,
      [
        { p: [-W / 2 + 1.8, -H / 2 - 0.05, D / 2 - 2.2] },
        { p: [W / 2 - 1.8, -H / 2 - 0.05, D / 2 - 2.2] },
        { p: [-W / 2 + 1.8, -H / 2 - 0.05, -D / 2 + 2.2] },
        { p: [W / 2 - 1.8, -H / 2 - 0.05, -D / 2 + 2.2] },
      ]
    )
  );
  register(bottomPanel, [0, -2.4, 0]);
  group.add(bottomPanel);

  const rearPanel = new THREE.Group();
  rearPanel.add(slab(W, H, 0.5, mats.case, [0, 0, -D / 2 + 0.25], 0.1));
  register(rearPanel, [0, 0, -2.8]);

  const microPorts = [
    ['power', -7.6, -6.6],
    ['usb-c', -5.4, -6.6],
    ['usb-a', -3.9, -6.6],
    ['usb-a', -2.4, -6.6],
    ['usb-a', -0.9, -6.6],
    ['usb-a', 0.6, -6.6],
    ['rj45', 2.6, -6.6],
    ['dp', 4.8, -5.4],
    ['hdmi', 4.8, -3.6],
    ['vga', 6.6, -4.6],
    ['serial', 6.6, -7.4],
    ['audio', -7.4, -3.8],
  ];
  microPorts.forEach(([type, x, y]) => {
    const socket = port(type, mats);
    socket.rotation.y = Math.PI;
    socket.position.set(x, y, -D / 2);
    rearPanel.add(socket);
  });

  group.add(rearPanel);

  /* --- perforated front panel --- */
  const bezel = new THREE.Group();
  bezel.add(slab(W, H, 0.8, mats.bezel, [0, 0, D / 2 - 0.25], 0.18));
  const perf = perfSheet(W * 0.64, H * 0.7, detailed ? 18 : 10, detailed ? 18 : 10, mats.bezel, mats.hole, 0.4);
  perf.position.set(-W * 0.13, 0, D / 2 + 0.17);
  bezel.add(perf);
  // Dell-style badge
  bezel.add(slab(0.7, 7.5, 0.26, mats.chrome, [W * 0.34, 0.6, D / 2 + 0.26], 0.12));
  bezel.add(slab(1.1, 1.4, 0.28, mats.chrome, [W * 0.34, -2.4, D / 2 + 0.26], 0.14));
  const power = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.45, 20), mats.steel, [W * 0.34, H * 0.33, D / 2 + 0.28]);
  power.rotation.x = Math.PI / 2;
  bezel.add(power);
  const ring = mesh(new THREE.TorusGeometry(0.8, 0.1, 8, 22), mats.ledBlue, [W * 0.34, H * 0.33, D / 2 + 0.36]);
  bezel.add(ring);
  register(bezel, [0, 0, 3.8]);
  group.add(bezel);

  /* --- internals --- */
  const mobo = new THREE.Group();
  const board = buildMotherboard(17.3, 17.1, mats, true);
  board.rotation.y = Math.PI / 2;
  board.position.set(2.2, 0, 0);
  mobo.add(board);
  const cpu = new THREE.Group();
  cpu.add(slab(4.2, 4.2, 0.6, mats.pcb, [0, 0, 0], 0.06));
  const sink = buildHeatsink(6.8, 6.8, detailed ? 15 : 9, mats.steel);
  sink.position.set(0, 2.0, 0);
  cpu.add(sink);
  const cpuFan = buildFan(4.2, mats.dark, mats.chip, detailed ? 9 : 7);
  cpuFan.rotation.x = -Math.PI / 2;
  cpuFan.position.set(0, 4.0, 0);
  cpu.add(cpuFan);
  cpu.position.set(2.0, 3.5, 1.5);
  mobo.add(cpu);
  spinners.push(cpuFan.userData.blades);
  const dimms = buildDimm(4, mats);
  dimms.position.set(2.0, 6.5, -4);
  mobo.add(dimms);
  register(mobo, [-3.2, 0, 0]);
  group.add(mobo);

  const psu = new THREE.Group();
  const psuBody = buildPsu(14, 7.4, 12, mats);
  psuBody.position.set(-0.5, -H / 2 + 4.5, -D / 2 + 7);
  psu.add(psuBody);
  register(psu, [-1.8, -2.4, -1.5]);
  group.add(psu);

  const hdd = new THREE.Group();
  const d1 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d1.position.set(-3.3, H / 2 - 4, -3);
  const d2 = buildDrive(10.2, 2.6, 14.7, mats, true);
  d2.position.set(-3.3, H / 2 - 7, -3);
  hdd.add(d1, d2);
  register(hdd, [-3.4, 1.6, -1.2]);
  group.add(hdd);

  const ssd = new THREE.Group();
  const s1 = buildDrive(10, 0.7, 7, mats, false);
  s1.position.set(3.5, -H / 2 + 2.4, 3.5);
  const s2 = buildDrive(10, 0.7, 7, mats, false);
  s2.position.set(3.5, -H / 2 + 3.4, 3.5);
  ssd.add(s1, s2);
  register(ssd, [3.0, -1.6, 1.8]);
  group.add(ssd);

  const intake = new THREE.Group();
  const fan = buildFan(4.4, mats.dark, mats.chip, detailed ? 9 : 7);
  fan.position.set(-3.0, -H / 2 + 3.2, D / 2 - 2.4);
  intake.add(fan);
  spinners.push(fan.userData.blades);
  register(intake, [0, 0, 2.4]);
  group.add(intake);

  const wires = new THREE.Group();
  wires.add(
    cable(
      [
        [-0.5, -H / 2 + 7, -D / 2 + 8],
        [0.8, -H / 2 + 10, -2],
        [1.8, -2, 0.5],
        [2.0, 3.5, 1.5],
      ],
      0.36,
      mats.dark
    )
  );
  register(wires, [0, 0, 0]);
  group.add(wires);

  return { group, parts, spinners, size: [W, H, D] };
}

const BUILDERS = { sff: buildSff, tiny: buildTiny, micro: buildMicro };

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */
export function buildChassis(preset = 'sff', { detailed = true } = {}) {
  const mats = makeMaterials();
  const builder = BUILDERS[preset] || BUILDERS.sff;
  const built = builder(mats, detailed);

  const root = new THREE.Group();
  root.add(built.group);

  // A soft light that only comes up as the chassis comes apart, so the
  // internals are readable instead of a black hole.
  const innerLight = new THREE.PointLight(0xdce4ff, 0, 14, 2);
  innerLight.position.set(0, 1.2, 0);
  root.add(innerLight);

  // normalise the model size so every preset frames the same
  const maxDim = Math.max(...built.size);
  root.scale.setScalar(6 / maxDim);

  /* local bounds, measured once, used to frame the model in the viewport */
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
    innerLight.intensity = amount * 9;
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
      if (object.material?.map?.dispose) object.material.map.dispose();
    });
    Object.values(mats).forEach((material) => material.dispose());
  }

  /** Half extents of the model in local units, including the current spread. */
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

export { makeMaterials, port, perfSheet };
