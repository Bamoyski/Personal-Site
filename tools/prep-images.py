"""Prepare product photography for the binder.

Removes the studio backdrop from product shots, trims the empty margin and
writes a trimmed PNG with alpha so the machine can sit on the page
background. Border flood fill keeps white detail inside the product (badges,
ports, logo) intact.

Usage:
    python tools/prep-images.py <source> <dest> [--tolerance 34] [--feather 6]
"""

import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter


def remove_backdrop(image, tolerance=34, feather=6):
    rgba = image.convert("RGBA")
    arr = np.array(rgba).astype(np.int16)
    h, w = arr.shape[:2]

    # background colour estimated from the border pixels
    border = np.concatenate(
        [arr[0, :, :3], arr[-1, :, :3], arr[:, 0, :3], arr[:, -1, :3]], axis=0
    ).astype(np.float32)
    bg = np.median(border, axis=0)

    rgb = arr[:, :, :3].astype(np.float32)
    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))

    # flood fill outwards from the border over near-background pixels
    near_bg = dist < tolerance
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()

    for x in range(w):
        for y in (0, h - 1):
            if near_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near_bg[y, x] and not visited[y, x]:
                visited[y, x] = True
                queue.append((y, x))

    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and near_bg[ny, nx]:
                visited[ny, nx] = True
                queue.append((ny, nx))

    alpha = np.full((h, w), 255, dtype=np.uint8)
    # soft edge: pixels just outside the flood are partially transparent
    edge = visited & (dist < tolerance * 1.9)
    alpha[edge] = np.clip(
        255 * (dist[edge] / (tolerance * 1.9)), 0, 255
    ).astype(np.uint8)
    alpha[visited & (dist >= tolerance)] = 0

    out = arr.copy()
    out[:, :, 3] = alpha
    result = Image.fromarray(out.astype(np.uint8), "RGBA")
    if feather:
        result = result.filter(ImageFilter.GaussianBlur(feather * 0.25))
    return result


def trim(image, pad_ratio=0.02):
    bbox = image.getbbox()
    if not bbox:
        return image
    cropped = image.crop(bbox)
    w, h = cropped.size
    pad = int(max(w, h) * pad_ratio)
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    canvas.paste(cropped, (pad, pad), cropped)
    return canvas


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = [a for a in sys.argv[1:] if a.startswith("--")]
    if len(args) < 2:
        print(__doc__)
        raise SystemExit(1)

    source, dest = args[0], args[1]
    tolerance = 34
    feather = 6
    for flag in flags:
        if flag.startswith("--tolerance"):
            tolerance = int(flag.split("=")[1])
        if flag.startswith("--feather"):
            feather = int(flag.split("=")[1])

    image = Image.open(source)
    has_alpha = image.mode in ("RGBA", "LA") and image.getchannel("A").getextrema()[0] < 250
    if has_alpha:
        result = image.convert("RGBA")
    else:
        result = remove_backdrop(image, tolerance, feather)

    result = trim(result)
    result.save(dest, "PNG", optimize=True)
    print(f"{source} -> {dest}  {result.size[0]}x{result.size[1]}")


if __name__ == "__main__":
    main()
