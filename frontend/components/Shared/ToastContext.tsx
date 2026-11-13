import React, { createContext, useContext, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface Toast {
    id: number;
    message: string | React.ReactNode;
    type: 'success' | 'error';
    onUndo?: () => void;
    undoLabel?: string;
}

interface ToastContextProps {
    showSuccessToast: (message: string | React.ReactNode) => void;
    showErrorToast: (message: string | React.ReactNode) => void;
    showUndoToast: (
        message: string | React.ReactNode,
        onUndo: () => void,
        // The button's text; "Undo" when left out.
        undoLabel?: string
    ) => void;
}

const ToastContext = createContext<ToastContextProps | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
    children,
}) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const showSuccessToast = useCallback(
        (message: string | React.ReactNode) => {
            const id = Date.now() + Math.random();
            const newToast: Toast = { id, message, type: 'success' };
            setToasts((prev) => [...prev, newToast]);
            setTimeout(() => removeToast(id), 4000);
        },
        [removeToast]
    );

    const showErrorToast = useCallback(
        (message: string | React.ReactNode) => {
            const id = Date.now() + Math.random();
            const newToast: Toast = { id, message, type: 'error' };
            setToasts((prev) => [...prev, newToast]);
            setTimeout(() => removeToast(id), 4000);
        },
        [removeToast]
    );

    const showUndoToast = useCallback(
        (
            message: string | React.ReactNode,
            onUndo: () => void,
            undoLabel?: string
        ) => {
            const id = Date.now() + Math.random();
            const newToast: Toast = {
                id,
                message,
                type: 'success',
                onUndo,
                undoLabel,
            };
            setToasts((prev) => [...prev, newToast]);
            setTimeout(() => removeToast(id), 6000);
        },
        [removeToast]
    );

    return (
        <ToastContext.Provider
            value={{ showSuccessToast, showErrorToast, showUndoToast }}
        >
            {children}
            <div className="fixed top-20 right-4 z-50 space-y-2">
                {toasts.map((toast, index) => (
                    <ToastComponent
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        onClose={() => removeToast(toast.id)}
                        onUndo={
                            toast.onUndo
                                ? () => {
                                      removeToast(toast.id);
                                      toast.onUndo!();
                                  }
                                : undefined
                        }
                        undoLabel={toast.undoLabel}
                        style={{ transform: `translateY(${index * 4}px)` }}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// For components that also render outside a ToastProvider (tests of lists):
// undefined there, so the caller skips the toast.
export const useOptionalToast = () => useContext(ToastContext);

// Success stays neutral and quiet; only an error takes a strong colour.
const ToastComponent: React.FC<{
    message: string | React.ReactNode;
    type: 'success' | 'error';
    onClose: () => void;
    onUndo?: () => void;
    undoLabel?: string;
    style?: React.CSSProperties;
}> = ({ message, type, onClose, onUndo, undoLabel, style }) => {
    const { t } = useTranslation();
    return (
        <div
            role={type === 'error' ? 'alert' : 'status'}
            className={`w-[min(24rem,calc(100vw-2rem))] px-4 py-3 rounded-lg shadow-lg transition-all duration-200 ease-out ${
                type === 'success'
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-red-600 text-white'
            }`}
            style={style}
        >
            <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                    {type === 'success' ? (
                        <CheckCircleIcon className="h-5 w-5" />
                    ) : (
                        <ExclamationTriangleIcon className="h-5 w-5" />
                    )}
                </div>
                <div className="min-w-0 flex-1 break-words text-sm line-clamp-3">
                    {message}
                </div>
                {onUndo && (
                    <button
                        type="button"
                        onClick={onUndo}
                        className="flex-shrink-0 rounded px-1 text-sm font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity focus-visible:outline focus-visible:outline-2"
                    >
                        {undoLabel ?? t('common.undo', 'Undo')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onClose}
                    aria-label={t('common.close', 'Close')}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-lg leading-none hover:opacity-75 focus-visible:outline focus-visible:outline-2"
                >
                    &times;
                </button>
            </div>
        </div>
    );
};
