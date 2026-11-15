import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePluginMenuStore } from '../../store/pluginMenuStore';
import {
    PluginActionPlace,
    PluginPageAction,
    runPluginAction,
} from '../../utils/pluginsService';
import Button from '../Shared/ui/Button';
import { useOptionalToast } from '../Shared/ToastContext';

/** What the page shows, handed to the plugin page in its query. */
export type PluginActionContext = Record<string, string | undefined>;

/**
 * The address a click opens: the plugin's page with the action, the place
 * and the context in the query (docs/46-plugins.md, "Page actions").
 */
export function pluginActionHref(
    action: PluginPageAction,
    place: PluginActionPlace,
    context: PluginActionContext = {}
): string {
    const query = new URLSearchParams({ action: action.id, place });
    for (const [key, value] of Object.entries(context)) {
        if (value) query.set(key, value);
    }
    return `/plugins/${encodeURIComponent(action.plugin)}?${query}`;
}

interface PluginActionsProps {
    place: PluginActionPlace;
    context?: PluginActionContext;
}

const ActionButtons: React.FC<{
    actions: PluginPageAction[];
    place: PluginActionPlace;
    context?: PluginActionContext;
}> = ({ actions, place, context }) => {
    const navigate = useNavigate();
    return (
        <>
            {actions.map((action) => (
                <Button
                    key={`${action.plugin}:${action.id}`}
                    variant="secondary"
                    data-testid={`plugin-action-${action.plugin}-${action.id}`}
                    onClick={() =>
                        navigate(pluginActionHref(action, place, context))
                    }
                >
                    {action.label}
                </Button>
            ))}
        </>
    );
};

const cleanContext = (context: PluginActionContext = {}) =>
    Object.fromEntries(
        Object.entries(context).filter((entry): entry is [string, string] =>
            Boolean(entry[1])
        )
    );

/**
 * A `run` button: the plugin acts in the server (a Hermes job started now)
 * and says what it did; one click at a time, nothing opens.
 */
const RunButton: React.FC<{
    action: PluginPageAction;
    place: PluginActionPlace;
    context?: PluginActionContext;
}> = ({ action, place, context }) => {
    const { t } = useTranslation();
    const toast = useOptionalToast();
    const [running, setRunning] = useState(false);
    const run = () => {
        if (running) return;
        setRunning(true);
        runPluginAction(action, place, cleanContext(context))
            .then(
                (result) => {
                    const text =
                        result.message ||
                        (result.ok
                            ? t('pluginRun.done', 'C’est lancé.')
                            : t(
                                  'pluginRun.failed',
                                  'Le plugin n’a pas pu agir.'
                              ));
                    if (result.ok) toast?.showSuccessToast(text);
                    else toast?.showErrorToast(text);
                },
                () =>
                    toast?.showErrorToast(
                        t('pluginRun.failed', 'Le plugin n’a pas pu agir.')
                    )
            )
            .finally(() => setRunning(false));
    };
    return (
        <Button
            variant="secondary"
            data-testid={`plugin-action-${action.plugin}-${action.id}`}
            disabled={running}
            aria-busy={running}
            onClick={run}
        >
            {action.label}
        </Button>
    );
};

/**
 * The buttons running plugins add to this page header; nothing when none,
 * without touching the router (pages also render outside one in tests).
 * A button that opens a page needs the plugin's page; a run button does not.
 */
const PluginActions: React.FC<PluginActionsProps> = ({ place, context }) => {
    const actions = usePluginMenuStore((state) => state.actions);
    const pages = usePluginMenuStore((state) => state.items);
    const here = actions.filter((action) => action.places.includes(place));
    const opening = here.filter(
        (action) =>
            !action.run && pages.some((page) => page.id === action.plugin)
    );
    const running = here.filter((action) => action.run);
    if (opening.length === 0 && running.length === 0) return null;
    return (
        <>
            {running.map((action) => (
                <RunButton
                    key={`${action.plugin}:${action.id}`}
                    action={action}
                    place={place}
                    context={context}
                />
            ))}
            {opening.length > 0 && (
                <ActionButtons
                    actions={opening}
                    place={place}
                    context={context}
                />
            )}
        </>
    );
};

export default PluginActions;
