import type {
    WeekendAnswer,
    WeekendWeather,
} from '../../utils/proposalsService';
import {
    dominantWeather,
    partLabel,
    Picks,
    ShareDay,
    shareDays,
    Translate,
} from './weekendModel';

// The image « Partager » sends (docs/48-weekend.md › Share): drawn on the
// device, nothing goes to the server. Android draws the same layout.

const WIDTH = 1080;
const PAD = 72;
const CARD_PAD = 40;
const CARD_GAP = 32;
const RADIUS = 36;
const FONT = 'Inter, "Segoe UI", Roboto, system-ui, sans-serif';

const GRADIENT: Record<WeekendWeather, [string, string]> = {
    sun: ['#FFB347', '#FF5E62'],
    partly: ['#FFB347', '#FF5E62'],
    cloud: ['#8E9EAB', '#D7E1EC'],
    fog: ['#8E9EAB', '#D7E1EC'],
    rain: ['#2C5364', '#0F2027'],
    storm: ['#2C5364', '#0F2027'],
    snow: ['#E0EAFC', '#B8CDEB'],
};
const DARK_BACKGROUND = new Set<WeekendWeather>([
    'sun',
    'partly',
    'rain',
    'storm',
]);
const GLYPH: Record<WeekendWeather, string> = {
    sun: '☀️',
    partly: '⛅',
    cloud: '☁️',
    rain: '🌧️',
    snow: '❄️',
    storm: '⛈️',
    fog: '🌫️',
};

interface Palette {
    ink: string;
    muted: string;
    card: string;
    pill: string;
    pillInk: string;
}

const paletteOf = (weather: WeekendWeather): Palette =>
    DARK_BACKGROUND.has(weather)
        ? {
              ink: '#FFFFFF',
              muted: 'rgba(255,255,255,0.78)',
              card: 'rgba(255,255,255,0.18)',
              pill: '#FFFFFF',
              pillInk: '#1B1B1F',
          }
        : {
              ink: '#1B1B1F',
              muted: 'rgba(27,27,31,0.68)',
              card: 'rgba(255,255,255,0.55)',
              pill: '#1B1B1F',
              pillInk: '#FFFFFF',
          };

const capitalize = (text: string): string =>
    text.charAt(0).toLocaleUpperCase() + text.slice(1);

// « Samedi 28 novembre ».
const longDay = (date: string, language: string): string => {
    const value = new Date(`${date}T12:00:00Z`);
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
    };
    try {
        return capitalize(value.toLocaleDateString(language, options));
    } catch {
        return capitalize(value.toLocaleDateString('fr', options));
    }
};

