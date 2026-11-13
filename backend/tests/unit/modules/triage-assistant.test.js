'use strict';

const {
    validateProposal,
    candidates,
    systemPrompt,
} = require('../../../modules/triage/assistant');
const { taskFingerprint } = require('../../../modules/triage/core/fingerprint');
const { input, settingsWith, task } = require('./triage-rules/fixtures');

const catalog = {
    projects: new Map([['Maison', 7]]),
    tags: new Set(['admin', 'courses']),
};
const reason = 'Le titre ne dit pas quoi faire.';

describe('validateProposal', () => {
    it('accepts a rename, not one that changes nothing', () => {
        const open = task({ name: 'trucs' });
        expect(
            validateProposal(
                { action: 'rename', name: 'Trier les papiers', reason },
                open,
                catalog
            )
        ).toEqual({
            action: 'rename',
            reason,
            payload: { name: 'Trier les papiers' },
        });
        expect(
            validateProposal(
                { action: 'rename', name: 'trucs', reason },
                open,
                catalog
            )
        ).toBeNull();
    });

    it('needs a reason, and refuses "none" and unknown actions', () => {
        const open = task();
        expect(
            validateProposal({ action: 'delete' }, open, catalog)
        ).toBeNull();
        expect(
            validateProposal({ action: 'none', reason }, open, catalog)
        ).toBeNull();
        expect(
            validateProposal({ action: 'explode', reason }, open, catalog)
        ).toBeNull();
        expect(validateProposal(undefined, open, catalog)).toBeNull();
    });

    it('only lets a recurring task be renamed', () => {
        const series = task({ recurring: true });
        for (const action of ['delete', 'to_note', 'done', 'split']) {
            expect(
                validateProposal(
                    { action, subtasks: ['a', 'b'], reason },
                    series,
                    catalog
                )
            ).toBeNull();
        }
    });

    it('bounds a split', () => {
        const open = task();
        expect(
            validateProposal(
                { action: 'split', subtasks: ['une'], reason },
                open,
                catalog
            )
        ).toBeNull();
        expect(
            validateProposal(
                { action: 'split', subtasks: ['une', 'deux'], reason },
                open,
                catalog
            ).payload
        ).toEqual({ subtasks: ['une', 'deux'] });
    });

    it('classifies only with known values, only what is not classified yet', () => {
        const bare = task({ project_name: null, tags: [] });
        expect(
            validateProposal(
                {
                    action: 'reclass',
                    project: 'Maison',
                    tags: ['admin', 'inconnu'],
                    reason,
                },
                bare,
                catalog
            ).payload
        ).toEqual({ project_id: 7, tags: ['admin'] });
        expect(
            validateProposal(
                { action: 'reclass', project: 'Inconnu', reason },
                bare,
                catalog
            )
        ).toBeNull();
        expect(
            validateProposal(
                { action: 'reclass', project: 'Maison', reason },
                task({ tags: ['deja'] }),
                catalog
            )
        ).toBeNull();
    });

    it('leaves classification to the classifier when it is on', () => {
        const bare = task({ project_name: null, tags: [] });
        expect(
            validateProposal(
                { action: 'reclass', project: 'Maison', reason },
                bare,
                catalog,
                { reclass: false }
            )
        ).toBeNull();
        expect(
            validateProposal(
                { action: 'rename', name: 'Appeler le garage', reason },
                bare,
                catalog,
                { reclass: false }
            ).action
        ).toBe('rename');
        expect(systemPrompt({ reclass: false })).not.toContain('reclass');
        expect(systemPrompt({ reclass: true })).toContain('reclass');
    });
});

describe('candidates', () => {
    it('skips what a rule covers, what was seen in this state and file-backed tasks, up to the limit', () => {
        const seen = task({ uid: 'seen', name: 'Vue', tags: [] });
        const tasks = [
            seen,
            task({ uid: 'file', name: 'Fichier', file_backed: true }),
            task({ uid: 'a', name: 'Premier' }),
            task({ uid: 'b', name: 'Second' }),
            task({ uid: 'c', name: 'Troisième' }),
        ];
        const rows = [{ task_uid: 'seen', fingerprint: taskFingerprint(seen) }];
        const found = candidates(input({ tasks }), settingsWith(), rows, 2);
        expect(found.map((t) => t.uid)).toEqual(['a', 'b']);
    });

    it('looks again at a task that changed', () => {
        const before = task({ uid: 'a', name: 'Avant' });
        const rows = [{ task_uid: 'a', fingerprint: taskFingerprint(before) }];
        const after = { ...before, name: 'Après' };
        expect(
            candidates(input({ tasks: [after] }), settingsWith(), rows, 5)
        ).toHaveLength(1);
    });
});
