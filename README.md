# benmoyer.org

Personal portfolio for Ben Moyer — infrastructure, interfaces, and the occasional homelab project.

The site is a single static page. No framework, no build step, no runtime dependencies.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The portfolio — markup, styles, and a small amount of vanilla JS |
| `404.html` | Matching not-found page |
| `og.png` | 1200×630 social preview image |
| `favicon.svg` / `avatar.png` | Site icons |
| `robots.txt` / `sitemap.xml` | Search engine metadata |
| `_headers` | Security headers for Cloudflare |

## Local preview

Open `index.html` directly, or serve the folder:

```bash
python -m http.server 8000
```

Then visit <http://localhost:8000>.

## Deploy

Pushes to `main` are deployed to <https://benmoyer.org> through Cloudflare.
