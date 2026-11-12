import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LinkPreviews from '../LinkPreviews';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, string | number>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

jest.mock('../../../utils/urlService', () => ({
    ...jest.requireActual('../../../utils/urlService'),
    fetchUrlPreview: (url: string) =>
        Promise.resolve(
            url.includes('github.com')
                ? {
                      url,
                      title: 'rocket',
                      description: 'A rocket',
                      image: null,
                      siteName: 'GitHub',
                      kind: 'repo',
                      githubStars: 1234,
                      githubLanguage: 'Rust',
                      githubLastCommit: '2026-11-01T10:00:00.000Z',
                  }
                : {
                      url,
                      title: 'A post',
                      description: null,
                      image: null,
                      siteName: null,
                  }
        ),
}));

// A card for each address of a task note, a note or a project description.
describe('LinkPreviews', () => {
    it('shows a card per address, once each, with GitHub stats', async () => {
        render(
            <LinkPreviews
                texts={[
                    'Essayer : rocket',
                    'https://github.com/acme/rocket\n\nsee https://example.com/post and https://github.com/acme/rocket.',
                ]}
            />
        );

        expect(await screen.findByText('rocket')).toBeInTheDocument();
        expect(await screen.findByText('A post')).toBeInTheDocument();
        expect(screen.getAllByTestId('link-preview')).toHaveLength(2);
        expect(
            screen.getByText('★ 1.2k · Rust · 2026-11-01')
        ).toBeInTheDocument();
    });

    it('shows nothing without an address', () => {
        const { container } = render(<LinkPreviews texts={['plain words']} />);
        expect(container).toBeEmptyDOMElement();
    });
});
