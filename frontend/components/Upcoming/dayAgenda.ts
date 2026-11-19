// A day column of the Plan with the calendar merged (docs/03-upcoming-view.md
// › Merged calendar): all-day events first, then each timed event before the
// first card that comes later or has no time, so the day reads in time order.
// Pure; the cards keep their own order.

export interface AgendaEvent {
    title: string;
    start?: string;
    end?: string;
    all_day: boolean;
}

interface TimedCard {
    start: number | null;
    dueMinute: number | null;
}

export type AgendaRow<C, E> =
    { kind: 'card'; card: C } | { kind: 'event'; event: E };

const minuteOf = (time?: string): number => {
    const [h, m] = (time ?? '').split(':').map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

export function dayAgenda<C extends TimedCard, E extends AgendaEvent>(
    cards: readonly C[],
    events: readonly E[]
): AgendaRow<C, E>[] {
    const allDay = events.filter((event) => event.all_day);
    const timed = events
        .filter((event) => !event.all_day)
        .map((event, i) => ({ event, at: minuteOf(event.start), i }))
        .sort((a, b) => a.at - b.at || a.i - b.i);
    const rows: AgendaRow<C, E>[] = allDay.map((event) => ({
        kind: 'event',
        event,
    }));
    let next = 0;
    for (const card of cards) {
        const at = card.start ?? card.dueMinute;
        while (next < timed.length && (at === null || timed[next].at <= at)) {
            rows.push({ kind: 'event', event: timed[next].event });
            next += 1;
        }
        rows.push({ kind: 'card', card });
    }
    for (; next < timed.length; next += 1) {
        rows.push({ kind: 'event', event: timed[next].event });
    }
    return rows;
}
