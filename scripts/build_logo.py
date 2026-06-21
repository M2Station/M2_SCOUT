#!/usr/bin/env python3
"""
M2_SCOUT - logo builder.

Single source of truth for the M2 brand mark. Extracts the exact M2 logo path
from src/renderer/index.html (the in-app `gh-icon` SVG), renders it in the brand
green, and regenerates every logo asset so they stay pixel-consistent:

  LOGO/M2_SCOUT.svg   - vector source (green fill)
  LOGO/M2_SCOUT.png   - 256px preview
  LOGO/M2_SCOUT.ico   - multi-size Windows icon (16..256)

Dependency-free apart from Pillow (already available). The compound path uses
the SVG even-odd fill rule (ring + monogram holes), reproduced here by XOR-ing
each sub-path's filled mask.

Usage:  python scripts/build_logo.py [#RRGGBB]
"""

import os
import re
import sys

from PIL import Image, ImageDraw

# Brand green - the one place the logo color is defined.
BRAND_GREEN = "#16A34A"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX_HTML = os.path.join(ROOT, "src", "renderer", "index.html")
LOGO_DIR = os.path.join(ROOT, "LOGO")

VIEWBOX = 1024          # source viewBox is 0 0 1024 1024
SUPERSAMPLE = 4         # render at 4x then downsample for anti-aliasing
ICO_SIZES = [16, 32, 48, 64, 128, 256]
BEZIER_STEPS = 36       # flattening resolution for cubic segments


def extract_path_d():
    """Pull the d="..." of the gh-icon M2 logo out of index.html."""
    with open(INDEX_HTML, "r", encoding="utf-8") as fh:
        html = fh.read()
    m = re.search(r'<svg class="gh-icon"[^>]*>\s*<path\s+d="([^"]+)"', html)
    if not m:
        raise SystemExit("Could not find the gh-icon <path> in index.html")
    return m.group(1)


def tokenize(d):
    """Yield ('cmd', letter) and ('num', float) tokens from a path string."""
    for tok in re.findall(r"[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?", d):
        if tok in "MLCZmlcz":
            yield ("cmd", tok)
        else:
            yield ("num", float(tok))


def parse_subpaths(d):
    """Parse absolute M/L/C/Z path data into a list of flattened point lists."""
    toks = list(tokenize(d))
    i = 0
    subpaths = []
    pts = []
    cur = (0.0, 0.0)
    cmd = None

    def nums(n):
        nonlocal i
        vals = []
        for _ in range(n):
            assert toks[i][0] == "num", f"expected number at {i}"
            vals.append(toks[i][1])
            i += 1
        return vals

    while i < len(toks):
        t = toks[i]
        if t[0] == "cmd":
            cmd = t[1]
            i += 1
            if cmd in "Zz":
                if pts:
                    subpaths.append(pts)
                pts = []
                cmd = None
            continue
        # Implicit repeat of the previous command with new coordinates.
        if cmd in "Mm":
            x, y = nums(2)
            if pts:
                subpaths.append(pts)
            pts = [(x, y)]
            cur = (x, y)
            cmd = "L"  # subsequent pairs after M are implicit L
        elif cmd in "Ll":
            x, y = nums(2)
            pts.append((x, y))
            cur = (x, y)
        elif cmd in "Cc":
            x1, y1, x2, y2, x, y = nums(6)
            p0 = cur
            for s in range(1, BEZIER_STEPS + 1):
                u = s / BEZIER_STEPS
                mu = 1 - u
                bx = (mu**3) * p0[0] + 3 * (mu**2) * u * x1 + 3 * mu * (u**2) * x2 + (u**3) * x
                by = (mu**3) * p0[1] + 3 * (mu**2) * u * y1 + 3 * mu * (u**2) * y2 + (u**3) * y
                pts.append((bx, by))
            cur = (x, y)
        else:
            raise SystemExit(f"Unsupported command: {cmd}")
    if pts:
        subpaths.append(pts)
    return subpaths


def render_master(subpaths, color):
    """Rasterize subpaths with the even-odd rule into an RGBA master image."""
    size = VIEWBOX * SUPERSAMPLE
    acc = Image.new("L", (size, size), 0)  # even-odd accumulator
    for sp in subpaths:
        layer = Image.new("L", (size, size), 0)
        d = ImageDraw.Draw(layer)
        scaled = [(x * SUPERSAMPLE, y * SUPERSAMPLE) for (x, y) in sp]
        d.polygon(scaled, fill=255)
        # XOR this sub-path into the accumulator (even-odd -> carves holes).
        acc = _xor(acc, layer)

    r, g, b = color
    rgba = Image.new("RGBA", (size, size), (r, g, b, 0))
    solid = Image.new("RGBA", (size, size), (r, g, b, 255))
    rgba = Image.composite(solid, rgba, acc)
    return rgba


def _xor(a, b):
    from PIL import ImageChops
    return ImageChops.difference(a, b)


def hex_to_rgb(h):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def write_svg(d, color):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
        'width="1024" height="1024" role="img" aria-label="M2_SCOUT">\n'
        f'  <path d="{d}" fill="{color}" fill-rule="evenodd"/>\n'
        '</svg>\n'
    )
    with open(os.path.join(LOGO_DIR, "M2_SCOUT.svg"), "w", encoding="utf-8") as fh:
        fh.write(svg)


def main():
    color_hex = sys.argv[1] if len(sys.argv) > 1 else BRAND_GREEN
    rgb = hex_to_rgb(color_hex)
    d = extract_path_d()
    subpaths = parse_subpaths(d)
    master = render_master(subpaths, rgb)

    os.makedirs(LOGO_DIR, exist_ok=True)
    write_svg(d, color_hex)

    png256 = master.resize((256, 256), Image.LANCZOS)
    png256.save(os.path.join(LOGO_DIR, "M2_SCOUT.png"))

    frames = [master.resize((s, s), Image.LANCZOS) for s in ICO_SIZES]
    frames[-1].save(
        os.path.join(LOGO_DIR, "M2_SCOUT.ico"),
        format="ICO",
        sizes=[(s, s) for s in ICO_SIZES],
        append_images=frames[:-1],
    )
    print(f"Built LOGO/M2_SCOUT.svg/.png/.ico in {color_hex} "
          f"({len(subpaths)} subpaths, sizes {ICO_SIZES})")


if __name__ == "__main__":
    main()
