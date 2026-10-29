import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleIcon,
    ClipboardDocumentIcon,
    ArrowDownTrayIcon,
    PrinterIcon,
} from '@heroicons/react/24/outline';
import {
    buildCsv,
    buildMarkdown,
    buildText,
    groupTasks,
    periodRange,
    SummaryGroupBy,
    SummaryPeriod,
} from './summaryExport';
import { getUserTimezone } from '../../utils/dateUtils';
import { fetchSummary, SummaryResponse } from '../../utils/summaryService';
import {
    fetchProfile,
    getFirstDayOfWeek,
    updateUiSettings,
} from '../../utils/profileService';

const GROUPINGS: SummaryGroupBy[] = ['project', 'day', 'status'];
const PERIODS: SummaryPeriod[] = [
    'today',
    'this_week',
    'last_week',
    'this_month',
    'custom',
];

function download(filename: string, content: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

const SummaryPage: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [period, setPeriod] = useState<SummaryPeriod>('this_week');
    const [firstDayOfWeek, setFirstDayOfWeek] = useState(1);
    const initial = periodRange('this_week');
    const [customStart, setCustomStart] = useState(initial.start);
    const [customEnd, setCustomEnd] = useState(initial.end);
    const [groupBy, setGroupBy] = useState<SummaryGroupBy>('project');
    const [includeOpen, setIncludeOpen] = useState(false);
    const [data, setData] = useState<SummaryResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        getFirstDayOfWeek()
            .then(setFirstDayOfWeek)
            .catch(() => undefined);
        fetchProfile()
            .then((profile) => {
                const saved = profile.ui_settings?.summary;
                if (saved) {
                    if (GROUPINGS.includes(saved.group_by as SummaryGroupBy))
                        setGroupBy(saved.group_by as SummaryGroupBy);
                    setIncludeOpen(Boolean(saved.include_open));
                }
            })
            .catch(() => undefined);
    }, []);

    const range = useMemo(
        () =>
            period === 'custom'
                ? { start: customStart, end: customEnd }
                : periodRange(
                      period,
                      new Date(),
                      firstDayOfWeek,
                      getUserTimezone()
                  ),
        [period, customStart, customEnd, firstDayOfWeek]
    );

    useEffect(() => {
        if (!range.start || !range.end) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchSummary(range.start, range.end, includeOpen)
            .then((res) => {
                if (!cancelled) setData(res);
            })
            .catch((err: Error) => {
                if (!cancelled) {
                    setData(null);
                    setError(err.message);
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [range.start, range.end, includeOpen]);

    const statusLabel = useCallback(
        (status: string) => t(`summary.status.${status}`, status),
        [t]
    );

    const formatDay = useCallback(
        (date: string) => {
            const [y, m, d] = date.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString(i18n.language, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        },
        [i18n.language]
    );

    const groups = useMemo(
        () =>
            groupTasks(data?.tasks || [], groupBy, {
                noProject: t('summary.noProject', 'No project'),
                noDate: t('summary.noDate', 'No date'),
                status: statusLabel,
                day: formatDay,
            }),
        [data, groupBy, t, statusLabel, formatDay]
    );

    const title = t('summary.exportTitle', 'Summary {{start}} – {{end}}', {
        start: range.start,
        end: range.end,
    });
    const fileBase = `summary-${range.start}-${range.end}`;

    const flash = (message: string) => {
        setNotice(message);
        window.setTimeout(() => setNotice(null), 2500);
    };

    const copyMarkdown = async () => {
        try {
            await navigator.clipboard.writeText(buildMarkdown(title, groups));
            flash(t('summary.copied', 'Copied to clipboard'));
        } catch {
            flash(t('summary.copyFailed', 'Could not copy to clipboard'));
        }
    };

    const csv = () =>
        buildCsv(
            groups.flatMap((g) => g.tasks),
            {
                name: t('summary.csv.name', 'Task'),
                status: t('summary.csv.status', 'Status'),
                project: t('summary.csv.project', 'Project'),
                completed: t('summary.csv.completed', 'Completed'),
                due: t('summary.csv.due', 'Due'),
                tags: t('summary.csv.tags', 'Tags'),
            },
            statusLabel
        );

    const saveTemplate = async () => {
        try {
            await updateUiSettings({
                summary: { group_by: groupBy, include_open: includeOpen },
            });
            flash(t('summary.templateSaved', 'Template saved'));
        } catch {
            flash(t('summary.templateFailed', 'Could not save the template'));
        }
    };

    const buttonClass =
        'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50';
    const selectClass =
        'px-2 py-1.5 text-sm rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100';
    const empty = groups.length === 0;

    return (
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-8">
            <h2 className="text-2xl font-light mb-6 no-print">
                {t('sidebar.summary', 'Summary')}
            </h2>

            <div className="flex flex-wrap items-end gap-4 mb-4 no-print">
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                    {t('summary.period', 'Period')}
                    <select
                        className={selectClass}
                        value={period}
                        onChange={(e) =>
                            setPeriod(e.target.value as SummaryPeriod)
                        }
                    >
                        {PERIODS.map((p) => (
                            <option key={p} value={p}>
                                {t(`summary.periods.${p}`, p)}
                            </option>
                        ))}
                    </select>
                </label>
                {period === 'custom' && (
                    <>
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t('summary.from', 'From')}
                            <input
                                type="date"
                                className={selectClass}
                                value={customStart}
                                onChange={(e) => setCustomStart(e.target.value)}
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-gray-500">
                            {t('summary.to', 'To')}
                            <input
                                type="date"
                                className={selectClass}
                                value={customEnd}
                                onChange={(e) => setCustomEnd(e.target.value)}
                            />
                        </label>
                    </>
                )}
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                    {t('summary.groupBy', 'Group by')}
                    <select
                        className={selectClass}
                        value={groupBy}
                        onChange={(e) =>
                            setGroupBy(e.target.value as SummaryGroupBy)
                        }
                    >
                        {GROUPINGS.map((g) => (
                            <option key={g} value={g}>
                                {t(`summary.groupings.${g}`, g)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200 pb-1.5">
                    <input
                        type="checkbox"
                        checked={includeOpen}
                        onChange={(e) => setIncludeOpen(e.target.checked)}
                    />
                    {t(
                        'summary.includeOpen',
                        'Include open tasks due in this period'
                    )}
                </label>
                <button
                    type="button"
                    className={buttonClass}
                    onClick={saveTemplate}
                >
                    {t('summary.saveTemplate', 'Save as template')}
                </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-6 no-print">
                <button
                    type="button"
                    className={buttonClass}
                    onClick={copyMarkdown}
                    disabled={empty}
                >
                    <ClipboardDocumentIcon className="h-4 w-4" />
                    {t('summary.copyMarkdown', 'Copy as Markdown')}
                </button>
                <button
                    type="button"
                    className={buttonClass}
                    disabled={empty}
                    onClick={() =>
                        download(
                            `${fileBase}.md`,
                            buildMarkdown(title, groups),
                            'text/markdown;charset=utf-8'
                        )
                    }
                >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {t('summary.downloadMd', 'Download .md')}
                </button>
                <button
                    type="button"
                    className={buttonClass}
                    disabled={empty}
                    onClick={() =>
                        download(
                            `${fileBase}.txt`,
                            buildText(title, groups),
                            'text/plain;charset=utf-8'
                        )
                    }
                >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {t('summary.downloadTxt', 'Download .txt')}
                </button>
                <button
                    type="button"
                    className={buttonClass}
                    disabled={empty}
                    onClick={() =>
                        download(
                            `${fileBase}.csv`,
                            '﻿' + csv(),
                            'text/csv;charset=utf-8'
                        )
                    }
                >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    {t('summary.downloadCsv', 'Download .csv')}
                </button>
                <button
                    type="button"
                    className={buttonClass}
                    disabled={empty}
                    onClick={() => window.print()}
                >
                    <PrinterIcon className="h-4 w-4" />
                    {t('summary.print', 'Print')}
                </button>
                {notice && (
                    <span
                        role="status"
                        className="self-center text-sm text-gray-500"
                    >
                        {notice}
                    </span>
                )}
            </div>

            <div id="summary-print">
                <h3 className="text-lg font-medium mb-1">{title}</h3>
                {data && (
                    <p className="text-sm text-gray-500 mb-4">
                        {t(
                            'summary.counts',
                            '{{completed}} completed, {{open}} open',
                            {
                                completed: data.completed_count,
                                open: data.open_count,
                            }
                        )}
                    </p>
                )}
                {loading && (
                    <p className="text-sm text-gray-500 no-print">
                        {t('common.loading', 'Loading...')}
                    </p>
                )}
                {error && <p className="text-sm text-red-500">{error}</p>}
                {!loading && !error && empty && (
                    <p className="text-sm text-gray-500">
                        {t('summary.empty', 'No tasks in this period.')}
                    </p>
                )}
                {groups.map((group) => (
                    <section key={group.key || '__none'} className="mb-5">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1.5">
                            {group.label}{' '}
                            <span className="text-gray-400 font-normal">
                                ({group.tasks.length})
                            </span>
                        </h4>
                        <ul className="flex flex-col gap-1">
                            {group.tasks.map((task) => (
                                <li
                                    key={task.uid}
                                    className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100"
                                >
                                    {task.status === 'done' ? (
                                        <CheckCircleIcon className="h-4 w-4 mt-0.5 text-green-500 flex-shrink-0" />
                                    ) : (
                                        <span className="h-4 w-4 mt-0.5 rounded-full border border-gray-400 flex-shrink-0" />
                                    )}
                                    <span>
                                        {task.name}
                                        {task.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="ml-1.5 text-xs text-gray-500"
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
};

export default SummaryPage;
