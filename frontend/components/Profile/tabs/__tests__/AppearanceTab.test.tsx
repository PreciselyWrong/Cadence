import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import AppearanceTab from '../AppearanceTab';
import type { ProfileFormData } from '../../types';
import { DEFAULT_TASK_ROW_FIELDS } from '../../../../constants/taskRowFields';

jest.mock('react-i18next', () => {
    const t = (key: string, fallback?: any) =>
        typeof fallback === 'string' ? fallback : key;
    const value = { t };
    // The real useTranslation is a hook; a hook-free mock would hide hook
    // order bugs, since React mounts hooks afresh after a hook-free render.
    const { useRef } = jest.requireActual('react');
    return {
        useTranslation: () => {
            useRef(null);
            return value;
        },
    };
});

describe('AppearanceTab background', () => {
    it('offers no page background photo: it made the app unreadable', () => {
        render(
            <AppearanceTab
                isActive
                formData={{ appearance: 'light' } as ProfileFormData}
                onAppearanceChange={jest.fn()}
                density="minimal"
                onDensityChange={jest.fn()}
            />
        );

        expect(screen.queryByTestId('content-background-cards')).toBeNull();
        expect(screen.queryByText('Background')).toBeNull();
    });
});

describe('AppearanceTab interface density', () => {
    const renderDensity = (density: 'minimal' | 'dense') => {
        const onDensityChange = jest.fn();
        render(
            <AppearanceTab
                isActive
                formData={{ appearance: 'light' } as ProfileFormData}
                onAppearanceChange={jest.fn()}
                density={density}
                onDensityChange={onDensityChange}
            />
        );
        return { onDensityChange };
    };

    it('marks the saved density and explains it', () => {
        renderDensity('minimal');

        expect(screen.getByRole('button', { name: 'Minimal' })).toHaveAttribute(
            'aria-pressed',
            'true'
        );
        expect(
            screen.getByText(
                'Minimal hides extras for a calm list; Dense shows every control.'
            )
        ).toBeInTheDocument();
    });

    it('reports dense when Dense is picked', () => {
        const { onDensityChange } = renderDensity('minimal');

        fireEvent.click(screen.getByRole('button', { name: 'Dense' }));

        expect(onDensityChange).toHaveBeenCalledWith('dense');
    });
});

describe('AppearanceTab task row details', () => {
    const renderRowDetails = (
        density: 'minimal' | 'dense' = 'minimal',
        taskRowFields = DEFAULT_TASK_ROW_FIELDS
    ) => {
        const onTaskRowFieldsChange = jest.fn();
        render(
            <AppearanceTab
                isActive
                formData={{ appearance: 'light' } as ProfileFormData}
                onAppearanceChange={jest.fn()}
                density={density}
                onDensityChange={jest.fn()}
                taskRowFields={taskRowFields}
                onTaskRowFieldsChange={onTaskRowFieldsChange}
            />
        );
        return { onTaskRowFieldsChange };
    };

    it('lists one checkbox per chip in the default order, all checked', () => {
        renderRowDetails();
        const boxes = screen.getAllByRole('checkbox');
        expect(boxes).toHaveLength(DEFAULT_TASK_ROW_FIELDS.length);
        boxes.forEach((box) => expect(box).toBeChecked());
        expect(boxes[0]).toHaveAccessibleName('Recurring');
        expect(boxes[5]).toHaveAccessibleName('Due date');
    });

    it('is shown only while the interface is minimal', () => {
        renderRowDetails('dense');
        expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });

    it('reports a hidden chip when its checkbox is unticked', () => {
        const { onTaskRowFieldsChange } = renderRowDetails();
        fireEvent.click(screen.getByRole('checkbox', { name: 'Tags' }));
        const next = onTaskRowFieldsChange.mock.calls[0][0];
        expect(next.find((f: any) => f.key === 'tags').visible).toBe(false);
        expect(next.filter((f: any) => f.visible)).toHaveLength(
            DEFAULT_TASK_ROW_FIELDS.length - 1
        );
    });

    it('moves a chip down with its arrow button', () => {
        const { onTaskRowFieldsChange } = renderRowDetails();
        fireEvent.click(
            screen.getByRole('button', { name: 'Move down: Priority flag' })
        );
        expect(
            onTaskRowFieldsChange.mock.calls[0][0]
                .map((f: any) => f.key)
                .slice(3, 6)
        ).toEqual(['project', 'due', 'priority']);
    });

    it('disables move up on the first chip and move down on the last', () => {
        renderRowDetails();
        expect(
            screen.getByRole('button', { name: 'Move up: Recurring' })
        ).toBeDisabled();
        expect(
            screen.getByRole('button', { name: 'Move down: Due date' })
        ).toBeDisabled();
    });
});

describe('AppearanceTab tab switching', () => {
    it('renders when it becomes the active tab after starting hidden', () => {
        const props = {
            formData: { appearance: 'light' } as ProfileFormData,
            onAppearanceChange: jest.fn(),
            density: 'minimal' as const,
            onDensityChange: jest.fn(),
        };
        const { rerender } = render(
            <AppearanceTab isActive={false} {...props} />
        );

        rerender(<AppearanceTab isActive {...props} />);

        expect(
            screen.getByRole('heading', { name: 'Appearance' })
        ).toBeInTheDocument();
    });
});
