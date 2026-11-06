"""Make public/logo-on-dark.png, the dark-footer version of the owner's logo.

usage (from web/): python -I scripts/brand/logo-on-dark.py [public/logo.png] [public/logo-on-dark.png]

The output is the same image at the same size with one change: the near-black
"Stock" lettering is recoloured to #EEF4F0 (--sv-on-stage). Every pixel keeps
its own alpha, so the lettering's anti-aliased edges stay smooth. The SV mark,
the arrow and "Virtue" are untouched. The logo itself is never redrawn
(spec §2.4); public/logo.png is only read.

How "Stock" is found: the opaque parts of the logo (alpha >= 40) fall into
separate 8-connected shapes (the mark, "S", "t", "ock", "Vi", "rt", "ue").
The dark shapes that sit in the band between the mark and "Virtue" are the
word "Stock". Their faint edge pixels (8 <= alpha < 40) go with them when the
nearest opaque pixel within 2 px belongs to "Stock". Pixels fainter than that
are quantisation noise and stay as they are (dark, so invisible on the stage).

If the source has no transparency (an opaque white background), the white
background connected to the image border is first turned into alpha
("colour to alpha"), so the result still sits cleanly on the dark footer.

Needs Pillow. Checks its own result and exits non-zero when the recolour
touched anything green or found no "Stock" lettering.
"""
import os
import site
import sys
from collections import deque

sys.path.append(site.getusersitepackages())
from PIL import Image  # noqa: E402

ON_STAGE = (0xEE, 0xF4, 0xF0)
CORE_ALPHA = 40       # opaque enough to define a shape
FRINGE_ALPHA = 8      # faintest edge pixel that is still part of a letter
FRINGE_REACH = 2      # px from a shape for an edge pixel to belong to it

here = os.path.dirname(os.path.abspath(__file__))
web = os.path.dirname(os.path.dirname(here))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(web, 'public', 'logo.png')
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(web, 'public', 'logo-on-dark.png')

im = Image.open(src)
has_alpha = im.mode in ('RGBA', 'LA', 'PA') or 'transparency' in im.info
im = im.convert('RGBA')
W, H = im.size
px = im.load()


def border_white_to_alpha():
    """Colour-to-alpha for an opaque white background reached from the border."""
    def near_white(p):
        return min(p[:3]) >= 200
    seen = [[False] * W for _ in range(H)]
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if near_white(px[x, y]) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    for y in range(H):
        for x in (0, W - 1):
            if near_white(px[x, y]) and not seen[y][x]:
                seen[y][x] = True
                q.append((x, y))
    while q:
        x, y = q.popleft()
        r, g, b, a = px[x, y]
        # The least alpha that explains this colour as (colour over white).
        alpha = max((255 - c) / 255 for c in (r, g, b))
        if alpha <= 0:
            px[x, y] = (0, 0, 0, 0)
        else:
            un = [round(255 - (255 - c) / alpha) for c in (r, g, b)]
            px[x, y] = (*[max(0, min(255, c)) for c in un], round(alpha * a))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H and not seen[ny][nx] and near_white(px[nx, ny]):
                seen[ny][nx] = True
                q.append((nx, ny))


corners = [px[0, 0], px[W - 1, 0], px[0, H - 1], px[W - 1, H - 1]]
if not has_alpha or all(c[3] == 255 for c in corners):
    if all(min(c[:3]) >= 200 for c in corners):
        print('source has an opaque white background: making it transparent first')
        border_white_to_alpha()
    else:
        sys.exit('source has no transparency and no white background to remove')

