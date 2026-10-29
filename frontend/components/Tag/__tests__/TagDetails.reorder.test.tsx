import React from 'react';
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TagDetails from '../TagDetails';
import { fetchTaskOrder, saveTaskOrder } from '../../../utils/tasksService';

let mockIsMinimal = true;
let mockTaskListProps: any = null;

jest.mock('../../../hooks/useUiDensity', () => ({
    useIsMinimal: () => mockIsMinimal,
}));

jest.mock('react-router-dom', () => ({
    useParams: () => ({ uidSlug: 'errands-t7' }),
    useNavigate: () => jest.fn(),
    Link: ({ children }: any) => children,
}));

jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, optionsOrDefault?: any) =>
            typeof optionsOrDefault === 'string' ? optionsOrDefault : key,
        i18n: { language: 'en' },
    }),
    initReactI18next: { type: '3rdParty', init: () => {} },
}));

jest.mock('../../../i18n', () => ({
    __esModule: true,
    default: { language: 'en' },
}));

jest.mock('../../../utils/tagsService', () => ({
    fetchTagBySlug: jest.fn(async () => ({
        id: 7,
        uid: 't7',
        name: 'Errands',
    })),
    updateTag: jest.fn(),
    deleteTag: jest.fn(),
}));

jest.mock('../../../utils/tasksService', () => ({
    createTask: jest.fn(),
    fetchTaskOrder: jest.fn(async () => ['u2', 'u1']),
    saveTaskOrder: jest.fn(async () => undefined),
}));

jest.mock('../../../utils/projectsService', () => ({
    updateProject: jest.fn(),
}));

jest.mock('../../../hooks/usePersistedModal', () => ({
    usePersistedModal: () => ({
        isOpen: false,
        openModal: jest.fn(),
        closeModal: jest.fn(),
    }),
}));

jest.mock('../../../store/useStore', () => {
    const state = {
        projectsStore: { projects: [], setProjects: jest.fn() },
        tagsStore: { tags: [], setTags: jest.fn() },
    };
    return {
        useStore: (selector: any) => selector(state),
    };
});

jest.mock('../../Shared/ToastContext', () => ({
    useToast: () => ({
        showSuccessToast: jest.fn(),
        showErrorToast: jest.fn(),
    }),
}));

jest.mock('../../Task/TaskList', () => ({
    __esModule: true,
    default: (props: any) => {
        mockTaskListProps = props;
        return null;
    },
}));

jest.mock('../../Task/TaskViewBody', () => ({
    __esModule: true,
    default: ({ children }: any) => children,
}));

jest.mock('../../Task/GroupedTaskList', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Task/NewTask', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Task/CompletedTasksSection', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Project/ProjectItem', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Project/ProjectShareModal', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../TagModal', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../TagHero', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Shared/ConfirmDialog', () => ({
    __esModule: true,
    default: () => null,
}));

jest.mock('../../Shared/IconSortDropdown', () => ({
    __esModule: true,
    default: () => null,
}));

const tasks = [
    {
        id: 1,
        uid: 'u1',
        name: 'One',
        status: 0,
        created_at: '2026-01-01T00:00:00Z',
    },
    {
        id: 2,
        uid: 'u2',
        name: 'Two',
        status: 0,
        created_at: '2026-01-02T00:00:00Z',
    },
    {
        id: 3,
        uid: 'u3',
        name: 'Three',
        status: 0,
        created_at: '2026-01-03T00:00:00Z',
    },
];

beforeEach(() => {
    mockTaskListProps = null;
    mockIsMinimal = true;
    localStorage.clear();
    localStorage.setItem('order_by', 'custom:asc');
    (fetchTaskOrder as jest.Mock).mockClear();
    (saveTaskOrder as jest.Mock).mockClear();
    global.fetch = jest.fn(async (url: string) => ({
        ok: true,
        json: async () => (String(url).includes('notes') ? [] : { tasks }),
    })) as any;
});

describe('TagDetails task order', () => {
    it('loads the tag order and saves a drag with the new uids (Minimal)', async () => {
        render(<TagDetails />);

        await waitFor(() => expect(mockTaskListProps?.onReorder).toBeDefined());
        expect(fetchTaskOrder).toHaveBeenCalledWith({
            scope: 'tag',
            tag_uid: 't7',
        });
        // Unplaced u3 comes first, then the saved order u2, u1.
        expect(mockTaskListProps.tasks.map((t: any) => t.uid)).toEqual([
            'u3',
            'u2',
            'u1',
        ]);

        mockTaskListProps.onReorder(['u1', 'u2', 'u3']);

        await waitFor(() =>
            expect(saveTaskOrder).toHaveBeenCalledWith(
                { scope: 'tag', tag_uid: 't7' },
                ['u1', 'u2', 'u3']
            )
        );
    });

    it('keeps Dense lists without a drag handler and skips the order call', async () => {
        mockIsMinimal = false;
        render(<TagDetails />);

        await waitFor(() => expect(mockTaskListProps).not.toBeNull());
        expect(mockTaskListProps.onReorder).toBeUndefined();
        expect(fetchTaskOrder).not.toHaveBeenCalled();
    });
});
