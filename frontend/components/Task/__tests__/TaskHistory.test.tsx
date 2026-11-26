import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TaskHistory from '../TaskHistory';
import { getTaskTimeline } from '../../../utils/taskEventService';

jest.mock('react-i18next', () => ({
    initReactI18next: { type: '3rdParty', init: () => {} },
    useTranslation: () => ({
        t: (key: string, fallback?: string | Record<string, unknown>) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

jest.mock('../../../utils/taskEventService', () => ({
    ...jest.requireActual('../../../utils/taskEventService'),
    getTaskTimeline: jest.fn(),
}));

const mockTimeline = getTaskTimeline as jest.MockedFunction<
    typeof getTaskTimeline
>;

const event = (id: number, type: string, source: string, at: string) =>
    ({
        id,
        task_id: 1,
        user_id: 1,
        event_type: type,
        metadata: { source },
        created_at: at,
    }) as any;

describe('TaskHistory', () => {
    beforeEach(() => mockTimeline.mockReset());

    it('stays closed until asked, then says who made each change', async () => {
        mockTimeline.mockResolvedValue([
            event(1, 'created', 'device', '2026-11-11T20:12:15Z'),
            event(2, 'due_date_changed', 'suggestion', '2026-11-20T12:22:50Z'),
            event(3, 'project_id_changed', 'ai', '2026-11-12T06:42:57Z'),
        ]);

        render(<TaskHistory taskUid="t1" />);
        expect(mockTimeline).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: 'History' }));

        expect(await screen.findByText(/From a device/)).toBeInTheDocument();
        expect(
            screen.getByText(/AI suggestion you accepted/)
        ).toBeInTheDocument();
        expect(screen.getByText(/By the AI/)).toBeInTheDocument();
    });
});
