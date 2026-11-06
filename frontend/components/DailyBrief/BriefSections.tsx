import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    BriefAnticipate,
    BriefMove,
    BriefReply,
    BriefTaskState,
    BriefTonightItem,
    DailyBrief,
} from '../../utils/dailyBriefService';
import { isTaskCompleted } from '../../constants/taskStatus';
import BriefTaskRow from './BriefTaskRow';
import { minutesText, shortDay } from './briefTime';

// The actions of the page, passed down: the page owns the requests and the
// optimistic task state. Drafts (phase 5) add no action here on purpose.
export interface BriefActions {
    onToggle: (uid: string) => void;
    onOpen: (uid: string) => void;
    onAcceptMove: (move: BriefMove, target?: string) => void;
    onFeedback: (
        card: { key: string; type: string },
        vote: 'useful' | 'noise'
    ) => void;
}

export interface BriefSectionProps {
    brief: DailyBrief;
    tasks: Record<string, BriefTaskState>;
    locale: string;
    actions: BriefActions;
    hiddenMoves: Set<string>;
}

export const SectionTitle: React.FC<{
    title: string;
    detail?: string;
}> = ({ title, detail }) => (
    <h2 className="mb-2 mt-7 flex items-baseline justify-between gap-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
        {detail && (
            <span className="text-[13px] font-normal tabular-nums text-gray-600 dark:text-gray-300">
                {detail}
            </span>
        )}
    </h2>
);

export const TonightSection: React.FC<BriefSectionProps> = ({
    brief,
    tasks,
    actions,
    locale,
}) => {
    const { t } = useTranslation();
    const rows = brief.tonight.filter((item) => tasks[item.task_uid]);
    if (rows.length === 0) return null;
    const { capacity_minutes: capacity, tonight_minutes: planned } =
        brief.counters;
    const detail =
        capacity === null
            ? minutesText(planned, t)
            : t('dailyBrief.tonight.ofCapacity', '{{planned}} / {{capacity}}', {
                  planned: minutesText(planned, t),
                  capacity: minutesText(capacity, t),
              });
    return (
        <section
            aria-label={t(
                'dailyBrief.sectionName.tonight',
                'Priorités du jour'
            )}
        >
            <SectionTitle
                title={t('dailyBrief.sectionName.tonight', 'Priorités du jour')}
                detail={detail}
            />
            {rows.map((item: BriefTonightItem) => {
                const task = tasks[item.task_uid];
                const meta = [
                    task.project_name,
                    item.reason,
                    item.reason_code === 'money' && task.due_date
                        ? shortDay(task.due_date, locale)
                        : null,
                    minutesText(item.minutes, t),
                ]
                    .filter(Boolean)
                    .join(' · ');
                return (
                    <BriefTaskRow
                        key={item.task_uid}
                        name={task.name}
                        done={isTaskCompleted(task.status)}
                        onToggle={() => actions.onToggle(item.task_uid)}
                        onOpen={() => actions.onOpen(item.task_uid)}
                        meta={meta}
                    />
                );
            })}
        </section>
    );
};

export const MovesSection: React.FC<BriefSectionProps> = ({
    brief,
    tasks,
    locale,
    actions,
    hiddenMoves,
}) => {
    const { t } = useTranslation();
    const rows = brief.moves.filter(
        (move) => tasks[move.task_uid] && !hiddenMoves.has(move.proposal_key)
    );
    if (rows.length === 0) return null;
    return (
        <section aria-label={t('dailyBrief.sectionName.moves', 'À déplacer')}>
            <SectionTitle
                title={t('dailyBrief.sectionName.moves', 'À déplacer')}
            />
            {rows.map((move) => (
                <MoveRow
                    key={move.proposal_key}
                    move={move}
                    task={tasks[move.task_uid]}
                    locale={locale}
                    actions={actions}
                />
            ))}
        </section>
    );
};

