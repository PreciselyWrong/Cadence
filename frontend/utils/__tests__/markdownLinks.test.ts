import {
    classifyHref,
    preprocessContentLinks,
    taskLinkNames,
} from '../markdownLinks';

const UID = 'abc123def456ghj';

describe('preprocessContentLinks', () => {
    it('turns note, task and person links into plain Markdown links', () => {
        expect(
            preprocessContentLinks(
                `[[Trip]] [[task: Call bank]] @[Anna B](person:${UID})`
            )
        ).toBe(
            `[Trip](/__wikilink__/Trip) [Call bank](/__tasklink__/Call%20bank) [Anna B](/__mention__/${UID})`
        );
    });

    it('leaves links shown as code alone', () => {
        const text = '`[[Inline]]`\n```\n[[Fenced]]\n```\n[[Real]]';
        expect(preprocessContentLinks(text)).toBe(
            '`[[Inline]]`\n```\n[[Fenced]]\n```\n[Real](/__wikilink__/Real)'
        );
    });

    it('lists the task names to resolve', () => {
        expect(
            taskLinkNames(
                '[[task:A]] [[Note]] [[TASK: B ]] [[task:A]] `[[task:C]]`'
            )
        ).toEqual(['A', 'B']);
    });
});

describe('classifyHref', () => {
    const origin = 'https://cadence.example';

    it('keeps app pages in the app, even as full URLs of this site', () => {
        expect(classifyHref(`/task/${UID}`, origin)).toEqual({
            kind: 'internal',
            path: `/task/${UID}`,
        });
        expect(classifyHref(`${origin}/note/${UID}-my-note`, origin)).toEqual({
            kind: 'internal',
            path: `/note/${UID}-my-note`,
        });
    });

    it('opens other web links outside', () => {
        expect(
            classifyHref(`https://other.example/task/${UID}`, origin)
        ).toEqual({
            kind: 'external',
            href: `https://other.example/task/${UID}`,
        });
        expect(classifyHref('mailto:a@b.c', origin)).toEqual({
            kind: 'other',
            href: 'mailto:a@b.c',
        });
    });

    it('reads the placeholders made by preprocessContentLinks', () => {
        expect(classifyHref('/__tasklink__/Call%20bank', origin)).toEqual({
            kind: 'task-title',
            title: 'Call bank',
        });
        expect(classifyHref(`/__mention__/${UID}`, origin)).toEqual({
            kind: 'mention',
            uid: UID,
        });
    });
});
