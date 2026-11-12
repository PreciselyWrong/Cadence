'use strict';

const fail = (error) => ({ ok: false, error });

// The address of a plugin repository and the folder it will be cloned into.
// Only network transports (https, http, ssh, scp-style) are accepted: no
// local path, no `file:` or `ext::` transport, no option-looking value, and
// no credentials in the address (use the server's own SSH key or git
// credential helper).
function parseGitUrl(raw) {
    if (typeof raw !== 'string') return fail('Enter the repository address');
    const url = raw.trim();
    if (!url) return fail('Enter the repository address');
    if (url.length > 500 || /[\s\0]/.test(url)) {
        return fail('The address is not valid');
    }
    if (url.startsWith('-')) return fail('The address is not valid');

    let path;
    const scp = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+:(?!\/\/)(.+)$/.exec(url);
    if (scp) {
        path = scp[1];
    } else {
        let parsed;
        try {
            parsed = new URL(url);
        } catch {
            return fail('The address is not valid');
        }
        if (!['https:', 'http:', 'ssh:'].includes(parsed.protocol)) {
            return fail('Use an https, http or ssh address');
        }
        if (
            parsed.password ||
            (parsed.username && parsed.protocol !== 'ssh:')
        ) {
            return fail(
                'Remove the credentials from the address; use an SSH key or the server git credentials'
            );
        }
        path = parsed.pathname;
    }

    const last = path.split('/').filter(Boolean).pop() || '';
    const folder = last
        .replace(/\.git$/i, '')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!folder || last === '..' || last === '.') {
        return fail('Could not find a repository name in the address');
    }
    return { ok: true, url, folder: folder.slice(0, 64) };
}

module.exports = { parseGitUrl };
