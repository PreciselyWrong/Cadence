import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Bars3Icon,
    BoltIcon,
    CalendarDaysIcon,
    CloudArrowDownIcon,
    CloudIcon,
    ShareIcon,
    SparklesIcon,
    SunIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import { useToast } from '../Shared/ToastContext';
import Button, { IconButton } from '../Shared/ui/Button';
import { INLINE_FIELD_CLASS } from '../Shared/ui/controlSizes';
import { OfflineQueuedError } from '../../utils/authUtils';
import {
    applyWeekendDecisions,
    getWeekendProposal,
    listWeekendProposals,
    requestWeekend,
    WeekendOp,
    WeekendProposal,
    WeekendSlot,
    WeekendWeather,
} from '../../utils/proposalsService';
import { PROPOSAL_CHANGED_EVENT } from '../Proposals/proposalLinks';
import {
    activityMetaLine,
    applyBody,
    countLine,
    dayName,
    decisionLabel,
    defaultDays,
    groupNearbyByDay,
    initialPicks,
    isWeekendDay,
    latestWeekends,
    pickerDays,
    REQUEST_MAX_DAYS,
    shortDay,
    toggleDay,
    isBusySlot,
    isOpenSlot,
    nearbyMetaLine,
    NOTE_MAX,
    safeHttpsUrl,
    slotTitle,
    togglePick,
    Translate,
    weatherLabel,
} from './weekendModel';
import { drawWeekendImage, shareImage } from './shareImage';

// While a request is prepared, the open sheet checks again this often.
const PENDING_POLL_MS = 20000;

const localToday = (): string => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const WEATHER_ICON: Record<WeekendWeather, typeof SunIcon> = {
    sun: SunIcon,
    partly: SunIcon,
    cloud: CloudIcon,
    rain: CloudArrowDownIcon,
    snow: SparklesIcon,
    storm: BoltIcon,
    fog: Bars3Icon,
};

const titleLink =
    'rounded-inner hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const join = (parts: (string | null | undefined | false)[]): string =>
    parts.filter(Boolean).join(' · ');

const capitalize = (text: string): string =>
    text.charAt(0).toLocaleUpperCase() + text.slice(1);

const WeatherIcon: React.FC<{ weather: WeekendWeather; label: string }> = ({
    weather,
    label,
}) => {
    const Icon = WEATHER_ICON[weather];
    return (
        <Icon
            aria-hidden="true"
            className="h-4 w-4 shrink-0"
            data-weather={weather}
            title={label}
        />
    );
};

const WeekendThumb: React.FC<{
    image?: string;
    url?: string;
    sizeClass: string;
}> = ({ image, url, sizeClass }) => {
    const src = safeHttpsUrl(image);
    const href = safeHttpsUrl(url);
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (!src || failed) return null;
    const img = (
        <img
            src={src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className={`${sizeClass} shrink-0 rounded-inner bg-surface-high object-cover`}
        />
    );
    if (!href) return img;
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-hidden="true"
            tabIndex={-1}
            className="shrink-0 rounded-inner"
        >
            {img}
        </a>
    );
};

interface WeekendSheetProps {
    // Without a uid the sheet shows the latest weekend and its request.
    uid?: string | null;
    onClose: () => void;
}