# 1. Opaque shapes (8-connected components of alpha >= CORE_ALPHA).
label = [[-1] * W for _ in range(H)]
shapes = []
for y in range(H):
    for x in range(W):
        if label[y][x] != -1 or px[x, y][3] < CORE_ALPHA:
            continue
        idx = len(shapes)
        q = deque([(x, y)])
        label[y][x] = idx
        pts = []
        while q:
            cx, cy = q.popleft()
            pts.append((cx, cy))
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H and label[ny][nx] == -1 and px[nx, ny][3] >= CORE_ALPHA:
                        label[ny][nx] = idx
                        q.append((nx, ny))
        wsum = sum(px[p][3] for p in pts)
        mean = tuple(sum(px[p][i] * px[p][3] for p in pts) / wsum for i in range(3))
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        shapes.append({'pts': pts, 'x0': min(xs), 'x1': max(xs), 'y0': min(ys), 'y1': max(ys), 'mean': mean})


def is_green(rgb):
    r, g, b = rgb
    return g > max(r, b) + 40 and g > 90


def is_dark(rgb):
    return max(rgb) < 60


# 2. The word "Stock": the dark shapes between the mark (the big green shape
#    at the left edge) and the first green shape of "Virtue" to its right.
big = [s for s in shapes if len(s['pts']) > 200]
mark = min(big, key=lambda s: s['x0'])
greens_right = [s for s in big if s is not mark and is_green(s['mean']) and s['x0'] > mark['x1'] - 40]
virtue_x0 = min(s['x0'] for s in greens_right) if greens_right else W
stock = [i for i, s in enumerate(shapes)
         if s is not mark and is_dark(s['mean'])
         and s['x0'] >= mark['x1'] - 40 and s['x1'] <= virtue_x0 + 8
         and len(s['pts']) > 50]
if not stock:
    sys.exit('could not find the "Stock" lettering')
stock_set = set(stock)
x0 = min(shapes[i]['x0'] for i in stock)
x1 = max(shapes[i]['x1'] for i in stock)
y0 = min(shapes[i]['y0'] for i in stock)
y1 = max(shapes[i]['y1'] for i in stock)
print(f'"Stock": {len(stock)} shapes at x {x0}..{x1}, y {y0}..{y1}; "Virtue" starts at x {virtue_x0}')

# 3. Recolour the shapes, then their faint edges. The source is a 256-colour
#    palette image, so a few of the lettering's faint edge pixels carry a
#    greenish palette colour; they are part of "Stock" (only "Stock" shapes are
#    near them) and are recoloured too. What must never be recoloured is a
#    visibly green pixel (green and at least 25% opaque): that would be the
#    mark's or "Virtue"'s artwork.
changed = 0
faint_greenish = 0
touched_green = 0


def note(rgb, a):
    global faint_greenish, touched_green
    if is_green(rgb):
        if a >= 64:
            touched_green += 1
        else:
            faint_greenish += 1


for i in stock:
    for p in shapes[i]['pts']:
        r, g, b, a = px[p]
        note((r, g, b), a)
        px[p] = (*ON_STAGE, a)
        changed += 1
for y in range(max(0, y0 - FRINGE_REACH), min(H, y1 + FRINGE_REACH + 1)):
    for x in range(max(0, x0 - FRINGE_REACH), min(W, x1 + FRINGE_REACH + 1)):
        r, g, b, a = px[x, y]
        if label[y][x] != -1 or not (FRINGE_ALPHA <= a < CORE_ALPHA):
            continue
        best = None
        for d in range(1, FRINGE_REACH + 1):
            near = {label[ny][nx]
                    for ny in range(y - d, y + d + 1) for nx in range(x - d, x + d + 1)
                    if 0 <= nx < W and 0 <= ny < H and label[ny][nx] != -1}
            if near:
                best = near
                break
        if best and best <= stock_set:
            note((r, g, b), a)
            px[x, y] = (*ON_STAGE, a)
            changed += 1

print(f'recoloured {changed} pixels to #EEF4F0 (alpha kept); faint greenish edge pixels among them: '
      f'{faint_greenish}; visibly green pixels touched: {touched_green}')
if touched_green:
    sys.exit('refusing to write: the recolour reached green pixels')
im.save(out, optimize=True)
print(f'wrote {out} ({os.path.getsize(out)} bytes, {W}x{H})')
