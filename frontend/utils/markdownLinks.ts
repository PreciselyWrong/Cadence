// Cadence's own link syntax in Markdown (notes and task descriptions):
//   [[Title]]               a note, by title
//   [[task:Title]]          a task, by name
//   @[Name](person:<uid>)   a person
// and links to /note/<uid>, /notes/<uid>, /task/<uid>, /person/<uid>, which
// open in the app. Mirrors backend/modules/content-links/core/parse.js.

export const NOTE_LINK_PREFIX = '/__wikilink__/';
export const TASK_LINK_PREFIX = '/__tasklink__/';
export const MENTION_PREFIX = '/__mention__/';

const WIKILINK = /\[\[([^[\]\n]+?)\]\]/g;
const MENTION = /@\[([^\]\n]*)\]\(person:([0-9a-z-]+)\)/g;
const TASK_PREFIX = /^task:\s*/i;
const APP_PATH = /^\/(note|notes|task|person)\/[0-9a-z-]+(?:[/?#].*)?$/i;

// Applies `fn` to the text outside code (fenced blocks and `inline`), so
// a [[link]] shown as code stays as typed.
const outsideCode = (content: string, fn: (text: string) => string) => {
    let fence: string | null = null;
    return content
        .split('\n')
        .map((line) => {
            const marker = line.match(/^\s*(```|~~~)/);
            if (fence) {
                if (marker && marker[1] === fence) fence = null;
                return line;
            }
            if (marker) {
                fence = marker[1];
                return line;
            }
            return line
                .split(/(`[^`]+`)/)
                .map((part, i) => (i % 2 === 1 ? part : fn(part)))
                .join('');
        })
        .join('\n');
};

const linkLabel = (text: string) => text.replace(/[[\]\\]/g, '\\$&');

// Turns Cadence links into plain Markdown links the renderer recognises.
export const preprocessContentLinks = (content: string): string =>
    outsideCode(content, (text) =>
        text
            .replace(MENTION, (_m, name: string, uid: string) => {
                return `[${linkLabel(name.trim() || uid)}](${MENTION_PREFIX}${uid})`;
            })
            .replace(WIKILINK, (_m, raw: string) => {
                const title = raw.trim();
                if (TASK_PREFIX.test(title)) {
                    const name = title.replace(TASK_PREFIX, '').trim();
                    return `[${linkLabel(name)}](${TASK_LINK_PREFIX}${encodeURIComponent(name)})`;
                }
                return `[${linkLabel(title)}](${NOTE_LINK_PREFIX}${encodeURIComponent(title)})`;
            })
    );

// The task names of every [[task:Name]] in `content`.
export const taskLinkNames = (content: string): string[] => {
    const names = new Set<string>();
    outsideCode(content, (text) => {
        for (const m of text.matchAll(WIKILINK)) {
            const raw = m[1].trim();
            if (TASK_PREFIX.test(raw)) {
                const name = raw.replace(TASK_PREFIX, '').trim();
                if (name) names.add(name);
            }
        }
        return text;
    });
    return [...names];
};

export type HrefKind =
    | { kind: 'note-title'; title: string }
    | { kind: 'task-title'; title: string }
    | { kind: 'mention'; uid: string }
    | { kind: 'internal'; path: string }
    | { kind: 'external'; href: string }
    | { kind: 'other'; href: string };

const decode = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
};

// What a rendered link points at. A full URL to this site's note, task or
// person page opens in the app; other web links open in a new tab.
export const classifyHref = (
    href: string | undefined,
    origin: string = typeof window !== 'undefined' ? window.location.origin : ''
): HrefKind => {
    const value = href ?? '';
    if (value.startsWith(NOTE_LINK_PREFIX)) {
        return {
            kind: 'note-title',
            title: decode(value.slice(NOTE_LINK_PREFIX.length)),
        };
    }
    if (value.startsWith(TASK_LINK_PREFIX)) {
        return {
            kind: 'task-title',
            title: decode(value.slice(TASK_LINK_PREFIX.length)),
        };
    }
    if (value.startsWith(MENTION_PREFIX)) {
        return { kind: 'mention', uid: value.slice(MENTION_PREFIX.length) };
    }
    if (/^https?:\/\//i.test(value)) {
        if (
            origin &&
            value.toLowerCase().startsWith(`${origin.toLowerCase()}/`)
        ) {
            const path = value.slice(origin.length);
            if (APP_PATH.test(path)) return { kind: 'internal', path };
        }
        return { kind: 'external', href: value };
    }
    if (APP_PATH.test(value)) return { kind: 'internal', path: value };
    return { kind: 'other', href: value };
};

// The Markdown a mention of a person is stored as.
export const mentionToken = (name: string, uid: string): string =>
    `@[${name.replace(/[[\]\n]/g, ' ').trim()}](person:${uid})`;

// An "@name" being typed just before the caret: the search typed so far and
// where the "@" is. An "@" inside a word (an e-mail address) is not one.
export const mentionTrigger = (
    textBeforeCaret: string
): { query: string; offset: number } | null => {
    const m = textBeforeCaret.match(/(?:^|[\s(])@([^\s@[\]()]{0,40})$/);
    if (!m) return null;
    return {
        query: m[1],
        offset: textBeforeCaret.length - m[1].length - 1,
    };
};
