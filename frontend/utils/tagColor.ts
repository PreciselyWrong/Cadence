import { useMemo } from 'react';
import { PALETTE, PaletteColor, resolveColor } from '../constants/colorPalette';
import { useStore } from '../store/useStore';

// The color of a tag: its own, else the nearest ancestor's (`perso` for
// `perso/sport`), else one derived from the root segment of its name so the
// same name always looks the same. Mirrored on Android; the shared cases are in
// fixtures/tags/colors.json.
const SEPARATOR = '/';
const NO_TAGS: TagLike[] = [];
const DERIVED = PALETTE.filter((c) => c.key !== 'gray');

interface TagLike {
    name: string;
    color?: string | null;
}

export function derivedTagColor(name: string): PaletteColor {
    const root = name.split(SEPARATOR)[0].trim().toLowerCase();
    let hash = 0;
    for (let i = 0; i < root.length; i++) {
        hash = (hash * 31 + root.charCodeAt(i)) >>> 0;
    }
    return DERIVED[hash % DERIVED.length];
}

export function resolveTagColor(
    tag: TagLike,
    tags: TagLike[] = []
): PaletteColor {
    const own = resolveColor(tag.color);
    if (own) return own;
    const byName = new Map(tags.map((t) => [t.name, t]));
    let path = tag.name;
    while (path.includes(SEPARATOR)) {
        path = path.slice(0, path.lastIndexOf(SEPARATOR));
        const inherited = resolveColor(byName.get(path)?.color);
        if (inherited) return inherited;
    }
    return derivedTagColor(tag.name);
}

// Resolver bound to the tags in the store, for components that show chips.
export function useTagColor(): (tag: TagLike) => PaletteColor {
    const tags = useStore((state) => state.tagsStore?.tags) ?? NO_TAGS;
    return useMemo(() => (tag: TagLike) => resolveTagColor(tag, tags), [tags]);
}
