/**
 * Studio environment.
 *
 * A miniature photo studio built out of emissive panels and baked into an
 * environment map. This is what makes brushed metal look like brushed metal:
 * the long soft streak highlights come from the strip lights, and the soft
 * gradient falloff on the curved edges comes from the big overhead softbox.
 *
 * The same rig also provides the direct lights for the live scene so the
 * specular highlights and the reflections agree.
 */

import * as THREE from 'three';

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

/**
 * Builds the environment scene. Positions are in centimetres, matching the
 * chassis scale, and the studio is sized around a ~20 unit subject.
 */
export function buildStudioScene({ theme = 'dark' } = {}) {
  const scene = new THREE.Scene();
  const disposables = [];

  const dark = theme === 'dark';
  const roomColor = dark ? 0x090a0d : 0x8f8d88;

  // enclosing room
  const roomMaterial = new THREE.MeshStandardMaterial({
    color: roomColor,
    roughness: 1,
    metalness: 0,
    side: THREE.BackSide,
  });
  const room = new THREE.Mesh(new THREE.BoxGeometry(60, 40, 60), roomMaterial);
  scene.add(room);
  disposables.push(room.geometry, roomMaterial);

  // floor gets a subtle bounce so the underside of the subject is not black
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(dark ? 0.09 : 0.42, dark ? 0.095 : 0.41, dark ? 0.11 : 0.4),
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -19.6;
  scene.add(floor);
  disposables.push(floor.geometry, floorMaterial);

  const white = [1, 1, 1];
  const cool = [0.86, 0.9, 1];
  const warm = [1, 0.93, 0.85];
  const indigo = [0.55, 0.6, 1];

  // key: large softbox above and slightly in front
  addPanel(scene, panel(26, 16, dark ? 5.5 : 4.2, warm), [2, 17, 6], [Math.PI / 2.35, 0, 0]);
  // hard specular source: small and very bright, gives crisp streak highlights
  addPanel(scene, panel(5, 3.5, dark ? 13 : 9, white), [12, 13, 11], [-Math.PI / 2.5, 0, 0]);

  // fill: broad cool panel camera-left
  addPanel(scene, panel(16, 18, dark ? 0.7 : 1.2, cool), [-22, 2, 6], [0, Math.PI / 2, 0]);

  // rim: narrow strip set well behind, grazes the edges instead of flooding
  addPanel(scene, panel(2.2, 24, dark ? 11 : 7, white), [21, 4, -11], [0, -Math.PI / 2.4, 0]);

  // second rim strip on the far side for a double edge
  addPanel(scene, panel(2, 22, dark ? 8 : 5, cool), [-19, 3, -14], [0, Math.PI / 3.4, 0]);

  // back wash, indigo, separates the subject from the background
  addPanel(scene, panel(24, 12, dark ? 0.7 : 0.6, indigo), [0, 3, -24], [0, 0, 0]);

  // top kicker to catch top edges
  addPanel(scene, panel(26, 4, dark ? 4 : 2.8, white), [0, 15, -13], [Math.PI / 2, 0, 0]);

  scene.traverse((object) => {
    if (object.isMesh && object.material !== roomMaterial && object.material !== floorMaterial) {
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
  const target = pmrem.fromScene(studio.scene, 0.015, 0.1, 120);
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

  const key = new THREE.DirectionalLight(dark ? 0xfff4e6 : 0xffffff, dark ? 5.2 : 4.2);
  key.position.set(9, 16, 12);
  key.castShadow = shadows;
  if (shadows) {
    key.shadow.mapSize.set(shadowSize, shadowSize);
    key.shadow.camera.left = -16;
    key.shadow.camera.right = 16;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 2.5;
  }
  scene.add(key);

  const fill = new THREE.DirectionalLight(dark ? 0x9fb8ff : 0xbcd0ff, dark ? 1.8 : 2.0);
  fill.position.set(-14, 4, 10);
  scene.add(fill);

  const rim = new THREE.DirectionalLight(dark ? 0xa9adff : 0x7478e0, dark ? 3.2 : 2.0);
  rim.position.set(-7, 8, -16);
  scene.add(rim);

  const kick = new THREE.DirectionalLight(0xffffff, dark ? 2.4 : 1.6);
  kick.position.set(14, 6, 8);
  scene.add(kick);

  const ambient = new THREE.HemisphereLight(dark ? 0x8fa2ff : 0xffffff, dark ? 0x0b0b0e : 0x6c6a64, dark ? 0.55 : 0.9);
  scene.add(ambient);

  return { key, fill, rim, kick, ambient };
}
