import React from 'react';
import { TFunction } from 'i18next';
import {
    ArrowRightStartOnRectangleIcon,
    FolderIcon,
    PencilSquareIcon,
    ShareIcon,
} from '@heroicons/react/24/outline';
import { Area } from '../../entities/Area';

interface AreaHeroProps {
    area: Area;
    t: TFunction;
    doneCount: number;
    totalCount: number;
    onShareClick: () => void;
    onEditClick: () => void;
    // Offered when the area is shared with the viewer (can_leave)
    onLeaveClick?: () => void;
}

// Same card as the project and goal headers: tinted surface, icon tile,
// title, actions, and a progress bar for the tasks in the area.
const AreaHero: React.FC<AreaHeroProps> = ({
    area,
    t,
    doneCount,
    totalCount,
    onShareClick,
    onEditClick,
    onLeaveClick,
}) => {
    const tint = area.color || '#3b82f6';
    const actionClass =
        'inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-body-m font-medium text-surface-on ring-1 ring-inset ring-outline-variant transition-colors hover:bg-surface-high max-sm:min-h-[44px]';

    return (
        <div className="mb-6 space-y-3">
            <div className="space-y-3 pt-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <span
                        className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm ring-4 ring-white dark:bg-gray-800 dark:ring-gray-900"
                        style={{
                            backgroundColor: `color-mix(in srgb, ${tint} 18%, transparent)`,
                            color: tint,
                        }}
                    >
                        <FolderIcon className="h-7 w-7" />
                    </span>

                    <div className="min-w-0 flex-1 space-y-2">
                        <h1
                            className="line-clamp-2 text-headline font-extrabold leading-tight tracking-tight text-surface-on"
                            data-testid="area-name"
                        >
                            {area.name}
                        </h1>
                        {area.description && (
                            <p className="max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                                {area.description}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={onShareClick}
                            className={actionClass}
                        >
                            <ShareIcon className="h-4 w-4" />
                            {t('projectItem.share', 'Share')}
                        </button>
                        <button
                            type="button"
                            onClick={onEditClick}
                            className={actionClass}
                        >
                            <PencilSquareIcon className="h-4 w-4" />
                            {t('common.edit', 'Edit')}
                        </button>
                        {onLeaveClick && area.can_leave && (
                            <button
                                type="button"
                                onClick={onLeaveClick}
                                className={actionClass}
                                data-testid="area-leave"
                            >
                                <ArrowRightStartOnRectangleIcon className="h-4 w-4" />
                                {t('shares.leave.action', 'Leave')}
                            </button>
                        )}
                    </div>
                </div>

                {doneCount > 0 && (
                    <p className="text-body-m tabular-nums text-surface-on-variant">
                        {t(
                            'areas.progressSummary',
                            'Area progress · {{done}} of {{total}} tasks done',
                            { done: doneCount, total: totalCount }
                        )}
                    </p>
                )}
            </div>
        </div>
    );
};

export default AreaHero;
