import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '../Shared/ToastContext';
import { useStore } from '../../store/useStore';
import { loadInboxItemsToStore } from '../../utils/inboxService';

const POLL_MS = 15000;

/**
 * Keeps the inbox in the store current while Plan is open: loaded once, then
 * read again every 15 s, with a toast for items that arrived from Telegram.
 */
export const useInboxPolling = (): void => {
    const { t } = useTranslation();
    const { showSuccessToast } = useToast();

    useEffect(() => {
        loadInboxItemsToStore(true).catch(console.error);
        const timer = setInterval(() => {
            const count = useStore.getState().inboxStore.inboxItems.length;
            loadInboxItemsToStore(false, count).catch(console.error);
        }, POLL_MS);

        const onArrived = (
            event: CustomEvent<{ count: number; firstItemContent: string }>
        ) => {
            const { count, firstItemContent } = event.detail;
            if (count <= 0) return;
            showSuccessToast(
                t(
                    'inbox.newTelegramItem',
                    'New item from Telegram: {{content}}',
                    {
                        content: firstItemContent,
                    }
                )
            );
            if (count > 1) {
                showSuccessToast(
                    t(
                        'inbox.multipleNewItems',
                        '{{count}} more new items added',
                        {
                            count: count - 1,
                        }
                    )
                );
            }
        };
        window.addEventListener(
            'inboxItemsUpdated',
            onArrived as EventListener
        );
        return () => {
            clearInterval(timer);
            window.removeEventListener(
                'inboxItemsUpdated',
                onArrived as EventListener
            );
        };
    }, [t, showSuccessToast]);
};
