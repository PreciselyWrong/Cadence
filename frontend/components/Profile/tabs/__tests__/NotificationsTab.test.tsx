import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationsTab from '../NotificationsTab';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: any) =>
        typeof fallback === 'string' ? fallback : key;
    const value = { t };
    return { useTranslation: () => value };
});

jest.mock('../PushDeviceCard', () => () => null);
jest.mock('../AppriseCard', () => () => null);
jest.mock('../WebhooksCard', () => () => null);
jest.mock('../../../../utils/csrfService', () => ({
    getCsrfToken: jest.fn().mockResolvedValue('token'),
}));
jest.mock('../../../../utils/pushService', () => ({
    countPushDevices: jest.fn().mockResolvedValue(0),
}));

const renderTab = async (props = {}) => {
    const onChange = jest.fn();
    const onQuietHoursChange = jest.fn();
    await act(async () => {
        render(
            <NotificationsTab
                isActive
                notificationPreferences={null}
                onChange={onChange}
                quietHours={null}
                onQuietHoursChange={onQuietHoursChange}
                {...props}
            />
        );
    });
    return { onChange, onQuietHoursChange };
};

describe('NotificationsTab', () => {
    beforeEach(() => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({}),
        }) as unknown as typeof fetch;
    });

    it('lists task reminders and hides the overdue, habit and email controls', async () => {
        await renderTab();

        expect(screen.getByText('Task reminders')).toBeInTheDocument();
        expect(screen.queryByText('Overdue Tasks')).not.toBeInTheDocument();
        expect(screen.queryByText('Overdue Projects')).not.toBeInTheDocument();
        expect(screen.queryByText('Habit Reminders')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('columnheader', { name: /email/i })
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('columnheader', { name: 'Desktop' })
        ).toBeInTheDocument();
    });

    it('turns the desktop channel on for task reminders', async () => {
        const { onChange } = await renderTab();

        fireEvent.click(
            screen.getByRole('switch', {
                name: 'Desktop · Task reminders',
            })
        );

        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({
                taskReminders: expect.objectContaining({ desktop: true }),
            })
        );
    });

    it('turns quiet hours on with a default night window', async () => {
        const { onQuietHoursChange } = await renderTab();

        fireEvent.click(screen.getByRole('checkbox', { name: 'Quiet hours' }));

        expect(onQuietHoursChange).toHaveBeenCalledWith({
            enabled: true,
            start: '22:00',
            end: '07:00',
        });
    });

    it('edits the quiet window', async () => {
        const { onQuietHoursChange } = await renderTab({
            quietHours: { enabled: true, start: '22:00', end: '07:00' },
        });

        fireEvent.change(screen.getByLabelText('From'), {
            target: { value: '23:30' },
        });

        expect(onQuietHoursChange).toHaveBeenCalledWith({
            enabled: true,
            start: '23:30',
            end: '07:00',
        });
    });
});
