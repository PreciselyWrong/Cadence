import React, { useEffect, useRef, useCallback } from 'react';
import { useIsMinimal } from '../../hooks/useUiDensity';

// Minimal task rows carry this attribute. The list moves focus between them
// with the arrow keys and keeps one row in the tab order (roving tabindex).
export const MINIMAL_ROW_ATTRIBUTE = 'data-minimal-task-row';
const ROW_SELECTOR = `[${MINIMAL_ROW_ATTRIBUTE}]`;

const isTextEntry = (el: HTMLElement): boolean =>
    el.matches('input, textarea, select, [contenteditable="true"]') ||
    el.isContentEditable;

export const useMinimalRowKeyboard = () => {
    const isMinimal = useIsMinimal();
    const listRef = useRef<HTMLDivElement>(null);

    const rowsOf = (list: HTMLElement): HTMLElement[] =>
        Array.from(list.querySelectorAll<HTMLElement>(ROW_SELECTOR));

    const setActiveRow = (rows: HTMLElement[], active: HTMLElement) => {
        rows.forEach((row) => {
            const isActive = row === active;
            row.tabIndex = isActive ? 0 : -1;
            row.dataset.rovingActive = isActive ? 'true' : 'false';
        });
    };

    // Runs after each render of the list so rows that mounted since the last
    // pass join the single tab stop.
    useEffect(() => {
        const list = listRef.current;
        if (!isMinimal || !list) return;
        const rows = rowsOf(list);
        if (rows.length === 0) return;
        const active =
            rows.find((row) => row.dataset.rovingActive === 'true') ?? rows[0];
        setActiveRow(rows, active);
    });

    const onListFocus = useCallback(
        (e: React.FocusEvent<HTMLDivElement>) => {
            if (!isMinimal || !listRef.current) return;
            const row = (e.target as HTMLElement).closest<HTMLElement>(
                ROW_SELECTOR
            );
            if (!row || !listRef.current.contains(row)) return;
            setActiveRow(rowsOf(listRef.current), row);
        },
        [isMinimal]
    );

    const onListKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (!isMinimal || !listRef.current) return;
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            const target = e.target as HTMLElement;
            if (isTextEntry(target)) return;
            const list = listRef.current;
            const row = target.closest<HTMLElement>(ROW_SELECTOR);
            if (!row || !list.contains(row)) return;
            const rows = rowsOf(list);
            const next =
                rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)];
            if (!next) return;
            e.preventDefault();
            setActiveRow(rows, next);
            next.focus();
        },
        [isMinimal]
    );

    return { listRef, onListKeyDown, onListFocus };
};

export default useMinimalRowKeyboard;
