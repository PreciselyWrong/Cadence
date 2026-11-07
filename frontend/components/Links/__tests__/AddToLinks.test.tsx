import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AddToLinks, { addressesIn } from '../AddToLinks';
import { addLinkFrom } from '../../../utils/linksService';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

jest.mock('../../../utils/linksService', () => ({
    addLinkFrom: jest.fn(),
}));

const mockedAdd = addLinkFrom as jest.MockedFunction<typeof addLinkFrom>;

describe('AddToLinks', () => {
    beforeEach(() => mockedAdd.mockReset());

    it('finds each address once, without the closing punctuation', () => {
        expect(
            addressesIn([
                'Try https://github.com/a/tool.',
                'see (https://example.com/x) and https://github.com/a/tool',
            ])
        ).toEqual(['https://github.com/a/tool', 'https://example.com/x']);
    });

    it('shows nothing when the text holds no address', () => {
        const { container } = render(
            <AddToLinks sourceType="task" sourceUid="t1" texts={['Plain']} />
        );
        expect(container).toBeEmptyDOMElement();
    });

    it('adds an address with the task as its source, then shows it saved', async () => {
        mockedAdd.mockResolvedValue({ link: {} as never, created: true });
        render(
            <AddToLinks
                sourceType="task"
                sourceUid="t1"
                texts={['Read', 'Docs: https://www.example.com/guide']}
            />
        );

        fireEvent.click(
            screen.getByRole('button', { name: /Add to links · example.com/ })
        );

        await waitFor(() =>
            expect(
                screen.getByText(/In links · example.com/)
            ).toBeInTheDocument()
        );
        expect(mockedAdd).toHaveBeenCalledWith(
            'https://www.example.com/guide',
            { type: 'task', uid: 't1' }
        );
    });

    it('says so when the link cannot be saved', async () => {
        mockedAdd.mockRejectedValue(new Error('down'));
        render(
            <AddToLinks
                sourceType="note"
                sourceUid="n1"
                texts={['https://example.com/a']}
            />
        );

        fireEvent.click(screen.getByRole('button'));

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Could not save the link.'
        );
    });
});
