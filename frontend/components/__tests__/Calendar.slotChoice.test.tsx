import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import SlotChoiceDialog from '../Calendar/SlotChoiceDialog';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: string, vars?: Record<string, string>) => {
            const text = fallback ?? key;
            return vars
                ? Object.entries(vars).reduce(
                      (acc, [k, v]) => acc.replace(`{{${k}}}`, v),
                      text
                  )
                : text;
        },
    }),
}));

const start = new Date(2026, 10, 3, 14, 0);

describe('SlotChoiceDialog', () => {
    it('offers Add task at the clicked time, enabled once a name is typed', async () => {
        const onAddTask = jest.fn().mockResolvedValue(undefined);
        render(
            <SlotChoiceDialog
                start={start}
                googleAvailable={false}
                onAddTask={onAddTask}
                onGoogleEvent={jest.fn()}
                onClose={jest.fn()}
            />
        );
        const add = screen.getByRole('button', { name: 'Add task at 14:00' });
        expect(add).toBeDisabled();

        fireEvent.change(screen.getByRole('textbox', { name: 'Task name' }), {
            target: { value: 'Call dentist' },
        });
        expect(add).toBeEnabled();
        fireEvent.click(add);
        await waitFor(() => expect(onAddTask).toHaveBeenCalledWith('Call dentist'));
    });

    it('hides the Google event choice without a writable Google calendar', () => {
        render(
            <SlotChoiceDialog
                start={start}
                googleAvailable={false}
                onAddTask={jest.fn()}
                onGoogleEvent={jest.fn()}
                onClose={jest.fn()}
            />
        );
        expect(
            screen.queryByRole('button', { name: 'New Google event' })
        ).toBeNull();
    });

    it('keeps the Google event as a second choice when available', () => {
        const onGoogleEvent = jest.fn();
        render(
            <SlotChoiceDialog
                start={start}
                googleAvailable
                onAddTask={jest.fn()}
                onGoogleEvent={onGoogleEvent}
                onClose={jest.fn()}
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'New Google event' }));
        expect(onGoogleEvent).toHaveBeenCalledTimes(1);
    });
});
