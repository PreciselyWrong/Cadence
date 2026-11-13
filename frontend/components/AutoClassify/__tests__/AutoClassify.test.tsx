import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TriagePage from '../../Triage/TriagePage';
import AutoClassifiedMark from '../AutoClassifiedMark';
import { fetchTriageQueue } from '../../../utils/triageService';
import {
    acceptAllChoice,
    applyClassifySuggestion,
    ClassifyPayload,
    ClassifyRequestError,
    dismissClassifySuggestion,
    fetchClassifyMarks,
    undoClassifyChange,
} from '../../../utils/autoClassifyService';

jest.mock('../../../utils/triageService', () => ({
    answerQuestion: jest.fn(),
    fetchTriageQueue: jest.fn(),
    keepTask: jest.fn(),
    applyTriage: jest.fn(),
}));
jest.mock('../../../utils/autoClassifyService', () => {
    const actual = jest.requireActual('../../../utils/autoClassifyService');
    return {
        ...actual,
        applyClassifySuggestion: jest.fn(),
        dismissClassifySuggestion: jest.fn(),
        fetchClassifyMarks: jest.fn(),
        undoClassifyChange: jest.fn(),
    };
});
jest.mock('../../../utils/projectsService', () => ({
    fetchProjects: jest
        .fn()
        .mockResolvedValue([{ uid: 'p-other', name: 'Bureau' }]),
}));
const mockToasts = { showErrorToast: jest.fn(), showSuccessToast: jest.fn() };
jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => mockToasts,
}));
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

const PAYLOAD: ClassifyPayload = {
    suggestion_uid: 's1',
    entity: 'note',
    item_uid: 'n1',
    title: 'Idées cabane',
    project: {
        options: [
            {
                uid: 'p-garden',
                name: 'Jardin',
                area_name: 'Maison',
                confidence: 0.6,
            },
            {
                uid: 'p-car',
                name: 'Voiture',
                area_name: null,
                confidence: null,
            },
        ],
        area: null,
        new_project: { name: 'Cabane', area_uid: 'a1', area_name: 'Maison' },
    },
    tags: { options: ['bois'], new_tag: 'bricolage' },
    priority: null,
};

const queueWith = (item: Record<string, unknown>) => ({
    count: 1,
    tasks: {},
    items: [
        {
            key: 'classify:s1',
            source: 'classify',
            task_uid: null,
            reason: '',
            details: [],
            question: null,
            ...item,
        },
    ],
});

