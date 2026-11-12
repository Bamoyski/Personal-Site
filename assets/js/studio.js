/**
 * Studio environment.
 *
 * A miniature photo studio built out of emissive panels and baked into an
 * environment map. This is what gives the floor its sheen and the product
 * a believable falloff, the same way a real product shot is lit.
 *
 * The room itself is a graded sphere rather than a flat colour, so every
 * reflection carries a horizon line instead of a dead grey.
 */

import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

let rectLightsReady = false;

/** A panel brighter than 1.0 — MeshBasicMaterial keeps HDR values in a float target. */
function panel(width, height, intensity, color) {
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color(color[0] * intensity, color[1] * intensity, color[2] * intensity),
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function addPanel(scene, mesh, position, rotation) {
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  scene.add(mesh);
  return mesh;
}

/** Vertical gradient used for the room shell. */
function gradientTexture(dark) {
  const canvas = document.createElement('canvas');
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 256, 0, 0);
  if (dark) {
    gradient.addColorStop(0.0, '#101216');
    gradient.addColorStop(0.28, '#191b21');
    gradient.addColorStop(0.46, '#25272e');
    gradient.addColorStop(0.52, '#15171c');
    gradient.addColorStop(0.78, '#08090c');
    gradient.addColorStop(1.0, '#050608');
  } else {
    gradient.addColorStop(0.0, '#c9c6be');
    gradient.addColorStop(0.3, '#e2dfd7');
    gradient.addColorStop(0.47, '#f3f1ea');
    gradient.addColorStop(0.53, '#dad7cf');
    gradient.addColorStop(0.8, '#b9b6ae');
    gradient.addColorStop(1.0, '#a5a29a');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 8, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Builds the environment scene. Positions are in centimetres, matching the
 * chassis scale, and the studio is sized around a ~20 unit subject.
 */
export function buildStudioScene({ theme = 'dark' } = {}) {
  const scene = new THREE.Scene();
  const disposables = [];
  const dark = theme === 'dark';

  // graded room shell
  const shellTexture = gradientTexture(dark);
  const shellMaterial = new THREE.MeshBasicMaterial({
    map: shellTexture,
    side: THREE.BackSide,
    toneMapped: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(44, 32, 24), shellMaterial);
  scene.add(shell);
  disposables.push(shell.geometry, shellMaterial, shellTexture);

  // floor gets a subtle bounce so the underside of the subject is not black
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(dark ? 0.07 : 0.36, dark ? 0.075 : 0.35, dark ? 0.085 : 0.34),
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -19.6;
  scene.add(floor);
  disposables.push(floor.geometry, floorMaterial);

  const white = [1, 1, 1];
  const cool = [0.88, 0.92, 1];
  const warm = [1, 0.94, 0.86];
  const indigo = [0.62, 0.66, 1];

  // key: large softbox above and slightly in front
  addPanel(scene, panel(26, 16, dark ? 5.5 : 4.2, warm), [2, 17, 6], [Math.PI / 2.35, 0, 0]);
  // hard specular source: small and very bright, gives crisp streak highlights
  addPanel(scene, panel(5, 3.5, dark ? 13 : 9, white), [12, 13, 11], [-Math.PI / 2.5, 0, 0]);
  // second, lower key so the vertical panels get a gradient rather than one flat band
  addPanel(scene, panel(20, 9, dark ? 2.6 : 2.0, warm), [1, 8, 13], [Math.PI / 2.7, 0, 0]);

  /* Big white bounce cards on the camera side. A black chassis only reads as
     black because of the broad soft gradient these leave across it — without
     them the panels fall into the background and the product disappears. */
  addPanel(scene, panel(26, 22, dark ? 2.1 : 1.5, [1, 0.97, 0.92]), [26, 3, 7], [0, -Math.PI / 2, 0]);
  addPanel(scene, panel(26, 18, dark ? 1.5 : 1.2, white), [3, 2, 27], [0, Math.PI, 0]);

  // fill: broad cool panel camera-left
  addPanel(scene, panel(16, 18, dark ? 0.9 : 1.2, cool), [-22, 2, 6], [0, Math.PI / 2, 0]);

  // rim: narrow strip set well behind, grazes the edges instead of flooding
  addPanel(scene, panel(2.2, 24, dark ? 11 : 7, white), [21, 4, -11], [0, -Math.PI / 2.4, 0]);

  // second rim strip on the far side for a double edge
  addPanel(scene, panel(2, 22, dark ? 8 : 5, cool), [-19, 3, -14], [0, Math.PI / 3.4, 0]);

  // back wash, indigo, separates the subject from the background
  addPanel(scene, panel(24, 12, dark ? 0.7 : 0.6, indigo), [0, 3, -24], [0, 0, 0]);

  // top kicker to catch top edges
  addPanel(scene, panel(26, 4, dark ? 4 : 2.8, white), [0, 15, -13], [Math.PI / 2, 0, 0]);

  scene.traverse((object) => {
    if (object.isMesh && object.material !== shellMaterial && object.material !== floorMaterial) {
      disposables.push(object.geometry, object.material);
    }
  });

  return {
    scene,
    dispose() {
      disposables.forEach((item) => item?.dispose?.());
    },
  };
}

/** Bakes the studio into an environment map for the live scene. */
export function bakeEnvironment(renderer, options = {}) {
  const studio = buildStudioScene(options);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const target = pmrem.fromScene(studio.scene, 0.008, 0.1, 140);
  pmrem.dispose();
  studio.dispose();
  return target;
}

/**
 * Direct lights for the live scene. Kept in step with the environment so
 * the specular and the reflections do not disagree.
 */
export function buildLightRig(scene, { shadows = true, shadowSize = 2048, theme = 'dark' } = {}) {
  const dark = theme === 'dark';

  if (!rectLightsReady) {
    RectAreaLightUniformsLib.init();
    rectLightsReady = true;
  }

  const key = new THREE.DirectionalLight(dark ? 0xfff4e6 : 0xffffff, dark ? 4.4 : 3.4);
  key.position.set(9, 16, 12);
  key.castShadow = shadows;
  if (key.shadow) {
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.018;
    key.shadow.radius = 3;
    key.shadow.blurSamples = 12;
  }
  scene.add(key);

  const fill = new THREE.DirectionalLight(dark ? 0x9fb8ff : 0xbcd0ff, dark ? 1.2 : 1.4);
  fill.position.set(-14, 4, 10);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(dark ? 0xa9adff : 0x7478e0, dark ? 2.6 : 1.7);
  rim.position.set(-7, 8, -16);
  scene.add(rim);

  const ambient = new THREE.HemisphereLight(dark ? 0x8fa2ff : 0xffffff, dark ? 0x0b0b0e : 0x6c6a64, dark ? 0.4 : 0.75);
  scene.add(ambient);

  /* Area lights give the long soft specular streaks that read as studio
     lighting on brushed metal. They do not cast shadows, so the directional
     rig still owns the shadows. */
  const softbox = new THREE.RectAreaLight(dark ? 0xfff1de : 0xffffff, dark ? 6 : 4.5, 16, 9);
  softbox.position.set(3, 11, 8);
  softbox.lookAt(0, 0, 0);
  scene.add(softbox);

  const strip = new THREE.RectAreaLight(dark ? 0xf2f6ff : 0xffffff, dark ? 14 : 8, 1.6, 16);
  strip.position.set(12, 3, -4);
  strip.lookAt(0, 1, 0);
  scene.add(strip);

  const wrap = new THREE.RectAreaLight(dark ? 0xcdd8ff : 0xe6ecff, dark ? 2.4 : 2.6, 12, 12);
  wrap.position.set(-11, 2, 5);
  wrap.lookAt(0, 0, 0);
  scene.add(wrap);

  return { key, fill, rim, ambient, softbox, strip, wrap };
}
