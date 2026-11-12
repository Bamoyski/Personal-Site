/**
 * Three.js layer for the tech binder.
 *
 * One canvas, fixed behind the document. The active machine's chassis is
 * framed inside whichever "viewport" panel the reader is looking at, so the
 * model appears to live inside the drawing rather than floating on top of it.
 *
 * Rendering goes through an EffectComposer on capable hardware:
 *   RenderPass -> GTAO (contact shading) -> Bloom (LEDs, speculars)
 *   -> OutputPass (ACES + sRGB) -> SMAA
 * Lower tiers drop the expensive passes and render straight to the canvas.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

import { buildChassis } from './chassis.js';
import { bakeEnvironment, buildLightRig } from './studio.js';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

const CAMERA_DIR = new THREE.Vector3(0.78, 0.5, 1.0).normalize();

/* ------------------------------------------------------------------ *
 * Quality tiers
 * ------------------------------------------------------------------ */
function pickTier() {
  const forced = new URLSearchParams(window.location.search).get('tier');
  if (forced === 'low' || forced === 'medium' || forced === 'high') {
    const tiers = {
      low: { name: 'low', pixelRatio: 1.25, shadows: false, gtao: false, bloom: false, smaa: false, detailed: false },
      medium: { name: 'medium', pixelRatio: 1.5, shadows: true, gtao: false, bloom: true, smaa: true, detailed: true },
      high: { name: 'high', pixelRatio: 1.35, shadows: true, gtao: true, bloom: true, smaa: true, detailed: true },
    };
    return tiers[forced];
  }

  const mobile = window.matchMedia('(max-width: 820px)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const memory = navigator.deviceMemory || 8;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (mobile || cores <= 4 || memory <= 4) {
    return { name: 'low', pixelRatio: 1.25, shadows: false, gtao: false, bloom: false, smaa: false, detailed: false };
  }
  if (cores <= 8 && memory <= 8) {
    return { name: 'medium', pixelRatio: 1.6, shadows: true, gtao: false, bloom: true, smaa: true, detailed: true };
  }
  return { name: 'high', pixelRatio: 2, shadows: true, gtao: true, bloom: true, smaa: true, detailed: !reduced };
}

const THEME = {
  dark: { fog: 0x08080a, shadow: 0.72, exposure: 1.16, env: 0.78, bloom: 0.16, bloomThreshold: 1.0 },
  light: { fog: 0xedebe6, shadow: 0.3, exposure: 1.0, env: 0.9, bloom: 0.1, bloomThreshold: 1.05 },
};

