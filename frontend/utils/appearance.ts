/**
 * Accent colour and pure-black mode. Mirrors android/designsystem
 * theme/Accent.kt: same presets, same HSL derivation. The result is written as
 * CSS variables on <html>, so the semantic tokens (bg-primary, ...) and the
 * blue-* scale follow the user's choice. Token table: docs/fork/DESIGN-TOKENS.md.
 */

export interface AccentPreset {
    id: string;
    hex: string;
    labelKey: string;
    fallback: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
    {
        id: 'violet',
        hex: '#5E5CE6',
        labelKey: 'accent.violet',
        fallback: 'Violet',
    },
    {
        id: 'indigo',
        hex: '#3F51B5',
        labelKey: 'accent.indigo',
        fallback: 'Indigo',
    },
    { id: 'bleu', hex: '#1E6FD9', labelKey: 'accent.blue', fallback: 'Blue' },
    {
        id: 'sarcelle',
        hex: '#00897B',
        labelKey: 'accent.teal',
        fallback: 'Teal',
    },
    { id: 'vert', hex: '#2E7D32', labelKey: 'accent.green', fallback: 'Green' },
    {
        id: 'ambre',
        hex: '#C77700',
        labelKey: 'accent.amber',
        fallback: 'Amber',
    },
    {
        id: 'corail',
        hex: '#E0483B',
        labelKey: 'accent.coral',
        fallback: 'Coral',
    },
    { id: 'rose', hex: '#C2185B', labelKey: 'accent.rose', fallback: 'Rose' },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].hex;
const ACCENT_KEY = 'cadenceAccent';
const PURE_BLACK_KEY = 'cadencePureBlack';
const HEX = /^#[0-9A-Fa-f]{6}$/;
const WHITE = 0xffffff;
const INK = 0x1b1b21;

export interface AccentRoles {
    primary: number;
    onPrimary: number;
    primaryContainer: number;
    onPrimaryContainer: number;
}

const VIOLET_LIGHT: AccentRoles = {
    primary: 0x5e5ce6,
    onPrimary: 0xffffff,
    primaryContainer: 0xe4e3ff,
    onPrimaryContainer: 0x16136b,
};
const VIOLET_DARK: AccentRoles = {
    primary: 0xa9a6ff,
    onPrimary: 0x1b1680,
    primaryContainer: 0x3a378f,
    onPrimaryContainer: 0xe4e3ff,
};

export function hexToRgb(hex: string): number {
    return parseInt(hex.slice(1), 16);
}

export function rgbToHex(rgb: number): string {
    return `#${rgb.toString(16).padStart(6, '0').toUpperCase()}`;
}

interface Hsl {
    hue: number;
    saturation: number;
    lightness: number;
}

