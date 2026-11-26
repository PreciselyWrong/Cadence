import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PickRow from '../PickRow';
import { Task } from '../../../entities/Task';

const task = {
    uid: 't1',
    name: 'Payer David',
    due_date: '2026-11-30',
    Project: { id: 1, name: 'Finances' },
    tags: [{ name: 'admin' }, { name: 'urgent' }, { name: 'third' }],
} as unknown as Task;

describe('PickRow', () => {
    it('shows the project and the first tags of a suggestion', () => {
        render(
            <PickRow
                task={task}
                locale="fr"
                onOpen={() => {}}
                action={() => {}}
                label="Ajouter"
            />
        );
        expect(screen.getByText('Finances')).toBeInTheDocument();
        expect(screen.getByText('#admin')).toBeInTheDocument();
        expect(screen.getByText('#urgent')).toBeInTheDocument();
        expect(screen.queryByText('#third')).not.toBeInTheDocument();
    });

    it('runs the action and opens the task', () => {
        const action = jest.fn();
        const onOpen = jest.fn();
        render(
            <PickRow
                task={task}
                locale="fr"
                onOpen={onOpen}
                action={action}
                label="Ajouter"
            />
        );
        fireEvent.click(screen.getByRole('button', { name: 'Ajouter' }));
        fireEvent.click(screen.getByRole('button', { name: 'Payer David' }));
        expect(action).toHaveBeenCalled();
        expect(onOpen).toHaveBeenCalledWith('t1');
    });
});
