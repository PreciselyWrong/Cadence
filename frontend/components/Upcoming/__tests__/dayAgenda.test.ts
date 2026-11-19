import { AgendaRow, AgendaEvent, dayAgenda } from '../dayAgenda';

const card = (
    uid: string,
    start: number | null,
    dueMinute: number | null = null
) => ({
    uid,
    start,
    dueMinute,
});
const event = (title: string, start?: string, all_day = false) => ({
    title,
    start,
    end: undefined,
    all_day,
});
const order = (rows: AgendaRow<ReturnType<typeof card>, AgendaEvent>[]) =>
    rows.map((row) => (row.kind === 'event' ? row.event.title : row.card.uid));

describe('dayAgenda', () => {
    it('puts each event before the first later or untimed card', () => {
        const rows = dayAgenda(
            [
                card('sport', null, 13 * 60 + 45),
                card('batch', null, 18 * 60 + 30),
                card('free', null),
            ],
            [
                event('Garage', undefined, true),
                event('Pause midi', '11:45'),
                event('Lila', '15:00'),
                event('Ergo', '16:15'),
            ]
        );
        expect(order(rows)).toEqual([
            'Garage',
            'Pause midi',
            'sport',
            'Lila',
            'Ergo',
            'batch',
            'free',
        ]);
    });

    it('uses the slot before the due time, and keeps events last when every card is earlier', () => {
        const rows = dayAgenda(
            [card('a', 9 * 60, 20 * 60)],
            [event('Late', '10:00')]
        );
        expect(order(rows)).toEqual(['a', 'Late']);
    });

    it('keeps the events in their time order', () => {
        const rows = dayAgenda([], [event('B', '16:00'), event('A', '09:00')]);
        expect(order(rows)).toEqual(['A', 'B']);
    });
});
