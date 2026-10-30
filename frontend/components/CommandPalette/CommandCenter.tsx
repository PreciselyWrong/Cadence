import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import { useTaskPanel, openTaskPanel } from '../../store/taskPanelStore';
import { useTaskPane } from '../../contexts/TaskPaneContext';
import { useTaskActions } from '../../hooks/useTaskActions';
import { openCapture } from '../../utils/captureUi';
import { createShortcutDispatcher } from '../../utils/shortcutDispatcher';
import { GLOBAL_BINDINGS } from '../../utils/shortcutRegistry';
import { isTaskDone } from '../../constants/taskStatus';
import { fetchTaskByUid } from '../../utils/tasksService';
import CommandPalette from './CommandPalette';
import {
    DELETE_TASK_EVENT,
    DeleteTaskDetail,
    OPEN_PALETTE_EVENT,
    OpenPaletteDetail,
} from '../../utils/commandEvents';
import ShortcutsHelp from './ShortcutsHelp';
import type { PaletteTarget } from './paletteCommands';

interface CommandCenterProps {
    toggleDarkMode: () => void;
    openProjectModal: () => void;
    openNewNote: () => void;
    openNewHabit: () => void;
}

// The task a task command acts on: the row with focus, else the one under the
// pointer, else the one open in a side panel.
const findTargetUid = (
    panelUid: string | null,
    paneUid: string | null
): string | null => {
    const active = document.activeElement;
    const focused =
        active instanceof Element
            ? active.closest<HTMLElement>('[data-task-uid]')
            : null;
    const hovered = document.querySelector<HTMLElement>(
        '[data-task-uid]:hover'
    );
    return (
        focused?.dataset.taskUid ??
        hovered?.dataset.taskUid ??
        panelUid ??
        paneUid ??
        null
    );
};

// Mounted once in the layout: owns the global single-key shortcuts, the
// command palette (Ctrl/Cmd+K) and the shortcuts help overlay (?).
const CommandCenter: React.FC<CommandCenterProps> = ({
    toggleDarkMode,
    openProjectModal,
    openNewNote,
    openNewHabit,
}) => {
    const navigate = useNavigate();
    const panelUid = useTaskPanel((state) => state.uid);
    const { openTaskUid: paneUid } = useTaskPane();
    const actions = useTaskActions();
    const projects = useStore((state) => state.projectsStore.projects);

    const [paletteOpen, setPaletteOpen] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [target, setTarget] = useState<PaletteTarget | null>(null);
    const [startStep, setStartStep] = useState<'root' | 'project'>('root');
    const returnFocusRef = useRef<HTMLElement | null>(null);

    const rememberFocus = () => {
        returnFocusRef.current =
            document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
    };

    const restoreFocus = useCallback(() => {
        const previous = returnFocusRef.current;
        returnFocusRef.current = null;
        if (previous && document.contains(previous)) previous.focus();
    }, []);

    const openPalette = useCallback(
        (detail: OpenPaletteDetail = {}) => {
            rememberFocus();
            const uid = detail.taskUid ?? findTargetUid(panelUid, paneUid);
            setTarget(uid ? { uid } : null);
            setStartStep(detail.step ?? 'root');
            setPaletteOpen(true);
            setHelpOpen(false);
        },
        [panelUid, paneUid]
    );

    useEffect(() => {
        if (!paletteOpen || !target || target.name) return undefined;
        let cancelled = false;
        fetchTaskByUid(target.uid)
            .then((task) => {
                if (cancelled) return;
                setTarget({
                    uid: target.uid,
                    name: task.name,
                    done: isTaskDone(task.status),
                });
            })
            .catch(() => {
                if (!cancelled) setTarget(null);
            });
        return () => {
            cancelled = true;
        };
    }, [paletteOpen, target]);

    const closePalette = useCallback(() => {
        setPaletteOpen(false);
        restoreFocus();
    }, [restoreFocus]);

    const openHelp = useCallback(() => {
        rememberFocus();
        setPaletteOpen(false);
        setHelpOpen(true);
    }, []);

    const closeHelp = useCallback(() => {
        setHelpOpen(false);
        restoreFocus();
    }, [restoreFocus]);

    useEffect(() => {
        const onOpen = (event: Event) =>
            openPalette((event as CustomEvent<OpenPaletteDetail>).detail);
        window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
        return () => window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    }, [openPalette]);

    const { removeWithUndo } = actions;
    useEffect(() => {
        const onDelete = (event: Event) => {
            const detail = (event as CustomEvent<DeleteTaskDetail>).detail;
            if (detail?.uid) removeWithUndo(detail.uid, detail.name);
        };
        window.addEventListener(DELETE_TASK_EVENT, onDelete);
        return () => window.removeEventListener(DELETE_TASK_EVENT, onDelete);
    }, [removeWithUndo]);

    const dispatcher = useMemo(
        () => createShortcutDispatcher(GLOBAL_BINDINGS),
        []
    );

    useEffect(() => {
        const handlers: Record<string, () => void> = {
            palette: () => (paletteOpen ? closePalette() : openPalette()),
            capture: () => openCapture('inbox'),
            search: () =>
                window.dispatchEvent(new Event('openUniversalSearch')),
            help: openHelp,
            'go-today': () => navigate('/today'),
            'go-inbox': () => navigate('/inbox'),
            'go-upcoming': () => navigate('/upcoming'),
            'go-calendar': () => navigate('/calendar'),
            'go-projects': () => navigate('/projects'),
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return;
            const hit = dispatcher(event);
            if (!hit) return;
            const handler = handlers[hit.id];
            if (!handler) return;
            event.preventDefault();
            handler();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [
        dispatcher,
        navigate,
        paletteOpen,
        openPalette,
        closePalette,
        openHelp,
    ]);

    return (
        <>
            {paletteOpen && (
                <CommandPalette
                    target={target}
                    startStep={startStep}
                    projects={projects}
                    actions={actions}
                    onClose={closePalette}
                    onOpenHelp={openHelp}
                    onToggleTheme={toggleDarkMode}
                    onCreateProject={openProjectModal}
                    onCreateNote={openNewNote}
                    onCreateHabit={openNewHabit}
                    onOpenTask={openTaskPanel}
                />
            )}
            {helpOpen && <ShortcutsHelp onClose={closeHelp} />}
        </>
    );
};

export default CommandCenter;
