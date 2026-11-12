import { parseQuickAdd } from '../quickAddParse';

// Thursday 12 November 2026, 09:00 local time.
const NOW = new Date(2026, 10, 12, 9, 0);
const PROJECTS = [
    { id: 1, name: 'Travail' },
    { id: 'p-home', name: 'Maison' },
    { id: 3, name: 'Mon Projet' },
    { id: 4, name: 'Mon' },
    { id: 5, name: 'Séjour' },
];

const parse = (text: string, locale = 'fr') =>
    parseQuickAdd(text, { now: NOW, locale, projects: PROJECTS });

describe('parseQuickAdd', () => {
    it('reads the example line: title, day, time, project and duration', () => {
        expect(parse('Appeler Léa demain 14h #Travail 30min')).toEqual({
            name: 'Appeler Léa',
            date: '2026-11-13',
            startMinute: 840,
            durationMinutes: 30,
            projectId: 1,
            tags: [],
        });
    });

    it('keeps an unknown #word as a tag', () => {
        expect(parse('Ranger #urgent')).toEqual({
            name: 'Ranger',
            tags: ['urgent'],
        });
    });

    it('matches projects case and accent insensitively', () => {
        expect(parse('Ranger #sejour').projectId).toBe(5);
        expect(parse('Ranger #MAISON').projectId).toBe('p-home');
    });

    it('takes the longest multi-word project name', () => {
        expect(parse('Relire #Mon Projet demain')).toMatchObject({
            name: 'Relire',
            projectId: 3,
            date: '2026-11-13',
        });
    });

    it('reads a quoted project name with spaces', () => {
        expect(parse('Relire #"Mon Projet"')).toMatchObject({
            name: 'Relire',
            projectId: 3,
        });
    });

    it('keeps the first project and turns a second one into a tag', () => {
        const result = parse('Revue #Travail #Maison');
        expect(result.projectId).toBe(1);
        expect(result.tags).toEqual(['Maison']);
    });

    it('merges duplicate tags whatever their case', () => {
        expect(parse('Lire #Idee #idee').tags).toEqual(['Idee']);
    });

    it('treats a lone # as plain text', () => {
        expect(parse('Coût # 5')).toEqual({ name: 'Coût # 5', tags: [] });
    });

    it.each([
        ['aujourd’hui', '2026-11-12'],
        ["aujourd'hui", '2026-11-12'],
        ['today', '2026-11-12'],
        ['demain', '2026-11-13'],
        ['tomorrow', '2026-11-13'],
        ['après-demain', '2026-11-14'],
        ['day after tomorrow', '2026-11-14'],
        ['dans 3 jours', '2026-11-15'],
    ])('reads the day word "%s"', (word, date) => {
        expect(parse(`Payer facture ${word}`)).toMatchObject({
            name: 'Payer facture',
            date,
        });
    });

    it('reads a weekday as its next occurrence, today included', () => {
        expect(parse('Dentiste lundi').date).toBe('2026-11-16');
        expect(parse('Dentiste monday').date).toBe('2026-11-16');
        expect(parse('Dentiste jeudi').date).toBe('2026-11-12');
    });

    it('reads "prochain" and "next" as the following occurrence', () => {
        expect(parse('Dentiste jeudi prochain').date).toBe('2026-11-19');
        expect(parse('Dentiste next thursday').date).toBe('2026-11-19');
    });

    it('reads numeric dates day first in French', () => {
        expect(parse('Envoyer dossier 12/11', 'fr').date).toBe('2026-11-12');
        expect(parse('Envoyer dossier 3/1', 'fr').date).toBe('2027-01-03');
    });

    it('reads numeric dates month first in en-US', () => {
        expect(parse('Send file 12/11', 'en').date).toBe('2026-12-11');
    });

    it('reads a day and a French or English month name', () => {
        expect(parse('Vacances 12 nov').date).toBe('2026-11-12');
        expect(parse('Vacances 20 déc.').date).toBe('2026-12-20');
        expect(parse('Vacances le 1er novembre 2027').date).toBe('2027-11-01');
        expect(parse('Trip Nov 20').date).toBe('2026-11-20');
    });

    it('moves a date without a year that has passed to next year', () => {
        expect(parse('Anniversaire 10 nov').date).toBe('2027-11-10');
    });

    it('leaves an impossible date in the title', () => {
        expect(parse('Payer 31/02')).toEqual({ name: 'Payer 31/02', tags: [] });
    });

    it.each([
        ['14h30', 870],
        ['14:30', 870],
        ['14h', 840],
        ['2pm', 840],
        ['2:30pm', 870],
        ['12am', 0],
        ['à 9h', 540],
        ['à 1h30', 90],
    ])('reads the clock time "%s" as %i minutes', (time, minutes) => {
        expect(parse(`Réunion ${time}`)).toMatchObject({
            name: 'Réunion',
            startMinute: minutes,
        });
        expect(parse(`Réunion ${time}`).durationMinutes).toBeUndefined();
    });

    it.each([
        ['1h30', 90],
        ['1h', 60],
        ['45min', 45],
        ['30min', 30],
        ['20 mn', 20],
        ['15 minutes', 15],
        ['pendant 2h', 120],
    ])('reads the duration "%s" as %i minutes', (length, minutes) => {
        const result = parse(`Relire ${length}`);
        expect(result.durationMinutes).toBe(minutes);
        expect(result.startMinute).toBeUndefined();
        expect(result.name).toBe('Relire');
    });

    it('does not read a bare "5m" as a duration: it stays in the title', () => {
        expect(parse('Prendre 5m de câble')).toEqual({
            name: 'Prendre 5m de câble',
            tags: [],
        });
    });

    it('does not read "30m" as a duration', () => {
        expect(parse('Courir 30m').durationMinutes).toBeUndefined();
        expect(parse('Courir 30m').name).toBe('Courir 30m');
    });

    it('reads a duration written in words with a space', () => {
        expect(parse('Lire 30 min').durationMinutes).toBe(30);
    });

    it('reads a time with a weekday in the same line', () => {
        expect(parse('Réunion 15h30 mardi')).toMatchObject({
            name: 'Réunion',
            startMinute: 930,
            date: '2026-11-17',
        });
    });

    it('does not read a 14h time as a duration', () => {
        expect(parse('Point 14h').durationMinutes).toBeUndefined();
    });

    it.each([
        ['!1', 'high'],
        ['p1', 'high'],
        ['!2', 'medium'],
        ['p2', 'medium'],
        ['!3', 'low'],
        ['P3', 'low'],
    ])('reads the priority "%s" as %s', (token, priority) => {
        expect(parse(`Ranger ${token}`)).toEqual({
            name: 'Ranger',
            tags: [],
            priority,
        });
    });

    it('does not read a priority inside a word', () => {
        expect(parse('Payer p10 !4')).toEqual({
            name: 'Payer p10 !4',
            tags: [],
        });
    });

    it('collapses the spaces left behind', () => {
        expect(parse('  Acheter   du pain   demain  ').name).toBe(
            'Acheter du pain'
        );
    });

    it('leaves an empty title when only tokens were typed', () => {
        expect(parse('demain 14h')).toEqual({
            name: '',
            date: '2026-11-13',
            startMinute: 840,
            tags: [],
        });
    });

    it('returns the text unchanged when nothing is recognised', () => {
        expect(parse('Lire le journal')).toEqual({
            name: 'Lire le journal',
            tags: [],
        });
    });
});
