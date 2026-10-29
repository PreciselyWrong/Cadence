// Splits inbox text into plain runs and the tokens the box understands
// (#tag, +project or ^list, @person, ~area, !1-!3 priority), so the edit box
// can colour them in place.
export type InboxTokenKind = 'tag' | 'project' | 'person' | 'area' | 'priority';

export interface InboxTextSegment {
    text: string;
    kind?: InboxTokenKind;
}

export type InboxPriority = 'high' | 'medium' | 'low';

// !1 is high, !2 medium, !3 low. Only these exact tokens are priorities.
export const INBOX_PRIORITY_BY_TOKEN: Record<string, InboxPriority> = {
    '!1': 'high',
    '!2': 'medium',
    '!3': 'low',
};

const PRIORITY_TOKEN = /^![123]$/;

// Tokens that sit in a consecutive group of tags and projects, as the
// parsers read them: #tag, +project, ^list and the !1-!3 priorities.
export const isTagGroupToken = (token: string): boolean =>
    token.startsWith('#') ||
    token.startsWith('+') ||
    token.startsWith('^') ||
    PRIORITY_TOKEN.test(token);

// +project and ^list both name a project.
export const isProjectToken = (token: string): boolean =>
    token.startsWith('+') || token.startsWith('^');

const KIND_BY_PREFIX: Record<string, InboxTokenKind> = {
    '#': 'tag',
    '+': 'project',
    '^': 'project',
    '@': 'person',
    '~': 'area',
};

export const splitInboxTokens = (text: string): InboxTextSegment[] => {
    const segments: InboxTextSegment[] = [];
    const pattern = /(^|\s)(![123](?=\s|$)|[#+@~^](?:"[^"]*"|[^\s"]+))/g;
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
        const start = match.index + match[1].length;
        const token = match[2];
        if (start > last) segments.push({ text: text.slice(last, start) });
        const kind = token.startsWith('!')
            ? 'priority'
            : KIND_BY_PREFIX[token[0]];
        segments.push({ text: token, kind });
        last = start + token.length;
    }

    if (last < text.length) segments.push({ text: text.slice(last) });
    return segments;
};

// The priority of the first !1-!3 token in the text, if any.
export const priorityFromText = (text: string): InboxPriority | undefined => {
    const token = splitInboxTokens(text).find(
        (segment) => segment.kind === 'priority'
    );
    return token ? INBOX_PRIORITY_BY_TOKEN[token.text] : undefined;
};

const normalizeProjectName = (value: string): string =>
    value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// The project a +name or ^name refers to: an exact name (case and accents
// ignored), else the only project whose name starts with it.
export const matchProjectName = <T extends { name: string }>(
    projects: T[],
    query: string
): T | undefined => {
    const wanted = normalizeProjectName(query);
    if (!wanted) return undefined;
    const exact = projects.find(
        (project) => normalizeProjectName(project.name) === wanted
    );
    if (exact) return exact;
    const prefixed = projects.filter((project) =>
        normalizeProjectName(project.name).startsWith(wanted)
    );
    return prefixed.length === 1 ? prefixed[0] : undefined;
};
