'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAX_ATTEMPTS = 3;
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

class ConflictError extends Error {
    constructor(file) {
        super(`${path.basename(file)} kept changing while it was being edited`);
        this.name = 'ConflictError';
        this.code = 'file_conflict';
    }
}

class UnsupportedEncodingError extends Error {
    constructor(file) {
        super(`${path.basename(file)} is not UTF-8, it is left untouched`);
        this.name = 'UnsupportedEncodingError';
        this.code = 'unsupported_encoding';
    }
}

// UTF-8 (with or without BOM) is the only encoding rewritten: anything else
// would be silently corrupted by a decode/encode round trip.
function decode(buffer, file) {
    const hasBom = buffer.subarray(0, 3).equals(BOM);
    const body = hasBom ? buffer.subarray(3) : buffer;
    const text = body.toString('utf8');
    if (!Buffer.from(text, 'utf8').equals(body)) {
        throw new UnsupportedEncodingError(file);
    }
    return { text, hasBom };
}

async function readTodoText(file) {
    return decode(await fs.promises.readFile(file), file);
}

async function fsyncDirectory(dir) {
    let handle;
    try {
        handle = await fs.promises.open(dir, 'r');
        await handle.sync();
    } catch {
        // Some filesystems do not allow it; the rename itself is atomic.
    } finally {
        await handle?.close();
    }
}

async function writeTemp(file, content, stat) {
    const tmp = path.join(
        path.dirname(file),
        `.${path.basename(file)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`
    );
    const handle = await fs.promises.open(tmp, 'wx', stat.mode & 0o777);
    try {
        await handle.writeFile(content);
        await handle.sync();
        // Only effective as root; otherwise the file stays owned by the app.
        await handle.chown(stat.uid, stat.gid).catch(() => {});
        await handle.chmod(stat.mode & 0o777).catch(() => {});
    } catch (error) {
        await handle.close();
        await fs.promises.rm(tmp, { force: true });
        throw error;
    }
    await handle.close();
    return tmp;
}

// Edits `file` with `transform(text) -> newText | null`, taking the current
// content each time. The new content goes to a temp file in the same
// directory, is flushed, and only replaces the original (atomic rename) if
// the original is still byte for byte what the transform saw. Otherwise the
// whole read-transform-write is retried, up to three times.
async function editTodoFile(file, transform) {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const stat = await fs.promises.stat(file);
        const original = await fs.promises.readFile(file);
        const { text, hasBom } = decode(original, file);

        const next = await transform(text);
        if (next === null || next === undefined || next === text) {
            return { changed: false, attempts: attempt, text };
        }

        const content = Buffer.concat([
            hasBom ? BOM : Buffer.alloc(0),
            Buffer.from(next, 'utf8'),
        ]);
        const tmp = await writeTemp(file, content, stat);

        const current = await fs.promises.readFile(file).catch(() => null);
        if (!current || !current.equals(original)) {
            await fs.promises.rm(tmp, { force: true });
            continue;
        }

        try {
            await fs.promises.rename(tmp, file);
        } catch (error) {
            await fs.promises.rm(tmp, { force: true });
            throw error;
        }
        await fsyncDirectory(path.dirname(file));
        return { changed: true, attempts: attempt, text: next };
    }
    throw new ConflictError(file);
}

module.exports = {
    editTodoFile,
    readTodoText,
    ConflictError,
    UnsupportedEncodingError,
};
