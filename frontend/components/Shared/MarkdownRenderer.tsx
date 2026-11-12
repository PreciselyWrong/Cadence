import React, { useEffect, useRef, useState, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import hljs from 'highlight.js';
import CalloutBlock from './CalloutBlock';
import MermaidDiagram, { getMermaidSource } from './MermaidDiagram';
import { detectCallout } from '../../utils/calloutParser';
import { toggleTaskListItem } from '../../utils/markdownTaskList';
import {
    contactUrlTransform,
    remarkContactLinks,
} from '../../utils/contactLinks';
import { useStore } from '../../store/useStore';
import {
    classifyHref,
    preprocessContentLinks,
    taskLinkNames,
} from '../../utils/markdownLinks';
import { resolveTaskLinks } from '../../utils/contentLinksService';
import {
    LinkBadge,
    MentionChip,
    MissingLinkButton,
    NoteBadge,
} from './ContentLinkChips';

// Image syntax that points at a video file renders a player instead.
const VIDEO_SRC = /\.(mp4|webm)(?:[?#]|$)/i;

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

const CodeBlock: React.FC<React.HTMLAttributes<HTMLPreElement>> = ({
    children,
    ...props
}) => {
    const preRef = useRef<HTMLPreElement>(null);
    const [copied, setCopied] = useState(false);

    const handleCopy = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const text = preRef.current?.textContent || '';
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy code:', err);
        }
    };

    return (
        <div className="relative group mb-4">
            <pre ref={preRef} className="rounded-lg overflow-x-auto" {...props}>
                {children}
            </pre>
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gray-700 dark:bg-gray-600 text-white text-xs px-2 py-1 rounded"
                aria-label="Copy code"
            >
                {copied ? 'Copied!' : 'Copy'}
            </button>
        </div>
    );
};

// On a public page, a link to a note the owner has not made public: the
// reader can click it to learn why it does not open. The message is portaled
// to the body so the note's content box cannot clip it.
const NotSharedNoteBadge: React.FC<{ title: string }> = ({ title }) => {
    const { t } = useTranslation();
    const [anchor, setAnchor] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (!anchor) return;
        const close = () => setAnchor(null);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => {
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
        };
    }, [anchor]);

    return (
        <>
            <button
                type="button"
                className="cursor-pointer align-baseline"
                aria-expanded={!!anchor}
                onClick={(e) =>
                    setAnchor((current) =>
                        current ? null : e.currentTarget.getBoundingClientRect()
                    )
                }
                onBlur={() => setAnchor(null)}
            >
                <NoteBadge title={title} locked />
            </button>
            {anchor &&
                ReactDOM.createPortal(
                    <span
                        role="status"
                        className="fixed z-[300] whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white shadow-lg dark:bg-gray-700"
                        style={{ left: anchor.left, top: anchor.bottom + 4 }}
                    >
                        {t(
                            'publicNote.linkedNoteNotShared',
                            'This note is not shared publicly.'
                        )}
                    </span>,
                    document.body
                )}
        </>
    );
};

interface MarkdownRendererProps {
    content: string;
    className?: string;
    summaryMode?: boolean;
    onContentChange?: (newContent: string) => void;
    noteColor?: string;
    // On a public note page: the linked notes the reader may open. Any other
    // [[link]] shows as not shared instead of looking up the reader's notes.
    publicNoteLinks?: PublicNoteLink[];
    // Where a public linked note opens; its public link page by default.
    publicNoteHref?: (link: PublicNoteLink) => string;
}

export interface PublicNoteLink {
    title: string;
    token?: string;
    slug?: string;
}

