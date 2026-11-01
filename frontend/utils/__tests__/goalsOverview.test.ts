import { Goal } from '../../entities/Goal';
import {
    buildGoalsOverview,
    filterGoalsOverview,
    foldText,
    isOverviewEmpty,
    openWishCount,
} from '../goalsOverview';

const goal = (overrides: Partial<Goal>): Goal => ({
    title: 'Goal',
    horizon: 'season',
    status: 'active',
    ...overrides,
});

describe('buildGoalsOverview', () => {
    it('puts active objectives first by nearest target date and folds the others apart', () => {
        const overview = buildGoalsOverview([
            goal({ uid: 'paused', title: 'A', status: 'paused' }),
            goal({ uid: 'late', title: 'B', target_date: '2027-01-01' }),
            goal({ uid: 'soon', title: 'C', target_date: '2026-12-01' }),
            goal({ uid: 'open', title: 'D' }),
            goal({ uid: 'won', title: 'E', status: 'achieved' }),
        ]);

        expect(overview.objectives.map((e) => e.goal.uid)).toEqual([
            'soon',
            'late',
            'open',
        ]);
        expect(overview.otherObjectives.map((e) => e.goal.uid)).toEqual([
            'paused',
            'won',
        ]);
    });

    it('nests key results under their objective, by title', () => {
        const overview = buildGoalsOverview([
            goal({ uid: 'o', title: 'Objective' }),
            goal({ uid: 'k2', title: 'Zebra', parent_goal_uid: 'o' }),
            goal({ uid: 'k1', title: 'Écrire', parent_goal_uid: 'o' }),
        ]);

        expect(overview.objectives).toHaveLength(1);
        expect(overview.objectives[0].keyResults.map((g) => g.uid)).toEqual([
            'k1',
            'k2',
        ]);
    });

    it('keeps open wishes in their group, accents sorted with their letter, and the finished ones apart', () => {
        const overview = buildGoalsOverview([
            goal({ uid: 'z', title: 'Zanzibar', bucket: 'do' }),
            goal({ uid: 'e', title: 'Écrire un livre', bucket: 'do' }),
            goal({
                uid: 'a',
                title: 'Apprendre',
                bucket: 'do',
                status: 'paused',
            }),
            goal({
                uid: 'won',
                title: 'Marathon',
                bucket: 'do',
                status: 'achieved',
            }),
            goal({
                uid: 'gone',
                title: 'Bateau',
                bucket: 'have',
                status: 'dropped',
            }),
        ]);

        expect(overview.wishes.do.map((g) => g.uid)).toEqual(['a', 'e', 'z']);
        expect(overview.wishes.have).toEqual([]);
        expect(overview.doneWishes.map((g) => g.uid)).toEqual(['gone', 'won']);
        expect(openWishCount(overview)).toBe(3);
        expect(isOverviewEmpty(overview)).toBe(false);
        expect(isOverviewEmpty(buildGoalsOverview([]))).toBe(true);
    });
});

describe('filterGoalsOverview', () => {
    const overview = buildGoalsOverview([
        goal({ uid: 'o1', title: 'Courir un semi' }),
        goal({ uid: 'k1', title: '10 km sous 55 min', parent_goal_uid: 'o1' }),
        goal({ uid: 'k2', title: 'Inscription', parent_goal_uid: 'o1' }),
        goal({ uid: 'o2', title: 'Finances', why: 'Dormir sereinement' }),
        goal({ uid: 'k3', title: 'Budget', parent_goal_uid: 'o2' }),
        goal({ uid: 'w1', title: 'Écrire un livre', bucket: 'do' }),
        goal({ uid: 'w2', title: 'Un chien', bucket: 'have' }),
    ]);

    it('keeps an objective for a matching key result, with only that one', () => {
        const result = filterGoalsOverview(overview, 'INSCRIPTION');
        expect(result.objectives.map((e) => e.goal.uid)).toEqual(['o1']);
        expect(result.objectives[0].keyResults.map((g) => g.uid)).toEqual([
            'k2',
        ]);
    });

    it('matches the why and keeps every key result of a matching objective', () => {
        const result = filterGoalsOverview(overview, 'serein');
        expect(result.objectives[0].keyResults.map((g) => g.uid)).toEqual([
            'k3',
        ]);
    });

    it('ignores accents in wishes and returns everything for a blank query', () => {
        const result = filterGoalsOverview(overview, 'ecrire');
        expect(result.objectives).toEqual([]);
        expect(result.wishes.do.map((g) => g.uid)).toEqual(['w1']);
        expect(result.wishes.have).toEqual([]);
        expect(filterGoalsOverview(overview, '  ')).toBe(overview);
        expect(foldText('Être')).toBe('etre');
    });
});
