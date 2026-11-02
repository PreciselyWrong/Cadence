const { focusBlocksOn } = require('../../../modules/daily-plan/slots');

describe('focusBlocksOn', () => {
    const work = { id: 'work', days: [1, 2, 3], start: 450, end: 1080 };
    const swim = { id: 'swim', days: [3], start: 720, end: 780 };
    const blocks = [work, swim];

    // 2026-11-02 is a Monday, 2026-11-04 a Wednesday.
    it('keeps the blocks of the weekday', () => {
        expect(focusBlocksOn(blocks, [], '2026-11-02')).toEqual([work]);
        expect(focusBlocksOn(blocks, [], '2026-11-04')).toEqual([work, swim]);
        expect(focusBlocksOn(blocks, [], '2026-11-05')).toEqual([]);
    });

    it('drops every block during an exception for all blocks', () => {
        const holiday = {
            id: 'h',
            start: '2026-11-02',
            end: '2026-11-04',
            block_ids: null,
        };
        expect(focusBlocksOn(blocks, [holiday], '2026-11-02')).toEqual([]);
        expect(focusBlocksOn(blocks, [holiday], '2026-11-04')).toEqual([]);
        expect(focusBlocksOn(blocks, [holiday], '2026-11-09')).toEqual([work]);
    });

    it('drops only the chosen blocks, first and last day included', () => {
        const dayOff = {
            id: 'd',
            start: '2026-11-04',
            end: '2026-11-04',
            block_ids: ['work'],
        };
        expect(focusBlocksOn(blocks, [dayOff], '2026-11-04')).toEqual([swim]);
        expect(focusBlocksOn(blocks, [dayOff], '2026-11-03')).toEqual([work]);
    });
});
