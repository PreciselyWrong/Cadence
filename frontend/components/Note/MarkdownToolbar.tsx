import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AtSymbolIcon,
    BoldIcon,
    ChatBubbleBottomCenterTextIcon,
    CheckCircleIcon,
    CodeBracketIcon,
    ItalicIcon,
    LinkIcon,
    ListBulletIcon,
    NumberedListIcon,
    StrikethroughIcon,
    TableCellsIcon,
} from '@heroicons/react/24/outline';
import {
    TextEdit,
    TextSelection,
    addTableColumn,
    addTableRow,
    cycleHeading,
    insertLink,
    insertTable,
    insertText,
    removeTableColumn,
    removeTableRow,
    toggleCode,
    toggleLinePrefix,
    toggleWrap,
} from './editor/markdownFormat';

export type FormatCommand = (sel: TextSelection) => TextEdit | null;

interface MarkdownToolbarProps {
    // Applies a command to the editing surface's text and selection.
    run: (command: FormatCommand) => void;
    // Whether the caret is in a table (shows the row and column buttons).
    inTable?: boolean;
    className?: string;
}

const MAX_ROWS = 8;
const MAX_COLS = 6;

const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';
const SHIFT = isMac ? '⇧' : 'Shift+';

const buttonClass =
    'inline-flex h-8 min-w-[2rem] flex-shrink-0 items-center justify-center rounded-md px-1.5 text-gray-600 hover:bg-gray-200 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white';

const ToolButton: React.FC<{
    label: string;
    shortcut?: string;
    onClick: () => void;
    children: React.ReactNode;
    pressed?: boolean;
}> = ({ label, shortcut, onClick, children, pressed }) => (
    <button
        type="button"
        className={buttonClass}
        aria-label={label}
        aria-keyshortcuts={shortcut
            ?.replace('⌘', 'Meta+')
            .replace('⇧', 'Shift+')}
        aria-pressed={pressed}
        title={shortcut ? `${label} (${shortcut})` : label}
        // Keeps the editor focused, so its selection stays.
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
    >
        {children}
    </button>
);

const Divider = () => (
    <span
        aria-hidden="true"
        className="mx-0.5 h-5 w-px flex-shrink-0 bg-gray-300 dark:bg-gray-600"
    />
);

// Pick rows × columns on a grid; arrows move, Enter inserts, Escape closes.
const TablePicker: React.FC<{
    onPick: (rows: number, cols: number) => void;
    onClose: () => void;
}> = ({ onPick, onClose }) => {
    const { t } = useTranslation();
    const [hover, setHover] = useState({ rows: 2, cols: 2 });
    const gridRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        gridRef.current
            ?.querySelector<HTMLButtonElement>('[data-cell="2-2"]')
            ?.focus();
    }, []);

    const focusCell = (rows: number, cols: number) => {
        const r = Math.max(1, Math.min(MAX_ROWS, rows));
        const c = Math.max(1, Math.min(MAX_COLS, cols));
        setHover({ rows: r, cols: c });
        gridRef.current
            ?.querySelector<HTMLButtonElement>(`[data-cell="${r}-${c}"]`)
            ?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        const moves: Record<string, [number, number]> = {
            ArrowUp: [-1, 0],
            ArrowDown: [1, 0],
            ArrowLeft: [0, -1],
            ArrowRight: [0, 1],
        };
        if (moves[e.key]) {
            e.preventDefault();
            const [dr, dc] = moves[e.key];
            focusCell(hover.rows + dr, hover.cols + dc);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
        }
    };

    return (
        <div
            role="dialog"
            aria-label={t('editorToolbar.insertTable', 'Insert a table')}
            className="absolute bottom-full left-0 z-50 mb-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"
            onKeyDown={onKeyDown}
        >
            <div
                ref={gridRef}
                role="grid"
                className="grid gap-0.5"
                style={{ gridTemplateColumns: `repeat(${MAX_COLS}, 1.25rem)` }}
            >
                {Array.from({ length: MAX_ROWS }, (_, r) =>
                    Array.from({ length: MAX_COLS }, (_, c) => {
                        const rows = r + 1;
                        const cols = c + 1;
                        const lit = rows <= hover.rows && cols <= hover.cols;
                        return (
                            <button
                                key={`${rows}-${cols}`}
                                type="button"
                                data-cell={`${rows}-${cols}`}
                                tabIndex={
                                    rows === hover.rows && cols === hover.cols
                                        ? 0
                                        : -1
                                }
                                aria-label={t(
                                    'editorToolbar.tableSize',
                                    '{{rows}} rows × {{cols}} columns',
                                    { rows, cols }
                                )}
                                className={`h-5 w-5 rounded-sm border focus:outline-none ${
                                    lit
                                        ? 'border-primary bg-primary-container'
                                        : 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-700'
                                }`}
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => setHover({ rows, cols })}
                                onFocus={() => setHover({ rows, cols })}
                                onClick={() => onPick(rows, cols)}
                            />
                        );
                    })
                )}
            </div>
            <p
                aria-live="polite"
                className="mt-1.5 text-center text-xs tabular-nums text-gray-600 dark:text-gray-300"
            >
                {hover.rows} × {hover.cols}
            </p>
        </div>
    );
};

