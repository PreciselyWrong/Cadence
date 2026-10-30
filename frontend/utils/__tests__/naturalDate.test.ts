import { parseNaturalDate } from '../naturalDate';
import { analyzeInboxText } from '../inboxService';

jest.mock('../inboxService', () => ({ analyzeInboxText: jest.fn() }));

const analyze = analyzeInboxText as jest.Mock;
const analysis = (over: Record<string, unknown>) => ({
    parsed_tags: [],
    parsed_projects: [],
    cleaned_content: '',
    parsed_due_date: null,
    parsed_due_time: null,
    parsed_date_text: null,
    ...over,
});

describe('parseNaturalDate', () => {
    beforeEach(() => analyze.mockReset());

    it('reads a date and time with the quick-capture analyzer', async () => {
        analyze.mockResolvedValue(
            analysis({
                parsed_due_date: '2026-10-31',
                parsed_due_time: '14:00',
                parsed_date_text: 'demain 14h',
            })
        );
        await expect(parseNaturalDate('demain 14h')).resolves.toEqual({
            date: '2026-10-31',
            time: '14:00',
            text: 'demain 14h',
        });
        expect(analyze).toHaveBeenCalledWith('demain 14h', {
            parseDates: true,
        });
    });

    it('returns a whole-day result without a time', async () => {
        analyze.mockResolvedValue(
            analysis({
                parsed_due_date: '2026-10-30',
                parsed_date_text: 'vendredi',
            })
        );
        await expect(parseNaturalDate('vendredi')).resolves.toMatchObject({
            date: '2026-10-30',
            time: null,
        });
    });

    it('returns null for blank or unreadable text without calling the server', async () => {
        await expect(parseNaturalDate('   ')).resolves.toBeNull();
        expect(analyze).not.toHaveBeenCalled();
        analyze.mockResolvedValue(analysis({}));
        await expect(parseNaturalDate('blah')).resolves.toBeNull();
    });

    it('returns null when the analyzer fails', async () => {
        analyze.mockRejectedValue(new Error('offline'));
        await expect(parseNaturalDate('demain')).resolves.toBeNull();
    });
});