export function createScene({ canvas, getFrame } = {}) {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tier = pickTier();
  let theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: tier.name === 'low',
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
  } catch (error) {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = THEME[theme].exposure;
  renderer.shadowMap.enabled = tier.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);

  /* --------------------------- studio environment ------------------------- */
  let envRT = bakeEnvironment(renderer, { theme });
  scene.environment = envRT.texture;
  scene.environmentIntensity = THEME[theme].env;

  const rig = buildLightRig(scene, {
    shadows: tier.shadows,
    shadowSize: tier.name === 'high' ? 2048 : 1024,
    theme,
  });

  /* ------------------------------- ground shadow -------------------------- */
  /* A soft painted contact shadow reads far better than a hard cast one,
     and costs nothing. The real shadow map still does the self-shadowing. */
  const blobCanvas = document.createElement('canvas');
  blobCanvas.width = blobCanvas.height = 128;
  const blobCtx = blobCanvas.getContext('2d');
  const blobGradient = blobCtx.createRadialGradient(64, 64, 2, 64, 64, 62);
  blobGradient.addColorStop(0, 'rgba(0,0,0,0.85)');
  blobGradient.addColorStop(0.45, 'rgba(0,0,0,0.42)');
  blobGradient.addColorStop(1, 'rgba(0,0,0,0)');
  blobCtx.fillStyle = blobGradient;
  blobCtx.fillRect(0, 0, 128, 128);
  const blobTexture = new THREE.CanvasTexture(blobCanvas);

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshBasicMaterial({
      map: blobTexture,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      color: 0x000000,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -3.4;
  scene.add(shadow);

  /* --------------------------------- chassis ------------------------------ */
  let machine = null;
  let currentPreset = null;
  let motion = prefersReduced ? 0 : 1;

  const state = {
    yaw: 0,
    explode: 0,
    visible: false,
    distance: 40,
  };
  const target = { yaw: 0, explode: 0, visible: false };

  function setMachine(preset) {
    if (preset === currentPreset) return;
    if (machine) {
      scene.remove(machine.root);
      machine.dispose();
      machine = null;
    }
    currentPreset = preset;
    if (!preset) return;
    machine = buildChassis(preset, { detailed: tier.detailed });
    scene.add(machine.root);
    // keep the contact shadow just under the model
    const extents = machine.halfExtents();
    shadow.position.y = -(extents.y + 0.55);
  }

  /* -------------------------------- framing ------------------------------- */
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const modelCentre = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camTarget = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const ndcBox = new THREE.Box2();

  function updateCorners() {
    const { centre, x, y, z } = machine.halfExtents();
    modelCentre.copy(centre).applyMatrix4(machine.root.matrixWorld);
    let i = 0;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corners[i].set(sx * x, sy * y, sz * z).applyMatrix4(machine.root.matrixWorld);
          i += 1;
        }
      }
    }
  }

  function projectCorners() {
    ndcBox.makeEmpty();
    for (let i = 0; i < 8; i += 1) {
      tmp.copy(corners[i]).project(camera);
      ndcBox.expandByPoint(tmp);
    }
    return ndcBox;
  }

  /**
   * Fits the model inside the target rectangle and centres it there.
   * Distance is solved iteratively because the projected size is perspective
   * dependent, then the camera is slid sideways to land the model on target.
   */
  function frameModel(rect, W, H) {
    if (!machine) return;
    updateCorners();

    const targetW = (rect.width / W) * 2;
    const targetH = (rect.height / H) * 2;
    const padding = 0.9;

    let distance = 34;
    for (let pass = 0; pass < 4; pass += 1) {
      camPos.copy(CAMERA_DIR).multiplyScalar(distance).add(modelCentre);
      camera.position.copy(camPos);
      camera.lookAt(modelCentre);
      camera.updateMatrixWorld();

      const box = projectCorners();
      const ndcW = Math.max(box.max.x - box.min.x, 0.0001);
      const ndcH = Math.max(box.max.y - box.min.y, 0.0001);
      const scale = Math.min((targetW * padding) / ndcW, (targetH * padding) / ndcH);
      distance = clamp(distance / scale, 6, 400);
    }

    // final placement
    camPos.copy(CAMERA_DIR).multiplyScalar(distance).add(modelCentre);
    camera.position.copy(camPos);
    camera.lookAt(modelCentre);
    camera.updateMatrixWorld();
    const box = projectCorners();

    const ndcCentreX = (box.min.x + box.max.x) / 2;
    const ndcCentreY = (box.min.y + box.max.y) / 2;
    const wantX = ((rect.left + rect.width / 2) / W) * 2 - 1;
    const wantY = 1 - ((rect.top + rect.height / 2) / H) * 2;

    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);

    // aiming off-centre pushes the model the opposite way on screen
    const shiftX = -(wantX - ndcCentreX) * distance * tanV * camera.aspect;
    const shiftY = -(wantY - ndcCentreY) * distance * tanV;

    camTarget.copy(modelCentre).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
    camera.position.copy(camPos).addScaledVector(right, shiftX).addScaledVector(up, shiftY);
    camera.lookAt(camTarget);
    camera.updateMatrixWorld();

    state.distance = distance;
  }

  /* ---------------------------- post processing --------------------------- */
  let composer = null;
  let bloomPass = null;
  let gtaoPass = null;

  function buildComposer() {
    if (composer) {
      composer.dispose();
      composer = null;
    }
    if (tier.name === 'low') return;

    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);

    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 0,
    });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));

    if (tier.gtao) {
      gtaoPass = new GTAOPass(scene, camera, size.x, size.y);
      gtaoPass.output = GTAOPass.OUTPUT.Default;
      gtaoPass.blendIntensity = 0.85;
      gtaoPass.updateGtaoMaterial({
        radius: 0.35,
        distanceExponent: 1.4,
        thickness: 1.0,
        scale: 1.0,
        samples: 8,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      gtaoPass.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
      composer.addPass(gtaoPass);
    } else {
      gtaoPass = null;
    }

    if (tier.bloom) {
      bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), THEME[theme].bloom, 0.7, THEME[theme].bloomThreshold);
      composer.addPass(bloomPass);
    } else {
      bloomPass = null;
    }

    composer.addPass(new OutputPass());

    if (tier.smaa) {
      composer.addPass(new SMAAPass(size.x, size.y));
    }
  }

  buildComposer();

  /* --------------------------------- theme -------------------------------- */
  function setTheme(next) {
    theme = next;
    const preset = THEME[next] || THEME.dark;
    renderer.toneMappingExposure = preset.exposure;
    scene.environmentIntensity = preset.env;
    shadow.material.opacity = preset.shadow;
    if (bloomPass) {
      bloomPass.strength = preset.bloom;
      bloomPass.threshold = preset.bloomThreshold;
    }
    // re-bake the studio so the reflections follow the theme
    const previous = envRT;
    envRT = bakeEnvironment(renderer, { theme: next });
    scene.environment = envRT.texture;
    previous.dispose();
    rig.ambient.intensity = next === 'dark' ? 0.35 : 0.7;
  }

  function setMotion(value) {
    motion = value ? 0 : 1;
  }

  /* --------------------------------- resize ------------------------------- */
  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const nextTier = pickTier();
    if (nextTier.name !== tier.name) {
      tier = nextTier;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
      renderer.shadowMap.enabled = tier.shadows;
      rig.key.castShadow = tier.shadows;
      if (machine) {
        scene.remove(machine.root);
        machine.dispose();
        machine = null;
        currentPreset = null;
      }
      buildComposer();
    }
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, tier.pixelRatio));
    renderer.setSize(width, height, false);
    if (composer) {
      composer.setSize(width, height);
      const size = new THREE.Vector2();
      renderer.getDrawingBufferSize(size);
      if (gtaoPass) gtaoPass.setSize(size.x, size.y);
      if (bloomPass) bloomPass.setSize(size.x, size.y);
    }
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  /* --------------------------------- loop --------------------------------- */
  let running = false;
  let lastTime = performance.now();
  let elapsed = 0;
  let lastRect = null;

  function loop(now) {
    if (!running) return;
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    elapsed += delta;

    const frame = getFrame?.();
    if (frame) {
      target.yaw = frame.yaw;
      target.explode = frame.explode;
      target.visible = frame.visible;
      if (frame.preset && frame.preset !== currentPreset) setMachine(frame.preset);
      lastRect = frame.rect;
    }

    const ease = prefersReduced ? 1 : 1 - Math.pow(0.002, delta);
    state.yaw = lerp(state.yaw, target.yaw, ease);
    state.explode = lerp(state.explode, target.explode, ease);
    state.visible = target.visible;

    if (machine) {
      machine.root.visible = state.visible;
      machine.setExplode(state.explode);
      machine.update(delta, motion);

      const idle = motion;
      machine.root.rotation.y = state.yaw + Math.sin(elapsed * 0.22) * 0.035 * idle;
      machine.root.rotation.x = Math.sin(elapsed * 0.31) * 0.012 * idle;
      machine.root.position.y = Math.sin(elapsed * 0.47) * 0.12 * idle;
      machine.root.updateMatrixWorld(true);

      if (state.visible && lastRect) {
        frameModel(lastRect, window.innerWidth, window.innerHeight);
      } else {
        camera.position.copy(CAMERA_DIR).multiplyScalar(40).add(modelCentre);
        camera.lookAt(modelCentre);
      }
    }

    if (composer) composer.render(delta);
    else renderer.render(scene, camera);

    requestAnimationFrame(loop);
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    requestAnimationFrame(loop);
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
    setMachine,
    start,
    stop,
    tier,
    scene,
    camera,
    renderer,
    dispose() {
      stop();
      if (machine) machine.dispose();
      if (composer) composer.dispose();
      renderer.dispose();
      envRT.dispose();
    },
  };
}
