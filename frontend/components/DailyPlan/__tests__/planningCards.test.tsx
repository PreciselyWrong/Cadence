import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CapacityMeter from '../CapacityMeter';
import NowCard from '../NowCard';
import StartOfDay from '../StartOfDay';
import { DailyPlanItem, PlanCandidates } from '../../../utils/dailyPlanService';
import { fetchDailyPlan } from '../../../utils/dailyPlanService';
import { decideTask } from '../../../utils/reviewService';

jest.mock('../../../utils/dailyPlanService', () => ({
    ...jest.requireActual('../../../utils/dailyPlanService'),
    fetchDailyPlan: jest.fn(),
}));
jest.mock('../../../utils/reviewService', () => ({
    decideTask: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
        showUndoToast: jest.fn(),
    }),
}));

const item = (
    uid: string,
    start: number | null,
    duration = 30,
    status: number | string = 0
): DailyPlanItem => ({
    task_uid: uid,
    position: 0,
    start_minute: start,
    duration_minutes: duration,
    task: { uid, name: uid, status, completed_at: null } as never,
});

describe('CapacityMeter', () => {
    it('shows the filled share without a warning under 100 %', () => {
        render(<CapacityMeter planned={120} free={480} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute(
            'aria-valuenow',
            '25'
        );
        expect(screen.queryByTestId('capacity-over')).toBeNull();
    });

    it('warns with the overshoot above 100 %', () => {
        render(<CapacityMeter planned={600} free={480} />);
        expect(screen.getByTestId('capacity-over')).toBeInTheDocument();
        expect(screen.getByRole('progressbar')).toHaveAttribute(
            'aria-valuenow',
            '100'
        );
    });
});

describe('NowCard slip handling', () => {
    const base = {
        events: [],
        onDone: jest.fn(),
        onPushLater: jest.fn(),
        busyUid: null,
    };

    it('offers to shift the rest or place the block later once its time has passed', () => {
        const onShiftRest = jest.fn();
        const onPlaceLater = jest.fn();
        const items = [item('late', 540, 60), item('next', 720, 30)];
        render(
            <NowCard
                {...base}
                items={items}
                now={650}
                onShiftRest={onShiftRest}
                onPlaceLater={onPlaceLater}
            />
        );
        expect(screen.getByTestId('slip-banner')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('slip-shift'));
        expect(onShiftRest).toHaveBeenCalledWith(items[0]);
        fireEvent.click(screen.getByTestId('slip-later'));
        expect(onPlaceLater).toHaveBeenCalledWith(items[0]);
    });

    it('stays quiet while every block is on time', () => {
        render(
            <NowCard
                {...base}
                items={[item('now', 540, 60)]}
                now={560}
                onShiftRest={jest.fn()}
                onPlaceLater={jest.fn()}
            />
        );
        expect(screen.queryByTestId('slip-banner')).toBeNull();
    });
});

describe('StartOfDay', () => {
    const candidates = {
        tagged_today: [],
        in_progress: [],
        overdue: [],
        due_today: [],
        suggested: [{ uid: 'pick', name: 'Pick me', status: 0 }],
        inbox: [],
        inbox_count: 0,
        ranked: [],
    } as unknown as PlanCandidates;

    const renderGuide = (onAdd = jest.fn(), onClose = jest.fn()) =>
        render(
            <StartOfDay
                yesterday="2026-10-29"
                todayItems={[]}
                candidates={candidates}
                planned={0}
                free={480}
                canPlaceAll
                onAdd={onAdd}
                onPlaceAll={jest.fn()}
                onClose={onClose}
            />
        );

    beforeEach(() => {
        (fetchDailyPlan as jest.Mock).mockResolvedValue({
            date: '2026-10-29',
            plan: {
                items: [item('left', 540), item('finished', 600, 30, 2)],
            },
        });
        (decideTask as jest.Mock).mockClear();
    });

    it('lists only the unfinished items of yesterday and carries one to today', async () => {
        const onAdd = jest.fn();
        renderGuide(onAdd);
        await waitFor(() =>
            expect(screen.getAllByTestId('leftover-row')).toHaveLength(1)
        );
        fireEvent.click(screen.getByTestId('leftover-carry'));
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'left' })
        );
        expect(screen.queryByTestId('leftover-row')).toBeNull();
    });

    it('postpones or drops a leftover through the review decision', async () => {
        renderGuide();
        await waitFor(() => screen.getByTestId('leftover-later'));
        fireEvent.click(screen.getByTestId('leftover-later'));
        await waitFor(() =>
            expect(decideTask).toHaveBeenCalledWith('left', {
                later: true,
                reviewed: true,
            })
        );
    });

    it('walks through the three steps and reports that it finished', async () => {
        const onClose = jest.fn();
        const onAdd = jest.fn();
        renderGuide(onAdd, onClose);
        await waitFor(() => screen.getByTestId('leftover-row'));
        fireEvent.click(screen.getByTestId('start-of-day-next'));
        fireEvent.click(screen.getByTestId('pick-add'));
        expect(onAdd).toHaveBeenCalledWith(
            expect.objectContaining({ uid: 'pick' })
        );
        fireEvent.click(screen.getByTestId('start-of-day-next'));
        expect(screen.getByTestId('guided-place-all')).toBeInTheDocument();
        fireEvent.click(screen.getByTestId('start-of-day-next'));
        expect(onClose).toHaveBeenCalledWith(true);
    });

    it('can be dismissed', async () => {
        const onClose = jest.fn();
        renderGuide(jest.fn(), onClose);
        fireEvent.click(screen.getByTestId('start-of-day-dismiss'));
        expect(onClose).toHaveBeenCalledWith(false);
    });
});
