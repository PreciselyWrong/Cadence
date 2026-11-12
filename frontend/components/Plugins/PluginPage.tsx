import React from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { getApiPath } from '../../config/paths';
import { usePluginMenuStore } from '../../store/pluginMenuStore';

// A running plugin's own page. The plugin serves it from its folder
// (docs/46-plugins.md); Cadence only frames it.
const PluginPage: React.FC = () => {
    const { t } = useTranslation();
    const { id = '' } = useParams();
    const loaded = usePluginMenuStore((state) => state.loaded);
    const item = usePluginMenuStore((state) =>
        state.items.find((entry) => entry.id === id)
    );

    if (!loaded) {
        return (
            <p className="p-6 text-sm text-gray-600 dark:text-gray-300">
                {t('common.loading', 'Loading...')}
            </p>
        );
    }

    if (!item) {
        return (
            <p
                role="alert"
                className="p-6 text-sm text-red-600 dark:text-red-400"
            >
                {t(
                    'profile.plugins.page.notFound',
                    'Plugin not found or turned off'
                )}
            </p>
        );
    }

    const src = getApiPath(
        `plugins/${encodeURIComponent(item.id)}/ui/${encodeURIComponent(item.file)}`
    );

    return (
        <div className="flex h-full min-h-[70vh] flex-col">
            <h1 className="px-6 pt-4 pb-2 text-lg font-semibold text-gray-900 dark:text-white">
                {item.label}
            </h1>
            <iframe
                title={item.label}
                src={src}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="w-full flex-1 border-0 bg-white"
            />
        </div>
    );
};

export default PluginPage;
