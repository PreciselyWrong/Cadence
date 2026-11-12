import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarDayView from '../CalendarDayView';
import { CalendarEvent } from '../taskEvents';

jest.mock('../../../i18n', () => ({ __esModule: true, default: {} }));

jest.mock('../../../utils/profileService', () => ({
    getFirstDayOfWeek: jest.fn().mockResolvedValue(1),
    getLocaleFirstDayOfWeek: jest.fn().mockReturnValue(1),
}));

const day = new Date(2026, 8, 24);

const block = (title: string, color?: string, done = false): CalendarEvent => ({
    id: title,
    title,
    start: new Date(2026, 8, 24, 9, 0),
    end: new Date(2026, 8, 24, 10, 0),
    type: 'task',
    color,
    done,
});

describe('calendar blocks', () => {
    it('draw a coloured block as a token-text flat fill with no blue fallback', () => {
        render(
            <CalendarDayView
                currentDate={day}
                events={[block('Coloured', '#1d4ed8')]}
            />
        );
        const el = screen.getByTitle(/Coloured/);
        expect(el).toHaveAttribute('data-calendar-block');
        expect(el.style.backgroundColor).toContain('color-mix');
        expect(el.className).toContain('text-surface-on');
        expect(el.getAttribute('style')).not.toContain('3b82f6');
    });

    it('draw an uncoloured block with the token fill', () => {
        render(<CalendarDayView currentDate={day} events={[block('Plain')]} />);
        const el = screen.getByTitle(/Plain/);
        expect(el.style.backgroundColor).toBe('');
        expect(el.className).toContain('bg-primary-container');
    });

    it('fade a finished block', () => {
        render(
            <CalendarDayView
                currentDate={day}
                events={[block('Finished', '#15803d', true)]}
            />
        );
        expect(screen.getByTitle(/Finished/).className).toContain('opacity-50');
    });
});
