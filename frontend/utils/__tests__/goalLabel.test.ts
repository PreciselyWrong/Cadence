import { goalLabel } from '../goalLabel';
import { Goal } from '../../entities/Goal';

const goals = [
    { uid: 'o1', title: 'Launch the business' },
    { uid: 'k1', title: 'Sign 3 clients', parent_goal_uid: 'o1' },
    { uid: 'k2', title: 'Orphan', parent_goal_uid: 'gone' },
] as Goal[];

describe('goalLabel', () => {
    it('is the title of a plain goal', () => {
        expect(goalLabel(goals[0], goals)).toBe('Launch the business');
    });

    it('prefixes a key result with its objective', () => {
        expect(goalLabel(goals[1], goals)).toBe(
            'Launch the business › Sign 3 clients'
        );
    });

    it('falls back on the title when the objective is not in the list', () => {
        expect(goalLabel(goals[2], goals)).toBe('Orphan');
    });
});
