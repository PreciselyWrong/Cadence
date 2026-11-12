# Design tokens (web and Android)

Source of truth: `android/designsystem/src/main/java/ch/nicolab/cadence/designsystem/theme/` (`Color.kt`, `Accent.kt`, `Tokens.kt`, `Type.kt`). The web mirrors it. Change a value on both sides in the same commit.

Web definitions: CSS variables in `frontend/styles/tailwind.css` (`:root`, `.dark`, `.dark.pure-black`), exposed as Tailwind colours in `tailwind.config.js`. Runtime accent: `frontend/utils/appearance.ts` (port of `deriveAccentRoles`). Font on the web: Inter (OFL), self-hosted as `public/fonts/Inter-*.woff2` (the CSP forbids Google Fonts); Android keeps Plus Jakarta Sans, `android/designsystem/src/main/res/font/plus_jakarta_sans.ttf`.

## Colour roles

The CSS variable holds RGB channels (`94 92 230`) so `bg-primary/90` works.

| Token                | Android light          | Android dark                     | CSS variable                                   | Tailwind                                           |
| -------------------- | ---------------------- | -------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| primary              | `#5E5CE6`              | `#A9A6FF`                        | `--color-primary`                              | `bg-primary`, `text-primary`                       |
| onPrimary            | `#FFFFFF`              | `#1B1680`                        | `--color-on-primary`                           | `text-primary-on`                                  |
| primaryContainer     | `#E4E3FF`              | `#3A378F`                        | `--color-primary-container`                    | `bg-primary-container`                             |
| onPrimaryContainer   | `#16136B`              | `#E4E3FF`                        | `--color-on-primary-container`                 | `text-primary-on-container`                        |
| background = surface | `#FCFCFD`              | `#121214` (pure black `#000000`) | `--color-surface`                              | `bg-surface`                                       |
| onSurface            | `#1B1B21`              | `#E5E1EC`                        | `--color-on-surface`                           | `text-ink`, `text-surface-on`                      |
| surfaceVariant       | `#E4E1EC`              | `#46454F`                        | `--color-surface-variant`                      | `bg-surface-variant`                               |
| onSurfaceVariant     | `#46464F`              | `#C8C5D0`                        | `--color-on-surface-variant`                   | `text-ink-muted`, `text-surface-on-variant`        |
| card                 | `#F4F4F6`              | `#1E1E21` (pure black `#121216`) | `--color-card`                                 | `bg-surface-card`                                  |
| containerLow         | `#F6F6F8`              | `#1A1A1D` (`#0A0A0E`)            | `--color-container-low`                        | `bg-surface-low`                                   |
| containerHigh        | `#EBEBEE`              | `#28282C` (`#1C1C22`)            | `--color-container-high`                       | `bg-surface-high`                                  |
| containerHighest     | `#E4E4E8`              | `#343438` (`#26262C`)            | `--color-container-highest`                    | `bg-surface-highest`                               |
| outline              | `#66656F`              | `#918F9A`                        | `--color-outline`                              | `border-outline`                                   |
| outlineVariant       | `#C7C5D0`              | `#46454F`                        | `--color-outline-variant`                      | `border-outline-variant`                           |
| error                | `#BA1A1A`              | `#FFB4AB`                        | `--color-error`                                | `text-danger`, `bg-danger`                         |
| onError              | `#FFFFFF`              | `#690005`                        | `--color-on-error`                             | `text-danger-on`                                   |
| errorContainer       | `#FFDAD6`              | `#93000A`                        | `--color-error-container`                      | `bg-danger-container`                              |
| onErrorContainer     | `#410002`              | `#FFDAD6`                        | `--color-on-error-container`                   | `text-danger-on-container`                         |
| success / container  | `#286C2A` / `#ABF5A3`  | `#8FD88A` / `#1F5223`            | `--color-success`, `--color-success-container` | `text-success`, `bg-success-container`             |
| warning / container  | `#7C5800` / `#FFDEA8`  | `#F5BD52` / `#5D4200`            | `--color-warning`, `--color-warning-container` | `text-warning`, `bg-warning-container`             |
| scrim                | `#0E0E14`              | `#000000`                        | `--color-scrim`                                | none (use `bg-black/50`)                           |
| glass                | surfaceVariant at 60 % | surfaceVariant at 35 %           | none                                           | `bg-surface-variant/60 dark:bg-surface-variant/35` |
| glassBorder          | outline at 35 %        | same                             | none                                           | `border-outline/35`                                |

### Web divergences (2026-11-12, desktop first)

- Dark mode on the web uses a blue-tinted charcoal (surface `#17181E`, card `#1F2129`, high `#262832`, highest `#30333F`) and the gray scale follows it; Android keeps its neutral dark until it is ported (`TODO.md`).
- The sidebar is a dark island in both modes (`.sidebar-island`, `--sidebar-bg` navy `#1B2333`, charcoal `#101116` in dark) and reads the dark accent roles (`--island-*`, written by `applyAppearance`).
- Calendar blocks mix the project or calendar colour into transparency (`--block-mix`: 24 % light, 42 % dark).

### Legacy palettes

Existing `blue-*` and `gray-*` utilities are variable-backed so the whole app follows the accent and the warm surfaces without touching every class.

