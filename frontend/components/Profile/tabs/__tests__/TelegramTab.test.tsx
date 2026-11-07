import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TelegramTab from '../TelegramTab';
import type { Profile, ProfileFormData } from '../../types';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: unknown) =>
        typeof fallback === 'string' ? fallback : key;
    return { useTranslation: () => ({ t, i18n: { language: 'en' } }) };
});

const profile = (extra: Partial<Profile> = {}) =>
    ({
        uid: 'u1',
        email: 'me@example.com',
        telegram_chat_id: null,
        telegram_allowed_users: null,
        task_summary_enabled: false,
        task_summary_frequency: 'daily',
        ...extra,
    }) as unknown as Profile;

const renderTab = (
    formData: ProfileFormData,
    userProfile: Profile,
    onClearToken = jest.fn()
) => {
    const noop = jest.fn();
    render(
        <TelegramTab
            isActive
            formData={formData}
            profile={userProfile}
            telegramBotInfo={null}
            isPolling={false}
            telegramSetupStatus="idle"
            onChange={noop}
            onSetup={noop}
            onClearToken={onClearToken}
            onStartPolling={noop}
            onStopPolling={noop}
            onToggleSummary={noop}
            onSelectFrequency={noop}
            onSendTestSummary={noop}
            formatFrequency={(f) => f}
        />
    );
    return onClearToken;
};

describe('TelegramTab bot token', () => {
    it('shows a saved token only by its last four characters', () => {
        const onClear = renderTab(
            {},
            profile({
                telegram_bot_token_set: true,
                telegram_bot_token_last4: '5678',
            })
        );

        expect(screen.getByText('••••••••5678')).toBeInTheDocument();
        expect(
            document.querySelector('input[name="telegram_bot_token"]')
        ).toBeNull();

        fireEvent.click(screen.getByRole('button', { name: /clear/i }));
        expect(onClear).toHaveBeenCalled();
    });

    it('offers a hidden field when no token is saved', () => {
        renderTab({}, profile({ telegram_bot_token_set: false }));

        const input = document.querySelector(
            'input[name="telegram_bot_token"]'
        );
        expect(input).toHaveAttribute('type', 'password');
    });

    it('offers the field again once the saved token is cleared', () => {
        renderTab(
            { telegram_bot_token: '' },
            profile({
                telegram_bot_token_set: true,
                telegram_bot_token_last4: '5678',
            })
        );

        expect(
            document.querySelector('input[name="telegram_bot_token"]')
        ).not.toBeNull();
        expect(screen.queryByText('••••••••5678')).toBeNull();
    });
});
