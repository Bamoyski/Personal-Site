/**
 * Entry point. Builds the binder sheets, wires the 3D layer to the document,
 * and hands control of the page to the DOM layer.
 *
 * The page degrades cleanly: without WebGL the product photograph in the
 * viewport is the fallback and the binder still reads as a binder.
 */

import { createScene } from './scene.js';
import { initUI } from './ui.js';
import { renderBinder, createFrameProvider } from './binder.js';

renderBinder();

const canvas = document.getElementById('scene');
const frames = createFrameProvider();

let scene = null;
try {
  scene = createScene({
    canvas,
    getFrame: () => frames.getFrame(),
  });
  if (scene) document.documentElement.classList.add('has-webgl');
} catch (error) {
  scene = null;
}

if (!scene) {
  // the product photograph in the viewport is the fallback
  canvas?.setAttribute('hidden', '');
}

initUI({
  onThemeChange: (theme) => scene?.setTheme(theme),
  onMotionChange: (reduced) => scene?.setMotion(reduced),
});

/* re-measure the sheets once fonts have settled */
if (document.fonts?.ready) {
  document.fonts.ready.then(() => frames.refresh());
}
window.addEventListener('load', () => frames.refresh());

/* Small developer handle: window.__bm.scene, window.__bm.frames */
window.__bm = { scene, frames };
