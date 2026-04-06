from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
BUILD_DIR = ROOT / "build"
PNG_PATH = BUILD_DIR / "icon.png"
ICO_PATH = BUILD_DIR / "icon.ico"
SIZE = 1024


def hex_rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (
        int(value[0:2], 16),
        int(value[2:4], 16),
        int(value[4:6], 16),
        alpha,
    )


def radial_gradient(
    size: int,
    inner_color: tuple[int, int, int, int],
    outer_color: tuple[int, int, int, int],
    center: tuple[float, float],
    radius: float,
) -> Image.Image:
    image = Image.new("RGBA", (size, size))
    pixels = image.load()
    cx, cy = center
    for y in range(size):
        for x in range(size):
            dx = (x - cx) / radius
            dy = (y - cy) / radius
            distance = min((dx * dx + dy * dy) ** 0.5, 1.0)
            mix = distance * distance * (3 - 2 * distance)
            pixels[x, y] = tuple(
                int(inner_color[i] * (1 - mix) + outer_color[i] * mix) for i in range(4)
            )
    return image


def draw_pulse(draw: ImageDraw.ImageDraw, color: tuple[int, int, int, int], width: int) -> None:
    points = [
        (248, 512),
        (338, 512),
        (386, 516),
        (420, 564),
        (442, 470),
        (468, 382),
        (492, 492),
        (516, 640),
        (546, 488),
        (576, 462),
        (608, 520),
        (652, 560),
        (704, 540),
        (776, 520),
    ]
    draw.line(points, fill=color, width=width, joint="curve")


def main() -> None:
    BUILD_DIR.mkdir(parents=True, exist_ok=True)

    image = radial_gradient(
        SIZE,
        hex_rgba("#2B1F18"),
        hex_rgba("#0C0A09"),
        center=(352, 264),
        radius=900,
    )

    orb = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    orb_gradient = radial_gradient(
        SIZE,
        hex_rgba("#734C34"),
        hex_rgba("#140F0D"),
        center=(456, 362),
        radius=520,
    )
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).ellipse((238, 238, 786, 786), fill=255)
    orb = Image.composite(orb_gradient, orb, mask)
    image = Image.alpha_composite(image, orb)

    ambient_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(ambient_glow).ellipse(
        (230, 230, 794, 794), fill=hex_rgba("#D7955B", 56)
    )
    ambient_glow = ambient_glow.filter(ImageFilter.GaussianBlur(32))
    image = Image.alpha_composite(image, ambient_glow)

    core_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(core_glow).ellipse((324, 324, 700, 700), fill=hex_rgba("#F0B37D", 120))
    core_glow = core_glow.filter(ImageFilter.GaussianBlur(36))
    image = Image.alpha_composite(image, core_glow)

    rings = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rings_draw = ImageDraw.Draw(rings)
    rings_draw.ellipse((238, 238, 786, 786), outline=hex_rgba("#F3ECE5", 30), width=2)
    rings_draw.ellipse((262, 262, 762, 762), outline=hex_rgba("#F3ECE5", 18), width=2)
    image = Image.alpha_composite(image, rings)

    pulse_glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_pulse(ImageDraw.Draw(pulse_glow), hex_rgba("#D7955B", 190), 30)
    pulse_glow = pulse_glow.filter(ImageFilter.GaussianBlur(20))
    image = Image.alpha_composite(image, pulse_glow)

    pulse_core = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw_pulse(ImageDraw.Draw(pulse_core), hex_rgba("#F7D9BC", 255), 16)
    image = Image.alpha_composite(image, pulse_core)

    center = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(center).ellipse((502, 502, 522, 522), fill=hex_rgba("#FFE2C4", 245))
    center = center.filter(ImageFilter.GaussianBlur(1))
    image = Image.alpha_composite(image, center)

    rounded_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(rounded_mask).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=224, fill=255)
    alpha = ImageChops.multiply(image.getchannel("A"), rounded_mask)
    image.putalpha(alpha)

    image.save(PNG_PATH, format="PNG")
    image.save(
        ICO_PATH,
        format="ICO",
        sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)],
    )

    print(f"wrote {PNG_PATH}")
    print(f"wrote {ICO_PATH}")


if __name__ == "__main__":
    main()
