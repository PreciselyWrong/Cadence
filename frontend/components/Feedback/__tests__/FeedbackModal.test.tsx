import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FeedbackModal, { issueUrl } from '../FeedbackModal';

jest.mock('react-router-dom', () => ({
    useLocation: () => ({ pathname: '/projects/abc', search: '?tab=notes' }),
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any) =>
            typeof fallback === 'string' ? fallback : key,
    }),
}));

describe('FeedbackModal', () => {
    beforeEach(() => {});

    it('keeps Send disabled until something is typed', () => {
        render(<FeedbackModal onClose={jest.fn()} />);
        const send = screen.getByTestId('feedback-submit');
        expect(send).toBeDisabled();

        fireEvent.change(screen.getByTestId('feedback-message'), {
            target: { value: '   ' },
        });
        expect(send).toBeDisabled();

        fireEvent.change(screen.getByTestId('feedback-message'), {
            target: { value: 'Broken' },
        });
        expect(send).toBeEnabled();
    });

    it('opens a GitHub issue with the message, the page and the version, then closes', () => {
        const open = jest.spyOn(window, 'open').mockReturnValue(null);
        const onClose = jest.fn();
        render(<FeedbackModal onClose={onClose} appVersion="v1.6.4" />);

        fireEvent.change(screen.getByTestId('feedback-message'), {
            target: { value: '  The board does not scroll\nOn Plan  ' },
        });
        fireEvent.click(screen.getByTestId('feedback-submit'));

        expect(open).toHaveBeenCalledTimes(1);
        const [address, target, features] = open.mock.calls[0];
        const url = new URL(String(address));
        expect(url.origin + url.pathname).toBe(
            'https://github.com/PreciselyWrong/Cadence/issues/new'
        );
        expect(url.searchParams.get('title')).toBe('The board does not scroll');
        expect(url.searchParams.get('body')).toBe(
            'The board does not scroll\nOn Plan\n\n---\nPage: /projects/abc?tab=notes\nVersion: v1.6.4'
        );
        expect(target).toBe('_blank');
        expect(features).toContain('noopener');
        expect(onClose).toHaveBeenCalled();
        open.mockRestore();
    });

    it('cuts a long first line to make the title', () => {
        expect(issueUrl('x'.repeat(200), '/', undefined)).toContain(
            `title=${'x'.repeat(79)}%E2%80%A6`
        );
    });

    it('closes on Escape', () => {
        const onClose = jest.fn();
        render(<FeedbackModal onClose={onClose} />);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(onClose).toHaveBeenCalled();
    });
});
