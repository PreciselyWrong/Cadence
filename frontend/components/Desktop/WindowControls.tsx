import React from 'react';
import { useTranslation } from 'react-i18next';
import { isDesktopApp } from '../../utils/desktopApp';

// The Linux client (desktop/, Tauri) has no system title bar. These buttons
// carry no handler: the client reads `data-desktop-window` under a real
// mouse press (titlebar.rs) and moves, minimizes, maximizes or closes the
// window itself, so the page never gets access to the window.
type Action = 'minimize' | 'maximize' | 'close';

export const desktopDragRegion = (): Record<string, string> =>
    isDesktopApp() ? { 'data-desktop-window': 'drag' } : {};

const icons: Record<Action, React.ReactNode> = {
    minimize: <path d="M3.5 8h9" />,
    maximize: <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" />,
    close: <path d="M4 4l8 8M12 4l-8 8" />,
};

const WindowControls: React.FC = () => {
    const { t } = useTranslation();
    if (!isDesktopApp()) return null;

    const labels: Record<Action, string> = {
        minimize: t('desktopWindow.minimize', 'Minimize'),
        maximize: t('desktopWindow.maximize', 'Maximize'),
        close: t('desktopWindow.close', 'Close'),
    };

    return (
        <div className="flex items-center gap-0.5 -mr-2">
            {(Object.keys(icons) as Action[]).map((action) => (
                <button
                    key={action}
                    type="button"
                    // Keyboard users have the window manager's shortcuts;
                    // a key press here would reach no handler.
                    tabIndex={-1}
                    data-desktop-window={action}
                    aria-label={labels[action]}
                    title={labels[action]}
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-gray-500 transition-colors duration-150 hover:bg-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100${
                        action === 'close'
                            ? ' hover:bg-red-500 hover:text-white dark:hover:bg-red-500 dark:hover:text-white'
                            : ''
                    }`}
                >
                    <svg
                        viewBox="0 0 16 16"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        aria-hidden="true"
                    >
                        {icons[action]}
                    </svg>
                </button>
            ))}
        </div>
    );
};

export default WindowControls;
