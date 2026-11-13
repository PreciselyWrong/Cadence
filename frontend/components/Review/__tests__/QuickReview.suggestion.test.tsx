import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import QuickReview from '../QuickReview';
import { DecisionOption } from '../DecisionChips';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (
            _key: string,
            fallback: string,
            options?: Record<string, unknown>
        ) =>
            Object.entries(options ?? {}).reduce(
                (text, [name, value]) =>
                    text.replace(`{{${name}}}`, String(value)),
                fallback
            ),
    }),
}));

const options = (runs: Record<string, jest.Mock>): DecisionOption[] => [
    { key: 'today', label: 'Do today', run: runs.today },
    { key: 'later', label: 'Later', run: runs.later },
];

const renderReview = (
    suggestion: React.ComponentProps<typeof QuickReview>['suggestion']
) => {
    const runs = { today: jest.fn(), later: jest.fn(), validate: jest.fn() };
    render(
        <QuickReview
            loading={false}
            kind="Pushed back"
            card={<span>Préparer la salle</span>}
            itemKey="t:1"
            options={options(runs)}
            suggestion={suggestion}
            position={1}
            total={3}
            onSkip={jest.fn()}
            onStop={jest.fn()}
            onOpen={jest.fn()}
            onAgain={jest.fn()}
        />
    );
    return runs;
};

describe('QuickReview with an agent suggestion', () => {
    it('shows the suggested choice with its reason, and one tap validates it', () => {
        const suggestion = {
            choice: 'Do today',
            reason: 'Mardi est libre',
            run: jest.fn(),
        };
        renderReview(suggestion);

        expect(screen.getByText('Mardi est libre')).toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Valider : Do today' })
        );

        expect(suggestion.run).toHaveBeenCalledTimes(1);
    });

    it('keeps the other choices available next to the suggestion', () => {
        renderReview({ choice: 'Do today', reason: null, run: jest.fn() });
        expect(
            screen.getByRole('button', { name: 'Later' })
        ).toBeInTheDocument();
    });

    it('validates the suggestion with Enter', () => {
        const suggestion = { choice: 'Do today', reason: null, run: jest.fn() };
        renderReview(suggestion);
        fireEvent.keyDown(window, { key: 'Enter' });
        expect(suggestion.run).toHaveBeenCalledTimes(1);
    });

    it('shows no suggestion when none is given: the existing flow', () => {
        renderReview(null);
        expect(screen.queryByText(/Valider :/)).not.toBeInTheDocument();
    });
});
