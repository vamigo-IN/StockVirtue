"""Regenerates every brand image derived from assets/newLogo.png.

Run from mobile/:   python tool/brand_assets.py
then:               dart run flutter_launcher_icons

The source (1536x1024, transparent) holds a glowing rounded-square "SV" tile.
Launcher icons must NOT be a tile-inside-a-tile, so the icon is recomposed
full-bleed: the tile's dark-teal interior is cropped inside its border,
feathered into a matching radial gradient, and the SV mark is centred —
large for iOS / legacy Android / web, and scaled into the 66dp safe circle for
Android adaptive icons (so circular launchers never clip the arrow tip).

Outputs
  assets/icon/app_icon.png             1024 full-bleed icon (iOS, legacy, web)
  assets/icon/app_icon_background.png  1024 adaptive background (gradient)
  assets/icon/app_icon_foreground.png  1024 adaptive foreground (mark, safe zone)
  assets/brand/logo.png                768 in-app logo (tile + glow, transparent)
  android/.../drawable-*/launch_logo.png    pre-Android-12 launch screen logo
  android/.../drawable-*/ic_stat_notify.png white "SV" status-bar icon
  ios/.../LaunchImage.imageset/*.png         iOS launch screen logo
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "newLogo.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# Measured on the source canvas.
TILE_BOX = (278, 63, 1246, 959)       # glowing rounded-square border
INTERIOR = (296, 80, 1228, 944)       # dark interior, just inside the border
MARK_CENTER = (760, 482)              # centre of the S + V + arrow mark
MARK_RADIUS = 500                     # farthest mark pixel from that centre

BG_INNER = (0, 40, 36)                # interior teal around the mark
BG_OUTER = (1, 8, 10)                 # near-black at the icon edge
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def radial_gradient(size: int, inner, outer) -> Image.Image:
    """Square radial gradient, inner colour at the centre fading to outer."""
    mask = Image.radial_gradient("L").resize((size, size), Image.LANCZOS)
    # radial_gradient is black at the centre, white at radius 128/256.
    mask = mask.point(lambda v: min(255, int(v * 1.35)))
    return Image.composite(
        Image.new("RGB", (size, size), outer),
        Image.new("RGB", (size, size), inner),
        mask,
    )


def feathered_interior(scale: float, feather: int) -> Image.Image:
    """The tile interior (mark + candles), scaled, with soft edges (RGBA)."""
    src = Image.open(SRC).convert("RGBA")
    crop = src.crop(INTERIOR)
    w, h = crop.size
    crop = crop.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    w, h = crop.size
    edge = Image.new("L", (w, h), 0)
    ImageDraw.Draw(edge).rounded_rectangle(
        [feather, feather, w - feather, h - feather],
        radius=feather * 2,
        fill=255,
    )
    edge = edge.filter(ImageFilter.GaussianBlur(feather / 2))
    alpha = Image.composite(crop.getchannel("A"), Image.new("L", (w, h), 0), edge)
    crop.putalpha(alpha)
    return crop


def place_mark(canvas: Image.Image, scale: float, feather: int, center_y: int):
    layer = feathered_interior(scale, feather)
    mx = (MARK_CENTER[0] - INTERIOR[0]) * scale
    my = (MARK_CENTER[1] - INTERIOR[1]) * scale
    size = canvas.size[0]
    pos = (round(size / 2 - mx), round(center_y - my))
    canvas.alpha_composite(layer, pos)
    return canvas


def launcher_icons():
    out = ROOT / "assets" / "icon"
    out.mkdir(parents=True, exist_ok=True)
    size = 1024

    # Full-bleed: mark at native scale (~80% of the width), nudged down a
    # touch so the arrow has headroom.
    full = radial_gradient(size, BG_INNER, BG_OUTER).convert("RGBA")
    place_mark(full, 1.0, 70, 500)
    full.convert("RGB").save(out / "app_icon.png", optimize=True)

    # Adaptive: 1024px = 108dp; the guaranteed-visible circle is 66dp
    # (radius ~313px). Scale so the farthest mark pixel sits inside it.
    radial_gradient(size, BG_INNER, BG_OUTER).save(
        out / "app_icon_background.png", optimize=True
    )
    scale = 310 / MARK_RADIUS
    fg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    place_mark(fg, scale, 46, 512)
    fg.save(out / "app_icon_foreground.png", optimize=True)


def tile_logo(side: int) -> Image.Image:
    """The original glowing tile on transparency, square-cropped."""
    src = Image.open(SRC).convert("RGBA")
    cx = (TILE_BOX[0] + TILE_BOX[2]) // 2
    cy = (TILE_BOX[1] + TILE_BOX[3]) // 2
    half = 505
    box = (cx - half, max(0, cy - half), cx + half, min(src.size[1], cy + half))
    return src.crop(box).resize((side, side), Image.LANCZOS)


def in_app_logo():
    out = ROOT / "assets" / "brand"
    out.mkdir(parents=True, exist_ok=True)
    tile_logo(768).save(out / "logo.png", optimize=True)


def android_launch_logo():
    for name, mult in DENSITIES.items():
        d = RES / f"drawable-{name}"
        d.mkdir(parents=True, exist_ok=True)
        tile_logo(round(144 * mult)).save(d / "launch_logo.png", optimize=True)


def notification_icon():
    """White 'SV' monogram on transparency — status-bar icons are alpha-only,
    so the full-colour launcher icon would render as a solid white square."""
    font_path = ROOT / "assets" / "fonts" / "Inter-ExtraBold.ttf"
    big = 400
    font = ImageFont.truetype(str(font_path), big)
    glyph = Image.new("L", (big * 3, big * 2), 0)
    ImageDraw.Draw(glyph).text((40, 20), "SV", font=font, fill=255)
    glyph = glyph.crop(glyph.getbbox())
    for name, mult in DENSITIES.items():
        canvas = round(24 * mult)
        live = round(20 * mult)  # 2dp padding each side
        gw, gh = glyph.size
        k = min(live / gw, live / gh)
        g = glyph.resize((max(1, round(gw * k)), max(1, round(gh * k))), Image.LANCZOS)
        icon = Image.new("RGBA", (canvas, canvas), (255, 255, 255, 0))
        white = Image.new("RGBA", g.size, (255, 255, 255, 255))
        icon.paste(white, ((canvas - g.size[0]) // 2, (canvas - g.size[1]) // 2), g)
        d = RES / f"drawable-{name}"
        d.mkdir(parents=True, exist_ok=True)
        icon.save(d / "ic_stat_notify.png", optimize=True)


def ios_launch_image():
    d = ROOT / "ios" / "Runner" / "Assets.xcassets" / "LaunchImage.imageset"
    for suffix, mult in (("", 1), ("@2x", 2), ("@3x", 3)):
        tile_logo(168 * mult).save(d / f"LaunchImage{suffix}.png", optimize=True)


if __name__ == "__main__":
    launcher_icons()
    in_app_logo()
    android_launch_logo()
    notification_icon()
    ios_launch_image()
    print("brand assets regenerated from", SRC.name)
