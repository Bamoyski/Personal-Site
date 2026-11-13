/**
 * Entry point.
 *
 * The binder content is rendered first and does not depend on three.js. The 3D
 * layer is imported separately and is allowed to fail: if the CDN is blocked,
 * the WebGL context is unavailable or the scene cannot start, the product
 * photograph in the viewport simply stays put and the page still reads.
 */

import { renderBinder, createFrameProvider } from './binder.js?v=20261113';
import { initUI } from './ui.js?v=20261113';

renderBinder();

const canvas = document.getElementById('scene');
const frames = createFrameProvider();
let scene = null;

initUI({
  onThemeChange: (theme) => scene?.setTheme(theme),
  onMotionChange: (reduced) => scene?.setMotion(reduced),
});

/* The 3D layer is an enhancement. Never let it take the page down with it. */
async function boot3D() {
  try {
    const { createScene } = await import('./scene.js?v=20261113');
    scene = createScene({
      canvas,
      getFrame: () => frames.getFrame(),
      // the photograph stays visible until the canvas can actually show
      // the product, so there is never an empty panel
      onReady: () => document.documentElement.classList.add('has-webgl'),
    });
    if (!scene) return;

    // if the scene cannot put an image on screen, fall back to the
    // photograph rather than leaving an empty panel
    const fallBackToPhoto = () => {
      document.documentElement.classList.remove('has-webgl');
      if (canvas) canvas.style.display = 'none';
    };
    const watchdog = setTimeout(() => {
      if (!scene.isReady()) fallBackToPhoto();
    }, 6000);
    window.addEventListener('load', () => clearTimeout(watchdog));

    // a lost context drops straight back to the photograph
    canvas.addEventListener('bm:contextlost', fallBackToPhoto);
  } catch (error) {
    scene = null;
    document.documentElement.classList.remove('has-webgl');
    if (canvas) canvas.style.display = 'none';
  }
}

boot3D();

/* re-measure the sheets once fonts have settled */
if (document.fonts?.ready) {
  document.fonts.ready.then(() => frames.refresh());
}
window.addEventListener('load', () => frames.refresh());

/* Small developer handle: window.__bm.scene, window.__bm.frames */
window.__bm = { get scene() { return scene; }, frames };