describe('classifier cards in the triage queue', () => {
    beforeEach(() => jest.clearAllMocks());

    it('preselects the best answers: Apply equals accept all', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(
            queueWith({
                type: 'classify',
                action: 'classify',
                payload: PAYLOAD,
            })
        );
        (applyClassifySuggestion as jest.Mock).mockResolvedValue({});
        render(<TriagePage />);
        expect(await screen.findByText('Idées cabane')).toBeInTheDocument();
        expect(screen.getByText('Note')).toBeInTheDocument();
        fireEvent.click(screen.getByText('Appliquer'));
        await waitFor(() =>
            expect(applyClassifySuggestion).toHaveBeenCalledWith('s1', {
                project: { type: 'project', uid: 'p-garden' },
                tags: ['bois'],
                new_tag: null,
                priority: null,
            })
        );
        expect(await screen.findByTestId('triage-empty')).toBeInTheDocument();
    });

    it('creates a new project and tag only when picked, with the name typed', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(
            queueWith({
                type: 'classify',
                action: 'classify',
                payload: PAYLOAD,
            })
        );
        (applyClassifySuggestion as jest.Mock).mockResolvedValue({});
        render(<TriagePage />);
        fireEvent.click(await screen.findByLabelText('Nouveau projet'));
        fireEvent.change(screen.getByLabelText('Nom du nouveau projet'), {
            target: { value: 'Cabane au fond' },
        });
        fireEvent.click(screen.getByLabelText('Nouveau tag : #bricolage'));
        fireEvent.click(screen.getByLabelText('#bois'));
        fireEvent.click(screen.getByText('Appliquer'));
        await waitFor(() =>
            expect(applyClassifySuggestion).toHaveBeenCalledWith('s1', {
                project: {
                    type: 'new_project',
                    name: 'Cabane au fond',
                    area_uid: 'a1',
                },
                tags: [],
                new_tag: 'bricolage',
                priority: null,
            })
        );
    });

    it('picks another existing project from the list', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(
            queueWith({
                type: 'classify',
                action: 'classify',
                payload: PAYLOAD,
            })
        );
        (applyClassifySuggestion as jest.Mock).mockResolvedValue({});
        render(<TriagePage />);
        fireEvent.click(await screen.findByLabelText('Autre…'));
        const select = await screen.findByRole('combobox', {
            name: 'Choisir un projet',
        });
        await screen.findByRole('option', { name: 'Bureau' });
        fireEvent.change(select, { target: { value: 'p-other' } });
        fireEvent.click(screen.getByText('Appliquer'));
        await waitFor(() =>
            expect(
                (applyClassifySuggestion as jest.Mock).mock.calls[0][1].project
            ).toEqual({ type: 'project', uid: 'p-other' })
        );
    });

    it('sends "all" and dismisses with Ignorer', async () => {
        (fetchTriageQueue as jest.Mock).mockResolvedValue(
            queueWith({
                type: 'classify',
                action: 'classify',
                payload: PAYLOAD,
            })
        );
        (dismissClassifySuggestion as jest.Mock).mockResolvedValue({});
        render(<TriagePage />);
        fireEvent.click(
            await screen.findByText('Ignorer', { selector: 'button' })
        );
        await waitFor(() =>
            expect(dismissClassifySuggestion).toHaveBeenCalledWith('s1')
        );
        expect(applyClassifySuggestion).not.toHaveBeenCalled();
    });

    it('builds accept all without a new project or tag', () => {
        expect(
            acceptAllChoice({
                ...PAYLOAD,
                priority: { value: 2, confidence: 0.9 },
            })
        ).toEqual({
            project: { type: 'project', uid: 'p-garden' },
            tags: ['bois'],
            new_tag: null,
            priority: 2,
        });
        expect(
            acceptAllChoice({
                ...PAYLOAD,
                project: {
                    options: [],
                    area: { uid: 'a1', name: 'Maison' },
                    new_project: null,
                },
            }).project
        ).toEqual({ type: 'area', uid: 'a1' });
    });
});

describe('AutoClassifiedMark', () => {
    beforeEach(() => jest.clearAllMocks());

    it('shows nothing without an active mark', async () => {
        (fetchClassifyMarks as jest.Mock).mockResolvedValue({ marks: [] });
        render(<AutoClassifiedMark entity="task" uid="t1" />);
        await waitFor(() =>
            expect(fetchClassifyMarks).toHaveBeenCalledWith('task', 't1')
        );
        expect(
            screen.queryByTestId('auto-classified-mark')
        ).not.toBeInTheDocument();
    });

    it('undoes, and explains a refusal when the item changed', async () => {
        (fetchClassifyMarks as jest.Mock).mockResolvedValue({
            marks: [{ change_id: 7, fields: ['project_uid'] }],
        });
        (undoClassifyChange as jest.Mock).mockRejectedValueOnce(
            new ClassifyRequestError('changed', 409)
        );
        const onUndone = jest.fn();
        render(
            <AutoClassifiedMark entity="task" uid="t1" onUndone={onUndone} />
        );
        fireEvent.click(await screen.findByText('Annuler'));
        await waitFor(() =>
            expect(
                screen.getByText(
                    'L’élément a changé depuis : annulation impossible'
                )
            ).toBeInTheDocument()
        );
        expect(onUndone).not.toHaveBeenCalled();
    });

    it('undoes and hides the mark', async () => {
        (fetchClassifyMarks as jest.Mock).mockResolvedValue({
            marks: [{ change_id: 7, fields: ['project_uid'] }],
        });
        (undoClassifyChange as jest.Mock).mockResolvedValueOnce({});
        const onUndone = jest.fn();
        render(
            <AutoClassifiedMark entity="task" uid="t1" onUndone={onUndone} />
        );
        fireEvent.click(await screen.findByText('Annuler'));
        await waitFor(() => expect(onUndone).toHaveBeenCalled());
        expect(undoClassifyChange).toHaveBeenCalledWith(7);
        expect(
            screen.queryByTestId('auto-classified-mark')
        ).not.toBeInTheDocument();
    });
});
