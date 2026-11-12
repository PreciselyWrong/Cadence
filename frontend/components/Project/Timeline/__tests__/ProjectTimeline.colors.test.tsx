import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProjectTimeline from '../ProjectTimeline';

const t = ((key: string, fallback?: any) =>
    typeof fallback === 'string' ? fallback : key) as any;

const future = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

describe('ProjectTimeline colour by', () => {
    beforeEach(() => localStorage.clear());

    const renderTimeline = () =>
        render(
            <ProjectTimeline
                project={{ uid: 'p', name: 'P' } as any}
                tasks={[
                    {
                        uid: 'a',
                        name: 'Urgent bar',
                        status: 0,
                        priority: 'high',
                        start_date: future(2),
                        due_date: future(5),
                    } as any,
                ]}
                links={[]}
                onDatesChange={jest.fn()}
                onOpenTask={jest.fn()}
                t={t}
            />
        );

    it('paints bars by priority when chosen, and remembers it', () => {
        const { unmount } = renderTimeline();
        const bar = () =>
            screen
                .getAllByText('Urgent bar')
                .map((el) => el.closest('[style*="left"]') as HTMLElement)
                .find(Boolean)!;
        expect(bar().style.backgroundColor).toBe('');

        fireEvent.change(screen.getByLabelText('Colour by'), {
            target: { value: 'priority' },
        });
        expect(bar().style.backgroundColor).toBe('rgb(185, 28, 28)');

        unmount();
        renderTimeline();
        expect(bar().style.backgroundColor).toBe('rgb(185, 28, 28)');
    });
});

describe('ProjectTimeline dates', () => {
    it("labels months in the app's language", () => {
        const due = new Date();
        due.setDate(due.getDate() + 5);
        render(
            <ProjectTimeline
                project={{ uid: 'p', name: 'P' } as any}
                tasks={[
                    {
                        uid: 'a',
                        name: 'Due bar',
                        status: 0,
                        due_date: due.toISOString().slice(0, 10),
                    } as any,
                ]}
                links={[]}
                onDatesChange={jest.fn()}
                onOpenTask={jest.fn()}
                t={t}
                language="fr"
            />
        );

        const frenchMonth = new Intl.DateTimeFormat('fr', {
            month: 'short',
        }).format(due);
        const englishMonth = new Intl.DateTimeFormat('en', {
            month: 'short',
        }).format(due);
        const text = document.body.textContent ?? '';
        expect(text).toContain(frenchMonth);
        expect(text).not.toContain(englishMonth);
    });
});
