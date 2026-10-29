import {
    matchProjectName,
    priorityFromText,
    splitInboxTokens,
} from '../../../utils/inboxTokens';

const tokens = (text: string) =>
    splitInboxTokens(text)
        .filter((segment) => segment.kind)
        .map((segment) => [segment.text, segment.kind]);

describe('splitInboxTokens', () => {
    it('finds tags, people, areas and projects', () => {
        expect(tokens('Call @Maria ~Home +Work #urgent')).toEqual([
            ['@Maria', 'person'],
            ['~Home', 'area'],
            ['+Work', 'project'],
            ['#urgent', 'tag'],
        ]);
    });

    it.each(['!1', '!2', '!3'])('marks "%s" as a priority', (token) => {
        expect(tokens(`Pay rent ${token}`)).toEqual([[token, 'priority']]);
        expect(tokens(`${token} Pay rent`)).toEqual([[token, 'priority']]);
    });

    it.each(['!0', '!4', '!12', 'Wow!1', '!1x', 'a!1'])(
        'does not mark "%s" as a priority',
        (token) => {
            expect(tokens(`Pay rent ${token}`)).toEqual([]);
        }
    );

    it('treats ^list as a project, like +project', () => {
        expect(tokens('Appeler Paul ^Maison')).toEqual([
            ['^Maison', 'project'],
        ]);
        expect(tokens('Appeler Paul +Maison')).toEqual([
            ['+Maison', 'project'],
        ]);
    });

    it('keeps quoted names together for ^ and +', () => {
        expect(tokens('Idée ^"Ma liste" fin')).toEqual([
            ['^"Ma liste"', 'project'],
        ]);
        expect(tokens('Idée +"Ma liste" fin')).toEqual([
            ['+"Ma liste"', 'project'],
        ]);
    });

    it('splits the full quick-add line into plain runs and tokens', () => {
        expect(
            splitInboxTokens('Appeler Paul demain 15h #perso !1 ^Maison')
        ).toEqual([
            { text: 'Appeler Paul demain 15h ' },
            { text: '#perso', kind: 'tag' },
            { text: ' ' },
            { text: '!1', kind: 'priority' },
            { text: ' ' },
            { text: '^Maison', kind: 'project' },
        ]);
    });
});

describe('matchProjectName', () => {
    const projects = [
        { name: 'Maison', uid: 'home' },
        { name: 'Maintenance', uid: 'upkeep' },
        { name: 'Travail écrit', uid: 'work' },
    ];

    it('matches case-insensitively and ignores accents', () => {
        expect(matchProjectName(projects, 'MAISON')?.uid).toBe('home');
        expect(matchProjectName(projects, 'travail ecrit')?.uid).toBe('work');
    });

    it('accepts a unique prefix', () => {
        expect(matchProjectName(projects, 'mais')?.uid).toBe('home');
        expect(matchProjectName(projects, 'travail e')?.uid).toBe('work');
    });

    it('prefers an exact name over a longer one that starts with it', () => {
        const withShort = [...projects, { name: 'Mais', uid: 'mais' }];
        expect(matchProjectName(withShort, 'mais')?.uid).toBe('mais');
    });

    it('does not guess between several prefixes', () => {
        expect(matchProjectName(projects, 'ma')).toBeUndefined();
    });

    it('returns nothing for an empty name', () => {
        expect(matchProjectName(projects, '  ')).toBeUndefined();
    });
});

describe('priorityFromText', () => {
    it('reads the first !1-!3 token', () => {
        expect(priorityFromText('Appeler Paul !1 !3')).toBe('high');
        expect(priorityFromText('Ranger !2')).toBe('medium');
        expect(priorityFromText('Lire !3')).toBe('low');
    });

    it('returns undefined without a priority token', () => {
        expect(priorityFromText('Lire wow!1')).toBeUndefined();
        expect(priorityFromText('Lire')).toBeUndefined();
    });
});
