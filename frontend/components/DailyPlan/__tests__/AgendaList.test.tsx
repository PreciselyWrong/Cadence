import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import AgendaList, { buildAgendaRows } from '../AgendaList';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback: string) => fallback,
    }),
}));
jest.mock('../../../store/taskPanelStore', () => ({
    openTaskPanel: jest.fn(),
}));

const item = (uid: string, start: number | null) =>
    ({
        task_uid: uid,
        position: 0,
        start_minute: start,
        duration_minutes: 30,
        task: { uid, name: `Task ${uid}`, status: 0 },
    }) as any;

const event = (uid: string, start: number | null, allDay = false) =>
    ({
        uid,
        title: `Event ${uid}`,
        all_day: allDay,
        busy: true,
        start: '',
        end: '',
        start_minute: start,
        end_minute: start === null ? null : start + 60,
        feed_uid: 'f',
        feed_name: 'Feed',
        color: null,
    }) as any;

describe('AgendaList', () => {
    it('orders timed rows by time, then untimed ones', () => {
        const { timed, untimed } = buildAgendaRows(
            [item('b', 660), item('u', null)],
            [event('e1', 540), event('ad', null, true)]
        );
        expect(timed.map((r) => r.title)).toEqual(['Event e1', 'Task b']);
        expect(untimed.map((r) => r.title)).toEqual(['Task u', 'Event ad']);
    });

    it('shows an empty message for a free day', () => {
        render(<AgendaList items={[]} events={[]} now={null} />);
        expect(screen.getByTestId('agenda-empty')).toBeInTheDocument();
    });

    it('renders a row per entry', () => {
        render(
            <AgendaList
                items={[item('a', 600)]}
                events={[event('e', 540)]}
                now={null}
            />
        );
        expect(screen.getAllByTestId('agenda-row')).toHaveLength(2);
    });
});
