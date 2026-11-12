import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import {
    AgentNotification,
    fetchUnreadAgentMessages,
    markAgentMessageRead,
    safeOpenPath,
    watchNotificationStream,
} from '../../utils/agentMessagesService';

const REFRESH_MS = 60_000;

// One quiet line at the top of every page while an agent message is unread
// (docs/46-plugins.md, "Notifications"). Open marks it read and opens it in
// the plugin's page; × marks it read.
const AgentMessageBanner: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [messages, setMessages] = useState<AgentNotification[]>([]);

    const refresh = useCallback(() => {
        fetchUnreadAgentMessages()
            .then(setMessages)
            .catch(() => setMessages([]));
    }, []);

    useEffect(() => {
        refresh();
        const close = watchNotificationStream(refresh);
        const timer = window.setInterval(() => {
            if (!document.hidden) refresh();
        }, REFRESH_MS);
        const onVisible = () => {
            if (!document.hidden) refresh();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            close();
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refresh]);

    const latest = messages[0];
    if (!latest) return null;
    const more = messages.length - 1;
    const path = safeOpenPath(latest.data?.openPath);

    const dismiss = async (open: boolean) => {
        setMessages((current) => current.filter((m) => m.uid !== latest.uid));
        await markAgentMessageRead(latest.uid).catch(() => {});
        if (open && path) navigate(path);
    };

    return (
        <div
            role="status"
            aria-live="polite"
            className="mx-4 mb-3 flex items-center gap-3 rounded-xl bg-primary-container/60 px-3 py-2 text-body-m text-primary-on-container ring-1 ring-inset ring-primary/20 max-sm:mx-3"
        >
            <SparklesIcon
                className="h-5 w-5 flex-shrink-0 text-primary"
                aria-hidden="true"
            />
            <p className="min-w-0 flex-1 truncate">
                <span className="font-semibold">{latest.title}</span>
                {latest.message && (
                    <span className="text-surface-on-variant max-sm:hidden">
                        {' · '}
                        {latest.message}
                    </span>
                )}
            </p>
            {more > 0 && (
                <span className="flex-shrink-0 rounded-full bg-primary px-2 text-label-m font-semibold leading-5 text-primary-on">
                    +{more}
                </span>
            )}
            {path && (
                <button
                    type="button"
                    onClick={() => dismiss(true)}
                    className="flex-shrink-0 rounded-lg px-2.5 py-1 font-semibold text-primary hover:bg-primary/10 max-sm:min-h-[44px]"
                >
                    {t('agentBanner.open', 'Open')}
                </button>
            )}
            <button
                type="button"
                onClick={() => dismiss(false)}
                aria-label={t('agentBanner.dismiss', 'Mark as read')}
                className="flex-shrink-0 rounded-lg p-1.5 text-surface-on-variant hover:bg-surface-high max-sm:min-h-[44px] max-sm:min-w-[44px]"
            >
                <XMarkIcon className="mx-auto h-4 w-4" aria-hidden="true" />
            </button>
        </div>
    );
};

export default AgentMessageBanner;
