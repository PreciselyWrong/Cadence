# Cadence brand mark

## Concept: the beat check

Two beats at a steady tempo, growing in size, then the check. Repeated small actions (habits, recurring tasks) build into a done. One idea, no letters, geometric, round caps.

Three other concepts were sketched (`concepts/`) and set aside:

- **A, pulse check** (a heartbeat spike that turns into a check): at small sizes it reads as a zigzag "N" or a stock-trend line.
- **B, ring check** (a habit-progress ring around a check): generic, and too close to TickTick and Google Tasks (open ring + check).
- **C, metronome check** (a swing arc above a check): reads as a gauge.

`concepts/d-beat-check.svg` is the sketch the final mark came from. It is distinct from the old hexagon-with-check and from TickTick: no container, and the rhythm sits in the dots.

## Construction

- 45° check. The short leg is 28 units on each axis and the long leg 92 (on a 256 master).
- The two beats sit on the short leg's line. Their centres are spaced exactly like the stroke start (constant tempo), and their radii are 9 and 12 against a 28-unit stroke (crescendo).
- Small cut (`mark-small.svg`, used for favicons and 24 dp Android icons) has a heavier stroke (36) and larger dots (13 and 16), so the beats survive at 16 px.
- `generate.py` holds the geometry and writes every SVG master plus the Android vectors. Change the geometry there, not in the output files.

## Colours

| Role | Hex | Notes |
|---|---|---|
| Accent (light UI) | `#5E5CE6` | Android `LightPalette.accent`, used for the mark on light backgrounds |
| Accent (dark UI) | `#7D7AFF` | Android `DarkPalette.accent`, used for the mark on dark backgrounds |
| Ink | `#1C1C1E` | Wordmark text on light backgrounds |
| Tile gradient | `#3D3AC8` → `#5E5CE6` (55 %) → `#8A80FF` | App icon background, top left to bottom right (Morphe-style three-stop brand gradient) |

On the tile, the mark is always white. The one-colour version is `mark-mono.svg` (`currentColor`).

## Files

| File | Use |
|---|---|
| `mark.svg` | Colour symbol, transparent |
| `mark-mono.svg` | One-colour symbol (`currentColor`) |
| `mark-small.svg` | Small-size cut (32 px and below) |
| `app-icon.svg` | 512 full-bleed store and PWA icon. The mark stays inside the 80 % maskable circle |
| `favicon.svg` | Rounded tile with the small cut |
| `wordmark-light.svg` | Mark + "Cadence" for **light** backgrounds (exported as `public/wide-logo-dark.png`) |
| `wordmark-dark.svg` | Mark + "Cadence" for **dark** backgrounds (exported as `public/wide-logo-light.png`) |

The wordmark is Plus Jakarta Sans Bold (OFL, the Android app's UI font) converted to paths, with -0.02 em tracking.

## Usage

- Minimum size: use `mark-small.svg` / `favicon.svg` at 32 px and below.
- Clear space: one beat-dot spacing (about 1/8 of the mark's width) on every side.
- Don't recolour the dots separately, add outlines or shadows, rotate, or put the colour mark on the indigo tile (use white).

## Regenerating

```bash
python3 -m venv /tmp/brand-venv && /tmp/brand-venv/bin/pip install fonttools
/tmp/brand-venv/bin/python docs/brand/generate.py
S=~/.agents/skills/logo-design/scripts   # render_png.py (headless Chrome)
python3 $S/render_png.py docs/brand/favicon.svg --ico public/favicon.ico --ico-sizes 16 32 48
for s in 16 32 48; do python3 $S/render_png.py docs/brand/favicon.svg -o public/favicon-$s.png --size $s; done
python3 $S/render_png.py docs/brand/app-icon.svg -o public/icon-logo.png --size 512
python3 $S/render_png.py /tmp/cadence-apple-touch.svg -o public/apple-touch-icon.png --size 180
python3 $S/render_png.py docs/brand/wordmark-light.svg -o public/wide-logo-dark.png --width 1558 --height 429
python3 $S/render_png.py docs/brand/wordmark-dark.svg -o public/wide-logo-light.png --width 1558 --height 429
```

After that, copy `favicon-32.png` to `favicon.png`, copy `favicon.ico` to `favicon-dark.ico` and `favicon-light.ico`, and copy `favicon.ico`, `icon-logo.png` and `wide-logo-dark.png` into `backend/modules/landing/public/`.

The mark has had no trademark search.
