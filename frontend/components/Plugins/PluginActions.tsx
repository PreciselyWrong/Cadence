import React from 'react';
import { useNavigate } from 'react-router-dom';
import { usePluginMenuStore } from '../../store/pluginMenuStore';
import {
    PluginActionPlace,
    PluginPageAction,
} from '../../utils/pluginsService';
import Button from '../Shared/ui/Button';

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

/**
 * The buttons running plugins add to this page header; nothing when none,
 * without touching the router (pages also render outside one in tests).
 */
const PluginActions: React.FC<PluginActionsProps> = ({ place, context }) => {
    const actions = usePluginMenuStore((state) => state.actions);
    const pages = usePluginMenuStore((state) => state.items);
    const here = actions.filter(
        (action) =>
            action.places.includes(place) &&
            pages.some((page) => page.id === action.plugin)
    );
    if (here.length === 0) return null;
    return <ActionButtons actions={here} place={place} context={context} />;
};

export default PluginActions;
