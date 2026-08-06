"""Generate LAXREE ERP app icons for PWA manifest.

Creates icon-192.png and icon-512.png with a gold "L" on dark background,
matching the app's gold (#8B6914) brand color.
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = '/home/z/my-project/public'

# Brand colors
BG_DARK = (15, 23, 42)        # slate-900
BG_GRAD_TOP = (24, 33, 58)    # slate-800-ish
GOLD = (212, 170, 80)         # D4AA50
GOLD_DARK = (139, 105, 20)    # 8B6914

def make_icon(size: int, out_path: str) -> None:
    img = Image.new('RGB', (size, size), BG_DARK)
    draw = ImageDraw.Draw(img)

    # Subtle radial gradient (draw concentric circles fading from center)
    for r in range(size // 2, 0, -2):
        ratio = r / (size / 2)
        # interpolate from BG_GRAD_TOP at center to BG_DARK at edge
        r_col = int(BG_GRAD_TOP[0] * (1 - ratio) + BG_DARK[0] * ratio)
        g_col = int(BG_GRAD_TOP[1] * (1 - ratio) + BG_DARK[1] * ratio)
        b_col = int(BG_GRAD_TOP[2] * (1 - ratio) + BG_DARK[2] * ratio)
        draw.ellipse(
            [size // 2 - r, size // 2 - r, size // 2 + r, size // 2 + r],
            fill=(r_col, g_col, b_col),
        )

    # Gold ring (border)
    ring_w = max(4, size // 32)
    draw.ellipse(
        [ring_w, ring_w, size - ring_w, size - ring_w],
        outline=GOLD,
        width=ring_w,
    )

    # Draw "L" — try DejaVu Serif, fall back to default
    letter = 'L'
    font_size = int(size * 0.55)
    font = None
    for fp in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf',
    ]:
        if os.path.exists(fp):
            try:
                font = ImageFont.truetype(fp, font_size)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default()

    # Measure text
    try:
        bbox = draw.textbbox((0, 0), letter, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        tx = (size - text_w) // 2 - bbox[0]
        ty = (size - text_h) // 2 - bbox[1]
    except Exception:
        tx, ty = size // 4, size // 6

    # Draw "L" with a subtle shadow
    shadow_offset = max(2, size // 96)
    draw.text((tx + shadow_offset, ty + shadow_offset), letter, font=font, fill=(0, 0, 0))
    draw.text((tx, ty), letter, font=font, fill=GOLD)

    img.save(out_path, 'PNG', optimize=True)
    print(f'Generated {out_path} ({size}x{size})')

make_icon(192, os.path.join(OUT_DIR, 'icon-192.png'))
make_icon(512, os.path.join(OUT_DIR, 'icon-512.png'))
# Apple touch icon (180 is recommended, but 192 works fine too)
make_icon(180, os.path.join(OUT_DIR, 'apple-touch-icon.png'))
print('Done.')