// The proposed day stays one click away; "Other date" opens the date field.
const MoveRow: React.FC<{
    move: BriefMove;
    task: BriefTaskState;
    locale: string;
    actions: BriefActions;
}> = ({ move, task, locale, actions }) => {
    const { t } = useTranslation();
    const [picking, setPicking] = useState(false);
    const target = shortDay(move.to, locale);
    return (
        <BriefTaskRow
            name={task.name}
            done={isTaskCompleted(task.status)}
            onToggle={() => actions.onToggle(move.task_uid)}
            onOpen={() => actions.onOpen(move.task_uid)}
            meta={move.reason}
            footer={
                picking ? (
                    <input
                        type="date"
                        aria-label={t(
                            'dailyBrief.moves.otherDate',
                            'Autre date'
                        )}
                        defaultValue={move.to}
                        onKeyDown={(event) => {
                            if (event.key === 'Escape') setPicking(false);
                        }}
                        onChange={(event) => {
                            const date = event.target.value;
                            if (!date) return;
                            setPicking(false);
                            actions.onAcceptMove(move, date);
                        }}
                        className="mt-2 rounded-md border border-gray-300 bg-white px-2 py-1 text-[13px] dark:border-gray-600 dark:bg-gray-900"
                    />
                ) : undefined
            }
            trailing={
                <div className="flex flex-none items-center gap-1">
                    <button
                        type="button"
                        onClick={() => setPicking((open) => !open)}
                        className="h-8 rounded-full px-2 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                        {t('dailyBrief.moves.otherDate', 'Autre date')}
                    </button>
                    <button
                        type="button"
                        onClick={() => actions.onAcceptMove(move)}
                        aria-label={t(
                            'dailyBrief.moves.acceptAria',
                            'Déplacer au {{date}}',
                            { date: target }
                        )}
                        className="flex h-8 items-center gap-1 rounded-full bg-indigo-100 px-3 text-[13px] font-semibold text-indigo-900 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-100 dark:hover:bg-indigo-900"
                    >
                        {target} →
                    </button>
                </div>
            }
        />
    );
};

