import fs from 'fs';
import path from 'path';
import { spreadOverdue, SpreadTask } from '../spreadOverdue';

interface SpreadCase {
    name: string;
    today: string;
    overdue: SpreadTask[];
    planned: Record<string, Array<Pick<SpreadTask, 'estimated_minutes'>>>;
    expect: Array<{ uid: string; date: string }>;
}

const { cases } = JSON.parse(
    fs.readFileSync(
        path.resolve(
            __dirname,
            '../../../../fixtures/plan/spread-overdue.json'
        ),
        'utf8'
    )
) as { cases: SpreadCase[] };

describe('spreadOverdue, shared with Android (fixtures/plan/spread-overdue.json)', () => {
    it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
        expect(spreadOverdue(c.overdue, c.today, c.planned)).toEqual(c.expect);
    });

    it('reads numeric priorities like the priority badge (2 is high)', () => {
        expect(
            spreadOverdue(
                [
                    { uid: 'low', priority: 0, due_date: '2026-11-01' },
                    { uid: 'high', priority: 2, due_date: '2026-11-09' },
                ],
                '2026-11-13',
                {}
            )
        ).toEqual([
            { uid: 'high', date: '2026-11-13' },
            { uid: 'low', date: '2026-11-14' },
        ]);
    });

    it('places nothing when nothing is overdue', () => {
        expect(spreadOverdue([], '2026-11-13', {})).toEqual([]);
    });
});
