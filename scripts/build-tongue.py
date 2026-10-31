"""Build the original, texture-free Yoshi tongue actor for the pinned CoopDX engine.

Format references in .build/sm64coopdx: data/dynos_bin_{vtx,gfx,geo,pointer,
compress}.cpp and include/PR/gbi.h (F3DEX2). No upstream mesh is copied.
The model extends from its mouth anchor at (0,0,0) along +Z to 100 game units.
Scale its Z axis to extend/retract it and rotate its yaw with the player.
"""
from pathlib import Path
import math
import struct
import zlib


def u32(value):
    return struct.pack('<I', value & 0xFFFFFFFF)


def name(value):
    encoded = value.encode('ascii')
    return bytes([len(encoded)]) + encoded


def pointer(value):
    return b'PNTR' + name(value) + u32(0)


def command(word0, word1=0):
    return u32(word0) + (word1 if isinstance(word1, bytes) else u32(word1))


# Three octagonal rings and a tip form a rounded, flattened tongue. Baked vertex
# colors give its upper surface a pink highlight without depending on light state.
vertices = []
for z, rx, ry in [(0, 6, 4), (82, 8, 5), (95, 6, 4)]:
    for i in range(8):
        angle = i * math.tau / 8
        x, y = round(rx * math.cos(angle)), round(ry * math.sin(angle))
        brightness = (math.sin(angle) + 1) / 2
        color = (245, round(76 + 62 * brightness), round(119 + 55 * brightness), 255)
        vertices.append(struct.pack('<hhhhhhBBBB', x, y, z, 0, 0, 0, *color))
vertices.append(struct.pack('<hhhhhhBBBB', 0, 0, 100, 0, 0, 0, 255, 132, 168, 255))

triangles = []
for ring in range(2):
    for i in range(8):
        a, b = ring * 8 + i, ring * 8 + (i + 1) % 8
        triangles.extend([(a, b, b + 8), (a, b + 8, a + 8)])
for i in range(8):
    triangles.append((16 + i, 16 + (i + 1) % 8, 24))
for i in range(1, 7):
    triangles.append((0, i + 1, i))

# gsDPSetCombineMode(G_CC_SHADE,G_CC_SHADE): vertex RGBA in both cycles.
combine0 = 0xFC000000 | (15 << 20) | (31 << 15) | (7 << 12) | (7 << 9) | (15 << 5) | 31
combine1 = ((15 << 28) | (4 << 15) | (7 << 12) | (4 << 9) |
            (15 << 24) | (7 << 21) | (7 << 18) | (4 << 6) | (7 << 3) | 4)
clear_flags = 0x20000 | 0x40000 | 0x80000 | 0x600  # lighting, texgen, culling
gfx = [
    command(0xE7000000),                              # gsDPPipeSync
    command(0xD7000000, 0xFFFFFFFF),                  # gsSPTexture(...,G_OFF)
    command(0xD9000000 | (~clear_flags & 0xFFFFFF), 0x200004),
    command(combine0, combine1),
    command(0x01000000 | len(vertices) << 12 | len(vertices) << 1, pointer('tongue_vertices')),
]
for a, b, c in triangles:
    gfx.append(command(0x05000000 | (a * 2 << 16) | (b * 2 << 8) | c * 2))
gfx.extend([
    command(0xE7000000),
    command(0xD9FFFFFF, 0x20400),                     # restore lighting/back cull
    command(0xDF000000),                              # gsSPEndDisplayList
])

data = bytes([3]) + name('tongue_vertices') + u32(len(vertices)) + b''.join(vertices)
data += bytes([4]) + name('tongue_mesh') + u32(len(gfx)) + b''.join(gfx)
# GEO_NODE_START, OPEN_NODE, DISPLAY_LIST(LAYER_OPAQUE,mesh), CLOSE_NODE, END.
geo = [u32(0x0B), u32(0x04), u32(0x115), pointer('tongue_mesh'), u32(0x05), u32(0x01)]
data += bytes([5]) + name('tongue_geo') + u32(len(geo)) + b''.join(geo) + b'\0'
result = b'DYNOSBIN' + struct.pack('<Q', len(data)) + zlib.compress(data, 9)
target = Path(__file__).resolve().parent.parent / 'site/mods/assets/tongue_geo.bin'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(result)
print(f'{target.name}: {len(result)} bytes; {len(vertices)} vertices; {len(triangles)} triangles')
