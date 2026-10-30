const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseTodoMd } = require('../../../../modules/todo-md/parser');
const {
    appendTask,
    setItemDone,
} = require('../../../../modules/todo-md/writer');
const {
    editTodoFile,
    ConflictError,
    UnsupportedEncodingError,
} = require('../../../../modules/todo-md/safeFile');

describe('todo-md append', () => {
    it('adds a bullet at the end of the section and touches nothing else', () => {
        const before =
            '# T\n\n## Now\n- A\n  note\n\n## Next\n- B\n- C\n\n## Ideas\n- D\n';
        const after = appendTask(before, 'Next', 'New');
        expect(after).toBe(
            '# T\n\n## Now\n- A\n  note\n\n## Next\n- B\n- C\n- New\n\n## Ideas\n- D\n'
        );
    });

    it('matches the section case-insensitively', () => {
        expect(appendTask('## next\n- A\n', 'Next', 'B')).toBe(
            '## next\n- A\n- B\n'
        );
    });

    it('appends below a multi-line last bullet', () => {
        expect(appendTask('## Next\n- A\n  more\n  - sub\n', 'Next', 'B')).toBe(
            '## Next\n- A\n  more\n  - sub\n- B\n'
        );
    });

    it('creates a missing section at the end of the file', () => {
        expect(appendTask('# T\n\n## Now\n- A\n', 'Next', 'B')).toBe(
            '# T\n\n## Now\n- A\n\n## Next\n\n- B\n'
        );
    });

    it('fills an empty section', () => {
        expect(appendTask('## Next\n\n## Ideas\n- X\n', 'Next', 'B')).toBe(
            '## Next\n- B\n\n## Ideas\n- X\n'
        );
    });

    it('creates the file content from nothing', () => {
        expect(appendTask('', 'Next', 'B')).toBe('## Next\n\n- B\n');
    });

    it('keeps CRLF endings and a missing trailing newline', () => {
        expect(appendTask('## Next\r\n- A\r\n- Z', 'Next', 'B')).toBe(
            '## Next\r\n- A\r\n- Z\r\n- B'
        );
        expect(appendTask('## Now\r\n- A\r\n', 'Next', 'B')).toBe(
            '## Now\r\n- A\r\n\r\n## Next\r\n\r\n- B\r\n'
        );
    });

    it('leaves every untouched byte alone, mixed endings included', () => {
        const before = '## Next\r\n- A\n- B\r\n\r\nfree text  \n';
        const after = appendTask(before, 'Next', 'C');
        const at = before.indexOf('\n- B') + 4;
        expect(after.slice(0, at)).toBe(before.slice(0, at));
        expect(after).toContain('- C');
        expect(after.endsWith('\r\n\r\nfree text  \n')).toBe(true);
    });

    it('writes a note as indented continuation lines and flattens the name', () => {
        const out = appendTask('## Next\n', 'Next', 'a\nb', {
            note: 'line1\nline2',
        });
        expect(out).toBe('## Next\n- a b\n  line1\n  line2\n');
        const [item] = parseTodoMd(out).items;
        expect(item.note).toBe('line1\nline2');
    });

    it('refuses an empty name', () => {
        expect(() => appendTask('## Next\n', 'Next', '  ')).toThrow(/name/i);
    });
});

