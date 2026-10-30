"""Generate the Cadence "beat check" SVG masters and Android vectors from one geometry.

Needs fontTools (pip install fonttools). Raster exports: see README.md."""
import math, os, tempfile
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BRAND = f'{REPO}/docs/brand'
RES = f'{REPO}/android/app/src/main/res'

INDIGO = '#5E5CE6'      # app accent (light)
INDIGO_LIGHT = '#7D7AFF'  # app accent (dark)
INK = '#1C1C1E'
GRAD = ('#3D3AC8', '#5E5CE6', '#8A80FF')  # tile gradient: deep, accent, lavender

# Master geometry, local units, vertex of the check at (0, 0).
# Beats sit on the short-leg line at a constant tempo (same centre spacing as
# the stroke start), growing in size: past beats -> today's check.
MASTER = dict(sw=28, r=(9, 12), d=32, a=28, b=92)
SMALL = dict(sw=36, r=(13, 16), d=38, a=26, b=84)  # <=32 px / 24 dp cut


def parts(g):
    sw, (r1, r2), d, a, b = g['sw'], g['r'], g['d'], g['a'], g['b']
    S = (-a, -a); E = (b, -b)
    D2 = (S[0] - d, S[1] - d); D1 = (D2[0] - d, D2[1] - d)
    h = sw / 2
    xmin = min(D1[0] - r1, S[0] - h); xmax = E[0] + h
    ymin = min(D1[1] - r1, E[1] - h); ymax = h
    return dict(sw=sw, S=S, E=E, dots=[(D1, r1), (D2, r2)], bbox=(xmin, ymin, xmax, ymax))


def place(g, cx, cy, width, lift=0.0):
    """Scale/translate so the bbox is `width` wide and centred on (cx, cy - lift)."""
    p = parts(g)
    xmin, ymin, xmax, ymax = p['bbox']
    s = width / (xmax - xmin)
    ox = cx - (xmin + xmax) / 2 * s
    oy = cy - lift - (ymin + ymax) / 2 * s
    T = lambda pt: (round(ox + pt[0] * s, 2), round(oy + pt[1] * s, 2))
    return dict(sw=round(p['sw'] * s, 2), S=T(p['S']), V=T((0, 0)), E=T(p['E']),
                dots=[(T(c), round(r * s, 2)) for c, r in p['dots']],
                bbox=(ox + xmin * s, oy + ymin * s, ox + xmax * s, oy + ymax * s))


def svg_mark(m, color):
    S, V, E = m['S'], m['V'], m['E']
    dots = ''.join(f'<circle cx="{c[0]:g}" cy="{c[1]:g}" r="{r:g}"/>' for c, r in m['dots'])
    return (f'<g fill="{color}">{dots}</g>'
            f'<path d="M{S[0]:g} {S[1]:g}L{V[0]:g} {V[1]:g}L{E[0]:g} {E[1]:g}" fill="none" stroke="{color}" '
            f'stroke-width="{m["sw"]:g}" stroke-linecap="round" stroke-linejoin="round"/>')


def circle_path(c, r):
    x, y = c
    return f'M{x - r:g},{y:g}a{r:g},{r:g} 0,1 0,{2 * r:g},0a{r:g},{r:g} 0,1 0,{-2 * r:g},0z'


def vector_mark(m, color):
    S, V, E = m['S'], m['V'], m['E']
    dots = ''.join(f'\n    <path\n        android:fillColor="{color}"\n        android:pathData="{circle_path(c, r)}" />' for c, r in m['dots'])
    return (dots + f'''
    <path
        android:strokeColor="{color}"
        android:strokeWidth="{m['sw']:g}"
        android:strokeLineCap="round"
        android:strokeLineJoin="round"
        android:pathData="M{S[0]:g},{S[1]:g}L{V[0]:g},{V[1]:g}L{E[0]:g},{E[1]:g}" />''')


def vector(size_dp, viewport, body, comment):
    return f'''<?xml version="1.0" encoding="utf-8"?>
<!-- {comment} Source: docs/brand (generated geometry, do not hand-edit coordinates). -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="{size_dp}dp"
    android:height="{size_dp}dp"
    android:viewportWidth="{viewport}"
    android:viewportHeight="{viewport}">{body}
</vector>
'''


def grad_defs(id_, x1, y1, x2, y2):
    return (f'<defs><linearGradient id="{id_}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" gradientUnits="userSpaceOnUse">'
            f'<stop offset="0" stop-color="{GRAD[0]}"/><stop offset="0.55" stop-color="{GRAD[1]}"/>'
            f'<stop offset="1" stop-color="{GRAD[2]}"/></linearGradient></defs>')


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        f.write(text)


def max_radius(m, cx, cy):
    """Farthest painted point from (cx, cy) — for safe-zone checks."""
    h = m['sw'] / 2
    pts = [(p, h) for p in (m['S'], m['V'], m['E'])] + list(m['dots'])
    return max(math.hypot(p[0] - cx, p[1] - cy) + r for p, r in pts)


TITLE = '<title>Cadence</title>'
HDR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">'

