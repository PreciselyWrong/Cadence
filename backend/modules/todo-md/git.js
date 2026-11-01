'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Runs git for the TODO.md repositories. Nothing from the machine's or the
// user's git configuration is read, credentials never appear in arguments
// or URLs (a token goes through GIT_ASKPASS, a key through GIT_SSH_COMMAND),
// and every message that leaves this module has them removed.

const TIMEOUT_MS = 60_000;
const IDENTITY = [
    '-c',
    'user.name=Cadence',
    '-c',
    'user.email=cadence@localhost',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'core.hooksPath=/dev/null',
    '-c',
    'credential.helper=',
];

class GitError extends Error {
    constructor(message, { kind = 'failed', stderr = '' } = {}) {
        super(message);
        this.name = 'GitError';
        this.kind = kind;
        this.stderr = stderr;
    }
}

const ASKPASS = `#!/bin/sh
case "$1" in
  Username*) printf '%s\\n' "$CADENCE_GIT_USERNAME" ;;
  *) printf '%s\\n' "$CADENCE_GIT_TOKEN" ;;
esac
`;

async function writePrivate(file, content, mode) {
    await fs.promises.mkdir(path.dirname(file), {
        recursive: true,
        mode: 0o700,
    });
    const current = await fs.promises.readFile(file, 'utf8').catch(() => null);
    if (current !== content) {
        await fs.promises.writeFile(file, content, { mode });
    }
    await fs.promises.chmod(file, mode);
}

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// The key is either the private key itself (it holds "PRIVATE KEY") or the
// path of a file that does.
async function sshKeyFile(repo, baseDir) {
    if (!repo.sshKey) return null;
    if (!repo.sshKey.includes('PRIVATE KEY')) return repo.sshKey;
    const content = `${repo.sshKey.replace(/\\n/g, '\n').trim()}\n`;
    const file = path.join(baseDir, '.keys', repo.slug);
    await writePrivate(file, content, 0o600);
    return file;
}

// Environment of every git call for this repository.
async function environment(repo, baseDir) {
    const env = {
        PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        HOME: baseDir,
        LANG: 'C',
        LC_ALL: 'C',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_TERMINAL_PROMPT: '0',
        GIT_ALLOW_PROTOCOL: 'file:git:http:https:ssh',
        GIT_ASKPASS: '/bin/false',
        SSH_ASKPASS: '/bin/false',
    };
    if (repo.token) {
        const askpass = path.join(baseDir, '.askpass.sh');
        await writePrivate(askpass, ASKPASS, 0o700);
        env.GIT_ASKPASS = askpass;
        env.CADENCE_GIT_USERNAME = repo.username || 'x-access-token';
        env.CADENCE_GIT_TOKEN = repo.token;
    }
    const key = await sshKeyFile(repo, baseDir);
    const knownHosts = path.join(baseDir, '.ssh', 'known_hosts');
    await fs.promises.mkdir(path.dirname(knownHosts), {
        recursive: true,
        mode: 0o700,
    });
    env.GIT_SSH_COMMAND = [
        'ssh',
        '-F',
        '/dev/null',
        ...(key ? ['-i', shellQuote(key), '-o', 'IdentitiesOnly=yes'] : []),
        '-o',
        'BatchMode=yes',
        '-o',
        'StrictHostKeyChecking=accept-new',
        '-o',
        `UserKnownHostsFile=${shellQuote(knownHosts)}`,
    ].join(' ');
    return env;
}

// Removes the token, any user:password in a URL and the key path.
function scrub(text, repo) {
    let out = String(text || '');
    for (const secret of [repo?.token, repo?.sshKey]) {
        if (secret && secret.length >= 4) out = out.split(secret).join('***');
    }
    return out.replace(/(\w+:\/\/)[^/@\s]+@/g, '$1***@').trim();
}

const UNREACHABLE =
    /could not resolve|unable to access|connection (refused|timed out|reset)|could not read from remote|does not appear to be a git repository|authentication failed|permission denied|host key verification failed|repository not found|network is unreachable|timed out|no route to host/i;
const REJECTED =
    /\[rejected\]|\[remote rejected\]|non-fast-forward|fetch first|failed to push some refs|stale info/i;

function classify(stderr) {
    if (REJECTED.test(stderr)) return 'rejected';
    if (UNREACHABLE.test(stderr)) return 'unreachable';
    return 'failed';
}

// git <args> in `cwd`. Resolves with stdout; rejects with a GitError whose
// message has no credentials in it.
async function run(repo, baseDir, args, { cwd } = {}) {
    const env = await environment(repo, baseDir);
    return new Promise((resolve, reject) => {
        execFile(
            'git',
            [...IDENTITY, ...args],
            {
                cwd: cwd || baseDir,
                env,
                timeout: TIMEOUT_MS,
                maxBuffer: 10 * 1024 * 1024,
            },
            (error, stdout, stderr) => {
                if (!error) return resolve(stdout);
                const clean = scrub(stderr || error.message, repo);
                const kind =
                    error.code === 'ENOENT'
                        ? 'missing_git'
                        : error.killed
                          ? 'unreachable'
                          : classify(clean);
                reject(
                    new GitError(
                        `git ${args[0]} failed: ${clean.split('\n').slice(-3).join(' ')}`,
                        { kind, stderr: clean }
                    )
                );
            }
        );
    });
}

module.exports = { run, scrub, GitError };
