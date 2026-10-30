const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    resolveRoot,
    listProjectFolders,
    resolveTodoFile,
    sourcePathFor,
    folderFromSourcePath,
    PathEscapeError,
} = require('../../../../modules/todo-md/paths');

describe('todo-md paths', () => {
    let base;
    let root;
    let outside;

    beforeEach(() => {
        base = fs.realpathSync(
            fs.mkdtempSync(path.join(os.tmpdir(), 'todo-md-paths-'))
        );
        root = path.join(base, 'root');
        outside = path.join(base, 'outside');
        fs.mkdirSync(path.join(root, 'alpha'), { recursive: true });
        fs.mkdirSync(path.join(root, 'beta'));
        fs.mkdirSync(path.join(root, 'no-todo'));
        fs.mkdirSync(path.join(root, '.hidden'));
        fs.mkdirSync(outside);
        fs.writeFileSync(path.join(root, 'alpha', 'TODO.md'), '## Now\n');
        fs.writeFileSync(path.join(root, 'beta', 'TODO.md'), '## Now\n');
        fs.writeFileSync(path.join(root, '.hidden', 'TODO.md'), '## Now\n');
        fs.writeFileSync(path.join(root, 'loose.md'), 'x');
        fs.writeFileSync(path.join(outside, 'TODO.md'), 'secret');
    });

    afterEach(() => {
        fs.rmSync(base, { recursive: true, force: true });
    });

    it('is off without a root and resolves a real one', async () => {
        expect(await resolveRoot(undefined)).toBeNull();
        expect(await resolveRoot('  ')).toBeNull();
        expect(await resolveRoot(path.join(base, 'missing'))).toBeNull();
        expect(await resolveRoot(root)).toBe(root);
    });

    it('lists folders that hold a TODO.md, skipping hidden ones', async () => {
        expect(await listProjectFolders(root)).toEqual(['alpha', 'beta']);
    });

    it('resolves a project file inside the root', async () => {
        const file = await resolveTodoFile(root, 'alpha');
        expect(file).toBe(path.join(root, 'alpha', 'TODO.md'));
    });

    it('refuses a folder symlinked outside the root', async () => {
        fs.symlinkSync(outside, path.join(root, 'evil'));
        await expect(resolveTodoFile(root, 'evil')).rejects.toBeInstanceOf(
            PathEscapeError
        );
        expect(await listProjectFolders(root)).toEqual(['alpha', 'beta']);
    });

    it('refuses a TODO.md symlinked outside the root', async () => {
        fs.mkdirSync(path.join(root, 'sneaky'));
        fs.symlinkSync(
            path.join(outside, 'TODO.md'),
            path.join(root, 'sneaky', 'TODO.md')
        );
        await expect(resolveTodoFile(root, 'sneaky')).rejects.toBeInstanceOf(
            PathEscapeError
        );
        expect(await listProjectFolders(root)).not.toContain('sneaky');
    });

    it('refuses a TODO.md that points at another file inside the root', async () => {
        fs.mkdirSync(path.join(root, 'notes'));
        fs.writeFileSync(path.join(root, 'notes', 'NOTES.md'), 'x');
        fs.symlinkSync('NOTES.md', path.join(root, 'notes', 'TODO.md'));
        await expect(resolveTodoFile(root, 'notes')).rejects.toBeInstanceOf(
            PathEscapeError
        );
    });

    it('accepts a symlink that stays inside the root and named TODO.md', async () => {
        fs.mkdirSync(path.join(root, 'twin'));
        fs.symlinkSync(
            path.join(root, 'alpha', 'TODO.md'),
            path.join(root, 'twin', 'TODO.md')
        );
        expect(await resolveTodoFile(root, 'twin')).toBe(
            path.join(root, 'alpha', 'TODO.md')
        );
    });

    it('refuses traversal in a folder name or stored source path', async () => {
        await expect(resolveTodoFile(root, '..')).rejects.toBeInstanceOf(
            PathEscapeError
        );
        await expect(
            resolveTodoFile(root, '../outside')
        ).rejects.toBeInstanceOf(PathEscapeError);
        await expect(
            resolveTodoFile(root, 'alpha/../../outside')
        ).rejects.toBeInstanceOf(PathEscapeError);
        expect(() => folderFromSourcePath('../outside/TODO.md')).toThrow(
            PathEscapeError
        );
        expect(() => folderFromSourcePath('alpha/OTHER.md')).toThrow(
            PathEscapeError
        );
        expect(() => folderFromSourcePath('/etc/TODO.md')).toThrow(
            PathEscapeError
        );
    });

    it('round-trips the stored source path', () => {
        expect(sourcePathFor('alpha')).toBe('alpha/TODO.md');
        expect(folderFromSourcePath('alpha/TODO.md')).toBe('alpha');
    });
});
