#!/usr/bin/env python3
"""Generate the Campus One launcher artwork with only the Python standard library."""
import struct
import zlib
from pathlib import Path

SIZE = 1024
GREEN = (34, 100, 79)
WHITE = (255, 255, 255)

def inside(x, y, polygon):
    result = False
    j = len(polygon) - 1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            result = not result
        j = i
    return result

# Cap, crown and an open book; leave room for adaptive icon masks.
shapes = [
    [(215, 399), (512, 270), (809, 399), (512, 528)],
    [(316, 480), (512, 565), (708, 480), (708, 545), (512, 628), (316, 545)],
    [(257, 620), (360, 605), (495, 652), (495, 735), (360, 687), (257, 703)],
    [(529, 652), (664, 605), (767, 620), (767, 703), (664, 687), (529, 735)],
    [(780, 409), (798, 409), (798, 560), (780, 560)],
]

def chunk(kind, data):
    return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)

raw = bytearray()
for y in range(SIZE):
    raw.append(0)
    for x in range(SIZE):
        raw.extend(WHITE if any(inside(x, y, shape) for shape in shapes) else GREEN)
png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!IIBBBBB', SIZE, SIZE, 8, 2, 0, 0, 0))
       + chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b''))
Path('assets/branding/icon.png').write_bytes(png)
