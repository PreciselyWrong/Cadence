import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SettingsErrorBoundary from '../SettingsErrorBoundary';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: any) =>
        typeof fallback === 'string' ? fallback : key;
    const value = { t };
    return { useTranslation: () => value };
});

const Boom: React.FC = () => {
    throw new Error('boom');
};

describe('SettingsErrorBoundary', () => {
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        (console.error as jest.Mock).mockRestore();
    });

    it('shows a message in place of a section that throws, keeping the page', () => {
        render(
            <div>
                <p>Save Changes</p>
                <SettingsErrorBoundary resetKey="appearance">
                    <Boom />
                </SettingsErrorBoundary>
            </div>
        );

        expect(screen.getByRole('alert')).toHaveTextContent(
            'This section could not be displayed.'
        );
        expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });

    it('renders the next section once another one is picked', () => {
        const { rerender } = render(
            <SettingsErrorBoundary resetKey="appearance">
                <Boom />
            </SettingsErrorBoundary>
        );

        rerender(
            <SettingsErrorBoundary resetKey="general">
                <p>General settings</p>
            </SettingsErrorBoundary>
        );

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText('General settings')).toBeInTheDocument();
    });
});
