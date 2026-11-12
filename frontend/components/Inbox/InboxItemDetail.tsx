import React, { useState, useEffect, useRef } from 'react';
import { InboxItem } from '../../entities/InboxItem';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { Task } from '../../entities/Task';
import { Project } from '../../entities/Project';
import { Note } from '../../entities/Note';
import InboxItemAttachments from './InboxItemAttachments';
import LinkPreviewCard from '../Links/LinkPreviewCard';
import TagInput from '../Tag/TagInput';
import { firstUrl } from '../../utils/linkFilters';
import {
    CaptureDraft,
    LinkDraft,
    linkTaskDraft,
    wordsAround,
} from '../../utils/linkTriage';
import {
    capturedTask,
    isOnlyAddress,
    VERB_FALLBACKS,
} from '../../utils/linkTaskName';
import { AddressPlaces, lookupAddress } from '../../utils/linksService';
import Menu from '../Shared/ui/Menu';
import { urlPreviewWithin } from '../../utils/urlService';
import { useUrlPreview } from '../../hooks/useUrlPreview';
import { useStore } from '../../store/useStore';
import {
    focusAreaIdForTask,
    getFocus,
    mergeFocusTags,
} from '../../utils/focus';
import QuickCaptureInput, {
    InboxComposerFooterContext,
    QuickCaptureInputHandle,
} from './QuickCaptureInput';
import {
    analyzeInboxText,
    applyAnalysisToTask,
    ensureAnalysisArea,
    InboxAnalysis,
} from '../../utils/inboxService';
import { carriedTokens, withCarried } from '../../utils/carriedTokens';

interface InboxItemDetailProps {
    item: InboxItem;
    onDelete: (uid: string) => void;
    onUpdate?: (uid: string, newContent: string) => Promise<void>;
    openTaskModal: (task: Task, inboxItemUid?: string) => void;
    openProjectModal: (project: Project | null, inboxItemUid?: string) => void;
    openNoteModal: (note: Note | null, inboxItemUid?: string) => void;
    // An idea that is only an address becomes a task in one click.
    onCaptureTask?: (
        inboxItemUid: string,
        draft: CaptureDraft
    ) => Promise<void>;
    // "Project…": the page goes to a project, offered when the item holds an
    // address.
    onAddToProject?: (
        inboxItemUid: string,
        draft: LinkDraft & { project_uid: string }
    ) => Promise<void>;
    projects: Project[];
    isNew?: boolean;
    onEditingChange?: (editing: boolean) => void;
}

