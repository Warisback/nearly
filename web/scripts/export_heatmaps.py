"""Create the pitch heatmaps from the exact checked-in mock API data.

Pixels use the same bottom-up orientation and square-root ramp as Heatmap.jsx.
Run: python scripts/export_heatmaps.py (requires Pillow).
"""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "public/mock/seed.json").read_text(encoding="utf-8"))
OUT = ROOT / "public/pitch"
OUT.mkdir(parents=True, exist_ok=True)
INK = "#183e3b"
MUTED = "#6e8782"
FIXTURE = "#dce7e1"
FLOOR = "#f3faf6"
BACKGROUND = "#f3f8f4"
LOW = (181, 238, 227)
HIGH = (17, 104, 95)
FONT_REGULAR = Path("C:/Windows/Fonts/arial.ttf")
FONT_BOLD = Path("C:/Windows/Fonts/arialbd.ttf")


def font(size, bold=False):
    return ImageFont.truetype(str(FONT_BOLD if bold else FONT_REGULAR), size)


def color(value, maximum):
    t = math.sqrt(min(value / (maximum or 1), 1))
    return tuple(round(a + (b - a) * t) for a, b in zip(LOW, HIGH))


footfall = DATA["static"]["api/heatmap?kind=footfall"]
attention = DATA["static"]["api/heatmap?kind=attention"]
spots = sorted(
    [(v, y, x) for y, row in enumerate(attention["cells"]) for x, v in enumerate(row) if v],
    key=lambda item: (-item[0], item[1], item[2]),
)[:3]

for kind, subtitle in [("footfall", "Where people walked"), ("dwell", "Where people stopped"), ("attention", "Where people looked")]:
    data = DATA["static"][f"api/heatmap?kind={kind}"]
    image = Image.new("RGB", (1920, 1080), BACKGROUND)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((92, 63, 116, 98), 10, fill="#2dbdb0")
    draw.rounded_rectangle((111, 76, 135, 111), 10, fill=INK)
    draw.text((151, 62), "nearly", font=font(43, True), fill=INK)
    draw.text((92, 170), kind.capitalize(), font=font(78), fill=INK)
    draw.text((95, 267), subtitle, font=font(30), fill=MUTED)
    draw.text((95, 379), "MOST LOOKED-AT SPOTS", font=font(19, True), fill=MUTED)
    for index, (seconds, _, _) in enumerate(spots):
        y = 462 + index * 84
        draw.ellipse((94, y - 22, 136, y + 20), fill=INK)
        draw.text((115, y), str(index + 1), font=font(21, True), fill="white", anchor="mm")
        draw.text((159, y), f"{seconds} seconds of attention", font=font(27), fill=INK, anchor="lm")

    grid = Image.new("RGB", (data["width"], data["height"]))
    for row in range(data["height"]):
        for col in range(data["width"]):
            value = data["cells"][row][col]
            shade = color(value, data["max"]) if value else FIXTURE if footfall["cells"][row][col] == 0 else FLOOR
            if isinstance(shade, str):
                shade = tuple(int(shade[i:i + 2], 16) for i in (1, 3, 5))
            grid.putpixel((col, data["height"] - row - 1), shade)
    cell = 9
    left, top = 1020, 82
    image.paste(grid.resize((data["width"] * cell, data["height"] * cell), Image.Resampling.NEAREST), (left, top))
    for index, (_, row, col) in enumerate(spots):
        x = left + (col + .5) * cell
        y = top + (data["height"] - row - .5) * cell
        draw.ellipse((x - 17, y - 17, x + 17, y + 17), fill=INK, outline="white", width=3)
        draw.text((x, y), str(index + 1), font=font(19, True), fill="white", anchor="mm")

    for x in range(445):
        draw.line((95 + x, 790, 95 + x, 803), fill=color(data["max"] * x / 444, data["max"]))
    draw.text((95, 824), "0 s", font=font(22), fill=MUTED)
    draw.text((540, 824), f'{data["max"]} s', font=font(22), fill=MUTED, anchor="ra")
    draw.text((95, 861), "Time in each 0.5 m square", font=font(20), fill=MUTED)
    draw.line((left, 968, left + 5 / data["cell_m"] * cell, 968), fill=INK, width=4)
    draw.line((left, 960, left, 974), fill=INK, width=3)
    draw.line((left + 90, 960, left + 90, 974), fill=INK, width=3)
    draw.text((left, 991), "5 m", font=font(20), fill=MUTED)
    draw.text((left + data["width"] * cell, 991), "39 × 46 m", font=font(20), fill=MUTED, anchor="ra")
    draw.text((95, 966), "NVIDIA synthetic store · 31 people · 13 min", font=font(23), fill=MUTED)
    if data["error_vs_truth"] is not None:
        draw.text((95, 1000), f'error vs ground truth: {data["error_vs_truth"]} m', font=font(21), fill=MUTED)
    output = OUT / f"heatmap-{kind}.png"
    image.save(output, optimize=True)
    print(f"{output.relative_to(ROOT)}: {image.width} x {image.height}; real seed, {data['max']} s max")
