import math
from PIL import Image, ImageDraw, ImageFilter

# 1. Generate SVG
pts = []
for i in range(120):
    t = (i / 120) * 2 * math.pi
    denom = 1 + math.sin(t)**2
    x = 256 + 180 * math.cos(t) / denom
    y = 256 + 180 * math.sin(t) * math.cos(t) / denom
    pts.append(f"{x:.1f},{y:.1f}")

path_d = "M " + " L ".join(pts) + " Z"

svg_content = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="sunsetRed" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ff4d4d" />
      <stop offset="50%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#9f1239" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="#000000" stroke="#e11d4840" stroke-width="4"/>
  <path d="{path_d}" fill="none" stroke="url(#sunsetRed)" stroke-width="48" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
</svg>"""

with open("C:/CloudLab/Vega-IDE-Build/vega_infinity.svg", "w", encoding="utf-8") as f:
    f.write(svg_content)
print("Saved C:/CloudLab/Vega-IDE-Build/vega_infinity.svg")

# 2. Render High-Resolution Icon with Anti-Aliasing and Glowing Sunsetting Red Gradient
size = 1024
canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

# Rounded dark squircle background for high-contrast desktop icon
draw.rounded_rectangle([32, 32, size - 32, size - 32], radius=220, fill=(0, 0, 0, 255), outline=(225, 29, 72, 80), width=10)

def get_color(factor):
    # Gradient: #ff4d4d -> #f43f5e -> #9f1239
    if factor < 0.5:
        f = factor * 2.0
        r = int(255 + (244 - 255) * f)
        g = int(77 + (63 - 77) * f)
        b = int(77 + (94 - 77) * f)
    else:
        f = (factor - 0.5) * 2.0
        r = int(244 + (159 - 244) * f)
        g = int(63 + (18 - 63) * f)
        b = int(94 + (57 - 94) * f)
    return (r, g, b, 255)

num_pts = 720
a = 360
stroke_w = 96

pts_2d = []
for i in range(num_pts):
    t = (i / num_pts) * 2 * math.pi
    denom = 1 + math.sin(t)**2
    x = size / 2 + a * math.cos(t) / denom
    y = size / 2 + a * math.sin(t) * math.cos(t) / denom
    pts_2d.append((x, y))

# Draw smooth glow layer
glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_layer)
for i in range(num_pts):
    p1 = pts_2d[i]
    p2 = pts_2d[(i + 1) % num_pts]
    factor = (pts_2d[i][0] - (size / 2 - a)) / (2 * a)
    factor = max(0.0, min(1.0, factor))
    color = get_color(factor)
    glow_draw.line([p1, p2], fill=(color[0], color[1], color[2], 120), width=stroke_w + 32)

glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(16))
canvas = Image.alpha_composite(canvas, glow_layer)
draw = ImageDraw.Draw(canvas)

# Draw main sharp gradient infinity
for i in range(num_pts):
    p1 = pts_2d[i]
    p2 = pts_2d[(i + 1) % num_pts]
    factor = (pts_2d[i][0] - (size / 2 - a)) / (2 * a)
    factor = max(0.0, min(1.0, factor))
    color = get_color(factor)
    draw.line([p1, p2], fill=color, width=stroke_w)
    r = stroke_w / 2
    draw.ellipse([p1[0] - r, p1[1] - r, p1[0] + r, p1[1] + r], fill=color)

icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
imgs = [canvas.resize(s, Image.Resampling.LANCZOS) for s in icon_sizes]
ico_path = "C:/CloudLab/Vega-IDE-Build/vega_infinity.ico"
imgs[0].save(ico_path, format="ICO", sizes=icon_sizes, append_images=imgs[1:])
print(f"Saved multi-resolution ICO to {ico_path}")
