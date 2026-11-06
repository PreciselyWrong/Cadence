import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    BriefAnticipate,
    BriefMove,
    BriefReply,
    BriefSource,
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
    onAcceptMove: (move: BriefMove) => void;
    onRefuseMove: (move: BriefMove) => void;
    onAnswer: (item: BriefAnticipate, answer: string) => void;
    onFeedback: (item: BriefAnticipate, vote: 'useful' | 'noise') => void;
}

export interface BriefSectionProps {
    brief: DailyBrief;
    tasks: Record<string, BriefTaskState>;
    locale: string;
    actions: BriefActions;
    hiddenMoves: Set<string>;
    answered: Record<string, string>;
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
            : t(
                  'dailyBrief.tonight.ofCapacity',
                  '{{planned}} / {{capacity}}',
                  {
                      planned: minutesText(planned, t),
                      capacity: minutesText(capacity, t),
                  }
              );
    return (
        <section
            aria-label={t('dailyBrief.sectionName.tonight', 'Priorités du jour')}
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
            {rows.map((move) => {
                const task = tasks[move.task_uid];
                const target = shortDay(move.to, locale);
                return (
                    <BriefTaskRow
                        key={move.proposal_key}
                        name={task.name}
                        done={isTaskCompleted(task.status)}
                        onToggle={() => actions.onToggle(move.task_uid)}
                        onOpen={() => actions.onOpen(move.task_uid)}
                        meta={move.reason}
                        trailing={
                            <div className="flex flex-none items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => actions.onRefuseMove(move)}
                                    className="h-8 rounded-full px-2 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                >
                                    {t(
                                        'dailyBrief.moves.refuse',
                                        'Pas cette date'
                                    )}
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
            })}
        </section>
    );
};

const AnticipateItem: React.FC<{
    item: BriefAnticipate;
    answer: string | undefined;
    actions: BriefActions;
}> = ({ item, answer, actions }) => {
    const { t } = useTranslation();
    const [precising, setPrecising] = useState(false);
    const [text, setText] = useState('');
    const [voted, setVoted] = useState<'useful' | 'noise' | null>(null);
    const question = item.question;
    const answerButton =
        'h-10 rounded-lg px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-900/30';

    return (
        <div className="border-t border-gray-200 py-3 first:border-t-0 dark:border-gray-800">
            <p className="text-[15px] text-gray-900 dark:text-gray-100">
                {question ? question.text : item.text}
            </p>
            {question && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                    {answer !== undefined ? (
                        <span className="px-2 py-2 text-sm text-gray-600 dark:text-gray-300">
                            {t(
                                'dailyBrief.anticipate.answered',
                                'Réponse enregistrée'
                            )}
                        </span>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => actions.onAnswer(item, 'yes')}
                                className={answerButton}
                            >
                                {t('dailyBrief.anticipate.yes', 'Oui')}
                            </button>
                            <button
                                type="button"
                                onClick={() => actions.onAnswer(item, 'no')}
                                className={answerButton}
                            >
                                {t('dailyBrief.anticipate.no', 'Non')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setPrecising((open) => !open)}
                                className={answerButton}
                            >
                                {t('dailyBrief.anticipate.precise', 'Préciser')}
                            </button>
                        </>
                    )}
                </div>
            )}
            {precising && answer === undefined && question && (
                <form
                    className="mt-1 flex gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (text.trim()) actions.onAnswer(item, text.trim());
                    }}
                >
                    <input
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        aria-label={t(
                            'dailyBrief.anticipate.preciseLabel',
                            'Précision'
                        )}
                        className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                    />
                    <button
                        type="submit"
                        className="h-10 rounded-lg px-3 text-sm font-semibold text-indigo-700 dark:text-indigo-300"
                    >
                        {t('dailyBrief.anticipate.save', 'Enregistrer')}
                    </button>
                </form>
            )}
            <div className="mt-1 flex gap-3 text-xs text-gray-600 dark:text-gray-300">
                <button
                    type="button"
                    aria-pressed={voted === 'useful'}
                    onClick={() => {
                        setVoted('useful');
                        actions.onFeedback(item, 'useful');
                    }}
                    className="py-1 hover:text-gray-900 dark:hover:text-gray-100"
                >
                    {t('dailyBrief.feedback.useful', 'Utile')}
                </button>
                <button
                    type="button"
                    aria-pressed={voted === 'noise'}
                    onClick={() => {
                        setVoted('noise');
                        actions.onFeedback(item, 'noise');
                    }}
                    className="py-1 hover:text-gray-900 dark:hover:text-gray-100"
                >
                    {t('dailyBrief.feedback.noise', 'Pas utile')}
                </button>
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
    answered,
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
                <AnticipateItem
                    key={item.key}
                    item={item}
                    answer={item.question ? answered[item.key] : undefined}
                    actions={actions}
                />
            ))}
        </section>
    );
};

const sourceOf = (sources: BriefSource[], id: BriefSource['id']) =>
    sources.find((source) => source.id === id);

export const RepliesSection: React.FC<BriefSectionProps> = ({
    brief,
    locale,
}) => {
    const { t } = useTranslation();
    const mail = sourceOf(brief.sources, 'mail');
    const notRead = mail !== undefined && mail.status !== 'read';
    if (brief.replies.length === 0 && !notRead) return null;
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
            {notRead && (
                <p className="py-2 text-[13px] text-gray-600 dark:text-gray-300">
                    {t('dailyBrief.replies.sourceNotRead', 'Source non lue')}
                </p>
            )}
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
    const rows = brief.resolved.filter((item) => tasks[item.task_uid]);
    if (rows.length === 0) return null;
    return (
        <section aria-label={t('dailyBrief.sectionName.resolved', 'Réglé')}>
            <SectionTitle
                title={t('dailyBrief.sectionName.resolved', 'Réglé')}
                detail={String(rows.length)}
            />
            {rows.map((item) => {
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
