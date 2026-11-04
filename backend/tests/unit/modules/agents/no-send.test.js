'use strict';

const fs = require('fs');
const path = require('path');
const { REQUEST_TYPES } = require('../../../../modules/agents/requests');

const AGENTS_DIR = path.resolve(__dirname, '../../../../modules/agents');
const SEND_WORDS = /send|envoyer|forward/i;

function sourceFiles(dir) {
    return fs.readdirSync(dir).flatMap((name) => {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) return sourceFiles(full);
        return name.endsWith('.js') ? [full] : [];
    });
}

describe('agent requests cannot send mail', () => {
    it('has no request type name that mentions sending', () => {
        for (const type of Object.keys(REQUEST_TYPES)) {
            expect(type).not.toMatch(SEND_WORDS);
        }
    });

    it('builds no input text that mentions sending or forwarding', () => {
        const {
            buildRepliesInput,
        } = require('../../../../modules/agents/requests');
        const input = buildRepliesInput({
            accounts: ['me@example.test'],
            excludedAccounts: [],
            windowDays: 7,
        });
        expect(input).not.toMatch(SEND_WORDS);
    });

    it('has no Gmail send path anywhere in the agents module source', () => {
        const offenders = sourceFiles(AGENTS_DIR).filter((file) =>
            fs.readFileSync(file, 'utf8').includes('messages/send')
        );
        expect(offenders).toEqual([]);
    });
});
