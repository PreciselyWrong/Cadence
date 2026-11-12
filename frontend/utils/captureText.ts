// 'link' (straight to the Links) is offered only for an idea that is only
// a link, where Project is not (docs/04-inbox-page.md).
export type CaptureTarget = 'inbox' | 'task' | 'note' | 'project' | 'link';

export const CAPTURE_TARGETS: CaptureTarget[] = [
    'inbox',
    'task',
    'note',
    'project',
];

export const LINK_CAPTURE_TARGETS: CaptureTarget[] = [
    'inbox',
    'task',
    'link',
    'note',
];

export interface CapturedItem {
    target: CaptureTarget;
    uid?: string;
    title: string;
    // A note's text as saved, so files can be added to the end of it.
    body?: string;
    // The project the user chose for it (not one a Focus supplied), so the
    // next item of a series can go to the same one.
    projectUid?: string;
    projectName?: string;
}

const BULLET = /^\s*(?:[-*•]|\d+[.)]|\[[ xX]\])\s+/;

export const nonEmptyLines = (text: string): string[] =>
    text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

export const stripBullet = (line: string): string => line.replace(BULLET, '');

// One raw text per item that will be created. Without "one item per line"
// the whole text is a single item, however many lines it has.
export const splitCaptureText = (
    text: string,
    oneItemPerLine: boolean
): string[] => {
    const trimmed = text.trim();
    if (!trimmed) {
        return [];
    }
    if (!oneItemPerLine) {
        return [trimmed];
    }
    return nonEmptyLines(trimmed).map(stripBullet).filter(Boolean);
};

// The first line is the title, the other lines are the body or notes.
export const splitFirstLine = (
    text: string
): { first: string; rest: string } => {
    const trimmed = text.trim();
    const newline = trimmed.indexOf('\n');
    if (newline < 0) {
        return { first: trimmed, rest: '' };
    }
    return {
        first: trimmed.slice(0, newline).trim(),
        rest: trimmed.slice(newline + 1).trim(),
    };
};
