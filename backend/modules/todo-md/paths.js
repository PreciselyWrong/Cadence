'use strict';

const fs = require('fs');
const path = require('path');

const FILE_NAME = 'TODO.md';

class PathEscapeError extends Error {
    constructor(message = 'Path is outside the TODO root') {
        super(message);
        this.name = 'PathEscapeError';
        this.code = 'path_escape';
    }
}

// The configured root, resolved to its real path, or null when the feature
// is off or the directory is not there (a missing mount must never be read
// as "every project was deleted").
async function resolveRoot(configured) {
    const value = (configured || '').trim();
    if (!value) return null;
    try {
        const real = await fs.promises.realpath(value);
        const stat = await fs.promises.stat(real);
        return stat.isDirectory() ? real : null;
    } catch {
        return null;
    }
}

const inside = (root, target) => target.startsWith(`${root}${path.sep}`);

function assertFolderName(folder) {
    if (
        typeof folder !== 'string' ||
        folder === '' ||
        folder === '.' ||
        folder === '..' ||
        folder.includes('/') ||
        folder.includes('\\') ||
        folder.includes('\0')
    ) {
        throw new PathEscapeError();
    }
}

// The one place a project file path is built. Real paths are compared, so a
// symlinked folder or TODO.md that leads out of the root (or to a file that
// is not named TODO.md) is refused.
async function resolveTodoFile(root, folder) {
    assertFolderName(folder);
    let real;
    try {
        real = await fs.promises.realpath(path.join(root, folder, FILE_NAME));
    } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
            const missing = new Error(`${folder}/${FILE_NAME} does not exist`);
            missing.code = 'missing_file';
            throw missing;
        }
        throw error;
    }
    if (!inside(root, real) || path.basename(real) !== FILE_NAME) {
        throw new PathEscapeError();
    }
    const stat = await fs.promises.stat(real);
    if (!stat.isFile()) throw new PathEscapeError();
    return real;
}

async function listProjectFolders(root) {
    const entries = await fs.promises.readdir(root, { withFileTypes: true });
    const folders = [];
    for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        try {
            await resolveTodoFile(root, entry.name);
            folders.push(entry.name);
        } catch {
            // No TODO.md, or one that leads out of the root: not a project.
        }
    }
    return folders.sort((a, b) => a.localeCompare(b));
}

const sourcePathFor = (folder) => `${folder}/${FILE_NAME}`;

function folderFromSourcePath(sourcePath) {
    const match = /^([^/\\\0]+)\/TODO\.md$/.exec(sourcePath || '');
    if (!match || match[1] === '.' || match[1] === '..') {
        throw new PathEscapeError();
    }
    return match[1];
}

module.exports = {
    FILE_NAME,
    PathEscapeError,
    resolveRoot,
    resolveTodoFile,
    listProjectFolders,
    sourcePathFor,
    folderFromSourcePath,
};
