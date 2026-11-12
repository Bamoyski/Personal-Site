# benmoyer.org

A tech binder for the three machines that run Ben Moyer's infrastructure:
a Dell OptiPlex 3090 SFF, a Lenovo ThinkCentre M910q Tiny, and a Dell OptiPlex
7050 Micro.

The site is static. No framework, no build step, no bundler.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The binder — markup, import map, and the shell |
| `404.html` | Matching not-found page |
| `assets/css/main.css` | All styling |
| `assets/js/main.js` | Entry point; wires the 3D layer to the document |
| `assets/js/machines.js` | The hardware data — specs, port maps, topology |
| `assets/js/binder.js` | Renders the sheets from the data and drives the camera |
| `assets/js/scene.js` | Three.js renderer, post-processing, camera framing |
| `assets/js/chassis.js` | Parametric chassis builder (three presets) |
| `assets/js/studio.js` | Studio environment, baked to an environment map |
| `assets/js/textures.js` | Procedural PBR maps, generated on a canvas |
| `assets/js/ui.js` | Theme, motion preference, icons, reveals, tab scrollspy |
| `og.png` | Social preview image |
| `favicon.svg` / `avatar.png` | Site icons |
| `robots.txt` / `sitemap.xml` | Search engine metadata |
| `_headers` | Security headers for Cloudflare |

## The 3D layer

There is no `.glb` anywhere. Each chassis is built from primitives in
`chassis.js`, with perforations, vent grilles, heatsink fins, port clusters,
cabling and fasteners generated as instanced geometry.

Materials are `MeshPhysicalMaterial` with procedurally generated normal and
roughness maps (`textures.js`). Lighting comes from a miniature photo studio
built in `studio.js` and baked into an environment map with `PMREMGenerator`,
plus a three-point rig for the direct light and shadows.

The camera is framed analytically: the target rectangle is the on-screen
"viewport" panel of the machine sheet you are reading, and the distance is
solved so the chassis fits that rectangle at any viewport size. Scroll down to
the **Inside** block on any sheet and the chassis comes apart.

Rendering goes through an `EffectComposer` on capable hardware:

```
RenderPass -> GTAO -> UnrealBloom -> OutputPass (ACES + sRGB) -> SMAA
```

Quality tiers are picked from device memory, core count and viewport width, and
can be forced with `?tier=low|medium|high`. The low tier renders straight to
the canvas with no post-processing and no shadows.

Without WebGL the page still reads as a binder — the canvas is replaced with a
static placeholder.

## Local preview

ES modules need to be served over HTTP, so open the folder with a server
rather than the file directly:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy

Pushes to `main` are deployed to <https://benmoyer.org> through Cloudflare.
