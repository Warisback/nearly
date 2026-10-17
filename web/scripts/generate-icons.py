"""Generate Nearly's own geometric icon assets. Run from any directory."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1] / "public"
ICONS = ROOT / "icons"
BRAND = ROOT / "brand"
ICONS.mkdir(parents=True, exist_ok=True)
BRAND.mkdir(parents=True, exist_ok=True)

MARK = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none" role="img" aria-label="Nearly">
<rect x="12" y="13" width="25" height="54" rx="12.5" transform="rotate(24 24.5 40)" fill="#163F3D"/>
<rect x="43" y="13" width="25" height="54" rx="12.5" transform="rotate(24 55.5 40)" fill="#58D7C2"/>
</svg>'''
(BRAND / "nearly-mark.svg").write_text(MARK, encoding="utf-8")
(BRAND / "nearly-wordmark.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 290 80" fill="none" role="img" aria-label="Nearly">
<rect x="12" y="13" width="25" height="54" rx="12.5" transform="rotate(24 24.5 40)" fill="#163F3D"/>
<rect x="43" y="13" width="25" height="54" rx="12.5" transform="rotate(24 55.5 40)" fill="#58D7C2"/>
<text x="94" y="59" font-family="Arial,Helvetica,sans-serif" font-size="59" font-weight="600" letter-spacing="-3.5" fill="#163F3D">nearly</text>
</svg>''', encoding="utf-8")
(ROOT / "favicon.svg").write_text('''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" rx="22" fill="#D3F6EF"/><g transform="translate(6 6) scale(.85)">''' + MARK.split('\n',1)[1].replace('</svg>', '') + '</g></svg>', encoding="utf-8")

def icon(size):
    scale = 4
    s = size * scale
    out = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(out)
    draw.rounded_rectangle((0, 0, s, s), radius=s * .27, fill="#D3F6EF")
    unit = s / 80
    for center, color in ((26, "#163F3D"), (54, "#58D7C2")):
        shape = Image.new("RGBA", (s, s), (0, 0, 0, 0))
        d = ImageDraw.Draw(shape)
        d.rounded_rectangle(((center-10.7)*unit, 17*unit, (center+10.7)*unit, 63*unit), radius=10.7*unit, fill=color)
        shape = shape.rotate(-24, resample=Image.Resampling.BICUBIC, center=(center*unit, 40*unit))
        out.alpha_composite(shape)
    return out.resize((size, size), Image.Resampling.LANCZOS)

for size in (192, 512):
    icon(size).save(ICONS / f"icon-{size}.png")
icon(180).save(ROOT / "apple-touch-icon.png")
icon(180).save(ICONS / "apple-touch-icon.png")
icon(64).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("Generated Nearly SVG logo, 192/512 icons, Apple touch icon, and favicons.")
