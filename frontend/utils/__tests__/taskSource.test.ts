import { taskSource } from '../taskSource';

describe('taskSource', () => {
    it('has no source for a missing task, a plain web task or an unknown origin', () => {
        expect(taskSource(null)).toBeNull();
        expect(taskSource({ source: null, source_url: null })).toBeNull();
        expect(taskSource({ source: 'web', source_url: null })).toBeNull();
        expect(taskSource({ source: 'facebook', source_url: null })).toBeNull();
    });

    it('labels a gmail task and keeps its web link', () => {
        expect(
            taskSource({
                source: 'gmail',
                source_url: 'https://mail.google.com/mail/u/0/#inbox/abc',
            })
        ).toEqual({
            kind: 'gmail',
            label: 'Gmail',
            url: 'https://mail.google.com/mail/u/0/#inbox/abc',
        });
    });

    it('drops a link that is not http or https', () => {
        expect(
            taskSource({ source: 'link', source_url: 'javascript:alert(1)' })
        ).toEqual({ kind: 'link', label: 'Link' });
        expect(taskSource({ source: 'link', source_url: 'not a url' })).toEqual(
            { kind: 'link', label: 'Link' }
        );
    });

    it('shows a task mirrored from TODO.md as todo_md, whatever its origin column', () => {
        expect(
            taskSource({ source: 'mcp', source_url: null, source_key: 'k1' })
        ).toEqual({ kind: 'todo_md', label: 'TODO.md' });
    });

    it('gives the origin without a link when there is no url', () => {
        expect(
            taskSource({
                source: 'telegram',
                source_url: null,
                source_key: null,
            })
        ).toEqual({ kind: 'telegram', label: 'Telegram' });
    });
});
