"""Check the cut-out plates: alpha coverage and product bounding box."""
import os
from PIL import Image

SRC = r"C:\Portfolio\assets\img\machines"
for name in sorted(os.listdir(SRC)):
    if not name.endswith(".png") or name.startswith(("ref-", "shadow-")):
        continue
    img = Image.open(os.path.join(SRC, name)).convert("RGBA")
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    hist = alpha.histogram()
    opaque = hist[255]
    total = img.width * img.height
    print(f"{name:34} {img.width}x{img.height}  opaque={opaque/total*100:5.1f}%  bbox={bbox}")