// Formatting bar under a Markdown editor. Every button runs a pure text
// command (editor/markdownFormat.ts) through `run`, so any editing surface
// can host it.
const MarkdownToolbar: React.FC<MarkdownToolbarProps> = ({
    run,
    inTable = false,
    className = '',
}) => {
    const { t } = useTranslation();
    const [tableOpen, setTableOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!tableOpen) return;
        const close = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node)) {
                setTableOpen(false);
            }
        };
        window.addEventListener('mousedown', close, true);
        return () => window.removeEventListener('mousedown', close, true);
    }, [tableOpen]);

    // [[ and @ open the editor's link and person pickers; selected text
    // becomes their search.
    const startPicker = (trigger: string) => (sel: TextSelection) =>
        insertText(
            sel,
            `${trigger}${sel.doc.slice(sel.from, sel.to).replace(/\n/g, ' ')}`
        );

    return (
        <div ref={wrapRef} className={`relative ${className}`}>
            <div
                role="toolbar"
                aria-label={t('editorToolbar.label', 'Formatting')}
                data-testid="markdown-toolbar"
                className="flex items-center gap-0.5 overflow-x-auto border-t border-gray-200 bg-gray-50/90 px-1 py-1 dark:border-gray-700 dark:bg-gray-900/90"
            >
                <ToolButton
                    label={t('editorToolbar.bold', 'Bold')}
                    shortcut={`${MOD}B`}
                    onClick={() => run((s) => toggleWrap(s, '**'))}
                >
                    <BoldIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.italic', 'Italic')}
                    shortcut={`${MOD}I`}
                    onClick={() => run((s) => toggleWrap(s, '_'))}
                >
                    <ItalicIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.strikethrough', 'Strikethrough')}
                    shortcut={`${MOD}${SHIFT}X`}
                    onClick={() => run((s) => toggleWrap(s, '~~'))}
                >
                    <StrikethroughIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.heading', 'Heading')}
                    shortcut={`${MOD}1`}
                    onClick={() => run(cycleHeading)}
                >
                    <span className="text-sm font-bold">H</span>
                </ToolButton>
                <Divider />
                <ToolButton
                    label={t('editorToolbar.bulletList', 'Bulleted list')}
                    onClick={() => run((s) => toggleLinePrefix(s, 'bullet'))}
                >
                    <ListBulletIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.numberedList', 'Numbered list')}
                    onClick={() => run((s) => toggleLinePrefix(s, 'number'))}
                >
                    <NumberedListIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.checklist', 'Checklist')}
                    onClick={() => run((s) => toggleLinePrefix(s, 'task'))}
                >
                    <CheckCircleIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.quote', 'Quote')}
                    onClick={() => run((s) => toggleLinePrefix(s, 'quote'))}
                >
                    <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.code', 'Code')}
                    shortcut={`${MOD}E`}
                    onClick={() => run(toggleCode)}
                >
                    <CodeBracketIcon className="h-4 w-4" />
                </ToolButton>
                <Divider />
                <ToolButton
                    label={t('editorToolbar.link', 'Link')}
                    shortcut={`${MOD}K`}
                    onClick={() => run(insertLink)}
                >
                    <LinkIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.noteLink', 'Link to a note')}
                    onClick={() => run(startPicker('[['))}
                >
                    <span className="font-mono text-xs font-semibold">
                        [[ ]]
                    </span>
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.mention', 'Mention a person')}
                    onClick={() => run(startPicker('@'))}
                >
                    <AtSymbolIcon className="h-4 w-4" />
                </ToolButton>
                <ToolButton
                    label={t('editorToolbar.table', 'Table')}
                    pressed={tableOpen}
                    onClick={() => setTableOpen((open) => !open)}
                >
                    <TableCellsIcon className="h-4 w-4" />
                </ToolButton>
                {inTable && (
                    <>
                        <Divider />
                        <ToolButton
                            label={t('editorToolbar.addRow', 'Add a row')}
                            onClick={() => run(addTableRow)}
                        >
                            <span className="text-xs">+ ≡</span>
                        </ToolButton>
                        <ToolButton
                            label={t(
                                'editorToolbar.removeRow',
                                'Remove the row'
                            )}
                            onClick={() => run(removeTableRow)}
                        >
                            <span className="text-xs">− ≡</span>
                        </ToolButton>
                        <ToolButton
                            label={t('editorToolbar.addColumn', 'Add a column')}
                            onClick={() => run(addTableColumn)}
                        >
                            <span className="text-xs">+ ‖</span>
                        </ToolButton>
                        <ToolButton
                            label={t(
                                'editorToolbar.removeColumn',
                                'Remove the column'
                            )}
                            onClick={() => run(removeTableColumn)}
                        >
                            <span className="text-xs">− ‖</span>
                        </ToolButton>
                    </>
                )}
            </div>
            {tableOpen && (
                <TablePicker
                    onClose={() => setTableOpen(false)}
                    onPick={(rows, cols) => {
                        setTableOpen(false);
                        run((s) =>
                            insertTable(s, rows, cols, (col) =>
                                t('editorToolbar.column', 'Column {{n}}', {
                                    n: col + 1,
                                })
                            )
                        );
                    }}
                />
            )}
        </div>
    );
};

export default MarkdownToolbar;