const InboxItemDetail: React.FC<InboxItemDetailProps> = ({
    item,
    onDelete,
    onUpdate,
    openTaskModal,
    openProjectModal,
    openNoteModal,
    onCaptureTask,
    onAddToProject,
    projects,
    isNew = false,
    onEditingChange,
}) => {
    const { t } = useTranslation();
    const {
        tagsStore: { tags },
    } = useStore();
    const [loading, setLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    // The edit box opens with the cleaned title (tokens like #tag, ~area,
    // dates and @person removed). Null until the analysis returns. The
    // removed words are carried: shown as badges and kept when saved.
    const [cleanedEditText, setCleanedEditText] = useState<string | null>(null);
    const [carriedEditText, setCarriedEditText] = useState('');
    // Chosen in the panel, added to what the text says at the decision.
    const [pickedTags, setPickedTags] = useState<string[]>([]);
    const [pickedProject, setPickedProject] = useState('');
    // The task name of an idea that is only an address, once the user types
    // one; null keeps the name computed from the page.
    const [typedName, setTypedName] = useState<string | null>(null);
    const [places, setPlaces] = useState<AddressPlaces | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const composerRef = useRef<QuickCaptureInputHandle>(null);

    useEffect(() => {
        onEditingChange?.(isEditing);
    }, [isEditing]);

    useEffect(() => {
        if (!isEditing) {
            setCleanedEditText(null);
            setCarriedEditText('');
            return;
        }
        let cancelled = false;
        analyzeInboxText(fullContent)
            .then((result) => {
                const cleaned = result?.cleaned_content?.trim();
                if (cancelled || !cleaned) return;
                setCleanedEditText(cleaned);
                setCarriedEditText(carriedTokens(fullContent, cleaned));
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // Only when the editor opens; the text is read once for that session.
    }, [isEditing]);

    // Tell the list in the same render that this item is opening, so its
    // rounded corners and background change together with the card.
    const startEditing = () => {
        setIsEditing(true);
        onEditingChange?.(true);
    };

    useEffect(() => {
        if (!isEditing) return;

        const handleClickOutside = (event: MouseEvent) => {
            // A menu of the panel (Project…) is drawn outside it.
            const inMenu = (event.target as Element | null)?.closest?.(
                '[role="menu"]'
            );
            if (
                containerRef.current &&
                !inMenu &&
                !containerRef.current.contains(event.target as Node)
            ) {
                if (composerRef.current) {
                    void composerRef.current.submit();
                } else {
                    setIsEditing(false);
                }
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsEditing(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isEditing]);

    // ── Parsing helpers ───────────────────────────────────────────────────────

    const tokenizeText = (text: string): string[] => {
        const tokens: string[] = [];
        let currentToken = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (
                char === '"' &&
                (i === 0 || text[i - 1] === '+' || text[i - 1] === '@')
            ) {
                inQuotes = true;
                currentToken += char;
            } else if (char === '"' && inQuotes) {
                inQuotes = false;
                currentToken += char;
            } else if (char === ' ' && !inQuotes) {
                if (currentToken) {
                    tokens.push(currentToken);
                    currentToken = '';
                }
            } else {
                currentToken += char;
            }
        }
        if (currentToken) tokens.push(currentToken);
        return tokens;
    };

    const parseHashtags = (text: string): string[] => {
        const words = text.trim().split(/\s+/);
        const matches: string[] = [];
        let i = 0;
        while (i < words.length) {
            if (words[i].startsWith('#') || words[i].startsWith('+')) {
                let groupEnd = i;
                while (
                    groupEnd < words.length &&
                    (words[groupEnd].startsWith('#') ||
                        words[groupEnd].startsWith('+'))
                )
                    groupEnd++;
                for (let j = i; j < groupEnd; j++) {
                    if (words[j].startsWith('#')) {
                        const tagName = words[j].substring(1);
                        if (
                            tagName &&
                            /^[a-zA-Z0-9_/-]+$/.test(tagName) &&
                            !matches.includes(tagName)
                        )
                            matches.push(tagName);
                    }
                }
                i = groupEnd;
            } else {
                i++;
            }
        }
        return matches;
    };

    const parseProjectRefs = (text: string): string[] => {
        const tokens = tokenizeText(text.trim());
        const matches: string[] = [];
        let i = 0;
        while (i < tokens.length) {
            if (tokens[i].startsWith('#') || tokens[i].startsWith('+')) {
                let groupEnd = i;
                while (
                    groupEnd < tokens.length &&
                    (tokens[groupEnd].startsWith('#') ||
                        tokens[groupEnd].startsWith('+'))
                )
                    groupEnd++;
                for (let j = i; j < groupEnd; j++) {
                    if (tokens[j].startsWith('+')) {
                        let projectName = tokens[j].substring(1);
                        if (
                            projectName.startsWith('"') &&
                            projectName.endsWith('"')
                        )
                            projectName = projectName.slice(1, -1);
                        if (projectName && !matches.includes(projectName)) {
                            matches.push(projectName);
                            return matches;
                        }
                    }
                }
                i = groupEnd;
            } else {
                i++;
            }
        }
        return matches;
    };

    const cleanTextFromTagsAndProjects = (text: string): string => {
        const tokens = tokenizeText(text.trim());
        const cleanedTokens: string[] = [];
        let i = 0;
        while (i < tokens.length) {
            if (tokens[i].startsWith('#') || tokens[i].startsWith('+')) {
                while (
                    i < tokens.length &&
                    (tokens[i].startsWith('#') || tokens[i].startsWith('+'))
                )
                    i++;
            } else {
                cleanedTokens.push(tokens[i]);
                i++;
            }
        }
        return cleanedTokens.join(' ').trim();
    };

    // Remove a raw token (e.g. "#tag" or "+project") from the item text and save
    const removeTokenFromText = async (raw: string) => {
        if (!onUpdate || item.uid === undefined) return;
        const newText = (item.content || '')
            .replace(raw, '')
            .replace(/ {2,}/g, ' ')
            .trim();
        await onUpdate(item.uid, newText);
    };

    // ── Derived values ────────────────────────────────────────────────────────

    const fullContent = item.content || '';
    const displayText =
        item.title && item.title.trim().length > 0 ? item.title : fullContent;
    const baseContent = fullContent || displayText;
    // Items captured through the API can end up with blank content; without a
    // placeholder the row renders as an invisible strip that cannot be clicked.
    const isBlank = displayText.trim().length === 0;

    // An item holding an address shows what the page is, under the words
    // written with it (the address itself is in the preview).
    const url = firstUrl(fullContent);
    const preview = useUrlPreview(url);
    const showText = !url || wordsAround(fullContent, url) !== '';
    const onlyAddress = isOnlyAddress(fullContent);

    // « Déjà dans … »: where the address already is, read when the panel opens.
    useEffect(() => {
        setPlaces(null);
        setTypedName(null);
        if (!isEditing || !url || !onlyAddress) return;
        let cancelled = false;
        lookupAddress(url)
            .then((found) => {
                if (!cancelled) setPlaces(found);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [isEditing, url, onlyAddress]);

    const verb = (key: string, title: string) =>
        t(key, VERB_FALLBACKS[key], { title });
    const computedName = url
        ? capturedTask(
              {
                  url,
                  title: preview?.url === url ? preview.title : null,
                  kind: preview?.url === url ? preview.kind : null,
              },
              verb
          ).name
        : '';
    const captureName = typedName ?? computedName;
    const placeCount =
        (places?.tasks.length ?? 0) + (places?.projects.length ?? 0);
    const firstPlace = places?.tasks[0]
        ? { path: `/task/${places.tasks[0].uid}`, name: places.tasks[0].name }
        : places?.projects[0]
          ? {
                path: `/project/${places.projects[0].uid}`,
                name: places.projects[0].name,
            }
          : null;

    const extraLineCount =
        displayText.split('\n').filter((l) => l.trim().length > 0).length - 1;

    // ── Inline text segment renderer ──────────────────────────────────────────
    // Parses the first line into plain-text + tag chip + project chip segments

    const renderInlineSegments = (text: string): React.ReactNode => {
        // Only render the first line for the preview
        const firstLine = text.split('\n')[0];
        const re =
            /#([\w-]+)|\+(?:"([^"]+)"|(\w+))|(?<!\S)@(?:"([^"]+)"|([\w.'-]*\w))|(?<!\S)~(?:"([^"]+)"|([\w.'-]*\w))/gu;
        const nodes: React.ReactNode[] = [];
        let last = 0;
        let m: RegExpExecArray | null;
        let idx = 0;

        while ((m = re.exec(firstLine)) !== null) {
            if (m.index > last) {
                nodes.push(
                    <span key={`t-${idx}`}>
                        {firstLine.slice(last, m.index)}
                    </span>
                );
            }
            const raw = m[0];
            if (m[1]) {
                // #tag
                const tagName = m[1];
                nodes.push(
                    <span
                        key={`tag-${idx}`}
                        className="inline-flex items-center gap-0.5 mx-0.5 align-middle text-[12px] font-semibold leading-none text-blue-700 dark:text-blue-300 bg-blue-100/70 dark:bg-blue-400/10 rounded-full px-2 py-[3px]"
                    >
                        #{tagName}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void removeTokenFromText(raw);
                            }}
                            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                            aria-label={`Remove tag ${tagName}`}
                        >
                            ×
                        </button>
                    </span>
                );
            } else if (m[4] || m[5]) {
                // @person
                const personName = m[4] || m[5];
                nodes.push(
                    <span
                        key={`person-${idx}`}
                        className="inline-flex items-center gap-0.5 mx-0.5 align-middle text-[12px] font-semibold leading-none text-indigo-700 dark:text-indigo-300 bg-indigo-100/70 dark:bg-indigo-400/10 rounded-full px-2 py-[3px]"
                    >
                        @{personName}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void removeTokenFromText(raw);
                            }}
                            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                            aria-label={`Remove person ${personName}`}
                        >
                            ×
                        </button>
                    </span>
                );
            } else if (m[6] || m[7]) {
                // ~area
                const areaName = m[6] || m[7];
                nodes.push(
                    <span
                        key={`area-${idx}`}
                        className="inline-flex items-center gap-0.5 mx-0.5 align-middle text-[12px] font-semibold leading-none text-purple-700 dark:text-purple-300 bg-purple-100/70 dark:bg-purple-400/10 rounded-full px-2 py-[3px]"
                    >
                        ~{areaName}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void removeTokenFromText(raw);
                            }}
                            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                            aria-label={`Remove area ${areaName}`}
                        >
                            ×
                        </button>
                    </span>
                );
            } else {
                // +project
                const projectName = m[2] || m[3];
                nodes.push(
                    <span
                        key={`proj-${idx}`}
                        className="inline-flex items-center gap-0.5 mx-0.5 align-middle text-[12px] font-semibold leading-none text-green-700 dark:text-green-300 bg-green-100/70 dark:bg-green-400/10 rounded-full px-2 py-[3px]"
                    >
                        +{projectName}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                void removeTokenFromText(raw);
                            }}
                            className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                            aria-label={`Remove project ${projectName}`}
                        >
                            ×
                        </button>
                    </span>
                );
            }
            last = m.index + m[0].length;
            idx++;
        }

        if (last < firstLine.length) {
            nodes.push(
                <span key={`t-end-${idx}`}>{firstLine.slice(last)}</span>
            );
        }

        return nodes.length > 0 ? nodes : firstLine;
    };

    // ── Conversion helpers ────────────────────────────────────────────────────

    const buildConversionPayload = (
        textOverride?: string,
        hashtagOverride?: string[],
        projectRefsOverride?: string[],
        cleanedOverride?: string
    ) => {
        const sourceText = textOverride ?? baseContent;
        const sourceHashtags = hashtagOverride ?? parseHashtags(sourceText);
        const sourceProjectRefs =
            projectRefsOverride ?? parseProjectRefs(sourceText);
        const cleaned =
            cleanedOverride ??
            cleanTextFromTagsAndProjects(sourceText) ??
            sourceText;

        const tagNames = [
            ...sourceHashtags,
            ...pickedTags.filter(
                (name) =>
                    !sourceHashtags.some(
                        (h) => h.toLowerCase() === name.toLowerCase()
                    )
            ),
        ];
        const tagObjects = tagNames.map((hashtagName) => {
            const existingTag = tags.find(
                (tag) => tag.name.toLowerCase() === hashtagName.toLowerCase()
            );
            return existingTag || { name: hashtagName };
        });

        // The project chosen in the panel wins over the one in the text.
        let projectUid: string | undefined = pickedProject || undefined;
        if (!projectUid && sourceProjectRefs.length > 0) {
            const matchingProject = projects.find(
                (p) =>
                    p.name.toLowerCase() === sourceProjectRefs[0].toLowerCase()
            );
            if (matchingProject) projectUid = matchingProject.uid;
        }
        // The Focus project fills in when the text names none
        if (!projectUid && getFocus()?.project_uid) {
            projectUid = getFocus()?.project_uid ?? undefined;
        }

        return {
            sourceText,
            cleanedContent: cleaned,
            tagObjects,
            projectUid,
            projectRefsList: sourceProjectRefs,
            hashtagsList: tagNames,
            projectChosen:
                Boolean(pickedProject) || sourceProjectRefs.length > 0,
        };
    };

    // The page title, if the server reads it soon enough.
    const pageTitle = async (address: string): Promise<string | null> => {
        if (preview?.url === address) return preview.title;
        setLoading(true);
        try {
            return (await urlPreviewWithin(address))?.title ?? null;
        } finally {
            setLoading(false);
        }
    };

    const handleConvertToTask = async (
        context?: InboxComposerFooterContext
    ) => {
        const payload = buildConversionPayload(
            context?.text,
            context?.hashtags,
            context?.projectRefs,
            context?.cleanedText
        );
        // Re-analyze against the capture time so "tomorrow" means the day
        // after the item was added. A date dismissed in the composer stays
        // dismissed: its live analysis then has no date.
        let analysis: InboxAnalysis | null = null;
        try {
            analysis = await analyzeInboxText(payload.sourceText, {
                referenceDate: item.created_at,
                parseDates: context?.analysis
                    ? !!context.analysis.parsed_due_date
                    : true,
            });
            analysis = await ensureAnalysisArea(analysis);
        } catch (error) {
            console.error('Failed to analyze inbox item:', error);
        }
        // A ~area in the text means the task is not for the Focus, so the
        // Focus project is dropped unless a project was named or chosen.
        const projectUid =
            analysis?.parsed_area && !payload.projectChosen
                ? undefined
                : payload.projectUid;
        let name =
            analysis?.cleaned_content || payload.cleanedContent || displayText;
        let note: string | undefined;
        const address = firstUrl(payload.sourceText);
        if (address) {
            ({ name, note } = linkTaskDraft({
                url: address,
                title: await pageTitle(address),
                text: wordsAround(name, address),
            }));
        }
        const newTask: Task = applyAnalysisToTask(
            {
                name,
                note,
                status: 'not_started',
                priority: null,
                tags: mergeFocusTags(
                    payload.tagObjects.map((tag) => tag.name),
                    getFocus()
                ).map(
                    (name) =>
                        payload.tagObjects.find((tag) => tag.name === name) ??
                        tags.find(
                            (tag) =>
                                tag.name.toLowerCase() === name.toLowerCase()
                        ) ?? { name }
                ),
                project_uid: projectUid,
                area_id: focusAreaIdForTask(
                    getFocus(),
                    projectUid,
                    useStore.getState().areasStore?.areas ?? []
                ),
                completed_at: null,
            },
            analysis
        );
        void openTaskModal(newTask, item.uid);
    };

    const handleConvertToProject = (context?: InboxComposerFooterContext) => {
        const payload = buildConversionPayload(
            context?.text,
            context?.hashtags,
            context?.projectRefs,
            context?.cleanedText
        );
        const newProject: Project = {
            name: payload.cleanedContent || displayText,
            description: '',
            status: 'planned',
            tags: payload.tagObjects,
        };
        openProjectModal(newProject, item.uid);
    };

    // One click: the task is made with the name shown, the address in its
    // note; the Focus project is not a reason to file it.
    const handleCaptureTask = async (context?: InboxComposerFooterContext) => {
        if (!onCaptureTask || !item.uid) return;
        const payload = buildConversionPayload(
            context?.text,
            context?.hashtags,
            context?.projectRefs,
            context?.cleanedText
        );
        const address = firstUrl(payload.sourceText);
        if (!address) return;
        setLoading(true);
        try {
            await onCaptureTask(item.uid, {
                url: address,
                name: captureName.trim() || computedName,
                note: address,
                tags: payload.hashtagsList,
                ...(payload.projectChosen && payload.projectUid
                    ? { project_uid: payload.projectUid }
                    : {}),
            });
        } finally {
            setLoading(false);
        }
    };

    const handleAddToProject = async (
        projectUid: string,
        context?: InboxComposerFooterContext
    ) => {
        if (!onAddToProject || !item.uid) return;
        const payload = buildConversionPayload(
            context?.text,
            context?.hashtags,
            context?.projectRefs,
            context?.cleanedText
        );
        const address = firstUrl(payload.sourceText);
        if (!address) return;
        const title = await pageTitle(address);
        const words = wordsAround(payload.cleanedContent, address);
        setLoading(true);
        try {
            await onAddToProject(item.uid, {
                url: address,
                ...(title ? { title } : {}),
                ...(words ? { note: words } : {}),
                ...(payload.hashtagsList.length > 0
                    ? { tags: payload.hashtagsList }
                    : {}),
                project_uid: projectUid,
            });
        } finally {
            setLoading(false);
        }
    };

    const handleConvertToNote = async (
        context?: InboxComposerFooterContext
    ) => {
        const sourceText = context?.text ?? baseContent;
        let title = sourceText.split('\n')[0] || sourceText.substring(0, 50);
        let isBookmark = false;

        const { isUrl: detectUrl } = await import('../../utils/urlService');
        if (detectUrl(sourceText.trim())) {
            isBookmark = true;
            const found = await pageTitle(sourceText.trim());
            if (found) title = found;
        }

        const payload = buildConversionPayload(
            context?.text,
            context?.hashtags,
            context?.projectRefs,
            context?.cleanedText
        );
        const bookmarkTag = isBookmark ? [{ name: 'bookmark' }] : [];
        const tagObjects = [...payload.tagObjects, ...bookmarkTag];
        const finalTitle =
            title === sourceText ? payload.cleanedContent || sourceText : title;

        const newNote: Note = {
            title: finalTitle,
            content: payload.cleanedContent || sourceText,
            tags: tagObjects,
            project_uid: payload.projectUid,
        };
        openNoteModal(newNote, item.uid);
    };

    const handleSubmitEdit = async (text: string) => {
        if (!onUpdate || item.uid === undefined) return;
        // An untouched box saves nothing, so the stored text keeps its
        // tokens where they were.
        if (
            baseContent.trim() === text.trim() ||
            (cleanedEditText !== null &&
                withCarried(cleanedEditText, carriedEditText).trim() ===
                    text.trim())
        ) {
            setIsEditing(false);
            return;
        }
        await onUpdate(item.uid, text);
    };

    // The parent hides the item and offers an undo, so no confirmation here.
    const handleDelete = () => {
        if (item.uid !== undefined) onDelete(item.uid);
    };

    // ── Edit-mode footer: the triage panel ───────────────────────────────────
    // What the page is, tags and project, then one decision.

    const decisionClass =
        'text-[12px] hover:underline transition-colors disabled:opacity-50';

    const renderComposerFooter = (context: InboxComposerFooterContext) => {
        const address = firstUrl(context.text);
        // An idea that is only an address: the task is the first choice.
        const capture = Boolean(onCaptureTask) && isOnlyAddress(context.text);
        return (
            <>
                {address && (
                    <LinkPreviewCard
                        url={address}
                        title={preview?.url === address ? preview.title : null}
                        description={
                            preview?.url === address
                                ? preview.description
                                : null
                        }
                        image={preview?.url === address ? preview.image : null}
                        pending={preview?.url !== address}
                    />
                )}
                {capture && firstPlace && (
                    <p
                        className="mt-2 flex items-center gap-2 text-[12px] text-amber-700 dark:text-amber-300"
                        data-testid="inbox-already-in"
                    >
                        <span>
                            {`${t('links.capture.alreadyIn', 'Already in « {{name}} »', { name: firstPlace.name })}${
                                placeCount > 1
                                    ? ` ${t('links.capture.more', '+{{count}}', { count: placeCount - 1 })}`
                                    : ''
                            }`}
                        </span>
                        <RouterLink
                            to={firstPlace.path}
                            className="font-medium underline"
                        >
                            {t('links.capture.open', 'Open')}
                        </RouterLink>
                    </p>
                )}
                {capture && (
                    <input
                        type="text"
                        aria-label={t('links.capture.taskName', 'Task name')}
                        value={captureName}
                        onChange={(e) => setTypedName(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleCaptureTask(context);
                            }
                        }}
                        className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-[15px] text-gray-900 dark:border-gray-900 dark:bg-gray-900 dark:text-gray-100"
                    />
                )}
                {item.uid && item.attachments && (
                    <InboxItemAttachments
                        itemUid={item.uid}
                        attachments={item.attachments}
                    />
                )}
                <div
                    className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                    data-testid="inbox-panel-fields"
                >
                    <div className="min-w-0 flex-1">
                        <TagInput
                            initialTags={pickedTags}
                            onTagsChange={setPickedTags}
                            availableTags={tags}
                        />
                    </div>
                    {projects.length > 0 && (
                        <select
                            aria-label={t('links.tryProject', 'Project')}
                            value={pickedProject}
                            onChange={(e) => setPickedProject(e.target.value)}
                            className="min-h-[40px] max-w-full rounded-md border border-gray-300 bg-white pl-2 pr-8 text-sm text-gray-700 dark:border-gray-900 dark:bg-gray-900 dark:text-gray-200 sm:max-w-[220px]"
                        >
                            <option value="">
                                {t('links.tryProject', 'Project')}
                            </option>
                            {projects.map((project) => (
                                <option key={project.uid} value={project.uid}>
                                    {project.name}
                                </option>
                            ))}
                        </select>
                    )}
                </div>
                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap min-h-5">
                    <div className="flex items-center gap-3.5">
                        {loading && (
                            <div className="h-3.5 w-3.5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                        )}
                        <span className="text-[12px] text-gray-500 dark:text-gray-400">
                            {t('inbox.saveAs', 'Save as')}
                        </span>
                        {capture ? (
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => void handleCaptureTask(context)}
                                className="rounded-md bg-blue-600 px-3 py-1 text-[12px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {firstPlace
                                    ? t('links.capture.addAnyway', 'Add anyway')
                                    : t('inbox.createTask', 'Task')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() =>
                                    void handleConvertToTask(context)
                                }
                                className={`${decisionClass} text-blue-600 dark:text-blue-400`}
                            >
                                {t('inbox.createTask', 'Task')}
                            </button>
                        )}
                        {address && onAddToProject && projects.length > 0 && (
                            <Menu
                                align="start"
                                entries={projects
                                    .filter((project) => project.uid)
                                    .map((project) => ({
                                        key: project.uid as string,
                                        label: project.name,
                                        onSelect: () =>
                                            void handleAddToProject(
                                                project.uid as string,
                                                context
                                            ),
                                    }))}
                                trigger={(props) => (
                                    <button
                                        type="button"
                                        {...props}
                                        disabled={loading}
                                        className={`${decisionClass} text-teal-600 dark:text-teal-400`}
                                    >
                                        {t(
                                            'links.capture.toProject',
                                            'Project…'
                                        )}
                                    </button>
                                )}
                            />
                        )}
                        <button
                            type="button"
                            disabled={loading}
                            onClick={() => void handleConvertToNote(context)}
                            className={`${decisionClass} text-purple-600 dark:text-purple-400`}
                        >
                            {t('inbox.createNote', 'Note')}
                        </button>
                        {!address && (
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => handleConvertToProject(context)}
                                className={`${decisionClass} text-green-600 dark:text-green-400`}
                            >
                                {t('inbox.createProject', 'Project')}
                            </button>
                        )}
                        {capture && (
                            <button
                                type="button"
                                disabled={loading}
                                onClick={() => setIsEditing(false)}
                                className={`${decisionClass} text-gray-600 dark:text-gray-300`}
                            >
                                {t('links.capture.keepInInbox', 'Inbox')}
                            </button>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={handleDelete}
                        className={`${decisionClass} text-red-500 dark:text-red-400`}
                    >
                        {t('common.delete', 'Delete')}
                    </button>
                </div>
            </>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div ref={containerRef}>
            {isEditing ? (
                <QuickCaptureInput
                    ref={composerRef}
                    mode="edit"
                    initialValue={cleanedEditText ?? fullContent}
                    carriedText={
                        cleanedEditText === null ? '' : carriedEditText
                    }
                    hidePrimaryButton
                    projects={projects}
                    onSubmitOverride={handleSubmitEdit}
                    onAfterSubmit={() => setIsEditing(false)}
                    renderFooterActions={renderComposerFooter}
                    openTaskModal={openTaskModal}
                    openProjectModal={openProjectModal}
                    openNoteModal={openNoteModal}
                    cardClassName="mb-0 !rounded-none !shadow-none"
                    multiline={true}
                    plainLinks
                />
            ) : (
                /* ── Flat row (no card, no shadow) ─────────────────────────── */
                <div
                    className={`group flex items-start gap-2.5 px-4 py-3 cursor-pointer${isNew ? ' animate-inbox-row-in' : ''}`}
                    onClick={startEditing}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            startEditing();
                        }
                    }}
                >
                    {/* Text content */}
                    <div className="flex-1 min-w-0">
                        {showText && (
                            <p className="text-[15px] font-normal tracking-tight text-gray-900 dark:text-gray-100 leading-snug break-words">
                                {isBlank ? (
                                    <span className="italic text-gray-500 dark:text-gray-400">
                                        {t('inbox.emptyItem', '(Empty item)')}
                                    </span>
                                ) : (
                                    renderInlineSegments(
                                        url
                                            ? wordsAround(displayText, url)
                                            : displayText
                                    )
                                )}
                                {extraLineCount > 0 && (
                                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                                        +{extraLineCount}{' '}
                                        {extraLineCount === 1
                                            ? t('inbox.line', 'line')
                                            : t('inbox.lines', 'lines')}
                                    </span>
                                )}
                            </p>
                        )}
                        {url && (
                            <LinkPreviewCard
                                url={url}
                                title={preview?.title}
                                description={preview?.description}
                                image={preview?.image}
                                pending={!preview}
                            />
                        )}
                        {item.uid && item.attachments && (
                            <InboxItemAttachments
                                itemUid={item.uid}
                                attachments={item.attachments}
                            />
                        )}
                    </div>

                    {/* Delete button – visible only on hover */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete();
                        }}
                        className="flex-shrink-0 mt-0.5 flex items-center justify-center w-5 h-5 rounded text-gray-300 dark:text-gray-600 hover:text-red-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all"
                        aria-label={t('common.delete', 'Delete')}
                    >
                        <XMarkIcon className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default InboxItemDetail;