describe('todo-md done toggle', () => {
    const keyOf = (text, name) =>
        parseTodoMd(text).items.find((i) => i.name === name).key;

    it('flips an existing checkbox in place', () => {
        const text = '## Now\n- [ ] A\n- [x] B\n';
        expect(setItemDone(text, keyOf(text, 'A'), true)).toBe(
            '## Now\n- [x] A\n- [x] B\n'
        );
        expect(setItemDone(text, keyOf(text, 'B'), false)).toBe(
            '## Now\n- [ ] A\n- [ ] B\n'
        );
    });

    it('adds a checkbox to a plain bullet and can uncheck it again', () => {
        const text = '## Now\n- A\n  note\n';
        const checked = setItemDone(text, keyOf(text, 'A'), true);
        expect(checked).toBe('## Now\n- [x] A\n  note\n');
        expect(setItemDone(checked, keyOf(checked, 'A'), false)).toBe(
            '## Now\n- [ ] A\n  note\n'
        );
    });

    it('refuses to undo a task that sits in Done', () => {
        const text = '## Done\n- [x] A\n';
        expect(() => setItemDone(text, keyOf(text, 'A'), false)).toThrow(
            /Done/
        );
    });

    it('returns null when nothing changes and throws for an unknown key', () => {
        const text = '## Now\n- [x] A\n';
        expect(setItemDone(text, keyOf(text, 'A'), true)).toBeNull();
        expect(() => setItemDone(text, 'nope', true)).toThrow(/not found/i);
    });
});

describe('todo-md safe file editing', () => {
    let dir;
    let file;

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-md-file-'));
        file = path.join(dir, 'TODO.md');
    });

    afterEach(() => {
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('replaces the file atomically and leaves no temp file behind', async () => {
        fs.writeFileSync(file, '## Next\n- A\n');
        await editTodoFile(file, (text) => appendTask(text, 'Next', 'B'));
        expect(fs.readFileSync(file, 'utf8')).toBe('## Next\n- A\n- B\n');
        expect(fs.readdirSync(dir)).toEqual(['TODO.md']);
    });

    it('keeps the file mode and a UTF-8 BOM', async () => {
        fs.writeFileSync(file, '﻿## Next\n- é\n');
        fs.chmodSync(file, 0o640);
        await editTodoFile(file, (text) => appendTask(text, 'Next', 'B'));
        const bytes = fs.readFileSync(file);
        expect([...bytes.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
        expect(bytes.toString('utf8')).toBe('﻿## Next\n- é\n- B\n');
        expect(fs.statSync(file).mode & 0o777).toBe(0o640);
    });

    it('retries when the file changes between read and rename', async () => {
        fs.writeFileSync(file, '## Next\n- A\n');
        let calls = 0;
        const result = await editTodoFile(file, (text) => {
            calls += 1;
            if (calls === 1) {
                fs.writeFileSync(file, '## Next\n- A\n- External\n');
            }
            return appendTask(text, 'Next', 'B');
        });
        expect(calls).toBe(2);
        expect(result.attempts).toBe(2);
        expect(fs.readFileSync(file, 'utf8')).toBe(
            '## Next\n- A\n- External\n- B\n'
        );
    });

    it('gives up after three conflicting attempts without writing', async () => {
        fs.writeFileSync(file, '## Next\n- A\n');
        let calls = 0;
        await expect(
            editTodoFile(file, (text) => {
                calls += 1;
                fs.writeFileSync(file, `${text}- race${calls}\n`);
                return appendTask(text, 'Next', 'B');
            })
        ).rejects.toBeInstanceOf(ConflictError);
        expect(calls).toBe(3);
        expect(fs.readFileSync(file, 'utf8')).not.toContain('- B');
        expect(fs.readdirSync(dir)).toEqual(['TODO.md']);
    });

    it('does not write when the transform changes nothing', async () => {
        fs.writeFileSync(file, '## Next\n- A\n');
        const before = fs.statSync(file).mtimeMs;
        const result = await editTodoFile(file, () => null);
        expect(result.changed).toBe(false);
        expect(fs.statSync(file).mtimeMs).toBe(before);
    });

    it('refuses an encoding it could corrupt', async () => {
        fs.writeFileSync(file, Buffer.from([0x23, 0x20, 0xe9, 0x0a]));
        await expect(
            editTodoFile(file, (text) => `${text}x`)
        ).rejects.toBeInstanceOf(UnsupportedEncodingError);
        fs.writeFileSync(file, Buffer.from([0xff, 0xfe, 0x23, 0x00]));
        await expect(
            editTodoFile(file, (text) => `${text}x`)
        ).rejects.toBeInstanceOf(UnsupportedEncodingError);
    });
});
