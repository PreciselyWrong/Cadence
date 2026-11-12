import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import SidebarMinimalEditor from '../SidebarMinimalEditor';
import { useStore } from '../../../store/useStore';
import { saveMinimalSidebarSettings } from '../../../utils/sidebarSettingsService';
import { DEFAULT_MINIMAL_SIDEBAR } from '../../../utils/minimalSidebar';

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, fallback?: any, options?: any) =>
            typeof fallback === 'string'
                ? fallback.replace(
                      /\{\{(\w+)\}\}/g,
                      (_: string, name: string) => options?.[name] ?? ''
                  )
                : key,
    }),
}));

jest.mock('../../../utils/sidebarSettingsService', () => ({
    saveMinimalSidebarSettings: jest.fn().mockResolvedValue(undefined),
}));

const saveMock = saveMinimalSidebarSettings as jest.MockedFunction<
    typeof saveMinimalSidebarSettings
>;

const renderEditor = (isAdmin = false) => {
    render(<SidebarMinimalEditor isAdmin={isAdmin} />);
};

describe('SidebarMinimalEditor', () => {
    beforeEach(() => {
        saveMock.mockClear();
        act(() => {
            useStore.getState().userSettingsStore.setSidebarMinimal(undefined);
        });
    });

    it('hides a smart list when its switch is turned off', () => {
        renderEditor();

        fireEvent.click(screen.getByLabelText('Show Today'));

        expect(saveMock).toHaveBeenCalledTimes(1);
        const [patch] = saveMock.mock.calls[0];
        expect(patch.smartLists).toEqual(
            expect.arrayContaining([
                { key: 'today', visible: false, showCount: true },
            ])
        );
    });

    it('turns a count badge off without hiding the row', () => {
        renderEditor();

        fireEvent.click(screen.getByLabelText('Show count for Today'));

        const [patch] = saveMock.mock.calls[0];
        expect(patch.smartLists).toEqual(
            expect.arrayContaining([
                { key: 'today', visible: true, showCount: false },
            ])
        );
    });

    it('moves a smart list up one place', () => {
        renderEditor();

        fireEvent.click(screen.getByLabelText('Move Plan up'));

        const [patch] = saveMock.mock.calls[0];
        expect(patch.smartLists?.map((item) => item.key)).toEqual([
            'inbox',
            'next7',
            'today',
        ]);
    });

    it('lists no Tomorrow smart list', () => {
        renderEditor();

        expect(screen.queryByLabelText('Show Tomorrow')).toBeNull();
        expect(screen.queryByText('Tomorrow')).toBeNull();
    });

    it('moves a rail item to More', () => {
        renderEditor();

        fireEvent.change(screen.getByLabelText('Place of Notes'), {
            target: { value: 'more' },
        });

        const [patch] = saveMock.mock.calls[0];
        expect(patch.rail).toEqual(
            expect.arrayContaining([{ key: 'notes', place: 'more' }])
        );
    });

    it('turns a section count badge on (off by default)', () => {
        renderEditor();

        fireEvent.click(screen.getByLabelText('Show count for Projects'));

        const [patch] = saveMock.mock.calls[0];
        expect(patch.sectionBadges).toEqual({
            ...DEFAULT_MINIMAL_SIDEBAR.sectionBadges,
            projects: true,
        });
    });

    it('shows Access in the rail list only to admins', () => {
        const { unmount } = render(<SidebarMinimalEditor isAdmin={false} />);
        expect(screen.queryByLabelText('Place of Access')).toBeNull();
        unmount();

        renderEditor(true);
        expect(screen.getByLabelText('Place of Access')).toBeInTheDocument();
    });

    it('resets everything to the defaults', () => {
        renderEditor();

        fireEvent.click(screen.getByText('Reset to default'));

        expect(saveMock).toHaveBeenCalledWith({
            smartLists: DEFAULT_MINIMAL_SIDEBAR.smartLists,
            rail: DEFAULT_MINIMAL_SIDEBAR.rail,
            sectionBadges: DEFAULT_MINIMAL_SIDEBAR.sectionBadges,
            panel: DEFAULT_MINIMAL_SIDEBAR.panel,
        });
    });

    it('hides a panel block, such as the month calendar', () => {
        renderEditor();

        fireEvent.click(screen.getByLabelText('Show Month calendar'));

        const [patch] = saveMock.mock.calls[0];
        expect(patch.panel).toEqual(
            expect.arrayContaining([{ key: 'miniMonth', visible: false }])
        );
        expect(patch.panel).toHaveLength(DEFAULT_MINIMAL_SIDEBAR.panel.length);
    });

    it('moves a panel block up one place', () => {
        renderEditor();

        fireEvent.click(screen.getByLabelText('Move Projects up'));

        const [patch] = saveMock.mock.calls[0];
        expect(patch.panel!.map((block) => block.key)).toEqual([
            'favorites',
            'miniMonth',
            'projects',
            'smartLists',
            'areas',
            'tags',
        ]);
    });
});
