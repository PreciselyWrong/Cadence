'use strict';

const { execFile } = require('child_process');

const TIMEOUT_MS = 120000;

// Runs git without a shell and without ever asking a question: a clone that
// needs a password fails instead of hanging the request.
function run(args) {
    return new Promise((resolve, reject) => {
        execFile(
            'git',
            args,
            {
                timeout: TIMEOUT_MS,
                maxBuffer: 1024 * 1024,
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: '0',
                    GIT_ASKPASS: 'true',
                    GIT_ALLOW_PROTOCOL: 'https:http:ssh',
                },
            },
            (error, stdout, stderr) => {
                if (error) {
                    const detail = String(stderr || error.message)
                        .trim()
                        .split('\n')
                        .pop();
                    reject(new Error(detail.slice(0, 300)));
                } else {
                    resolve(stdout);
                }
            }
        );
    });
}

// `--` keeps an address from ever being read as an option.
const clone = (url, target) =>
    run(['clone', '--depth', '1', '--', url, target]);

const pull = (dir) => run(['-C', dir, 'pull', '--ff-only']);

module.exports = { clone, pull };