function toHsl(rgb: number): Hsl {
    const r = ((rgb >> 16) & 0xff) / 255;
    const g = ((rgb >> 8) & 0xff) / 255;
    const b = (rgb & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const delta = max - min;
    if (delta === 0) return { hue: 0, saturation: 0, lightness };
    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let sector: number;
    if (max === r) sector = ((g - b) / delta + 6) % 6;
    else if (max === g) sector = (b - r) / delta + 2;
    else sector = (r - g) / delta + 4;
    return { hue: sector * 60, saturation, lightness };
}

function fromHsl(hue: number, saturation: number, lightness: number): number {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const sector = hue / 60;
    const x = chroma * (1 - Math.abs((sector % 2) - 1));
    let rgb: [number, number, number];
    if (sector < 1) rgb = [chroma, x, 0];
    else if (sector < 2) rgb = [x, chroma, 0];
    else if (sector < 3) rgb = [0, chroma, x];
    else if (sector < 4) rgb = [0, x, chroma];
    else if (sector < 5) rgb = [x, 0, chroma];
    else rgb = [chroma, 0, x];
    const m = lightness - chroma / 2;
    const ch = (v: number) =>
        Math.min(255, Math.max(0, Math.round((v + m) * 255)));
    return (ch(rgb[0]) << 16) | (ch(rgb[1]) << 8) | ch(rgb[2]);
}

function luminance(rgb: number): number {
    const lin = (c: number) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return (
        0.2126 * lin((rgb >> 16) & 0xff) +
        0.7152 * lin((rgb >> 8) & 0xff) +
        0.0722 * lin(rgb & 0xff)
    );
}

export function contrastRatio(a: number, b: number): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Same rules as Android deriveAccentRoles. */
export function deriveAccentRoles(seed: number, dark: boolean): AccentRoles {
    if (seed === VIOLET_LIGHT.primary) return dark ? VIOLET_DARK : VIOLET_LIGHT;
    const { hue, saturation } = toHsl(seed);
    const tone = (l: number) => fromHsl(hue, saturation, l);
    if (dark) {
        return {
            primary: tone(0.82),
            onPrimary: tone(0.22),
            primaryContainer: tone(0.3),
            onPrimaryContainer: tone(0.9),
        };
    }
    const onPrimary =
        contrastRatio(seed, WHITE) >= contrastRatio(seed, INK) ? WHITE : INK;
    return {
        primary: seed,
        onPrimary,
        primaryContainer: tone(0.92),
        onPrimaryContainer: tone(0.2),
    };
}

const BLUE_STEPS: Array<[number, number]> = [
    [50, 0.97],
    [100, 0.92],
    [200, 0.85],
    [300, 0.76],
    [400, 0.66],
    [600, -0.07],
    [700, -0.15],
    [800, -0.23],
    [900, -0.31],
    [950, -0.38],
];

/** Tonal scale behind the blue-* utilities: 500 is the seed, others share its hue. */
export function accentScale(seed: number): Record<number, number> {
    const { hue, saturation, lightness } = toHsl(seed);
    const scale: Record<number, number> = { 500: seed };
    for (const [step, value] of BLUE_STEPS) {
        const l = value < 0 ? Math.max(0.08, lightness + value) : value;
        scale[step] = fromHsl(hue, saturation, l);
    }
    return scale;
}

const channels = (rgb: number) =>
    `${(rgb >> 16) & 0xff} ${(rgb >> 8) & 0xff} ${rgb & 0xff}`;

export function getStoredAccent(): string {
    try {
        const stored = localStorage.getItem(ACCENT_KEY);
        return stored && HEX.test(stored)
            ? stored.toUpperCase()
            : DEFAULT_ACCENT;
    } catch {
        return DEFAULT_ACCENT;
    }
}

export function getStoredPureBlack(): boolean {
    try {
        return localStorage.getItem(PURE_BLACK_KEY) === 'true';
    } catch {
        return false;
    }
}

export function storeAccent(hex: string): void {
    try {
        localStorage.setItem(ACCENT_KEY, hex.toUpperCase());
    } catch {
        // Storage can be unavailable (private mode); the choice then lasts for the session.
    }
}

export function storePureBlack(value: boolean): void {
    try {
        localStorage.setItem(PURE_BLACK_KEY, String(value));
    } catch {
        // See storeAccent.
    }
}

/** Writes the accent roles and the blue scale for the current theme mode. */
export function applyAppearance(
    accentHex: string = getStoredAccent(),
    pureBlack: boolean = getStoredPureBlack()
): void {
    const root = document.documentElement;
    const dark = root.classList.contains('dark');
    root.classList.toggle('pure-black', pureBlack);
    const seed = hexToRgb(HEX.test(accentHex) ? accentHex : DEFAULT_ACCENT);
    const roles = deriveAccentRoles(seed, dark);
    const style = root.style;
    style.setProperty('--color-primary', channels(roles.primary));
    style.setProperty('--color-on-primary', channels(roles.onPrimary));
    style.setProperty(
        '--color-primary-container',
        channels(roles.primaryContainer)
    );
    style.setProperty(
        '--color-on-primary-container',
        channels(roles.onPrimaryContainer)
    );
    const scale = accentScale(seed);
    for (const [step, rgb] of Object.entries(scale)) {
        style.setProperty(`--blue-${step}`, channels(rgb));
    }
}

/** Re-applies the accent when the theme mode flips (roles differ per mode). */
export function watchThemeMode(): () => void {
    const observer = new MutationObserver(() => applyAppearance());
    observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
    });
    return () => observer.disconnect();
}
