/**
 * Product stage.
 *
 * The hardware itself is the real thing: a manufacturer product photograph,
 * cut out and placed in a Three.js studio. The scene provides the depth —
 * a glossy floor, a soft reflection, a contact shadow, a camera that orbits
 * with the scroll, and a photographic grade over the top.
 *
 * The plate is drawn unlit and without tone mapping, so the pixels you see
 * are the pixels the manufacturer rendered.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { bakeEnvironment } from './studio.js';
import { buildChassis } from './chassis.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

/* Photographic grade: lens falloff, a touch of lateral chromatic aberration
   and animated grain, applied over the finished frame. */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.026 },
    uAberration: { value: 0.7 },
    uLift: { value: 0.004 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uLift;
    varying vec2 vUv;

    float hash( vec2 p ) {
      return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    }

    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r2 = dot( d, d );

      vec2 shift = d * r2 * uAberration * 0.01;
      vec4 col;
      col.r = texture2D( tDiffuse, uv + shift ).r;
      col.g = texture2D( tDiffuse, uv ).g;
      col.b = texture2D( tDiffuse, uv - shift ).b;
      col.a = 1.0;

      col.rgb *= 1.0 - uVignette * r2 * 1.15;

      col.rgb += uLift * ( 1.0 - col.rgb );

      float n = hash( uv * vec2( 1024.0, 768.0 ) + fract( uTime ) * 91.7 ) - 0.5;
      float luma = dot( col.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
      col.rgb += n * uGrain * ( 1.2 - luma );

      gl_FragColor = col;
    }
  `,
};

const PLATES = {
  'optiplex-3090-sff': 'assets/img/machines/optiplex-3090-sff.png',
  'optiplex-7050-micro': 'assets/img/machines/optiplex-7050-micro.png',
  'thinkcentre-m910q': 'assets/img/machines/thinkcentre-m910q.png',
};

/** Which chassis model belongs to which plate. */
const MODELS = {
  'optiplex-3090-sff': 'sff',
  'optiplex-7050-micro': 'micro',
  'thinkcentre-m910q': 'tiny',
};

const PLATE_HEIGHT = 3.1;

export function createScene({ canvas, getFrame } = {}) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let isSmall = window.matchMedia('(max-width: 820px)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !isSmall,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (error) {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // the plate is a finished photograph, so it must not be tone mapped again
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = false;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  /* ------------------------------- the stage ------------------------------ */
  const stage = new THREE.Group();
  scene.add(stage);

  // glossy floor that catches the environment
  const floorTexture = makeFloorTexture();
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(26, 26),
    new THREE.MeshPhysicalMaterial({
      color: 0x07080a,
      roughness: 0.34,
      metalness: 0.4,
      transparent: true,
      alphaMap: floorTexture,
      depthWrite: false,
      envMapIntensity: 0.3,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  stage.add(floor);

  // the product plate
  const plateMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), plateMaterial);
  stage.add(plate);

  // its reflection in the floor
  const reflectionMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.55,
  });
  const reflection = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), reflectionMaterial);
  reflection.rotation.x = Math.PI / 2;
  stage.add(reflection);

  // contact shadow
  const shadowMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0.85,
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  stage.add(shadow);

  /* ------------------------------- lighting ------------------------------ */
  const envRT = bakeEnvironment(renderer, { theme: 'dark' });
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.72;

  const key = new THREE.DirectionalLight(0xffffff, 3.4);
  key.position.set(4, 8, 6);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xb8bcd4, 1.4);
  rim.position.set(-5, 3, -6);
  scene.add(rim);

  /* ------------------------------- textures ------------------------------ */
  const loader = new THREE.TextureLoader();
  const textures = {};
  let currentKey = null;
  let loading = false;

  /* --------------------------- exploded chassis -------------------------- */
  let machine = null;
  let machinePlate = null;
  const machineMaterials = new Set();

  function loadMachine(plateKey) {
    const preset = MODELS[plateKey];
    if (!preset || plateKey === machinePlate) return;
    if (machine) {
      stage.remove(machine.root);
      machine.dispose();
      machine = null;
    }
    machinePlate = plateKey;
    machineMaterials.clear();
    machine = buildChassis(preset, { detailed: !isSmall });
    machine.root.traverse((object) => {
      if (object.material) {
        machineMaterials.add(object.material);
        object.material.transparent = true;
        object.material.opacity = 0;
      }
    });
    stage.add(machine.root);
  }

  function loadPlate(key) {
    if (key === currentKey || loading) return;
    const base = PLATES[key];
    if (!base) return;
    loading = true;
    const dir = base.replace(/[^/]+$/, '');
    const file = base.replace(/.*\//, '');

    loader.load(
      base,
      (map) => {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        map.needsUpdate = true;
        const aspect = map.image.width / map.image.height;
        plateMaterial.map = map;
        plateMaterial.needsUpdate = true;
        plate.scale.set(PLATE_HEIGHT * aspect, PLATE_HEIGHT, 1);
        plate.position.y = PLATE_HEIGHT / 2;

        loader.load(dir + 'ref-' + file, (ref) => {
          ref.colorSpace = THREE.SRGBColorSpace;
          reflectionMaterial.map = ref;
          reflectionMaterial.needsUpdate = true;
          reflection.scale.set(PLATE_HEIGHT * aspect, PLATE_HEIGHT, 1);
          reflection.position.set(0, -PLATE_HEIGHT / 2, 0.001);

          loader.load(dir + 'shadow-' + file, (sh) => {
            sh.colorSpace = THREE.SRGBColorSpace;
            shadowMaterial.map = sh;
            shadowMaterial.needsUpdate = true;
            shadow.scale.set(PLATE_HEIGHT * aspect * 0.92, PLATE_HEIGHT * 0.16, 1);
            shadow.position.set(0, 0.004, 0.02);

            textures[key] = { aspect };
            currentKey = key;
            loading = false;
          });
        });
      },
      undefined,
      () => {
        loading = false;
      }
    );
  }

  /* ------------------------------- camera -------------------------------- */
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const modelCentre = new THREE.Vector3();
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const ndcBox = new THREE.Box2();
  const scratch = new THREE.Vector3();

  const state = { yaw: 0, pitch: 0, distance: 20, visible: false, explode: 0 };
  const target = { yaw: 0, pitch: 0, distance: 20, visible: false, explode: 0 };

  /**
   * Frames the plate inside the on-screen viewport panel: the distance is
   * solved so the plate fills the panel, then the camera is slid sideways so
   * the plate lands exactly in the middle of it.
   */
  function framePlate(rect, W, H) {
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);

    // projected height of the plate as a fraction of the viewport
    const fill = 0.82;
    const wantNdc = 2 * (rect.height / H) * fill;
    const distance = clamp(PLATE_HEIGHT / (wantNdc * tanV), 6, 60);

    const yaw = state.yaw;
    const pitch = state.pitch;
    const dir = new THREE.Vector3(
      Math.sin(yaw) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch)
    );

    camPos.copy(dir).multiplyScalar(distance).add(tmp.set(0, PLATE_HEIGHT / 2, 0));
    camera.position.copy(camPos);
    camera.lookAt(tmp.set(0, PLATE_HEIGHT / 2, 0));
    camera.updateMatrixWorld();

    // where is the plate centre on screen?
    const centre = new THREE.Vector3(0, PLATE_HEIGHT / 2, 0).project(camera);
    const wantX = ((rect.left + rect.width / 2) / W) * 2 - 1;
    const wantY = 1 - ((rect.top + rect.height / 2) / H) * 2;

    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    const shiftX = -(wantX - centre.x) * distance * tanV * camera.aspect;
    const shiftY = -(wantY - centre.y) * distance * tanV;

    camTarget.copy(tmp.set(0, PLATE_HEIGHT / 2, 0)).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
    camera.position.copy(camPos).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
  }

  /**
   * Frames the exploded chassis inside the on-screen viewport panel. The
   * distance is solved so the projected bounding box fits the panel, then the
   * camera is slid sideways so it lands exactly in the middle of it.
   */
  function frameModel(rect, W, H) {
    if (!machine) return;
    const ext = machine.halfExtents();
    const c = ext.centre;
    const pts = [
      [-ext.x, -ext.y, -ext.z], [ext.x, -ext.y, -ext.z], [ext.x, ext.y, -ext.z], [-ext.x, ext.y, -ext.z],
      [-ext.x, -ext.y, ext.z], [ext.x, -ext.y, ext.z], [ext.x, ext.y, ext.z], [-ext.x, ext.y, ext.z],
    ];
    modelCentre.copy(c).applyMatrix4(machine.root.matrixWorld);
    pts.forEach((p, i) => corners[i].set(p[0], p[1], p[2]).applyMatrix4(machine.root.matrixWorld));

    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    // a technical three-quarter view, the angle an exploded diagram wants
    const dir = new THREE.Vector3(
      Math.sin(0.58) * Math.cos(0.5),
      Math.sin(0.5),
      Math.cos(0.58) * Math.cos(0.5)
    );

    let distance = 24;
    for (let pass = 0; pass < 4; pass += 1) {
      camPos.copy(dir).multiplyScalar(distance).add(modelCentre);
      camera.position.copy(camPos);
      camera.lookAt(modelCentre);
      camera.updateMatrixWorld();
      ndcBox.makeEmpty();
      for (let i = 0; i < 8; i += 1) {
        scratch.copy(corners[i]).project(camera);
        ndcBox.expandByPoint(scratch);
      }
      const ndcW = Math.max(ndcBox.max.x - ndcBox.min.x, 0.0001);
      const ndcH = Math.max(ndcBox.max.y - ndcBox.min.y, 0.0001);
      const wantW = 2 * (rect.width / W);
      const wantH = 2 * (rect.height / H);
      const scale = Math.min(wantW / ndcW, wantH / ndcH) * 0.94;
      distance = clamp(distance / scale, 6, 260);
    }

    camPos.copy(dir).multiplyScalar(distance).add(modelCentre);
    camera.position.copy(camPos);
    camera.lookAt(modelCentre);
    camera.updateMatrixWorld();
    ndcBox.makeEmpty();
    for (let i = 0; i < 8; i += 1) {
      scratch.copy(corners[i]).project(camera);
      ndcBox.expandByPoint(scratch);
    }

    const ndcCentreX = (ndcBox.min.x + ndcBox.max.x) / 2;
    const ndcCentreY = (ndcBox.min.y + ndcBox.max.y) / 2;
    const wantX = ((rect.left + rect.width / 2) / W) * 2 - 1;
    const wantY = 1 - ((rect.top + rect.height / 2) / H) * 2;

    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    const shiftX = -(wantX - ndcCentreX) * distance * tanV * camera.aspect;
    const shiftY = -(wantY - ndcCentreY) * distance * tanV;

    camTarget.copy(modelCentre).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
    camera.position.copy(camPos).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();
  }

  /* ---------------------------- post processing -------------------------- */
  let composer = null;
  let bloomPass = null;
  let gradePass = null;

  function buildComposer() {
    if (composer) {
      composer.dispose();
      composer = null;
    }
    if (isSmall) return;
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.12, 0.75, 0.9);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.addPass(new SMAAPass(size.x, size.y));
    gradePass = new ShaderPass(GradeShader);
    composer.addPass(gradePass);
  }
  buildComposer();

  /* -------------------------------- theme -------------------------------- */
  function setTheme(theme) {
    const dark = theme !== 'light';
    floor.material.color.setHex(dark ? 0x07080a : 0xd8d5ce);
    floor.material.envMapIntensity = dark ? 0.13 : 0.34;
    scene.environmentIntensity = dark ? 0.72 : 0.95;
    key.intensity = dark ? 3.4 : 3.9;
    rim.intensity = dark ? 1.4 : 0.9;
    reflectionMaterial.opacity = dark ? 0.55 : 0.4;
    shadowMaterial.opacity = dark ? 0.85 : 0.5;
    if (gradePass) {
      gradePass.uniforms.uVignette.value = dark ? 0.42 : 0.3;
      gradePass.uniforms.uGrain.value = dark ? 0.026 : 0.016;
    }
  }

  function setMotion(value) {
    state.motion = value ? 0 : 1;
  }

  /* -------------------------------- resize ------------------------------- */
  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const wasSmall = isSmall;
    isSmall = width <= 820;
    if (wasSmall !== isSmall) buildComposer();
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.5 : 2));
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setSize(width, height);
      const size = new THREE.Vector2();
      renderer.getDrawingBufferSize(size);
      if (bloomPass) bloomPass.setSize(size.x, size.y);
    }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* --------------------------------- loop -------------------------------- */
  let running = false;
  let lastTime = performance.now();
  let elapsed = 0;
  let lastRect = { left: 0, top: 0, width: 10, height: 10 };

  function loop(now) {
    if (!running) return;
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += delta;

    const frame = getFrame?.();
    if (frame) {
      if (frame.rect) lastRect = frame.rect;
      target.yaw = frame.yaw;
      target.pitch = frame.pitch;
      target.visible = frame.visible;
      target.explode = frame.explode || 0;
      if (frame.plate && frame.plate !== currentKey) loadPlate(frame.plate);
      if (frame.plate && frame.plate !== machinePlate) loadMachine(frame.plate);
    }

    const ease = prefersReduced ? 1 : 1 - Math.pow(0.002, delta);
    state.yaw = lerp(state.yaw, target.yaw, ease);
    state.pitch = lerp(state.pitch, target.pitch, ease);
    state.visible = target.visible;
    state.explode = lerp(state.explode, target.explode, ease);

    stage.visible = state.visible;

    if (state.visible) {
      // the photograph hands over to the exploded chassis
      const fade = clamp((state.explode - 0.28) / 0.44, 0, 1);
      const showPhoto = fade < 0.995;
      const showModel = fade > 0.005;

      plate.visible = showPhoto;
      reflection.visible = showPhoto;
      shadow.visible = showPhoto;
      plateMaterial.opacity = 1 - fade;
      reflectionMaterial.opacity = 0.55 * (1 - fade);
      shadowMaterial.opacity = 0.85 * (1 - fade);

      if (machine) {
        machine.root.visible = showModel;
        machine.setExplode(state.explode);
        machine.update(delta, motion);
        machine.root.rotation.y = state.yaw * 0.35 + 0.42;
        machine.root.rotation.x = state.pitch * 0.4 + 0.06;
        machine.root.updateMatrixWorld(true);
        machineMaterials.forEach((material) => {
          material.opacity = fade;
        });
      }

      if (fade < 0.5) framePlate(lastRect, window.innerWidth, window.innerHeight);
      else frameModel(lastRect, window.innerWidth, window.innerHeight);
    }

    if (composer) composer.render(delta);
    else renderer.render(scene, camera);

    if (gradePass) gradePass.uniforms.uTime.value = elapsed;

    requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  /** Draw a single frame immediately, without waiting for the loop. */
  function renderOnce() {
    const frame = getFrame?.();
    if (frame) {
      if (frame.rect) lastRect = frame.rect;
      target.yaw = frame.yaw;
      target.pitch = frame.pitch;
      target.visible = frame.visible;
      target.explode = frame.explode || 0;
      if (frame.plate && frame.plate !== currentKey) loadPlate(frame.plate);
      if (frame.plate && frame.plate !== machinePlate) loadMachine(frame.plate);
    }
    state.yaw = target.yaw;
    state.pitch = target.pitch;
    state.visible = target.visible;
    state.explode = target.explode;
    stage.visible = state.visible;
    if (state.visible) {
      const fade = clamp((state.explode - 0.28) / 0.44, 0, 1);
      const showPhoto = fade < 0.995;
      const showModel = fade > 0.005;
      plate.visible = showPhoto;
      reflection.visible = showPhoto;
      shadow.visible = showPhoto;
      plateMaterial.opacity = 1 - fade;
      reflectionMaterial.opacity = 0.55 * (1 - fade);
      shadowMaterial.opacity = 0.85 * (1 - fade);
      if (machine) {
        machine.root.visible = showModel;
        machine.setExplode(state.explode);
        machine.root.rotation.y = state.yaw * 0.35 + 0.42;
        machine.root.rotation.x = state.pitch * 0.4 + 0.06;
        machine.root.updateMatrixWorld(true);
        machineMaterials.forEach((material) => {
          material.opacity = fade;
        });
      }
      if (fade < 0.5) framePlate(lastRect, window.innerWidth, window.innerHeight);
      else frameModel(lastRect, window.innerWidth, window.innerHeight);
    }
    if (composer) composer.render(0.016);
    else renderer.render(scene, camera);
  }

  function stop() {
    running = false;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  start();

  return {
    setTheme,
    setMotion,
    start,
    stop,
    renderOnce,
    scene,
    camera,
    renderer,
    dispose() {
      stop();
      if (composer) composer.dispose();
      envRT.dispose();
      renderer.dispose();
    },
  };
}

/* A radial falloff so the floor fades out instead of ending in a hard edge. */
function makeFloorTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 6, 128, 128, 124);
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.22, '#6e6e6e');
  gradient.addColorStop(0.55, '#1c1c1c');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