const publicLinkPage = (link: PublicNoteLink) => `/public/notes/${link.token}`;

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
    content,
    className = '',
    summaryMode = false,
    onContentChange,
    noteColor,
    publicNoteLinks,
    publicNoteHref = publicLinkPage,
}) => {
    const storeNotes = useStore((state) => state.notesStore.notes);
    const notesLoaded = useStore((state) => state.notesStore.hasLoaded);
    const loadNotes = useStore((state) => state.notesStore.loadNotes);

    // A [[title]] link opens the note of that title, whatever page shows it:
    // the note list is loaded here when the page has not loaded it yet.
    const needsNoteList = !summaryMode && !publicNoteLinks;
    const hasWikilinks = content.includes('[[');
    useEffect(() => {
        if (needsNoteList && hasWikilinks && !notesLoaded) loadNotes();
    }, [needsNoteList, hasWikilinks, notesLoaded, loadNotes]);

    const noteTitleToSlug = useMemo(() => {
        const map = new Map<string, string>();
        for (const n of storeNotes) {
            if (n.uid && n.title) {
                map.set(
                    n.title.trim().toLowerCase(),
                    `${n.uid}-${slugify(n.title)}`
                );
            }
        }
        return map;
    }, [storeNotes]);

    const processedContent = useMemo(
        () => preprocessContentLinks(content),
        [content]
    );

    // [[task:Name]] links open the task of that name, looked up on the
    // server (the task list is never loaded whole).
    const taskNames = useMemo(
        () => (summaryMode || publicNoteLinks ? [] : taskLinkNames(content)),
        [content, summaryMode, publicNoteLinks]
    );
    const taskNamesKey = taskNames.join('\n');
    const [taskUids, setTaskUids] = useState<Record<string, string> | null>(
        null
    );
    useEffect(() => {
        if (!taskNamesKey) return;
        let live = true;
        resolveTaskLinks(taskNamesKey.split('\n'))
            .then((found) => live && setTaskUids(found))
            .catch(() => live && setTaskUids({}));
        return () => {
            live = false;
        };
    }, [taskNamesKey]);

    // Determine text color based on background
    const getTextColor = () => {
        if (!noteColor) return undefined;

        const hex = noteColor.replace('#', '');
        const r = parseInt(hex.substr(0, 2), 16);
        const g = parseInt(hex.substr(2, 2), 16);
        const b = parseInt(hex.substr(4, 2), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        return luminance < 0.4 ? '#ffffff' : '#333333';
    };

    const textColor = getTextColor();
    useEffect(() => {
        // Configure highlight.js
        hljs.configure({
            languages: [
                'javascript',
                'typescript',
                'python',
                'java',
                'css',
                'html',
                'json',
                'bash',
                'sql',
                'yaml',
                'xml',
                'dockerfile',
                'nginx',
                'apache',
            ],
        });

        // Manual highlighting for any missed code blocks
        const timer = setTimeout(() => {
            const codeBlocks = document.querySelectorAll('pre code:not(.hljs)');
            codeBlocks.forEach((block) => {
                hljs.highlightElement(block as HTMLElement);
            });
        }, 100);

        return () => clearTimeout(timer);
    }, [content]);

    // Track checkbox index for toggling
    const checkboxIndexRef = React.useRef(-1);

    // Reset on each render
    checkboxIndexRef.current = -1;

    const toggleCheckbox = (checkboxIndex: number) => {
        if (!onContentChange) return;
        const next = toggleTaskListItem(content, checkboxIndex);
        if (next !== content) onContentChange(next);
    };

    return (
        <div className={`markdown-content ${className}`}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkContactLinks]}
                urlTransform={contactUrlTransform}
                rehypePlugins={[
                    [rehypeHighlight, { detect: true, ignoreMissing: true }],
                ]}
                components={{
                    // Customize heading styles - in summary mode, convert headers to emphasized text
                    h1: ({ ...props }) =>
                        summaryMode ? (
                            <strong
                                className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ) : (
                            <h1
                                className={`text-3xl font-bold mt-6 first:mt-0 mb-4 ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ),
                    h2: ({ ...props }) =>
                        summaryMode ? (
                            <strong
                                className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ) : (
                            <h2
                                className={`text-2xl font-semibold mt-5 first:mt-0 mb-3 ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ),
                    h3: ({ ...props }) =>
                        summaryMode ? (
                            <strong
                                className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ) : (
                            <h3
                                className={`text-xl font-medium mt-4 first:mt-0 mb-2 ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ),
                    h4: ({ ...props }) =>
                        summaryMode ? (
                            <strong
                                className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ) : (
                            <h4
                                className={`text-lg font-medium mt-4 first:mt-0 mb-2 ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ),
                    h5: ({ ...props }) =>
                        summaryMode ? (
                            <strong
                                className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ) : (
                            <h5
                                className={`text-base font-medium mt-4 first:mt-0 mb-2 ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ),
                    h6: ({ ...props }) =>
                        summaryMode ? (
                            <strong
                                className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ) : (
                            <h6
                                className={`text-sm font-medium mt-4 first:mt-0 mb-2 ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                                style={{
                                    color: textColor,
                                }}
                                {...props}
                            />
                        ),

                    // Customize paragraph styles
                    p: ({ ...props }) => (
                        <p
                            className={`mb-3 leading-relaxed ${!noteColor ? 'text-gray-700 dark:text-gray-300' : ''}`}
                            style={{
                                color: textColor,
                            }}
                            {...props}
                        />
                    ),

                    // Customize list styles
                    ul: ({ ...props }) => (
                        <ul
                            className={`mb-3 list-disc ml-4 pl-5 space-y-1 ${!noteColor ? 'text-gray-700 dark:text-gray-300' : ''}`}
                            style={{
                                color: textColor,
                            }}
                            {...props}
                        />
                    ),
                    ol: ({ ...props }) => (
                        <ol
                            className={`mb-3 list-decimal ml-4 pl-5 space-y-1 ${!noteColor ? 'text-gray-700 dark:text-gray-300' : ''}`}
                            style={{
                                color: textColor,
                            }}
                            {...props}
                        />
                    ),
                    li: ({ ...props }) => (
                        <li
                            className={
                                !noteColor
                                    ? 'text-gray-700 dark:text-gray-300'
                                    : ''
                            }
                            style={{
                                color: textColor,
                            }}
                            {...props}
                        />
                    ),

                    // Cadence links read as chips; in-app paths stay in the
                    // app; other web links open in a new tab.
                    a: ({ href, children, ...props }) => {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars, react/prop-types
                        const { node, ...anchorProps } = props as any;
                        const target = classifyHref(href);
                        if (target.kind === 'mention') {
                            return (
                                <MentionChip
                                    uid={target.uid}
                                    name={children}
                                    asLink={!summaryMode && !publicNoteLinks}
                                />
                            );
                        }
                        if (target.kind === 'task-title') {
                            const { title } = target;
                            if (summaryMode || publicNoteLinks) {
                                return <LinkBadge label="TASK" title={title} />;
                            }
                            const uid = taskUids?.[title.trim().toLowerCase()];
                            if (uid) {
                                return (
                                    <Link
                                        to={`/task/${uid}`}
                                        className="!no-underline hover:!no-underline"
                                    >
                                        <LinkBadge label="TASK" title={title} />
                                    </Link>
                                );
                            }
                            return taskUids ? (
                                <MissingLinkButton
                                    type="task"
                                    title={title}
                                    onCreated={(created) =>
                                        setTaskUids((current) => ({
                                            ...current,
                                            [title.trim().toLowerCase()]:
                                                created,
                                        }))
                                    }
                                />
                            ) : (
                                <LinkBadge label="TASK" title={title} />
                            );
                        }
                        if (target.kind === 'note-title') {
                            const { title } = target;
                            // A summary sits inside a card that is itself a
                            // link: no link may nest in it.
                            if (summaryMode) return <NoteBadge title={title} />;
                            if (publicNoteLinks) {
                                const publicTarget = publicNoteLinks.find(
                                    (n) =>
                                        n.title.toLowerCase() ===
                                        title.toLowerCase()
                                );
                                return publicTarget ? (
                                    <Link
                                        to={publicNoteHref(publicTarget)}
                                        className="!no-underline hover:!no-underline"
                                    >
                                        <NoteBadge title={title} />
                                    </Link>
                                ) : (
                                    <NotSharedNoteBadge title={title} />
                                );
                            }
                            const slug = noteTitleToSlug.get(
                                title.trim().toLowerCase()
                            );
                            if (slug) {
                                return (
                                    <Link
                                        to={`/note/${slug}`}
                                        className="!no-underline hover:!no-underline"
                                    >
                                        <NoteBadge title={title} />
                                    </Link>
                                );
                            }
                            return notesLoaded ? (
                                <MissingLinkButton type="note" title={title} />
                            ) : (
                                <NoteBadge title={title} />
                            );
                        }
                        const linkClass =
                            'underline underline-offset-2 decoration-gray-400 dark:decoration-gray-500 hover:decoration-current';
                        if (summaryMode) {
                            return (
                                <span className="underline underline-offset-2 decoration-gray-400 dark:decoration-gray-500">
                                    {children}
                                </span>
                            );
                        }
                        if (target.kind === 'internal') {
                            return (
                                <Link
                                    className={linkClass}
                                    to={target.path}
                                    {...anchorProps}
                                >
                                    {children}
                                </Link>
                            );
                        }
                        return (
                            <a
                                className={linkClass}
                                href={href}
                                {...anchorProps}
                                {...(target.kind === 'external'
                                    ? {
                                          target: '_blank',
                                          rel: 'noopener noreferrer',
                                      }
                                    : {})}
                            >
                                {children}
                            </a>
                        );
                    },

                    // Customize code styles
                    code: ({ className, children, ...props }) => {
                        // Check if this is a code block (has language class) or inline code
                        const isCodeBlock =
                            className && className.startsWith('language-');

                        if (isCodeBlock) {
                            // This is a code block - add hljs class to ensure our styles apply
                            return (
                                <code
                                    className={`${className} hljs`}
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        } else {
                            // This is inline code - apply our custom styling
                            // Check if parent is a pre element - if so, this might be a code block without language
                            // eslint-disable-next-line react/prop-types
                            const node = (props as any).node;
                            // eslint-disable-next-line react/prop-types
                            const parentIsPre = node?.parent?.tagName === 'pre';
                            if (parentIsPre) {
                                return (
                                    <code className="hljs" {...props}>
                                        {children}
                                    </code>
                                );
                            }
                            return (
                                <code
                                    className="py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-sm font-mono text-gray-900 dark:text-gray-100"
                                    {...props}
                                >
                                    {children}
                                </code>
                            );
                        }
                    },
                    pre: ({ node, ...props }) => {
                        const mermaidSource = getMermaidSource(node);
                        if (mermaidSource === null) {
                            return <CodeBlock {...props} />;
                        }
                        return summaryMode ? (
                            <span className="text-gray-600 italic">
                                [Diagram hidden in preview]
                            </span>
                        ) : (
                            <MermaidDiagram code={mermaidSource} />
                        );
                    },

                    // Customize blockquote styles — detect Obsidian-style callouts
                    blockquote: ({ node, children, ...props }) => {
                        const callout = detectCallout(node);
                        if (callout) {
                            const blockChildren =
                                React.Children.toArray(children);
                            const markerIndex = blockChildren.findIndex((c) =>
                                React.isValidElement(c)
                            );
                            const contentChildren = blockChildren.slice(
                                markerIndex + 1
                            );
                            const markerParagraph = blockChildren[markerIndex];
                            if (React.isValidElement(markerParagraph)) {
                                // Keep soft-wrapped body text that shares the marker's
                                // paragraph (e.g. "> [!NOTE]\n> body" with no blank line)
                                const inlineRest = React.Children.toArray(
                                    (markerParagraph.props as any).children
                                ).slice(1);
                                const leadChildren = [
                                    ...(callout.remainderText
                                        ? [callout.remainderText]
                                        : []),
                                    ...inlineRest,
                                ];
                                if (leadChildren.length > 0) {
                                    contentChildren.unshift(
                                        React.cloneElement(
                                            markerParagraph,
                                            undefined,
                                            ...leadChildren
                                        )
                                    );
                                }
                            }
                            return (
                                <CalloutBlock
                                    type={callout.type}
                                    title={callout.title}
                                >
                                    {contentChildren.length > 0
                                        ? contentChildren
                                        : null}
                                </CalloutBlock>
                            );
                        }
                        return (
                            <blockquote
                                className="mb-4 pl-4 border-l-4 border-gray-300 dark:border-gray-600 italic text-gray-600 dark:text-gray-300"
                                {...props}
                            >
                                {children}
                            </blockquote>
                        );
                    },

                    // Customize table styles - hide tables in summary mode
                    table: ({ ...props }) =>
                        summaryMode ? (
                            <span className="text-gray-600 italic">
                                [Table content hidden in preview]
                            </span>
                        ) : (
                            <div className="markdown-table-wrapper">
                                <table
                                    className="markdown-table w-full border-collapse"
                                    {...props}
                                />
                            </div>
                        ),
                    thead: ({ ...props }) =>
                        summaryMode ? null : (
                            <thead
                                className="bg-gray-100 dark:bg-gray-800"
                                {...props}
                            />
                        ),
                    th: ({ ...props }) =>
                        summaryMode ? null : (
                            <th
                                className="px-3 py-2 text-left font-semibold text-gray-900 dark:text-gray-100"
                                {...props}
                            />
                        ),
                    td: ({ ...props }) =>
                        summaryMode ? null : (
                            <td
                                className="px-3 py-2 text-gray-700 dark:text-gray-300"
                                {...props}
                            />
                        ),

                    // Customize horizontal rule
                    hr: ({ ...props }) => (
                        <hr
                            className="my-6 border-gray-300 dark:border-gray-600"
                            {...props}
                        />
                    ),

                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    img: ({ node, src, alt, ...props }) =>
                        src && VIDEO_SRC.test(src) ? (
                            <video
                                src={src}
                                controls
                                playsInline
                                preload="metadata"
                                aria-label={alt || undefined}
                                className="w-full rounded-lg bg-black"
                            />
                        ) : (
                            <img src={src} alt={alt} {...props} />
                        ),

                    // Customize strong/bold text
                    strong: ({ ...props }) => (
                        <strong
                            className={`font-semibold ${!noteColor ? 'text-gray-900 dark:text-gray-100' : ''}`}
                            style={{
                                color: textColor,
                            }}
                            {...props}
                        />
                    ),

                    // Customize italic text
                    em: ({ ...props }) => (
                        <em
                            className={`italic ${!noteColor ? 'text-gray-700 dark:text-gray-300' : ''}`}
                            style={{
                                color: textColor,
                            }}
                            {...props}
                        />
                    ),

                    // Customize checkboxes for task lists with Tailwind styling
                    input: ({ type, checked, ...props }) => {
                        if (type === 'checkbox') {
                            checkboxIndexRef.current++;
                            const currentIndex = checkboxIndexRef.current;

                            return (
                                <input
                                    {...props}
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!onContentChange}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                    }}
                                    onChange={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        toggleCheckbox(currentIndex);
                                    }}
                                    className={`w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 ${
                                        onContentChange
                                            ? 'cursor-pointer'
                                            : 'cursor-not-allowed'
                                    }`}
                                />
                            );
                        }
                        return <input type={type} {...props} />;
                    },
                }}
            >
                {processedContent}
            </ReactMarkdown>
        </div>
    );
};

export default MarkdownRenderer;
