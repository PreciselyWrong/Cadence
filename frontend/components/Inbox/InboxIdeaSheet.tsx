import React from 'react';
import { useTranslation } from 'react-i18next';
import { InboxItem } from '../../entities/InboxItem';
import InboxItemDetail from './InboxItemDetail';
import { useInboxIdeaActions } from './useInboxIdeaActions';

interface InboxIdeaSheetProps {
    // The idea being decided, or null when none is open.
    item: InboxItem | null;
    onClose(): void;
    // An idea became a task waiting in « Tâches à classer ».
    onTaskCaptured?(): void;
}

/**
 * Plan's inbox idea, opened: its decision panel (Task, Project…, Note,
 * Inbox, Delete) floats over the board. It closes with the panel (Escape, a
 * click outside, a decision). The project and note modals stay mounted, so
 * a decision that opens one outlives the panel.
 */
const InboxIdeaSheet: React.FC<InboxIdeaSheetProps> = ({
    item,
    onClose,
    onTaskCaptured,
}) => {
    const { t } = useTranslation();
    const { detailProps, modals } = useInboxIdeaActions({ onTaskCaptured });
    return (
        <>
            {item && (
                <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/20 px-4 pt-[12vh] max-sm:items-end max-sm:px-0 max-sm:pt-0">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label={t('inbox.ideaSheet', 'Inbox item')}
                        data-testid="inbox-idea-sheet"
                        className="w-full max-w-xl overflow-hidden rounded-2xl bg-surface shadow-2xl ring-1 ring-black/10 dark:bg-surface-card dark:ring-white/10 max-sm:rounded-b-none"
                    >
                        <InboxItemDetail
                            key={item.uid}
                            item={item}
                            autoOpen
                            {...detailProps}
                            onEditingChange={(editing) => {
                                if (!editing) onClose();
                            }}
                        />
                    </div>
                </div>
            )}
            {modals}
        </>
    );
};

export default InboxIdeaSheet;
