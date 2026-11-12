export type PluginOpenResult = { route: string } | { external: string } | null;

const REF_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const ROUTES: Record<string, string> = {
    task: '/task/',
    note: '/note/',
    project: '/project/',
};

// Where a plugin page asked to go (`cadence.open` in the page SDK,
// docs/46-plugins.md): an item of the app by its uid, or an http(s) address.
// Anything else is refused.
export const resolvePluginOpen = (
    target: unknown,
    ref: unknown
): PluginOpenResult => {
    if (typeof target !== 'string' || typeof ref !== 'string') return null;
    if (target === 'url') {
        try {
            const parsed = new URL(ref);
            return ['http:', 'https:'].includes(parsed.protocol)
                ? { external: parsed.toString() }
                : null;
        } catch {
            return null;
        }
    }
    const prefix = ROUTES[target];
    return prefix && REF_PATTERN.test(ref)
        ? { route: `${prefix}${ref}` }
        : null;
};
