"""Generate the studio reflection and contact shadow for the product plates."""
import os
from PIL import Image, ImageFilter, ImageDraw

SRC = r"C:\Portfolio\assets\img\machines"
OUT = r"C:\Portfolio\assets\img\machines"

for name in os.listdir(SRC):
    if not name.endswith(".png") or name.startswith(("ref-", "shadow-")):
        continue
    img = Image.open(os.path.join(SRC, name)).convert("RGBA")

    # reflection: flipped, blurred, fading out downward
    ref = img.transpose(Image.FLIP_TOP_BOTTOM)
    ref = ref.filter(ImageFilter.GaussianBlur(radius=max(2, img.width // 90)))
    w, h = ref.size
    alpha = ref.getchannel("A")
    fade = Image.new("L", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        fade.putpixel((0, y), int(255 * max(0.0, 1.0 - t) ** 2.1))
    fade = fade.resize((w, h))
    alpha = Image.composite(alpha, Image.new("L", (w, h), 0), fade)
    ref.putalpha(alpha)
    ref.save(os.path.join(OUT, "ref-" + name), "PNG", optimize=True)

    # contact shadow: soft ellipse sized to the product footprint
    sw, sh = img.size
    shadow = Image.new("RGBA", (sw, max(8, sh // 6)), (0, 0, 0, 0))
    d = ImageDraw.Draw(shadow)
    d.ellipse((sw * 0.06, 0, sw * 0.94, shadow.height - 1), fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(3, sw // 40)))
    shadow.save(os.path.join(OUT, "shadow-" + name), "PNG", optimize=True)
    print(name, "->", img.size)

