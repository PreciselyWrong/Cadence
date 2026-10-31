import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import HabitEditor from '../HabitEditor';
import * as save from '../../../utils/cadenceHabitSave';
import { detail, minutesGoal } from './fixtures';

jest.mock('react-i18next', () => jest.requireActual('./testI18n').mockI18n);
jest.mock('../../../utils/cadenceHabitSave', () => ({
    ...jest.requireActual('../../../utils/cadenceHabitSave'),
    createFromDraft: jest.fn(),
    updateFromDraft: jest.fn(),
}));

const api = save as jest.Mocked<typeof save>;

const groups = [
    {
        uid: 'group-day',
        name: 'Journée',
        start_minute: null,
        end_minute: null,
        sort_order: 0,
    },
    {
        uid: 'group-morning',
        name: 'Matin',
        start_minute: 300,
        end_minute: 720,
        sort_order: 1,
    },
];

const renderEditor = (
    props: Partial<React.ComponentProps<typeof HabitEditor>> = {}
) => {
    const onSaved = jest.fn();
    const onClose = jest.fn();
    render(
        <HabitEditor
            isOpen
            onClose={onClose}
            groups={groups}
            today="2026-10-05"
            onSaved={onSaved}
            {...props}
        />
    );
    return { onSaved, onClose };
};

const submit = () => fireEvent.click(screen.getByTestId('habit-editor-submit'));

beforeEach(() => {
    jest.resetAllMocks();
    api.createFromDraft.mockResolvedValue(detail({ uid: 'created-1' }));
    api.updateFromDraft.mockResolvedValue(undefined);
});

describe('HabitEditor', () => {
    it('refuses a habit without a name', () => {
        renderEditor();
        submit();
        expect(screen.getByText('Give the habit a name.')).toBeInTheDocument();
        expect(api.createFromDraft).not.toHaveBeenCalled();
    });

    it('creates a habit and reports its uid', async () => {
        const { onSaved } = renderEditor();
        fireEvent.change(screen.getByLabelText('Name'), {
            target: { value: 'Lire' },
        });
        fireEvent.change(screen.getByLabelText('Time of day'), {
            target: { value: 'group-morning' },
        });
        submit();
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('created-1'));
        expect(api.createFromDraft).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Lire',
                groupUid: 'group-morning',
                kind: 'goal',
                goalType: 'BINARY',
            })
        );
    });

    it('reads a limit as a maximum', () => {
        renderEditor();
        expect(screen.queryByLabelText('Maximum per period')).toBeNull();
        fireEvent.click(screen.getByRole('radio', { name: 'Limit' }));
        expect(screen.getByLabelText('Maximum per period')).toBeInTheDocument();
        expect(
            screen.queryByLabelText('Minimum that counts (optional)')
        ).toBeNull();
    });

    it('has nothing to measure for an abstinence', () => {
        renderEditor();
        fireEvent.click(screen.getByRole('radio', { name: 'Abstinence' }));
        expect(screen.queryByLabelText('Unit')).toBeNull();
        expect(screen.getByLabelText('About')).toBeInTheDocument();
    });

    it('asks from when a changed goal applies, and shows the error of a refused save', async () => {
        api.updateFromDraft.mockRejectedValueOnce(
            new Error('invalid_value:target_minor')
        );
        const habit = detail({
            goal: minutesGoal(),
            goals: [minutesGoal()],
            schedule: {
                uid: 's1',
                habit_uid: 'h1',
                schedule_mode: 'EVERY_DAY',
                active_days:
                    'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
                first_day_of_week: 'MONDAY',
                effective_from: '2026-10-01',
                interval_days: 2,
            },
        });
        renderEditor({ habit });
        expect(screen.queryByText('Apply the change')).toBeNull();
        fireEvent.change(screen.getByLabelText('Ideal (target)'), {
            target: { value: '45' },
        });
        expect(screen.getByText('Apply the change')).toBeInTheDocument();
        expect(screen.getByLabelText('Applies from')).toHaveValue('2026-10-05');
        submit();
        await waitFor(() => expect(api.updateFromDraft).toHaveBeenCalled());
        expect(api.updateFromDraft.mock.calls[0][2]).toEqual({
            apply: 'new',
            from: '2026-10-05',
        });
        expect(
            await screen.findByText(
                'Could not save the habit (invalid_value:target_minor).'
            )
        ).toBeInTheDocument();
    });

    it('lets a mistake be corrected without a new version', async () => {
        const habit = detail({
            goal: minutesGoal(),
            goals: [minutesGoal()],
            schedule: {
                uid: 's1',
                habit_uid: 'h1',
                schedule_mode: 'EVERY_DAY',
                active_days:
                    'MONDAY,TUESDAY,WEDNESDAY,THURSDAY,FRIDAY,SATURDAY,SUNDAY',
                first_day_of_week: 'MONDAY',
                effective_from: '2026-10-01',
                interval_days: 2,
            },
        });
        const { onSaved } = renderEditor({ habit });
        fireEvent.change(screen.getByLabelText('Ideal (target)'), {
            target: { value: '45' },
        });
        fireEvent.click(
            screen.getByRole('radio', { name: 'Correct the current version' })
        );
        submit();
        await waitFor(() => expect(onSaved).toHaveBeenCalledWith('h1'));
        expect(api.updateFromDraft.mock.calls[0][2].apply).toBe('fix');
    });
});
