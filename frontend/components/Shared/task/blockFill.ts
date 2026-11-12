// A calendar block's colour as a flat fill: lighter in light mode, deeper in
// dark mode (--block-mix in tailwind.css), so blocks never turn muddy. No
// colour (or one that is not a 6-digit hex) gives undefined, and the block
// takes its token classes instead.
export const blockFill = (color?: string | null): string | undefined =>
    color && /^#[0-9a-f]{6}$/i.test(color)
        ? `color-mix(in srgb, ${color} var(--block-mix), transparent)`
        : undefined;
