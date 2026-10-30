import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { XMarkIcon } from '@heroicons/react/24/outline';
import {
    SHORTCUT_DEFS,
    ShortcutGroup,
    shortcutKeyCaps,
} from '../../utils/shortcutRegistry';

interface ShortcutsHelpProps {
    onClose: () => void;
}

const GROUPS: Array<{ id: ShortcutGroup; key: string; fallback: string }> = [
    { id: 'general', key: 'commandCenter.help.general', fallback: 'General' },
    {
        id: 'navigation',
        key: 'commandCenter.help.navigation',
        fallback: 'Go to',
    },
    { id: 'task', key: 'commandCenter.help.task', fallback: 'On a task' },
    { id: 'create', key: 'commandCenter.help.create', fallback: 'Create' },
    {
        id: 'triage',
        key: 'commandCenter.help.triage',
        fallback: 'Inbox triage',
    },
];

const ShortcutsHelp: React.FC<ShortcutsHelpProps> = ({ onClose }) => {
    const { t } = useTranslation();
    const closeRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        closeRef.current?.focus();
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' || event.key === '?') {
                event.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[10200] flex items-start justify-center pt-[8vh] px-3"
            data-testid="shortcuts-help"
        >
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-gray-900/30 dark:bg-black/60"
                onMouseDown={onClose}
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-label={t('commandCenter.help.title', 'Keyboard shortcuts')}
                className="relative w-full max-w-[720px] max-h-[82vh] overflow-y-auto rounded-xl bg-white dark:bg-gray-800 shadow-2xl ring-1 ring-gray-200 dark:ring-gray-700"
            >
                <div className="sticky top-0 flex items-center justify-between px-5 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {t('commandCenter.help.title', 'Keyboard shortcuts')}
                    </h2>
                    <button
                        ref={closeRef}
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close', 'Close')}
                        className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>
                <div className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2">
                    {GROUPS.map((group) => {
                        const defs = SHORTCUT_DEFS.filter(
                            (def) => def.group === group.id
                        );
                        return (
                            <section key={group.id}>
                                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {t(group.key, group.fallback)}
                                </h3>
                                <ul className="space-y-1.5">
                                    {defs.map((def) => (
                                        <li
                                            key={def.id}
                                            className="flex items-center justify-between gap-3 text-sm text-gray-800 dark:text-gray-200"
                                        >
                                            <span>
                                                {t(
                                                    def.labelKey,
                                                    def.defaultLabel
                                                )}
                                            </span>
                                            <span className="flex items-center gap-1 flex-shrink-0">
                                                {shortcutKeyCaps(def.id).map(
                                                    (cap, index) => (
                                                        <kbd
                                                            key={`${cap}-${index}`}
                                                            className="min-w-[1.25rem] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-[11px] font-mono text-gray-600 dark:text-gray-300 text-center"
                                                        >
                                                            {cap}
                                                        </kbd>
                                                    )
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ShortcutsHelp;
