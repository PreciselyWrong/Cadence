import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ThisOrThat from '../ThisOrThat';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));
jest.mock('../../DailyPlan/planUtils', () => ({
    formatDuration: (m: number) => `${m}m`,
}));

const task = (uid: string, name: string, extra = {}) =>
    ({ uid, name, status: 'not_started', ...extra }) as unknown as Task;

describe('ThisOrThat', () => {
    it('keeps the pick against the next one until one is left', () => {
        const onChoose = jest.fn();
        render(
            <ThisOrThat
                tasks={[
                    task('a', 'Alpha', { estimated_minutes: 30 }),
                    task('b', 'Beta'),
                    task('c', 'Gamma'),
                ]}
                onChoose={onChoose}
                onClose={jest.fn()}
            />
        );
        expect(screen.getByText('30m')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Beta'));
        expect(screen.getByText('Beta')).toBeInTheDocument();
        expect(screen.getByText('Gamma')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Beta'));
        expect(screen.getByText('Your next action')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Add to today'));
        expect(onChoose).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'b' })
        );
    });

    it('skips both and ends when nothing is left', () => {
        render(
            <ThisOrThat
                tasks={[task('a', 'Alpha'), task('b', 'Beta')]}
                onChoose={jest.fn()}
                onClose={jest.fn()}
            />
        );
        fireEvent.click(screen.getByText('Neither'));
        expect(
            screen.getByText('Nothing left to compare.')
        ).toBeInTheDocument();
    });
});
