import { suggestTriage } from '../inboxTriage';

describe('suggestTriage', () => {
    it('suggests a task for a +project token and names the project', () => {
        expect(suggestTriage('Send the invoice +Acme')).toEqual({
            kind: 'task',
            reason: 'project',
            detail: 'Acme',
        });
    });

    it('reads ^list as a project too', () => {
        expect(suggestTriage('Buy paint ^Home').reason).toBe('project');
    });

    it('lets a note-like #tag win over the default', () => {
        expect(suggestTriage('Fast sourdough #recette')).toEqual({
            kind: 'note',
            reason: 'tag',
            detail: 'recette',
        });
        expect(suggestTriage('Something to try #idea').kind).toBe('note');
    });

    it('suggests a project for a #projet tag or a project keyword', () => {
        expect(suggestTriage('Refaire la cuisine #projet').kind).toBe(
            'project'
        );
        expect(suggestTriage('Projet: refonte du site').kind).toBe('project');
    });

    it('suggests a task for any other #tag', () => {
        expect(suggestTriage('Call mum #family')).toEqual({
            kind: 'task',
            reason: 'tag',
            detail: 'family',
        });
    });

    it('suggests a note for a bare link', () => {
        expect(suggestTriage('https://example.com/article')).toEqual({
            kind: 'note',
            reason: 'url',
        });
    });

    it('suggests a note for reading keywords', () => {
        expect(suggestTriage('Lire cet article sur Rust').kind).toBe('note');
        expect(suggestTriage('Idée: app de recettes').kind).toBe('note');
    });

    it('suggests a task for action verbs in French and English', () => {
        expect(suggestTriage('Appeler le plombier').kind).toBe('task');
        expect(suggestTriage('Buy milk').reason).toBe('keyword');
    });

    it('suggests a note for long or multi-line text', () => {
        expect(suggestTriage('first line\nsecond line').kind).toBe('note');
        expect(suggestTriage('x'.repeat(260)).reason).toBe('long');
    });

    it('falls back to a task with no reason', () => {
        expect(suggestTriage('Printer ink')).toEqual({
            kind: 'task',
            reason: 'default',
        });
    });

    it('is deterministic', () => {
        expect(suggestTriage('Call mum #family')).toEqual(
            suggestTriage('Call mum #family')
        );
    });
});
