import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClassifyTab from '../ClassifyTab';
import {
    ClassifySettings,
    fetchClassifySettings,
    retryClassifyFailed,
} from '../../../../utils/autoClassifyService';

jest.mock('react-i18next', () => {
    const t = (
        key: string,
        fallback?: unknown,
        options?: Record<string, unknown>
    ) => {
        if (typeof fallback !== 'string') return key;
        return fallback.replace(/\{\{(\w+)\}\}/g, (_: string, name: string) =>
            String(options?.[name] ?? '')
        );
    };
    return { useTranslation: () => ({ t, i18n: { language: 'fr' } }) };
});
jest.mock('../../../Shared/ToastContext', () => {
    const toast = { showErrorToast: jest.fn(), showSuccessToast: jest.fn() };
    return { useToast: () => toast };
});
jest.mock('../../../../utils/autoClassifyService', () => {
    const actual = jest.requireActual('../../../../utils/autoClassifyService');
    return {
        ...actual,
        fetchClassifySettings: jest.fn(),
        fetchClassifyRuns: jest.fn().mockResolvedValue({ runs: [] }),
        retryClassifyFailed: jest.fn(),
    };
});

const SETTINGS: ClassifySettings = {
    enabled: true,
    mode: 'write',
    notify: true,
    model: 'claude-haiku-5-5',
    reasoning_effort: '',
    batch_size: 12,
    grace_seconds: 90,
    fetch_wait_minutes: 60,
    max_attempts: 5,
    context_cache_minutes: 10,
    suggestion_ttl_days: 7,
    daily_suggestion_limit: 0,
    log_retention_days: 180,
    max_tags: 3,
    summary_max_chars: 220,
    max_tokens: 4000,
    thresholds: {
        project: 0.8,
        tags: 0.8,
        duration: 0.6,
        priority: 0.8,
        ask: 0.4,
    },
    excluded_tags: [],
};

const respond = (health: unknown) =>
    (fetchClassifySettings as jest.Mock).mockResolvedValue({
        settings: SETTINGS,
        defaults: SETTINGS,
        ai_configured: true,
        health,
    });

describe('ClassifyTab health banner', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows the last API error and requeues the failed items', async () => {
        respond({
            last_error: {
                message: '401: invalid x-api-key',
                at: '2026-11-08T07:30:00.000Z',
            },
            retryable: 3,
        });
        (retryClassifyFailed as jest.Mock).mockResolvedValue({ requeued: 3 });
        render(<ClassifyTab isActive />);

        const banner = await screen.findByRole('alert');
        expect(banner).toHaveTextContent('401: invalid x-api-key');
        expect(banner).toHaveTextContent('3 éléments en échec');

        fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
        await waitFor(() => expect(retryClassifyFailed).toHaveBeenCalled());
        await waitFor(() =>
            expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        );
    });

    it('shows nothing while every call succeeds', async () => {
        respond({ last_error: null, retryable: 0 });
        render(<ClassifyTab isActive />);
        await screen.findByText('Fonctionnement');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});
