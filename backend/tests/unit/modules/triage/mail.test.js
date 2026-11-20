'use strict';

const { normalizeProposal } = require('../../../../modules/triage/core/mail');

const proposal = (fields = {}) => ({
    account: 'personal',
    thread_id: 'thread123',
    received_at: '2026-11-20T08:00:00Z',
    summary: 'Alice demande de valider le devis avant vendredi.',
    gmail_url: 'https://mail.google.com/mail/u/0/#inbox/thread123',
    ...fields,
});

describe('mail card text', () => {
    it.each([450, 500])('accepts a summary of %i characters', (length) => {
        const summary = 'x'.repeat(length);
        expect(normalizeProposal(proposal({ summary })).summary).toBe(summary);
    });

    it('refuses a summary over 500 characters', () => {
        expect(() =>
            normalizeProposal(proposal({ summary: 'x'.repeat(501) }))
        ).toThrow(/summary.*500/);
    });

    it('preserves summary line breaks while removing control and spoofing characters', () => {
        const summary =
            'Alice écrit au sujet du devis.\r\nValider avant vendredi.\nMerci\u0000\u202e';
        expect(normalizeProposal(proposal({ summary })).summary).toBe(
            'Alice écrit au sujet du devis.\nValider avant vendredi.\nMerci'
        );
    });

    it.each([15000, 20000])(
        'accepts the complete mail of %i characters',
        (length) => {
            const excerpt = 'x'.repeat(length);
            expect(normalizeProposal(proposal({ excerpt })).excerpt).toBe(
                excerpt
            );
        }
    );

    it('refuses a mail over 20000 characters before HTML cleanup', () => {
        expect(() =>
            normalizeProposal(proposal({ excerpt: 'x'.repeat(20001) }))
        ).toThrow(/excerpt.*20000/);
        expect(() =>
            normalizeProposal(proposal({ excerpt: '<b>'.repeat(6667) }))
        ).toThrow(/excerpt.*20000/);
    });

    it('turns HTML mail into readable text with decoded entities and paragraph breaks', () => {
        const excerpt =
            '<div>Bonjour &Eacute;lodie,&nbsp;  voici le devis.<br>R&eacute;pondre avant vendredi.</div>' +
            '<p>Montant : &#8364; &#x31;00 &amp; taxes.</p><ul><li>Valider</li><li>Signer</li></ul>';
        expect(normalizeProposal(proposal({ excerpt })).excerpt).toBe(
            'Bonjour Élodie, voici le devis.\nRépondre avant vendredi.\nMontant : € 100 & taxes.\n\nValider\nSigner'
        );
    });

    it('cleans encoded tags, comments and non-content HTML without leaking attributes', () => {
        const excerpt =
            '<!DOCTYPE html><!-- comment --><style>.x { color: red; }</style><script>alert(1)</script>' +
            '<d\u200biv title="a > b">&lt;b&gt;Bonjour&lt;/b&gt; &copy; Alice</div>';
        expect(normalizeProposal(proposal({ excerpt })).excerpt).toBe(
            'Bonjour © Alice'
        );
    });

    it('normalizes spaces and keeps at most two consecutive empty lines', () => {
        const excerpt = '  Bonjour\t  Alice  \r\n \n\n\n\n  Fin\u0000\u202e  ';
        expect(normalizeProposal(proposal({ excerpt })).excerpt).toBe(
            'Bonjour Alice\n\n\nFin'
        );
    });

    it('keeps the links and addresses of a plain-text mail', () => {
        const excerpt =
            'Alice <alice@example.ch> écrit :\nLe tarif change : <https://example.ch/prix?a=1>';
        expect(normalizeProposal(proposal({ excerpt })).excerpt).toBe(excerpt);
    });

    it('keeps plain-text comparisons and optional empty bodies', () => {
        expect(
            normalizeProposal(proposal({ excerpt: 'Prix < 100 € et > 50 €' }))
                .excerpt
        ).toBe('Prix < 100 € et > 50 €');
        expect(normalizeProposal(proposal()).excerpt).toBeNull();
        expect(
            normalizeProposal(proposal({ excerpt: '  ' })).excerpt
        ).toBeNull();
    });
});
