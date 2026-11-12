# benmoyer.org

A tech binder for the three machines that run Ben Moyer's infrastructure:
a Dell OptiPlex 3090 SFF, a Lenovo ThinkCentre M910q Tiny and a Dell
OptiPlex 7050 Micro.

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
| `assets/js/scene.js` | Three.js renderer, product stage, post-processing |
| `assets/js/studio.js` | Studio environment, baked to an environment map |
| `assets/js/ui.js` | Theme, motion preference, icons, reveals, tab scrollspy |
| `assets/img/machines/` | Product photography, reflections and contact shadows |
| `tools/prep-images.py` | Cuts the studio backdrop off the product shots |
| `tools/gen-plates.py` | Builds the reflection and contact shadow plates |
| `og.png` | Social preview image |
| `favicon.svg` / `avatar.png` | Site icons |
| `robots.txt` / `sitemap.xml` | Search engine metadata |
| `_headers` | Security headers for Cloudflare |

## The 3D layer

The exterior is not modelled. It is the real thing: manufacturer product
photography, cut out of its studio backdrop and stood on a real 3D floor.

`tools/prep-images.py` floods the background out of the source shot and
trims it to the product. `tools/gen-plates.py` then builds two derived
plates per machine — a flipped, blurred, fading reflection and a soft
contact shadow.

`scene.js` puts that in a Three.js studio: a glossy floor lit by an
environment map baked from `studio.js`, the product plate standing on it,
and the reflection and shadow laid into the same space. The camera is
solved analytically against the on-screen viewport panel, so the product is
framed correctly at any window size, and the whole thing orbits with the
scroll.

The plate is drawn unlit and without tone mapping, so the pixels on screen
are the pixels the manufacturer rendered. Over the top of it goes a
photographic grade: lens falloff, a touch of lateral chromatic aberration
and animated grain, plus a subtle bloom and SMAA.

### The exploded view

Scroll to the **Inside** block on any sheet and the photograph hands over to
a chassis that comes apart. `chassis.js` builds each machine to the
vendor dimensions —

| | H × W × D |
| --- | --- |
| OptiPlex 3090 SFF | 290 × 92.6 × 292.8 mm |
| OptiPlex 7050 Micro | 182 × 183 × 179 mm |
| ThinkCentre M910q Tiny | 36.5 × 182.9 × 179 mm |

— with the panels, PSU, board, memory, drives and cooling modelled and
separated along the assembly axis. Base colours are sampled from the real
photographs (`tools/sample-palette.py`) so the exploded model and the
photography agree on tone.

Without WebGL the page falls back to the same photograph in the DOM.

## Specification sources

The OptiPlex 3090 SFF rows follow Dell's own *OptiPlex 3090 Small Form
Factor Setup and Specifications* manual. Where a figure depends on how a
machine was ordered, the notes column says so rather than picking one.

## Local preview

ES modules need to be served over HTTP, so open the folder with a server
rather than the file directly:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy

Pushes to `main` are deployed to <https://benmoyer.org> through Cloudflare.
