import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    LinkedContext,
    deleteContext,
    fetchContexts,
    updateContext,
} from '../../utils/triageService';
import { SidePanelSection } from '../SidePanel/SidePanelParts';

interface TaskContextsProps {
    taskUid: string;
    readOnly?: boolean;
}

// Contexts the user gave in "À trier" about this task ("the car is in
// the garage on Thursday"). Nothing is shown when there are none.
const TaskContexts: React.FC<TaskContextsProps> = ({
    taskUid,
    readOnly = false,
}) => {
    const { t } = useTranslation();
    const [contexts, setContexts] = useState<LinkedContext[]>([]);
    const [editing, setEditing] = useState<{
        uid: string;
        text: string;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchContexts({ scope: 'task', target_ref: taskUid })
            .then((list) => {
                if (!cancelled) setContexts(list);
            })
            .catch(() => {
                if (!cancelled) setContexts([]);
            });
        return () => {
            cancelled = true;
        };
    }, [taskUid]);

    if (contexts.length === 0) return null;

    const save = async () => {
        if (!editing) return;
        const text = editing.text.trim();
        if (text === '') return;
        try {
            const updated = await updateContext(editing.uid, text);
            setContexts((list) =>
                list.map((item) => (item.uid === updated.uid ? updated : item))
            );
            setEditing(null);
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    const remove = async (uid: string) => {
        try {
            await deleteContext(uid);
            setContexts((list) => list.filter((item) => item.uid !== uid));
            setError(null);
        } catch (err) {
            setError((err as Error).message);
        }
    };

    return (
        <SidePanelSection title={t('triage.context.title', 'Contexte')}>
            <ul className="space-y-2">
                {contexts.map((context) => (
                    <li
                        key={context.uid}
                        className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200"
                    >
                        {editing?.uid === context.uid ? (
                            <form
                                className="flex flex-1 gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    save();
                                }}
                            >
                                <input
                                    value={editing.text}
                                    maxLength={500}
                                    aria-label={t(
                                        'triage.context.edit',
                                        'Modifier le contexte'
                                    )}
                                    onChange={(event) =>
                                        setEditing({
                                            uid: context.uid,
                                            text: event.target.value,
                                        })
                                    }
                                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900"
                                />
                                <button
                                    type="submit"
                                    className="h-10 px-2 font-semibold text-indigo-700 dark:text-indigo-300"
                                >
                                    {t('triage.context.save', 'Enregistrer')}
                                </button>
                            </form>
                        ) : (
                            <>
                                <span className="flex-1">{context.text}</span>
                                {!readOnly && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setEditing({
                                                    uid: context.uid,
                                                    text: context.text,
                                                })
                                            }
                                            className="h-8 rounded-md px-2 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                        >
                                            {t(
                                                'triage.context.edit',
                                                'Modifier le contexte'
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => remove(context.uid)}
                                            className="h-8 rounded-md px-2 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                        >
                                            {t(
                                                'triage.context.delete',
                                                'Supprimer'
                                            )}
                                        </button>
                                    </>
                                )}
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {error && (
                <p
                    role="alert"
                    className="text-xs text-red-600 dark:text-red-400"
                >
                    {error}
                </p>
            )}
        </SidePanelSection>
    );
};

export default TaskContexts;
