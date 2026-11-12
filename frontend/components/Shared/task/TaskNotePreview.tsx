import React, { useEffect, useState } from 'react';
import { plainPreview } from './plainText';

type Renderer = typeof import('../MarkdownRenderer').default;

// Loaded once on first use: rows stay light, and a list without notes never
// pulls the Markdown stack in.
let loaded: Renderer | null = null;

// A task's note under its row, read-only and compact: the shared Markdown
// renderer in summary mode (bold, links, [[…]] chips, @mentions, lists and
// checkboxes; headings no bigger than the body). Until it loads, the note
// shows as plain text, never as raw Markdown. Clicks on a link or a chip do
// their own thing and never open the task behind the row.
const COMPACT =
    'line-clamp-3 text-body-m text-surface-on-variant [&_*]:!text-[length:inherit] [&_p]:!my-0 [&_ul]:!my-0 [&_ol]:!my-0 [&_li]:!my-0 [&_pre]:hidden';

const TaskNotePreview: React.FC<{ note: string; className?: string }> = ({
    note,
    className = '',
}) => {
    const [Markdown, setMarkdown] = useState<Renderer | null>(() => loaded);

    useEffect(() => {
        if (Markdown) return;
        let cancelled = false;
        import('../MarkdownRenderer')
            .then((module) => {
                loaded = module.default;
                if (!cancelled) setMarkdown(() => module.default);
            })
            .catch(() => {
                // Plain text stays.
            });
        return () => {
            cancelled = true;
        };
    }, [Markdown]);

    return (
        <span
            className={`block ${className}`}
            data-testid="task-note-preview"
            onClick={(event) => {
                if ((event.target as Element).closest('a,button,input')) {
                    event.stopPropagation();
                }
            }}
        >
            {Markdown ? (
                <Markdown content={note} summaryMode className={COMPACT} />
            ) : (
                <span className={`${COMPACT} block whitespace-pre-line`}>
                    {note
                        .split('\n')
                        .map((line) => plainPreview(line))
                        .filter(Boolean)
                        .join('\n')}
                </span>
            )}
        </span>
    );
};

export default TaskNotePreview;
