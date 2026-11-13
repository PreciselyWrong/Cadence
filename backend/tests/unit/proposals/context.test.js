'use strict';

const { contextFacts } = require('../../../modules/proposals/core/context');

describe('contextFacts', () => {
    it('keeps the active goals, the earliest due first, eight at most', () => {
        const goals = [
            {
                uid: 'g9',
                title: 'Zeta',
                status: 'active',
                due: null,
                percent: null,
            },
            {
                uid: 'g2',
                title: 'Beta',
                status: 'active',
                due: '2027-03-01',
                percent: 40,
            },
            {
                uid: 'g1',
                title: 'Alpha',
                status: 'active',
                due: '2027-01-01',
                percent: 0,
            },
            {
                uid: 'gx',
                title: 'Paused',
                status: 'paused',
                due: '2026-12-01',
                percent: 10,
            },
            ...Array.from({ length: 8 }, (_, i) => ({
                uid: `n${i}`,
                title: `Objectif ${i}`,
                status: 'active',
                due: '2027-06-01',
                percent: null,
            })),
        ];
        const { goals: kept } = contextFacts({ goals });
        expect(kept).toHaveLength(8);
        expect(kept.map((g) => g.uid).slice(0, 3)).toEqual(['g1', 'g2', 'n0']);
        expect(kept.find((g) => g.uid === 'g1')).toEqual({
            uid: 'g1',
            title: 'Alpha',
            due: '2027-01-01',
            progress: 0,
        });
        expect(kept.some((g) => g.uid === 'gx')).toBe(false);
    });

    it('sends a goal without due date or progress with neither', () => {
        const { goals } = contextFacts({
            goals: [
                {
                    uid: 'g9',
                    title: 'Zeta',
                    status: 'active',
                    due: null,
                    percent: null,
                },
            ],
        });
        expect(goals).toEqual([{ uid: 'g9', title: 'Zeta' }]);
    });

    it('keeps area names unique, ten at most, and projects fifteen at most with their area', () => {
        const areas = [
            ...Array.from({ length: 12 }, (_, i) => `Domaine ${i}`),
            'Domaine 0',
        ];
        const projects = Array.from({ length: 20 }, (_, i) => ({
            name: `Projet ${i}`,
            area: i % 2 ? 'Maison' : null,
        }));
        const facts = contextFacts({ areas, projects });
        expect(facts.areas).toHaveLength(10);
        expect(new Set(facts.areas).size).toBe(10);
        expect(facts.projects).toHaveLength(15);
        expect(facts.projects[0]).toEqual({ name: 'Projet 0' });
        expect(facts.projects[1]).toEqual({ name: 'Projet 1', area: 'Maison' });
    });

    it('has no free text about the user: the planner reads its own memory', () => {
        expect(contextFacts({})).toEqual({
            goals: [],
            areas: [],
            projects: [],
        });
    });
});
