'use strict';

const {
    normalizeProposalBatch,
    normalizeItem,
    validateNote,
    validateReport,
} = require('../../../../modules/decisions/core/validate');
const { ValidationError } = require('../../../../shared/errors');

const baseItem = (overrides = {}) => ({
    key: 'sub-netflix',
    title: 'Netflix (17,99 €/mois)',
    choices: [
        { id: 'keep', label: 'Garder' },
        { id: 'cancel', label: 'Résilier', tone: 'danger' },
    ],
    ...overrides,
});

describe('decisions › core/validate', () => {
    it('validates batch header and rejects empty or >30 items', () => {
        expect(() =>
            normalizeProposalBatch({
                kind: 'bad-kind',
                kind_label: 'Abonnements',
                items: [baseItem()],
            })
        ).toThrow(ValidationError);

        expect(() =>
            normalizeProposalBatch({
                kind: 'subscription',
                kind_label: '   ',
                items: [baseItem()],
            })
        ).toThrow(ValidationError);

        expect(() =>
            normalizeProposalBatch({
                kind: 'subscription',
                kind_label: 'Abonnements',
                items: [],
            })
        ).toThrow(ValidationError);

        expect(() =>
            normalizeProposalBatch({
                kind: 'subscription',
                kind_label: 'Abonnements',
                items: Array.from({ length: 31 }, (_, i) =>
                    baseItem({ key: `k-${i}` })
                ),
            })
        ).toThrow(ValidationError);
    });

    it('cleans control and bidi/zero-width characters and keeps line breaks in body', () => {
        const cleaned = normalizeItem(
            baseItem({
                title: 'Net\u202Eflix\u0007\nTV',
                context: 'Peu\u200B utilisé\tce mois',
                body: 'Ligne 1\u061C\r\nLigne 2\uFEFF',
                reason: 'Inactif\u200F depuis 60j',
            })
        );
        expect(cleaned.title).toBe('Netflix TV');
        expect(cleaned.context).toBe('Peu utilisé ce mois');
        expect(cleaned.body).toBe('Ligne 1\nLigne 2');
        expect(cleaned.reason).toBe('Inactif depuis 60j');
    });

    it('rejects bad choice ids, note/later as choice id, and recommended not in choices', () => {
        expect(() =>
            normalizeItem(
                baseItem({
                    choices: [
                        { id: 'Bad-Id', label: 'A' },
                        { id: 'ok', label: 'B' },
                    ],
                })
            )
        ).toThrow(ValidationError);

        expect(() =>
            normalizeItem(
                baseItem({
                    choices: [
                        { id: 'note', label: 'Note' },
                        { id: 'ok', label: 'B' },
                    ],
                })
            )
        ).toThrow(ValidationError);

        expect(() =>
            normalizeItem(
                baseItem({
                    choices: [
                        { id: 'later', label: 'Later' },
                        { id: 'ok', label: 'B' },
                    ],
                })
            )
        ).toThrow(ValidationError);

        expect(() =>
            normalizeItem(
                baseItem({
                    recommended: 'missing',
                })
            )
        ).toThrow(ValidationError);
    });

    it('rejects non-https urls and data over 2 KB', () => {
        expect(() =>
            normalizeItem(baseItem({ url: 'http://example.com' }))
        ).toThrow(ValidationError);

        expect(() =>
            normalizeItem(baseItem({ url: 'javascript:alert(1)' }))
        ).toThrow(ValidationError);

        expect(
            normalizeItem(baseItem({ url: 'https://example.com/sub' })).url
        ).toBe('https://example.com/sub');

        expect(() =>
            normalizeItem(baseItem({ data: { blob: 'x'.repeat(2050) } }))
        ).toThrow(ValidationError);

        expect(() => normalizeItem(baseItem({ data: ['not-object'] }))).toThrow(
            ValidationError
        );
    });

    it('validates note and report_decision inputs', () => {
        expect(validateNote('  Garder\u200B\nencore 1 mois  ')).toBe(
            'Garder\nencore 1 mois'
        );
        expect(() => validateNote('   ')).toThrow(ValidationError);
        expect(() => validateNote('x'.repeat(501))).toThrow(ValidationError);

        expect(
            validateReport({
                kind: 'subscription',
                key: 'sub-1',
                ok: true,
                url: 'https://example.com/done',
            })
        ).toEqual({
            kind: 'subscription',
            key: 'sub-1',
            ok: true,
            error: null,
            url: 'https://example.com/done',
        });

        expect(() =>
            validateReport({
                kind: 'subscription',
                key: 'sub-1',
                ok: true,
                error: 'should_fail',
            })
        ).toThrow(ValidationError);

        expect(() =>
            validateReport({
                kind: 'subscription',
                key: 'sub-1',
                ok: false,
                error: 'Bad Error!',
            })
        ).toThrow(ValidationError);
    });
});
