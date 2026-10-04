"""Hand-reconstructed runner geometry (coords = pixels of assets-src/logo-original.png).

The wordmark covers the torso/hip/back leg, so a pure color trace is fragmented.
These Bezier paths follow the visible blue pieces and bridge the hidden parts.
Run directly to render an overlay for checking: python scripts/brand/runner.py
"""
# Each shape: start point + list of cubic segments (c1, c2, end). Clockwise.
BODY = {
    "start": (181, 128),
    "segs": [
        ((200, 105), (235, 84), (275, 83)),     # arm upper edge
        ((305, 82), (326, 98), (329, 122)),     # shoulder
        ((332, 150), (300, 172), (268, 194)),   # back of torso
        ((252, 205), (284, 226), (302, 246)),   # hidden waist -> hip
        ((312, 258), (292, 291), (246, 308)),   # thigh/foot outer edge
        ((225, 318), (200, 324), (170, 328)),   # foot tip
        ((205, 312), (258, 282), (263, 258)),   # foot inner edge
        ((268, 238), (228, 236), (223, 210)),   # hidden waist (left)
        ((219, 184), (280, 152), (303, 118)),   # torso inner edge
        ((306, 106), (292, 99), (270, 103)),    # armpit
        ((235, 110), (205, 118), (181, 128)),   # arm lower edge to tip
    ],
}
LEG = {
    "start": (28, 343),
    "segs": [
        ((55, 305), (95, 258), (160, 244)),
        ((200, 236), (240, 232), (262, 240)),
        ((268, 248), (268, 256), (262, 264)),
        ((225, 262), (185, 252), (144, 256)),
        ((118, 264), (65, 305), (28, 343)),
    ],
}
HEAD = {"cx": 350, "cy": 67, "rx": 30.5, "ry": 29.5}


def sample(shape, n=24):
    pts = [shape["start"]]
    p0 = shape["start"]
    for c1, c2, p3 in shape["segs"]:
        for i in range(1, n + 1):
            t = i / n
            u = 1 - t
            x = u**3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * p3[0]
            y = u**3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * p3[1]
            pts.append((x, y))
        p0 = p3
    return pts


if __name__ == "__main__":
    from PIL import Image, ImageDraw
    S = 3
    im = Image.open("assets-src/logo-original.png").convert("RGB")
    im = im.resize((im.width * S, im.height * S), Image.LANCZOS)
    ov = Image.new("RGBA", im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for sh in (BODY, LEG):
        d.polygon([(x * S, y * S) for x, y in sample(sh)], fill=(255, 40, 40, 110), outline=(255, 255, 0, 255))
    h = HEAD
    d.ellipse([(h["cx"] - h["rx"]) * S, (h["cy"] - h["ry"]) * S, (h["cx"] + h["rx"]) * S, (h["cy"] + h["ry"]) * S],
              fill=(255, 40, 40, 110), outline=(255, 255, 0, 255))
    im = Image.alpha_composite(im.convert("RGBA"), ov).convert("RGB")
    im.crop((0, 120, im.width, 1060)).save("assets-src/_overlay.png")