# --- Symbol masters (256) -------------------------------------------------
m = place(MASTER, 128, 128, 216, lift=4)
write(f'{BRAND}/mark.svg', HDR.format(w=256, h=256) + TITLE + svg_mark(m, INDIGO) + '</svg>\n')
write(f'{BRAND}/mark-mono.svg', HDR.format(w=256, h=256) + TITLE + svg_mark(m, 'currentColor') + '</svg>\n')
ms = place(SMALL, 128, 128, 232, lift=4)
write(f'{BRAND}/mark-small.svg', HDR.format(w=256, h=256) + TITLE + svg_mark(ms, INDIGO) + '</svg>\n')

# --- App icon (512, full bleed; mark inside the 80 % maskable circle) -----
def tile(size, g, width, radius=0, id_='bg'):
    mk = place(g, size / 2, size / 2, width, lift=size * 0.012)
    rr = f' rx="{radius:g}"' if radius else ''
    body = (grad_defs(id_, 0, 0, size, size) + f'<rect width="{size}" height="{size}"{rr} fill="url(#{id_})"/>'
            + svg_mark(mk, '#FFFFFF'))
    return HDR.format(w=size, h=size) + TITLE + body + '</svg>\n', mk

app_svg, am = tile(512, MASTER, 328)
print('app-icon max radius / safe radius:', round(max_radius(am, 256, 256), 1), 512 * 0.4)
write(f'{BRAND}/app-icon.svg', app_svg)
fav_svg, _ = tile(256, SMALL, 200, radius=56)
write(f'{BRAND}/favicon.svg', fav_svg)
touch_svg, _ = tile(180, MASTER, 112)  # iOS rounds the corners itself
write(os.path.join(tempfile.gettempdir(), 'cadence-apple-touch.svg'), touch_svg)

# --- Wordmarks --------------------------------------------------------------
font = TTFont(f'{RES}/font/plus_jakarta_sans.ttf')
font = instantiateVariableFont(font, {'wght': 700})
gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
cap = font['OS/2'].sCapHeight
W, H = 1558, 429  # same pixel size/aspect as the existing wide logos
cap_px = 132
s = cap_px / cap
tracking = -0.02 * upm
mark_w = 272
lm = place(MASTER, 0, 0, mark_w)
mh = lm['bbox'][3] - lm['bbox'][1]
gap = 52
text = 'Cadence'
adv = sum(gs[cmap[ord(ch)]].width + tracking for ch in text) - tracking
text_w = adv * s
total = mark_w + gap + text_w
x0 = (W - total) / 2
baseline = H / 2 + cap_px / 2
# Mark: its bottom (check vertex) sits slightly under the baseline, top near cap height.
lm = place(MASTER, x0 + mark_w / 2, baseline - mh / 2 + 10, mark_w)
paths = []
x = x0 + mark_w + gap
for ch in text:
    gname = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    gs[gname].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
    paths.append(pen.getCommands())
    x += (gs[gname].width + tracking) * s
d = ' '.join(paths)
for name, mark_c, text_c in (('wordmark-light', INDIGO, INK), ('wordmark-dark', INDIGO_LIGHT, '#FFFFFF')):
    write(f'{BRAND}/{name}.svg', HDR.format(w=W, h=H) + '<title>Cadence</title>' + svg_mark(lm, mark_c)
          + f'<path fill="{text_c}" d="{d}"/></svg>\n')

# --- Android -------------------------------------------------------------------
# Adaptive icon: 108 dp canvas, mark kept inside the 66 dp safe circle (r = 33).
fg = place(MASTER, 54, 54, 56, lift=1)
print('android fg max radius (<=33):', round(max_radius(fg, 54, 54), 2))
write(f'{RES}/drawable/ic_launcher_foreground.xml',
      vector(108, 108, vector_mark(fg, '#FFFFFFFF'), 'Cadence beat check: beats that build into a done.'))
write(f'{RES}/drawable/ic_launcher_monochrome.xml',
      vector(108, 108, vector_mark(fg, '#FFFFFFFF'), 'Themed-icon layer (Android 13+): only alpha is used.'))
write(f'{RES}/drawable/ic_launcher_background.xml', f'''<?xml version="1.0" encoding="utf-8"?>
<!-- Cadence tile gradient. Source: docs/brand. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient
                android:type="linear"
                android:startX="0"
                android:startY="0"
                android:endX="108"
                android:endY="108">
                <item android:offset="0" android:color="#FF{GRAD[0][1:]}" />
                <item android:offset="0.55" android:color="#FF{GRAD[1][1:]}" />
                <item android:offset="1" android:color="#FF{GRAD[2][1:]}" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
''')
wm = place(SMALL, 12, 12, 22)
write(f'{RES}/drawable/ic_widget_mark.xml', vector(24, 24, vector_mark(wm, '#FFF7F8FC'), 'Cadence mark, small cut (notifications, widget).'))
write(f'{RES}/drawable/ic_widget_mark_light.xml', vector(24, 24, vector_mark(wm, '#FF475569'), 'Cadence mark, small cut, for light widget backgrounds.'))
print('ok')
