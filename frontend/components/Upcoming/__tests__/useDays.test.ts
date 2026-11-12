import { renderHook, waitFor } from '@testing-library/react';
import { useCalendarEvents } from '../useDays';
import { fetchCalendarEvents } from '../../../utils/calendarFeedsService';

jest.mock('../../../utils/calendarFeedsService', () => ({
    fetchCalendarEvents: jest.fn(async (date: string) => ({
        events: [{ title: `event ${date}` }],
    })),
}));

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn(async () => 1),
}));

const mockFetch = fetchCalendarEvents as jest.MockedFunction<
    typeof fetchCalendarEvents
>;

describe('useCalendarEvents', () => {
    beforeEach(() => jest.clearAllMocks());

    it('fetches only the days that came into view', async () => {
        const { result, rerender } = renderHook(
            ({ dates }) => useCalendarEvents(dates, true),
            {
                initialProps: {
                    dates: ['2026-11-12', '2026-11-13', '2026-11-14'],
                },
            }
        );
        await waitFor(() =>
            expect(Object.keys(result.current)).toHaveLength(3)
        );
        expect(mockFetch).toHaveBeenCalledTimes(3);

        rerender({ dates: ['2026-11-13', '2026-11-14', '2026-11-15'] });
        await waitFor(() => expect(result.current['2026-11-15']).toBeDefined());
        expect(mockFetch).toHaveBeenCalledTimes(4);
        expect(mockFetch).toHaveBeenLastCalledWith('2026-11-15');
        expect(result.current['2026-11-12']).toBeUndefined();
        expect(result.current['2026-11-13']).toEqual([
            { title: 'event 2026-11-13' },
        ]);
    });

    it('shows nothing and fetches nothing while calendar feeds are off', () => {
        const { result } = renderHook(() =>
            useCalendarEvents(['2026-11-12'], false)
        );
        expect(result.current).toEqual({});
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
