import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DndContext } from '@dnd-kit/core';
import ToPlanBox from '../ToPlanBox';
import type { ToPlanBox as Box } from '../horizons';
import { Task } from '../../../entities/Task';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string, values?: Record<string, unknown>) =>
            fallback.replace(/{{(\w+)}}/g, (_m, name) =>
                String(values?.[name] ?? '')
            ),
        i18n: { language: 'en' },
    }),
}));

const task = (uid: string): Task =>
    ({ uid, name: `Task ${uid}`, status: 0, tags: [] }) as unknown as Task;

const renderBox = (
    box: Box,
    props: Partial<React.ComponentProps<typeof ToPlanBox>> = {}
) => {
    const onCollapsedChange = jest.fn();
    const onExpand = jest.fn();
    render(
        <DndContext>
            <ToPlanBox
                box={box}
                today="2026-11-12"
                collapsed={false}
                onCollapsedChange={onCollapsedChange}
                onExpand={onExpand}
                onOpenTask={jest.fn()}
                onToggleTask={jest.fn()}
                onToggleSubtask={jest.fn()}
                {...props}
            />
        </DndContext>
    );
    return { onCollapsedChange, onExpand };
};

describe('ToPlanBox', () => {
    it('is hidden when nothing is left to plan', () => {
        renderBox({ replan: [], week: [], month: [] });
        expect(screen.queryByTestId('to-plan-box')).not.toBeInTheDocument();
    });

    it('lists to replan first, this week open, this month collapsed', () => {
        renderBox({
            replan: [task('r')],
            week: [task('w')],
            month: [task('m1'), task('m2')],
        });
        const box = screen.getByTestId('to-plan-box');
        expect(box).toHaveTextContent('To plan');
        expect(screen.getByText('Task r')).toBeInTheDocument();
        expect(screen.getByText('Task w')).toBeInTheDocument();
        expect(screen.queryByText('Task m1')).not.toBeInTheDocument();
        const month = screen.getByRole('button', { name: /This month/ });
        expect(month).toHaveTextContent('2');
        fireEvent.click(month);
        expect(screen.getByText('Task m1')).toBeInTheDocument();
        const groups = screen
            .getAllByTestId(/^to-plan-(replan|week|month)$/)
            .map((el) => el.dataset.testid);
        expect(groups).toEqual([
            'to-plan-replan',
            'to-plan-week',
            'to-plan-month',
        ]);
    });

    it('collapses as a whole', () => {
        const { onCollapsedChange } = renderBox(
            { replan: [task('r')], week: [], month: [] },
            { collapsed: true }
        );
        expect(screen.queryByText('Task r')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /To plan/ }));
        expect(onCollapsedChange).toHaveBeenCalledWith(false);
    });

    it('shows a thin bar with its count under a collapsed inbox', () => {
        const { onExpand } = renderBox(
            { replan: [task('r')], week: [task('w')], month: [] },
            { thin: true }
        );
        const bar = screen.getByRole('button', {
            name: 'Show what to plan (2)',
        });
        fireEvent.click(bar);
        expect(onExpand).toHaveBeenCalled();
    });
});
