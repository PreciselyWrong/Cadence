import React from 'react';
import { render, screen } from '@testing-library/react';
import WindowControls, { desktopDragRegion } from '../WindowControls';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const setUserAgent = (value: string) =>
    Object.defineProperty(window.navigator, 'userAgent', {
        value,
        configurable: true,
    });

describe('WindowControls', () => {
    afterEach(() => setUserAgent('Mozilla/5.0'));

    it('renders nothing in a browser', () => {
        setUserAgent('Mozilla/5.0 Firefox/140.0');
        const { container } = render(<WindowControls />);
        expect(container).toBeEmptyDOMElement();
        expect(desktopDragRegion()).toEqual({});
    });

    it('marks the three controls for the Linux client to act on', () => {
        setUserAgent('Mozilla/5.0 AppleWebKit/605 CadenceDesktop/0.1.0');
        render(<WindowControls />);
        expect(
            screen
                .getAllByRole('button')
                .map((b) => b.getAttribute('data-desktop-window'))
        ).toEqual(['minimize', 'maximize', 'close']);
        expect(desktopDragRegion()).toEqual({ 'data-desktop-window': 'drag' });
    });
});