const AnticipateItem: React.FC<{
    item: BriefAnticipate;
    actions: BriefActions;
}> = ({ item, actions }) => {
    const { t } = useTranslation();
    const [voted, setVoted] = useState<'noise' | null>(null);
    const [menuOpen, setMenuOpen] = useState(false);

    return (
        <div className="border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-800">
            <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[15px] text-gray-900 dark:text-gray-100">
                    {item.text}
                </p>
                {voted === null && (
                    <div className="relative flex-none">
                        <button
                            type="button"
                            aria-label={t(
                                'dailyBrief.anticipate.options',
                                'Options de cette alerte'
                            )}
                            aria-expanded={menuOpen}
                            onClick={() => setMenuOpen((open) => !open)}
                            className="h-7 w-7 rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                            ⋯
                        </button>
                        {menuOpen && (
                            <button
                                type="button"
                                onClick={() => {
                                    setMenuOpen(false);
                                    setVoted('noise');
                                    actions.onFeedback(item, 'noise');
                                }}
                                className="absolute right-0 top-8 z-10 whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm text-gray-900 shadow-lg ring-1 ring-black/5 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                            >
                                {t(
                                    'dailyBrief.anticipate.less',
                                    'Moins de ce type'
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>
            {voted === 'noise' && (
                <p
                    role="status"
                    className="mt-1 text-xs text-gray-600 dark:text-gray-300"
                >
                    {t(
                        'dailyBrief.feedback.fewer',
                        'Tu verras moins ce type d’alerte'
                    )}
                </p>
            )}
        </div>
    );
};

export const AnticipateSection: React.FC<BriefSectionProps> = ({
    brief,
    actions,
}) => {
    const { t } = useTranslation();
    if (brief.anticipate.length === 0) return null;
    return (
        <section
            aria-label={t('dailyBrief.sectionName.anticipate', 'À anticiper')}
        >
            <SectionTitle
                title={t('dailyBrief.sectionName.anticipate', 'À anticiper')}
            />
            {brief.anticipate.map((item) => (
                <AnticipateItem key={item.key} item={item} actions={actions} />
            ))}
        </section>
    );
};

export const RepliesSection: React.FC<BriefSectionProps> = ({
    brief,
    locale,
}) => {
    const { t } = useTranslation();
    if (brief.replies.length === 0) return null;
    return (
        <section
            aria-label={t(
                'dailyBrief.sectionName.replies',
                'Réponses attendues'
            )}
        >
            <SectionTitle
                title={t(
                    'dailyBrief.sectionName.replies',
                    'Réponses attendues'
                )}
            />
            {brief.replies.map((reply: BriefReply) => (
                <div
                    key={reply.thread_ref}
                    className="border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-800"
                >
                    <div className="text-[15px] text-gray-900 dark:text-gray-100">
                        {reply.from} · {reply.subject}
                    </div>
                    <div className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300">
                        {reply.summary ||
                            new Intl.DateTimeFormat(locale, {
                                day: 'numeric',
                                month: 'short',
                            }).format(new Date(reply.date))}
                    </div>
                </div>
            ))}
        </section>
    );
};

export const InboxSection: React.FC<BriefSectionProps> = ({ brief }) => {
    const { t } = useTranslation();
    if (brief.inbox.length === 0) return null;
    return (
        <section aria-label={t('dailyBrief.sectionName.inbox', 'Inbox')}>
            <SectionTitle title={t('dailyBrief.sectionName.inbox', 'Inbox')} />
            {brief.inbox.map((item) => (
                <div
                    key={item.uid}
                    className="border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-800"
                >
                    <div className="text-[15px] text-gray-900 dark:text-gray-100">
                        {item.title}
                    </div>
                    {item.proposal?.reason && (
                        <div className="mt-0.5 text-[13px] text-gray-600 dark:text-gray-300">
                            {item.proposal?.reason}
                        </div>
                    )}
                </div>
            ))}
        </section>
    );
};

export const ResolvedSection: React.FC<BriefSectionProps> = ({
    brief,
    tasks,
    actions,
}) => {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const rows = brief.resolved.filter((item) => tasks[item.task_uid]);
    if (rows.length === 0) return null;
    return (
        <section aria-label={t('dailyBrief.sectionName.resolved', 'Réglé')}>
            <h2 className="mb-2 mt-7">
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((current) => !current)}
                    className="flex w-full items-baseline justify-between gap-3 text-sm font-semibold text-gray-900 dark:text-gray-100"
                >
                    {t('dailyBrief.sectionName.resolved', 'Réglé')}
                    <span className="text-[13px] font-normal tabular-nums text-gray-600 dark:text-gray-300">
                        {rows.length} {open ? '▴' : '▾'}
                    </span>
                </button>
            </h2>
            {(open ? rows : []).map((item) => {
                const task = tasks[item.task_uid];
                return (
                    <BriefTaskRow
                        key={item.task_uid}
                        name={task.name}
                        done={isTaskCompleted(task.status)}
                        onToggle={() => actions.onToggle(item.task_uid)}
                        onOpen={() => actions.onOpen(item.task_uid)}
                    />
                );
            })}
        </section>
    );
};

// One discreet feedback on the whole screen, at its foot.
export const ScreenFeedback: React.FC<{
    date: string;
    onFeedback: BriefActions['onFeedback'];
}> = ({ date, onFeedback }) => {
    const { t } = useTranslation();
    const [voted, setVoted] = useState<'useful' | 'noise' | null>(null);
    const vote = (value: 'useful' | 'noise') => {
        setVoted(value);
        onFeedback({ key: `brief:${date}`, type: 'brief' }, value);
    };
    return (
        <div className="mt-8 flex items-center gap-3 text-xs text-gray-600 dark:text-gray-300">
            {voted ? (
                <span role="status">
                    {voted === 'useful'
                        ? t('dailyBrief.feedback.useful', 'Utile')
                        : t('dailyBrief.feedback.noise', 'Pas utile')}
                </span>
            ) : (
                <>
                    <span>
                        {t(
                            'dailyBrief.feedback.question',
                            'Cet écran t’a aidé ?'
                        )}
                    </span>
                    <button
                        type="button"
                        onClick={() => vote('useful')}
                        className="py-1 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                        {t('dailyBrief.feedback.useful', 'Utile')}
                    </button>
                    <button
                        type="button"
                        onClick={() => vote('noise')}
                        className="py-1 hover:text-gray-900 dark:hover:text-gray-100"
                    >
                        {t('dailyBrief.feedback.noise', 'Pas utile')}
                    </button>
                </>
            )}
        </div>
    );
};