// Words that fit `width`, line by line; a word longer than a line is cut.
function wrap(
    ctx: CanvasRenderingContext2D,
    text: string,
    width: number
): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width <= width || !line) {
            line = next;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

interface Text {
    font: string;
    color: string;
    size: number;
    lineHeight: number;
    spacing?: string;
}

interface Labels {
    kicker: string;
    calendar: string;
    busy: (text: string) => string;
    footer: string;
    part: (part: ShareDay['items'][number]['part']) => string;
}

// One pass measures (draw = false) and the next draws at the same places.
function paint(
    ctx: CanvasRenderingContext2D,
    answer: WeekendAnswer,
    days: ShareDay[],
    palette: Palette,
    labels: Labels,
    language: string,
    draw: boolean
): number {
    const inner = WIDTH - PAD * 2;
    let y = PAD + 8;

    const write = (
        text: string,
        style: Text,
        x: number,
        width: number,
        align: CanvasTextAlign = 'left'
    ): number => {
        ctx.font = style.font;
        const lines = wrap(ctx, text, width);
        if (draw) {
            ctx.fillStyle = style.color;
            ctx.textAlign = align;
            ctx.textBaseline = 'alphabetic';
            lines.forEach((line, i) =>
                ctx.fillText(
                    line,
                    align === 'right' ? x + width : x,
                    y + style.size + i * style.lineHeight
                )
            );
        }
        return lines.length * style.lineHeight;
    };

    const kicker: Text = {
        font: `600 26px ${FONT}`,
        color: palette.muted,
        size: 26,
        lineHeight: 34,
    };
    if ('letterSpacing' in ctx) {
        (ctx as unknown as { letterSpacing: string }).letterSpacing = '6px';
    }
    y += write(labels.kicker, kicker, PAD, inner) + 12;
    if ('letterSpacing' in ctx) {
        (ctx as unknown as { letterSpacing: string }).letterSpacing = '0px';
    }
    y += write(
        answer.headline,
        {
            font: `700 64px ${FONT}`,
            color: palette.ink,
            size: 64,
            lineHeight: 76,
        },
        PAD,
        inner
    );
    if (answer.subtitle) {
        y += 12;
        y += write(
            answer.subtitle,
            {
                font: `400 34px ${FONT}`,
                color: palette.muted,
                size: 34,
                lineHeight: 46,
            },
            PAD,
            inner
        );
    }
    y += 48;

    const cardInner = inner - CARD_PAD * 2;
    for (const day of days) {
        const top = y;
        // The card is drawn behind its content: measure it first.
        const height = (() => {
            const saved = y;
            const was = draw;
            draw = false;
            y = top + CARD_PAD;
            y += dayContent(day);
            const h = y - top + CARD_PAD - 20;
            y = saved;
            draw = was;
            return h;
        })();
        if (draw) {
            ctx.fillStyle = palette.card;
            ctx.beginPath();
            ctx.roundRect(PAD, top, inner, height, RADIUS);
            ctx.fill();
        }
        y = top + CARD_PAD;
        dayContent(day);
        y = top + height + CARD_GAP;
    }

    function dayContent(day: ShareDay): number {
        const start = y;
        const x = PAD + CARD_PAD;
        const weather = [
            day.weather ? GLYPH[day.weather] : null,
            day.min !== null && day.max !== null
                ? `${day.min}° · ${day.max}°`
                : null,
        ]
            .filter(Boolean)
            .join('  ');
        const title: Text = {
            font: `700 40px ${FONT}`,
            color: palette.ink,
            size: 40,
            lineHeight: 50,
        };
        ctx.font = `500 32px ${FONT}`;
        const weatherWidth = weather ? ctx.measureText(weather).width + 24 : 0;
        const titleHeight = write(
            longDay(day.date, language),
            title,
            x,
            cardInner - weatherWidth
        );
        if (weather) {
            write(
                weather,
                {
                    font: `500 32px ${FONT}`,
                    color: palette.ink,
                    size: 36,
                    lineHeight: 50,
                },
                x,
                cardInner,
                'right'
            );
        }
        y += titleHeight + 20;

        let shownPart: string | null = null;
        for (const item of day.items) {
            // Alternatives of one half-day follow each other: its name once.
            if (item.part !== shownPart) {
                shownPart = item.part;
                y += write(
                    labels.part(item.part).toLocaleUpperCase(),
                    {
                        font: `600 22px ${FONT}`,
                        color: palette.muted,
                        size: 22,
                        lineHeight: 30,
                    },
                    x,
                    cardInner
                );
                y += 4;
            }
            const text =
                item.state === 'busy' ? labels.busy(item.title) : item.title;
            y += write(
                text,
                {
                    font: `600 36px ${FONT}`,
                    color: palette.ink,
                    size: 36,
                    lineHeight: 46,
                },
                x,
                cardInner
            );
            const meta = [item.place, item.start, item.travel]
                .filter(Boolean)
                .join(' · ');
            if (meta) {
                y += 2;
                y += write(
                    meta,
                    {
                        font: `400 28px ${FONT}`,
                        color: palette.muted,
                        size: 28,
                        lineHeight: 38,
                    },
                    x,
                    cardInner
                );
            }
            if (item.state === 'calendar') {
                y += 12;
                ctx.font = `600 24px ${FONT}`;
                const w = ctx.measureText(labels.calendar).width + 40;
                if (draw) {
                    ctx.fillStyle = palette.pill;
                    ctx.beginPath();
                    ctx.roundRect(x, y, w, 44, 22);
                    ctx.fill();
                    ctx.fillStyle = palette.pillInk;
                    ctx.textAlign = 'left';
                    ctx.fillText(labels.calendar, x + 20, y + 31);
                }
                y += 44;
            }
            y += 28;
        }
        return y - start;
    }

    y += 8;
    y += write(
        labels.footer,
        {
            font: `500 24px ${FONT}`,
            color: palette.muted,
            size: 24,
            lineHeight: 32,
        },
        PAD,
        inner,
        'left'
    );
    return Math.ceil(y + PAD);
}

// The PNG of the weekend with the picks not sent yet.
export async function drawWeekendImage(
    answer: WeekendAnswer,
    picks: Picks,
    t: Translate,
    language: string
): Promise<Blob> {
    const days = shareDays(answer, picks);
    const weather = dominantWeather(answer.days ?? []);
    const palette = paletteOf(weather);
    const labels: Labels = {
        kicker: t('weekend.share.kicker', 'WEEK-END'),
        calendar: t('weekend.decided.calendar', 'À l’agenda'),
        busy: (text) => t('weekend.busy', 'Occupé : {{busy}}', { busy: text }),
        footer: t('weekend.share.footer', 'Préparé avec Cadence'),
        part: (part) => partLabel(part, t),
    };
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const height = paint(ctx, answer, days, palette, labels, language, false);
    canvas.width = WIDTH;
    canvas.height = height;
    const [from, to] = GRADIENT[weather];
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, from);
    gradient.addColorStop(1, to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, height);
    paint(ctx, answer, days, palette, labels, language, true);
    return new Promise((resolve, reject) =>
        canvas.toBlob(
            (blob) =>
                blob ? resolve(blob) : reject(new Error('No image produced')),
            'image/png'
        )
    );
}

export type ShareOutcome = 'shared' | 'copied' | 'downloaded' | 'cancelled';

// The system share sheet with the file, else the clipboard, else a download.
export async function shareImage(
    blob: Blob,
    filename: string,
    title: string
): Promise<ShareOutcome> {
    const file = new File([blob], filename, { type: 'image/png' });
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title });
            return 'shared';
        } catch (error) {
            if ((error as DOMException)?.name === 'AbortError') {
                return 'cancelled';
            }
        }
    }
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        try {
            await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
            ]);
            return 'copied';
        } catch {
            // Clipboard refused (permissions, focus): fall back to a download.
        }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'downloaded';
}
