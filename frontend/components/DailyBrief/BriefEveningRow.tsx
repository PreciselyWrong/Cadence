import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EllipsisHorizontalIcon } from '@heroicons/react/24/outline';
import { isTaskCancelled } from '../../constants/taskStatus';
import type { StatusType } from '../../entities/Task';
import BriefTaskRow from './BriefTaskRow';
import { shortDay } from './briefTime';

// What the evening review did to a row. The row shows it until the next
// action; the undo toast of the action restores the row before it.
export type EveningHandled =
    | { kind: 'tomorrow' }
    | { kind: 'due'; date: string }
    | { kind: 'later' }
    | { kind: 'cancelled' };

export interface EveningRowActions {
    onTomorrow: (uid: string) => void;
    onSetDue: (uid: string, date: string) => void;
    onLater: (uid: string) => void;
    onCancel: (uid: string) => void;
}

interface BriefEveningRowProps {
    uid: string;
    name: string;
    done: boolean;
    status: StatusType | number;
    meta?: string;
    dueDate: string | null;
    recurring?: boolean;
    handled?: EveningHandled;
    actionable: boolean;
    locale: string;
    actions: EveningRowActions;
    onToggle: () => void;
    onOpen: () => void;
}

// A tonight or slipped row: the completion circle, and one "…" menu with the
// four evening actions. The date picker opens under the title.
const BriefEveningRow: React.FC<BriefEveningRowProps> = ({
    uid,
    name,
    done,
    status,
    meta,
    dueDate,
    recurring = false,
    handled,
    actionable,
    locale,
    actions,
    onToggle,
    onOpen,
}) => {
    const { t } = useTranslation();
    const [menuOpen, setMenuOpen] = useState(false);
    const [picking, setPicking] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!menuOpen) return;
        const onPointer = (event: MouseEvent) => {
            if (!menuRef.current?.contains(event.target as Node)) {
                setMenuOpen(false);
            }
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const handledLabel = (() => {
        if (!handled) return null;
        switch (handled.kind) {
            case 'tomorrow':
                return t('dailyBrief.evening.actions.tomorrow', 'Demain');
            case 'due':
                return t(
                    'dailyBrief.evening.state.due',
                    'Échéance : {{date}}',
                    {
                        date: shortDay(handled.date, locale),
                    }
                );
            case 'later':
                return t('dailyBrief.evening.actions.later', 'Plus tard');
            case 'cancelled':
                return t('dailyBrief.evening.state.cancelled', 'Abandonnée');
        }
    })();

    const menuItems = [
        {
            key: 'tomorrow',
            label: t('dailyBrief.evening.actions.tomorrow', 'Demain'),
            run: () => actions.onTomorrow(uid),
        },
        ...(recurring
            ? []
            : [
                  {
                      key: 'date',
                      label: t(
                          'dailyBrief.evening.actions.dueDate',
                          'Choisir une date'
                      ),
                      run: () => setPicking(true),
                  },
              ]),
        {
            key: 'later',
            label: t('dailyBrief.evening.actions.later', 'Plus tard'),
            run: () => actions.onLater(uid),
        },
        {
            key: 'cancel',
            label: t('dailyBrief.evening.actions.cancel', 'Abandonner'),
            run: () => actions.onCancel(uid),
        },
    ];

    const trailing = actionable ? (
        <div
            ref={menuRef}
            className="relative flex flex-none items-start gap-1"
        >
            {handledLabel && (
                <span className="mt-1 whitespace-nowrap text-[13px] text-gray-600 dark:text-gray-300">
                    {handledLabel}
                </span>
            )}
            <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={t(
                    'dailyBrief.evening.actions.menu',
                    'Actions pour « {{name}} »',
                    { name }
                )}
                onClick={() => setMenuOpen((open) => !open)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-300 dark:hover:bg-gray-800"
            >
                <EllipsisHorizontalIcon className="h-5 w-5" />
            </button>
            {menuOpen && (
                <div
                    role="menu"
                    className="absolute right-0 top-9 z-10 min-w-[11rem] rounded-xl border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
                >
                    {menuItems.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setMenuOpen(false);
                                item.run();
                            }}
                            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-gray-100 dark:hover:bg-gray-800"
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    ) : undefined;

    const footer =
        actionable && picking ? (
            <label className="mt-2 flex items-center gap-2 text-[13px] text-gray-600 dark:text-gray-300">
                <input
                    type="date"
                    aria-label={t(
                        'dailyBrief.evening.actions.dueLabel',
                        'Échéance'
                    )}
                    value={dueDate ?? ''}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') setPicking(false);
                    }}
                    onChange={(event) => {
                        const date = event.target.value;
                        if (!date) return;
                        setPicking(false);
                        actions.onSetDue(uid, date);
                    }}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-[13px] dark:border-gray-600 dark:bg-gray-900"
                />
            </label>
        ) : undefined;

    return (
        <BriefTaskRow
            name={name}
            done={done}
            struck={isTaskCancelled(status)}
            onToggle={onToggle}
            onOpen={onOpen}
            meta={meta}
            trailing={trailing}
            footer={footer}
        />
    );
};

export default BriefEveningRow;