| Utility           | Meaning                                                     | Source                                 |
| ----------------- | ----------------------------------------------------------- | -------------------------------------- |
| `blue-500`        | the accent seed (`#5E5CE6` by default)                      | `--blue-500`                           |
| `blue-50 ... 950` | tonal scale, same hue and saturation as the seed            | `accentScale()` in `appearance.ts`     |
| `gray-900`        | dark background `#121214`                                   | `--gray-900` (`#000000` in pure black) |
| `gray-800`        | dark card `#1E1E21`                                         | `--gray-800` (`#121216`)               |
| `gray-700`        | dark container highest `#343438`                            | `--gray-700`                           |
| `gray-600 / 500`  | secondary text, AA on every surface (`#46464F` / `#67666F`) | `--gray-600`, `--gray-500`             |
| `gray-300 / 400`  | dark secondary text `#C8C7CE` / outlines `#919098`          | `--gray-300`, `--gray-400`             |
| `gray-50 ... 200` | light surfaces `#F8F8FA`, `#F4F4F6` (card), `#EBEBEE`       | `--gray-50` to `--gray-200`            |

## Accent (Réglages › Apparence)

Presets, identical to `AccentPreset`: Violet `#5E5CE6` (default), Indigo `#3F51B5`, Bleu `#1E6FD9`, Sarcelle `#00897B`, Vert `#2E7D32`, Ambre `#C77700`, Corail `#E0483B`, Rose `#C2185B`, plus a free `#RRGGBB`. Violet keeps its exact roles. Any other seed: light = seed as primary, darkened (hue and saturation kept) until 4.5:1 on the light card, `onPrimary` = `readableOn(primary)`, container at HSL lightness 0.92, on-container 0.20; dark = primary 0.82, onPrimary 0.22, container 0.30 (darkened if its on-container does not reach 4.5:1), on-container 0.90 (same hue and saturation as the seed). Every text/fill pair reaches 4.5:1 (`PaletteContrastTest`, `appearance.test.ts`). Stored in `localStorage` (`cadenceAccent`, `cadencePureBlack`); theme mode (système/clair/sombre) is the existing `isDarkMode` preference. Material You has no web equivalent.

## Radii

| Token    | Android             | CSS / Tailwind     |
| -------- | ------------------- | ------------------ |
| inner    | 4 dp                | `rounded-inner`    |
| checkbox | 8 dp                | `rounded-checkbox` |
| chip     | 12 dp               | `rounded-chip`     |
| control  | 16 dp               | `rounded-control`  |
| fab      | 18 dp               | `rounded-fab`      |
| card     | 20 dp               | `rounded-card`     |
| panel    | 24 dp               | `rounded-panel`    |
| sheet    | 28 dp (top corners) | `rounded-sheet`    |
| pill     | 999 dp              | `rounded-full`     |

## Spacing and sizes

Steps 4 / 8 / 12 / 16 / 24 / 32 / 48 map to Tailwind `1 / 2 / 3 / 4 / 6 / 8 / 12`. Gutter 16 (`px-4`). Group gap 2 (`gap-0.5`). Sizes: tab and segment 40 (`h-10`), badge 24 (`h-6`), checkbox 22 on the web (24 on Android), touch target at least 44 (`min-h-[44px]` on phones), header button 48.

## Type

The root font size is 90 %, so 1 rem is 14.4 px: rem = px / 14.4.

| Role     | Android (sp / line) | Weight | Tailwind        |
| -------- | ------------------- | ------ | --------------- |
| display  | 30 / 36, -0.5       | 600    | `text-display`  |
| headline | 24 / 32, -0.5       | 600    | `text-headline` |
| title    | 20 / 26             | 600    | `text-title`    |
| titleM   | 16 / 22             | 700    | `text-title-m`  |
| body     | 16 / 24             | 400    | `text-body`     |
| bodyM    | 14 / 20             | 400    | `text-body-m`   |
| label    | 14 / 20             | 500    | `text-label`    |
| labelM   | 12 / 16             | 500    | `text-label-m`  |
| metric   | 32 / 36, -0.5       | 600    | `text-metric`   |

`text-xs` is 12 px, the minimum text size on the web. Secondary text uses `text-gray-600 dark:text-gray-300` or lighter-weight equivalents that keep 4.5:1.

## Motion

| Token                       | Android                                        | Web                                                                                                                                                 |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| quick / normal / expressive | 140 / 240 / 380 ms (critically damped springs) | CSS transitions of similar duration, no bounce                                                                                                      |
| colour                      | 220 ms                                         | `duration-[220ms]`                                                                                                                                  |
| press scale                 | 0.97                                           | `active:scale-[0.97]`                                                                                                                               |
| task check                  | fill and stroke tween 220 ms                   | tick draw 180 ms, scale pop 180 ms, row fade and collapse 180 ms at 420 ms, task toggled at 600 ms; reduced motion: no animation, toggled at 250 ms |

## Components

| Android                    | Web                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TabPills`                 | `frontend/components/Shared/ui/Segmented.tsx` on the desktop (the Plan switch look)                    |
| `SegmentedTabs`            | `frontend/components/Shared/ui/SegmentedTabs.tsx` (calendar view switch on phones, to adopt elsewhere) |
| `CadenceBadge`             | `frontend/components/Shared/ui/CadenceBadge.tsx`                                                       |
| `TaskCheckbox`             | `frontend/components/Task/TaskCheckCircle.tsx`                                                         |
| `FacetGauge` (habits only) | `frontend/components/Shared/ui/FacetGauge.tsx`                                                         |
| glass buttons and chips    | `bg-surface-variant/60` plus `border-outline/35`                                                       |
| page header                | `frontend/components/Shared/ui/PageHeader.tsx` (800 title, one action row, summary line)               |
| list row                   | `frontend/components/Shared/ui/ListRow.tsx` (two levels, `countsLine` without zeros, `ColorDot`)       |
| search field               | `frontend/components/Shared/ui/SearchField.tsx`                                                        |