// The week-end proposal as a sheet: one block per slot of the weekend, the
// agent's advice preselected, « Valider » sending every pick at once. Nothing
// reaches the calendar before that (docs/48-weekend.md › Sheet).
const WeekendSheet: React.FC<WeekendSheetProps> = ({ uid, onClose }) => {
    const { t, i18n } = useTranslation();
    const language = i18n?.language || 'fr';
    const tr = t as unknown as Translate;
    const { showErrorToast, showSuccessToast } = useToast();
    const [proposal, setProposal] = useState<WeekendProposal | null>(null);
    // The request on chosen days: pending, or failed without an answer.
    const [asked, setAsked] = useState<WeekendProposal | null>(null);
    const [state, setState] = useState<'loading' | 'ready' | 'error'>(
        'loading'
    );
    const [pickerOpen, setPickerOpen] = useState(false);
    const [days, setDays] = useState<string[]>(() => defaultDays(localToday()));
    const [asking, setAsking] = useState(false);
    const [askError, setAskError] = useState<string | null>(null);
    const [sharing, setSharing] = useState(false);
    // Picks are local until « Valider ».
    const [picks, setPicks] = useState<Map<string, WeekendOp>>(() => new Map());
    const [notes, setNotes] = useState<Map<string, string>>(() => new Map());
    const [noteOpen, setNoteOpen] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const show = useCallback((next: WeekendProposal | null) => {
        setProposal((current) => {
            // A poll keeps the picks of the weekend already shown.
            if (current?.uid !== next?.uid) {
                setPicks(initialPicks(next?.answer ?? null));
            }
            return next;
        });
    }, []);

    const load = useCallback(async () => {
        try {
            const one = uid ? await getWeekendProposal(uid) : null;
            if (one && one.answer) {
                show(one);
                setAsked(null);
            } else {
                const latest = latestWeekends(await listWeekendProposals());
                show(latest.shown);
                setAsked(one ?? latest.request);
            }
            setState('ready');
        } catch {
            setState('error');
        }
    }, [uid, show]);

    useEffect(() => {
        void load();
    }, [load]);

    const pending = asked?.status === 'pending';
    useEffect(() => {
        if (!pending) return undefined;
        const timer = window.setInterval(() => void load(), PENDING_POLL_MS);
        return () => window.clearInterval(timer);
    }, [pending, load]);

    const ask = () => {
        if (asking || days.length === 0) return;
        setAsking(true);
        setAskError(null);
        requestWeekend(days)
            .then(() => {
                setPickerOpen(false);
                window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
                return load();
            })
            .catch(() =>
                setAskError(
                    t(
                        'weekend.request.error',
                        'La demande n’a pas pu être envoyée.'
                    )
                )
            )
            .finally(() => setAsking(false));
    };

    const share = async () => {
        if (!proposal?.answer || sharing) return;
        setSharing(true);
        try {
            const blob = await drawWeekendImage(
                proposal.answer,
                picks,
                tr,
                language
            );
            const first = proposal.answer.days[0]?.date ?? localToday();
            const outcome = await shareImage(
                blob,
                `week-end-${first}.png`,
                proposal.answer.headline
            );
            if (outcome === 'copied') {
                showSuccessToast(t('weekend.share.copied', 'Image copiée'));
            } else if (outcome === 'downloaded') {
                showSuccessToast(
                    t('weekend.share.downloaded', 'Image téléchargée')
                );
            }
        } catch {
            showErrorToast(
                t('weekend.share.error', 'L’image n’a pas pu être créée.')
            );
        } finally {
            setSharing(false);
        }
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose]);

    const answer = proposal?.answer ?? null;
    const editable = proposal?.status === 'ready';

    const validate = () => {
        if (!proposal || submitting || picks.size === 0) return;
        const decisions = applyBody(answer, picks, notes);
        setSubmitting(true);
        setSubmitError(null);
        const finish = () => {
            window.dispatchEvent(new Event(PROPOSAL_CHANGED_EVENT));
            showSuccessToast(
                t('weekend.applied', 'Décisions appliquées : {{count}}', {
                    count: decisions.length,
                })
            );
            onClose();
        };
        applyWeekendDecisions(proposal.uid, decisions)
            .then(finish)
            .catch((error) => {
                // Queued offline: the write is replayed later, as if applied.
                if (error instanceof OfflineQueuedError) return finish();
                const message = t(
                    'weekend.applyError',
                    'La décision n’a pas été enregistrée.'
                );
                setSubmitting(false);
                setSubmitError(message);
                showErrorToast(message);
            });
    };

    const pickChip = (
        slot: WeekendSlot,
        op: WeekendOp,
        label: string
    ): React.ReactNode => {
        const on = picks.get(slot.id) === op;
        return (
            <Button
                key={op}
                size="sm"
                variant={on ? 'primary' : 'secondary'}
                aria-pressed={on}
                disabled={submitting}
                onClick={() =>
                    setPicks((current) => togglePick(current, slot.id, op))
                }
            >
                {label}
            </Button>
        );
    };

    const renderSlot = (slot: WeekendSlot) => {
        const title = slotTitle(slot, language, tr);
        const weather = slot.weather ? weatherLabel(slot.weather, tr) : null;
        const after = slot.activity?.after ?? slot.after;
        const url = safeHttpsUrl(slot.activity?.url);
        const eventLink = safeHttpsUrl(slot.event?.link);
        const label = decisionLabel(slot, tr);
        const final = !!slot.decision && slot.decision.op !== 'other';
        const open = editable && isOpenSlot(slot);
        const noteText = notes.get(slot.id) ?? '';
        return (
            <li
                key={slot.id}
                data-testid={`weekend-slot-${slot.id}`}
                className="py-3"
            >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h3 className="text-body font-medium text-surface-on">
                        {title}
                    </h3>
                    {slot.weather && (
                        <p className="flex items-center gap-1.5 text-body-m tabular-nums text-surface-on-variant">
                            <WeatherIcon
                                weather={slot.weather}
                                label={weather ?? ''}
                            />
                            <span>
                                {join([
                                    weather,
                                    slot.temp !== undefined && `${slot.temp}°`,
                                    slot.feels !== undefined &&
                                        t(
                                            'weekend.feels',
                                            'ressenti {{temp}}°',
                                            { temp: slot.feels }
                                        ),
                                ])}
                            </span>
                        </p>
                    )}
                </div>

                {isBusySlot(slot) && (
                    <p className="mt-1 flex items-center gap-1.5 text-body-m text-surface-on-variant">
                        <CalendarDaysIcon
                            aria-hidden="true"
                            className="h-4 w-4 shrink-0"
                        />
                        <span>
                            {t('weekend.busy', 'Occupé : {{busy}}', {
                                busy: slot.busy,
                            })}
                        </span>
                    </p>
                )}

                {slot.activity && (
                    <div className="mt-1.5 flex items-start gap-3">
                        <WeekendThumb
                            image={slot.activity.image}
                            url={url ?? undefined}
                            sizeClass="h-14 w-14"
                        />
                        <div className="min-w-0 flex-1">
                            <p className="text-body font-medium text-surface-on">
                                {url ? (
                                    <a
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={titleLink}
                                    >
                                        {slot.activity.title}
                                    </a>
                                ) : (
                                    slot.activity.title
                                )}
                            </p>
                            {activityMetaLine(slot.activity) && (
                                <p className="text-body-m text-surface-on-variant">
                                    {activityMetaLine(slot.activity)}
                                </p>
                            )}
                            {slot.activity.note && (
                                <p className="text-body-m text-surface-on-variant">
                                    {slot.activity.note}
                                </p>
                            )}
                            {after && (
                                <p className="mt-0.5 text-body-m text-surface-on-variant">
                                    {after}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {!slot.activity && after && (
                    <p className="mt-0.5 text-body-m text-surface-on-variant">
                        {after}
                    </p>
                )}

                {slot.activity && open && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {pickChip(
                            slot,
                            'calendar',
                            t('weekend.calendar', 'Mettre à l’agenda')
                        )}
                        {pickChip(
                            slot,
                            'other',
                            t('weekend.other', 'Autre idée')
                        )}
                        {pickChip(slot, 'skip', t('weekend.skip', 'Ignorer'))}
                        <Button
                            size="sm"
                            variant="ghost"
                            aria-expanded={noteOpen === slot.id}
                            onClick={() =>
                                setNoteOpen((current) =>
                                    current === slot.id ? null : slot.id
                                )
                            }
                        >
                            {t('weekend.note', 'Remarque')}
                        </Button>
                    </div>
                )}

                {slot.activity && open && noteOpen === slot.id && (
                    <input
                        type="text"
                        maxLength={NOTE_MAX}
                        aria-label={t(
                            'weekend.noteLabel',
                            'Remarque pour l’agent'
                        )}
                        placeholder={t(
                            'weekend.notePlaceholder',
                            'Ce que l’agent doit savoir'
                        )}
                        value={noteText}
                        onChange={(event) =>
                            setNotes((current) =>
                                new Map(current).set(
                                    slot.id,
                                    event.target.value
                                )
                            )
                        }
                        className={`${INLINE_FIELD_CLASS} mt-2 w-full`}
                    />
                )}

                {slot.activity && !open && label && (
                    <p className="mt-2 flex flex-wrap items-center gap-x-2 text-label-m text-surface-on-variant">
                        <span>{label}</span>
                        {final && eventLink && (
                            <a
                                href={eventLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${titleLink} text-primary`}
                            >
                                {t(
                                    'weekend.event.open',
                                    'Ouvrir dans l’agenda'
                                )}
                            </a>
                        )}
                    </p>
                )}

                {slot.activity && open && slot.decision?.op === 'other' && (
                    <p className="mt-1 text-label-m text-surface-on-variant">
                        {t('weekend.otherAsked', 'Autre idée demandée')}
                    </p>
                )}
            </li>
        );
    };

    const header = (
        <header className="relative px-12 pb-3 pt-4 text-center sm:pt-5">
            <h2 id="weekend-sheet-title" className="text-title text-surface-on">
                {answer?.headline ?? t('weekend.title', 'Week-end')}
            </h2>
            {answer?.subtitle && (
                <p className="mt-1 text-body-m text-surface-on-variant">
                    {answer.subtitle}
                </p>
            )}
            <div className="absolute left-3 top-3 flex gap-1 sm:left-4 sm:top-4">
                <IconButton
                    label={t('weekend.request.open', 'Autres jours')}
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((open) => !open)}
                >
                    <CalendarDaysIcon />
                </IconButton>
                {answer && (
                    <IconButton
                        label={t('weekend.share.action', 'Partager')}
                        disabled={sharing}
                        onClick={() => void share()}
                    >
                        <ShareIcon />
                    </IconButton>
                )}
            </div>
            <div className="absolute right-3 top-3 sm:right-4 sm:top-4">
                <IconButton
                    label={t('proposals.sheet.close', 'Fermer')}
                    onClick={onClose}
                >
                    <XMarkIcon />
                </IconButton>
            </div>
        </header>
    );

    const shell = (body: React.ReactNode, footer?: React.ReactNode) => (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <div
                aria-hidden="true"
                onClick={onClose}
                className="absolute inset-0 bg-black/40"
            />
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="weekend-sheet-title"
                data-testid="weekend-sheet"
                className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-sheet bg-surface-card text-surface-on shadow-xl ring-1 ring-outline-variant sm:max-w-xl sm:rounded-panel"
            >
                <div
                    aria-hidden="true"
                    className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-outline-variant sm:hidden"
                />
                {header}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
                    {body}
                </div>
                {footer}
            </section>
        </div>
    );

    if (state === 'loading') {
        return shell(
            <div aria-busy="true" className="space-y-3 py-4">
                <div className="h-4 w-2/3 animate-pulse rounded bg-surface-high motion-reduce:animate-none" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-surface-high motion-reduce:animate-none" />
            </div>
        );
    }

    if (state === 'error') {
        return shell(
            <p className="py-6 text-body-m text-surface-on-variant">
                {t('weekend.loadError', 'Impossible d’ouvrir le week-end.')}
            </p>
        );
    }

    const today = localToday();
    const picker = (
        <section
            aria-labelledby="weekend-picker"
            data-testid="weekend-picker"
            className="mb-3 rounded-card bg-surface-low p-3"
        >
            <h3
                id="weekend-picker"
                className="text-body font-medium text-surface-on"
            >
                {t('weekend.request.title', 'Préparer des jours')}
            </h3>
            <ul className="mt-2 grid grid-cols-7 gap-1.5">
                {pickerDays(today).map((date) => {
                    const on = days.includes(date);
                    const full = !on && days.length >= REQUEST_MAX_DAYS;
                    return (
                        <li key={date}>
                            <button
                                type="button"
                                aria-pressed={on}
                                disabled={full || asking}
                                onClick={() =>
                                    setDays((current) =>
                                        toggleDay(current, date)
                                    )
                                }
                                className={`w-full rounded-inner px-1 py-1.5 text-label-m tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-40 ${
                                    on
                                        ? 'bg-primary text-primary-on'
                                        : isWeekendDay(date)
                                          ? 'bg-primary/10 text-surface-on hover:bg-primary/20'
                                          : 'bg-surface-card text-surface-on hover:bg-surface-high'
                                }`}
                            >
                                {shortDay(date, language)}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <p className="mt-2 text-label-m text-surface-on-variant">
                {t(
                    'weekend.request.hint',
                    'L’IA prépare au moins 5 idées par jour. Une notification arrive quand c’est prêt.'
                )}
            </p>
            {askError && (
                <p className="mt-1 text-label-m text-danger">{askError}</p>
            )}
            <div className="mt-2 flex justify-end">
                <Button
                    variant="primary"
                    size="sm"
                    disabled={asking || days.length === 0}
                    onClick={ask}
                >
                    {t('weekend.request.submit', 'Préparer')}
                </Button>
            </div>
        </section>
    );

    const askedDays = (asked?.request?.dates ?? [])
        .map((date) => shortDay(date, language))
        .join(', ');
    const requestLine = asked && (
        <p
            data-testid="weekend-request"
            role="status"
            className="mb-3 flex items-center gap-2 rounded-card bg-surface-low p-3 text-body-m text-surface-on-variant"
        >
            {pending && (
                <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
                />
            )}
            {pending
                ? t('weekend.request.pending', 'En préparation pour {{days}}', {
                      days: askedDays,
                  })
                : t(
                      'weekend.request.failed',
                      'Pas pu être préparé ({{days}})',
                      { days: askedDays }
                  )}
        </p>
    );
    const showPicker =
        pickerOpen || (!pending && (!answer || asked?.status === 'failed'));

    if (!answer) {
        return shell(
            <>
                {requestLine}
                {showPicker && picker}
                {!asked && !showPicker && (
                    <p className="py-6 text-body-m text-surface-on-variant">
                        {t('weekend.empty', 'Rien à proposer ce week-end.')}
                    </p>
                )}
            </>
        );
    }

    const dayTiles = answer.days ?? [];
    const nearbyGroups = groupNearbyByDay(answer.nearby);
    const elsewhere = answer.elsewhere ?? [];

    const body = (
        <>
            {requestLine}
            {showPicker && picker}
            <ul
                className={`grid gap-2 ${
                    dayTiles.length > 2
                        ? 'grid-cols-2 sm:grid-cols-4'
                        : 'grid-cols-2'
                }`}
                aria-label={t('weekend.dayList', 'Les jours')}
            >
                {dayTiles.map((day) => {
                    const label = weatherLabel(day.weather, tr);
                    return (
                        <li
                            key={day.date}
                            className="rounded-card bg-surface-low p-3 text-center"
                        >
                            <p className="text-label-m text-surface-on-variant">
                                {capitalize(dayName(day.date, language))}
                            </p>
                            <p className="mt-1 flex items-center justify-center gap-2 text-body-m">
                                <WeatherIcon
                                    weather={day.weather}
                                    label={label}
                                />
                                <span>{label}</span>
                            </p>
                            <p className="mt-0.5 text-body-m tabular-nums text-surface-on-variant">
                                {`${day.min}° · ${day.max}°`}
                            </p>
                        </li>
                    );
                })}
            </ul>

            <ul className="divide-y divide-outline-variant/60">
                {answer.slots.map(renderSlot)}
            </ul>

            {nearbyGroups.length > 0 && (
                <section
                    aria-labelledby="weekend-nearby"
                    className="mt-3 rounded-card bg-surface-low p-3"
                >
                    <h3
                        id="weekend-nearby"
                        className="text-body font-medium text-surface-on"
                    >
                        {t('weekend.nearby', 'Près de chez nous')}
                    </h3>
                    <div className="mt-2 space-y-2.5">
                        {nearbyGroups.map((group) => (
                            <ul key={group.date} className="space-y-2">
                                {group.items.map((item, idx) => {
                                    const itemUrl = safeHttpsUrl(item.url);
                                    return (
                                        <li
                                            key={`${group.date}-${idx}-${item.title}`}
                                            className="flex items-start gap-2.5"
                                        >
                                            <WeekendThumb
                                                image={item.image}
                                                url={itemUrl ?? undefined}
                                                sizeClass="h-10 w-10"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="text-body-m font-medium text-surface-on">
                                                    {itemUrl ? (
                                                        <a
                                                            href={itemUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className={
                                                                titleLink
                                                            }
                                                        >
                                                            {item.title}
                                                        </a>
                                                    ) : (
                                                        item.title
                                                    )}
                                                </p>
                                                <p className="text-body-m text-surface-on-variant">
                                                    {nearbyMetaLine(
                                                        item,
                                                        language
                                                    )}
                                                </p>
                                                {item.note && (
                                                    <p className="text-body-m text-surface-on-variant">
                                                        {item.note}
                                                    </p>
                                                )}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        ))}
                    </div>
                </section>
            )}

            {elsewhere.length > 0 && (
                <section
                    aria-labelledby="weekend-elsewhere"
                    className="mt-3 rounded-card bg-surface-low p-3"
                >
                    <h3
                        id="weekend-elsewhere"
                        className="flex items-center gap-2 text-body font-medium text-surface-on"
                    >
                        <SunIcon aria-hidden="true" className="h-4 w-4" />
                        {t('weekend.elsewhere', 'Plus beau ailleurs')}
                    </h3>
                    <ul className="mt-1.5 space-y-1">
                        {elsewhere.map((place) => (
                            <li
                                key={`${place.place}-${place.date}`}
                                className="text-body-m text-surface-on-variant"
                            >
                                {join([
                                    t(
                                        'weekend.elsewhereLine',
                                        '{{place}}, {{day}} : {{weather}}, {{temp}}°',
                                        {
                                            place: place.place,
                                            day: dayName(place.date, language),
                                            weather: weatherLabel(
                                                place.weather,
                                                tr
                                            ),
                                            temp: place.temp,
                                        }
                                    ),
                                    place.travel,
                                ])}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );

    const footer = editable ? (
        <footer className="border-t border-outline-variant/60 px-5 py-3">
            {submitError && (
                <p className="mb-2 text-label-m text-danger">{submitError}</p>
            )}
            <div className="flex items-center justify-between gap-3">
                <p className="text-body-m text-surface-on-variant">
                    {countLine(picks, tr)}
                </p>
                <Button
                    variant="primary"
                    size="md"
                    disabled={submitting || picks.size === 0}
                    onClick={validate}
                >
                    {t('weekend.validate', 'Valider')}
                </Button>
            </div>
        </footer>
    ) : undefined;

    return shell(body, footer);
};

export default WeekendSheet;
