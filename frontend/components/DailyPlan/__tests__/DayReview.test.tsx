import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import DayReview, { reviewDay } from '../DayReview';

jest.mock('react-i18next', () => {
    const t = (
        _key: string,
        fallback: string,
        values?: Record<string, unknown>
    ) => fallback.replace(/{{(\w+)}}/g, (_m, n) => String(values?.[n] ?? ''));
    return { useTranslation: () => ({ t }) };
});

const task = (uid: string, name: string, extra = {}) =>
    ({ uid, name, status: 'not_started', ...extra }) as any;
const item = (t: any, extra = {}) =>
    ({
        task_uid: t.uid,
        position: 0,
        start_minute: 600,
        duration_minutes: 30,
        task: t,
        ...extra,
    }) as any;

const DAY = '2026-10-28';
const items = [
    item(task('a', 'Write report', { status: 'done' })),
    item(task('b', 'Call bank')),
    item(task('r', 'Water plants'), { occurrence_done: true }),
];
const dayTasks = [
    task('a', 'Write report', { status: 'done' }),
    task('c', 'Pay rent', {
        status: 'done',
        completed_at: new Date(2026, 9, 28, 15).toISOString(),
    }),
    task('d', 'Done later', {
        status: 'done',
        completed_at: new Date(2026, 9, 29, 9).toISOString(),
    }),
    task('e', 'Still open'),
];

describe('DayReview', () => {
    it('lists the plan items and day tasks done that day, once each', () => {
        const { done, notDone } = reviewDay(DAY, items, dayTasks);
        expect(done.map((t) => t.uid)).toEqual(['a', 'r', 'c']);
        expect(notDone.map((t) => t.uid)).toEqual(['b']);
    });

    it('renders the summary instead of planning prompts', () => {
        render(
            <DayReview
                date={DAY}
                dayLabel="Yesterday"
                items={items}
                dayTasks={dayTasks}
            />
        );
        expect(
            screen.getByText('What you did on Yesterday')
        ).toBeInTheDocument();
        expect(screen.getByText('Done: 3')).toBeInTheDocument();
        expect(screen.getByText('Pay rent')).toBeInTheDocument();
        expect(screen.getByText('Call bank')).toBeInTheDocument();
        expect(screen.queryByText('Done later')).not.toBeInTheDocument();
    });

    it('says so when nothing was done', () => {
        render(
            <DayReview date={DAY} dayLabel="Mon" items={[]} dayTasks={[]} />
        );
        expect(
            screen.getByText('Nothing completed that day.')
        ).toBeInTheDocument();
    });
});
