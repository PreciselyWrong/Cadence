import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import TimedRemindersCard from '../TimedRemindersCard';
import {
    fetchTimedReminders,
    saveTimedReminders,
} from '../../../../utils/timedRemindersService';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: any, options?: any) =>
        (typeof fallback === 'string' ? fallback : key).replace(
            /{{(\w+)}}/g,
            (_: string, name: string) => options?.[name] ?? name
        );
    const value = { t };
    return { useTranslation: () => value };
});

jest.mock('../../../../utils/timedRemindersService', () => ({
    TIMED_LEAD_MINUTES: [0, 5, 10, 15, 30],
    fetchTimedReminders: jest.fn(),
    saveTimedReminders: jest.fn(),
}));

const renderCard = async (enabled = true) => {
    (fetchTimedReminders as jest.Mock).mockResolvedValue({
        enabled,
        lead_minutes: 0,
    });
    (saveTimedReminders as jest.Mock).mockReset().mockResolvedValue({});
    await act(async () => {
        render(<TimedRemindersCard />);
    });
};

describe('TimedRemindersCard', () => {
    it('saves a new lead at once', async () => {
        await renderCard();

        await act(async () => {
            fireEvent.change(screen.getByRole('combobox'), {
                target: { value: '10' },
            });
        });

        expect(saveTimedReminders).toHaveBeenCalledWith({
            enabled: true,
            lead_minutes: 10,
        });
    });

    it('hides the lead when the setting is off', async () => {
        await renderCard(false);
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    });

    it('goes back to the saved value when the save fails', async () => {
        await renderCard();
        const error = jest.spyOn(console, 'error').mockImplementation();
        (saveTimedReminders as jest.Mock).mockRejectedValue(new Error('no'));

        await act(async () => {
            fireEvent.click(screen.getByRole('checkbox'));
        });

        expect(screen.getByRole('checkbox')).toBeChecked();
        error.mockRestore();
    });
});
