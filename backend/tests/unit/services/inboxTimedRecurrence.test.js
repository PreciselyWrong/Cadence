const {
    processInboxItem,
} = require('../../../modules/inbox/inboxProcessingService');
const {
    parseRecurrence,
    parseClockTime,
    parseDuration,
} = require('../../../modules/inbox/nlpParsers');

// Friday 2026-09-25, 13:00 in Athens
const NOW = new Date('2026-09-25T10:00:00Z');
const options = { referenceDate: NOW, timezone: 'Europe/Athens' };

describe('inbox timed recurrence and duration', () => {
    beforeAll(() => {
        jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick'] });
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    describe('French recurrence', () => {
        it.each([
            [
                'Standup tous les lundis',
                { recurrence_type: 'weekly', recurrence_weekdays: [1] },
            ],
            [
                'Yoga chaque mardi',
                { recurrence_type: 'weekly', recurrence_weekdays: [2] },
            ],
            [
                'Sport tous les lundis et jeudis',
                { recurrence_type: 'weekly', recurrence_weekdays: [1, 4] },
            ],
            [
                'Mails tous les jours ouvrés',
                {
                    recurrence_type: 'weekly',
                    recurrence_weekdays: [1, 2, 3, 4, 5],
                },
            ],
            [
                'Arroser tous les jours',
                { recurrence_type: 'daily', recurrence_interval: 1 },
            ],
            [
                'Arroser tous les 3 jours',
                { recurrence_type: 'daily', recurrence_interval: 3 },
            ],
            [
                'Bilan toutes les deux semaines',
                { recurrence_type: 'weekly', recurrence_interval: 2 },
            ],
            [
                'Loyer chaque mois',
                { recurrence_type: 'monthly', recurrence_interval: 1 },
            ],
        ])('parses "%s"', (text, recurrence) => {
            expect(parseRecurrence(text, options).recurrence).toMatchObject(
                recurrence
            );
        });
    });

    describe('parseClockTime', () => {
        it.each([
            ['Standup at 9am', '09:00'],
            ['Standup at 9:30 pm', '21:30'],
            ['Standup at 12am', '00:00'],
            ['Standup at 12pm', '12:00'],
            ['Standup at 14:00', '14:00'],
            ['Standup 14:00', '14:00'],
            ['Standup 9am', '09:00'],
            ['Standup à 9h', '09:00'],
            ['Standup à 9h30', '09:30'],
            ['Standup à 9 h', '09:00'],
            ['Standup à 18:45', '18:45'],
        ])('reads the time in "%s"', (text, time) => {
            expect(parseClockTime(text).time).toBe(time);
        });

        it.each([
            'Write report 1h',
            'Write report 1h30',
            'Write report 30 min',
            'Standup at 25:00',
            'Standup at 9:75',
            'Version 1.2:30',
        ])('ignores "%s"', (text) => {
            expect(parseClockTime(text)).toBeNull();
        });
    });

    describe('parseDuration', () => {
        it.each([
            ['Write report 1h', 60],
            ['Write report 1 h', 60],
            ['Write report 2h', 120],
            ['Write report 1.5h', 90],
            ['Write report 1,5 h', 90],
            ['Write report 30 min', 30],
            ['Write report 30min', 30],
            ['Write report 45 minutes', 45],
            ['Write report 1h30', 90],
            ['Write report 1 h 30', 90],
            ['Write report 1h 30 min', 90],
            ['Rédiger le rapport pendant 45 min', 45],
            ['Write report for 30 min', 30],
            ['Write report for 2 hours', 120],
            ['Write report durée 20 min', 20],
            ['Write report for 3 min', 5],
            ['Write report for 20 hours', 720],
            ['Write report pendant 15h', 720],
        ])('reads "%s" as %i minutes', (text, minutes) => {
            expect(parseDuration(text).minutes).toBe(minutes);
        });

        it('cuts the keyword with the duration', () => {
            const result = parseDuration('Rédiger pendant 45 min #work');
            expect(result.text).toBe('pendant 45 min');
            expect(result.index).toBe(8);
        });

        it.each([
            'Write report',
            'Appeler Paul 15h',
            'Appeler Paul 15h30',
            'Check logs every 30 min',
            'Vérifier tous les 2 h',
            'Meet at 9h',
            'Meet at 9h30',
            'Meet à 9h',
            'Meet at 9am',
            'See https://example.com/clip-30min',
            'Version 1h30x',
        ])('finds no duration in "%s"', (text) => {
            expect(parseDuration(text)).toBeNull();
        });

        it('keeps a bare 9h30 without a marker as a duration', () => {
            expect(parseDuration('Plan 9h30').minutes).toBe(570);
        });

        it('skips the spans the caller already used', () => {
            const text = 'Dentist tomorrow 1h';
            expect(
                parseDuration(text, { ignore: [{ index: 9, end: 19 }] })
            ).toBeNull();
        });
    });

    describe('processInboxItem', () => {
        it.each([
            ['Standup every Monday at 9am', '09:00'],
            ['Standup tous les lundis à 9h', '09:00'],
            ['Yoga chaque mardi à 18h30', '18:30'],
            ['Sync every weekday at 14:00', '14:00'],
            ['Journal every day at 9:30pm', '21:30'],
            ['Pause tous les jours à 12 h', '12:00'],
        ])('keeps the time of "%s"', (text, time) => {
            const result = processInboxItem(text, options);
            expect(result.parsed_due_time).toBe(time);
            expect(result.parsed_recurrence).not.toBeNull();
            expect(result.parsed_due_date).not.toBeNull();
            expect(result.cleaned_content).toBe(text.split(' ')[0]);
        });

        it('leaves the time empty when a recurrence has none', () => {
            const result = processInboxItem('Standup every Monday', options);
            expect(result.parsed_due_time).toBeNull();
            expect(result.parsed_recurrence).not.toBeNull();
        });

        it('reads the weekday and time of "tous les lundis à 9h"', () => {
            const result = processInboxItem(
                'Standup tous les lundis à 9h',
                options
            );
            expect(result.parsed_recurrence).toMatchObject({
                recurrence_type: 'weekly',
                recurrence_weekdays: [1],
            });
            expect(result.parsed_due_date).toBe('2026-09-28');
        });

        it('does not treat a time without recurrence or date as a due date', () => {
            const result = processInboxItem('Réunion à 9h', options);
            expect(result.parsed_due_date).toBeNull();
            expect(result.parsed_due_time).toBeNull();
            expect(result.cleaned_content).toBe('Réunion à 9h');
            expect(result.parsed_estimated_minutes).toBeNull();
        });

        it('reads a time and a duration together', () => {
            const result = processInboxItem(
                'Standup tous les lundis à 9h30 pendant 45 min',
                options
            );
            expect(result).toMatchObject({
                cleaned_content: 'Standup',
                parsed_due_time: '09:30',
                parsed_estimated_minutes: 45,
            });
        });

        it('reads an English time and duration together', () => {
            const result = processInboxItem(
                'Standup every monday at 9am for 15 min',
                options
            );
            expect(result).toMatchObject({
                cleaned_content: 'Standup',
                parsed_due_time: '09:00',
                parsed_estimated_minutes: 15,
            });
        });

        it('reads a bare duration after a time as a duration', () => {
            const result = processInboxItem(
                'Standup tous les lundis à 9h 1h',
                options
            );
            expect(result).toMatchObject({
                cleaned_content: 'Standup',
                parsed_due_time: '09:00',
                parsed_estimated_minutes: 60,
            });
        });

        it('keeps a French date time out of the duration', () => {
            const result = processInboxItem('Appeler Paul demain 15h', options);
            expect(result).toMatchObject({
                parsed_due_time: '15:00',
                parsed_estimated_minutes: null,
            });
        });

        it('reads a duration after an English date and time', () => {
            const result = processInboxItem(
                'Dentist tomorrow at 3pm for 1h30',
                options
            );
            expect(result).toMatchObject({
                parsed_due_date: '2026-09-26',
                parsed_due_time: '15:00',
                parsed_estimated_minutes: 90,
            });
        });

        it('cuts a lone duration out of the title', () => {
            const result = processInboxItem('Rédiger le rapport 1h30', options);
            expect(result).toMatchObject({
                cleaned_content: 'Rédiger le rapport',
                parsed_estimated_minutes: 90,
                parsed_due_date: null,
            });
        });

        it('suggests no task from a duration alone', () => {
            const result = processInboxItem('Idea 30 min', options);
            expect(result.parsed_estimated_minutes).toBe(30);
            expect(result.suggested_type).toBeNull();
        });

        it('skips time and duration when parseDates is false', () => {
            const result = processInboxItem('Standup every Monday at 9am 1h', {
                ...options,
                parseDates: false,
            });
            expect(result).toMatchObject({
                cleaned_content: 'Standup every Monday at 9am 1h',
                parsed_due_time: null,
                parsed_estimated_minutes: null,
            });
        });

        it('ignores a duration inside a hashtag', () => {
            const result = processInboxItem('Plan week #30min', options);
            expect(result.parsed_estimated_minutes).toBeNull();
        });
    });
});
