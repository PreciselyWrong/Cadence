import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import TurnIntoProject, { canBecomeProject } from '../TurnIntoProject';

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

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
    ...jest.requireActual('react-router-dom'),
    useNavigate: () => mockNavigate,
}));

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
    }),
}));

const mockTurn = jest.fn();
jest.mock('../../../utils/tasksService', () => ({
    ...jest.requireActual('../../../utils/tasksService'),
    turnTaskIntoProject: (uid: string) => mockTurn(uid),
}));

// « Transformer en projet » (docs/37-links.md).
describe('TurnIntoProject', () => {
    it('is offered for a plain task only', () => {
        expect(canBecomeProject({ uid: 't', name: 'x' } as any)).toBe(true);
        expect(
            canBecomeProject({ uid: 't', name: 'x', parent_task_id: 3 } as any)
        ).toBe(false);
        expect(
            canBecomeProject({
                uid: 't',
                name: 'x',
                recurrence_type: 'weekly',
            } as any)
        ).toBe(false);
        expect(
            canBecomeProject({ uid: 't', name: 'x', source_key: 'k' } as any)
        ).toBe(false);
    });

    it('asks, turns the task into a project, then opens it', async () => {
        mockTurn.mockResolvedValue({ project: { uid: 'p1', name: 'X' } });
        render(
            <MemoryRouter>
                <TurnIntoProject
                    task={{ uid: 't1', name: 'Essayer : X' } as any}
                />
            </MemoryRouter>
        );
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Turn into a project' })
        );
        fireEvent.click(
            screen.getByRole('button', { name: 'Turn into a project' })
        );
        await waitFor(() => expect(mockTurn).toHaveBeenCalledWith('t1'));
        expect(mockNavigate).toHaveBeenCalledWith('/project/p1');
    });
});
