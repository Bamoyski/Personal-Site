"""Sample real panel colours out of the product photographs.

The exploded model is built to the vendor dimensions, but its materials are
taken from the real machine so the two views agree.
"""
import os
from PIL import Image

SRC = r"C:\Portfolio\assets\img\machines"

# name -> { region: (x0, y0, x1, y1) in fractions of the image }
REGIONS = {
    "optiplex-3090-sff": {
        "side":  (0.62, 0.30, 0.86, 0.62),
        "front": (0.20, 0.32, 0.40, 0.66),
        "top":   (0.34, 0.10, 0.58, 0.22),
        "body":  (0.55, 0.40, 0.80, 0.70),
    },
    "optiplex-7050-micro": {
        "side":  (0.50, 0.30, 0.78, 0.62),
        "front": (0.12, 0.30, 0.36, 0.66),
        "top":   (0.22, 0.10, 0.50, 0.22),
        "body":  (0.45, 0.40, 0.72, 0.70),
    },
    "thinkcentre-m910q": {
        "side":  (0.44, 0.30, 0.78, 0.66),
        "front": (0.12, 0.24, 0.38, 0.70),
        "top":   (0.26, 0.08, 0.52, 0.20),
        "body":  (0.40, 0.36, 0.70, 0.68),
    },
}


def average(path, box):
    img = Image.open(path).convert("RGB")
    w, h = img.size
    crop = img.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)))
    px = list(crop.getdata())
    n = len(px)
    r = sum(p[0] for p in px) / n
    g = sum(p[1] for p in px) / n
    b = sum(p[2] for p in px) / n
    return (round(r), round(g), round(b))


if __name__ == "__main__":
    out = {}
    for name, regions in REGIONS.items():
        path = os.path.join(SRC, name + ".png")
        out[name] = {k: average(path, v) for k, v in regions.items()}
        print(name, out[name])

    with open(os.path.join(SRC, "palette.json"), "w", encoding="utf-8") as fh:
        import json
        json.dump(out, fh, indent=2)
