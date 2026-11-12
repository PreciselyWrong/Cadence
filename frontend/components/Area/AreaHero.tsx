import React from 'react';
import { TFunction } from 'i18next';
import {
    ArrowRightStartOnRectangleIcon,
    EllipsisHorizontalIcon,
    PencilSquareIcon,
    ShareIcon,
} from '@heroicons/react/24/outline';
import { Area } from '../../entities/Area';
import PageHeader from '../Shared/ui/PageHeader';
import Button, { IconButton } from '../Shared/ui/Button';
import Menu, { MenuEntry } from '../Shared/ui/Menu';
import EntityMark from '../Shared/ui/EntityMark';

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

// The shared page header, as on a project: the area icon of the sidebar,
// the name, the progress line, Edit, and Share or Leave under ⋯.
const AreaHero: React.FC<AreaHeroProps> = ({
    area,
    t,
    doneCount,
    totalCount,
    onShareClick,
    onEditClick,
    onLeaveClick,
}) => {
    const menu: MenuEntry[] = [
        {
            key: 'share',
            label: t('projectItem.share', 'Share'),
            icon: <ShareIcon />,
            onSelect: onShareClick,
            testId: 'area-share',
        },
        ...(onLeaveClick && area.can_leave
            ? [
                  {
                      key: 'leave',
                      label: t('shares.leave.action', 'Leave'),
                      icon: <ArrowRightStartOnRectangleIcon />,
                      danger: true,
                      onSelect: onLeaveClick,
                      testId: 'area-leave',
                  },
              ]
            : []),
    ];

    return (
        <PageHeader
            className="mb-2"
            leading={
                <EntityMark
                    kind="area"
                    color={area.color}
                    className="h-6 w-6"
                />
            }
            title={<span data-testid="area-name">{area.name}</span>}
            meta={
                doneCount > 0
                    ? t(
                          'areas.progressSummary',
                          'Area progress · {{done}} of {{total}} tasks done',
                          { done: doneCount, total: totalCount }
                      )
                    : undefined
            }
            actions={
                <>
                    <Button
                        size="sm"
                        variant="secondary"
                        icon={<PencilSquareIcon className="h-4 w-4" />}
                        onClick={onEditClick}
                    >
                        {t('common.edit', 'Edit')}
                    </Button>
                    <Menu
                        entries={menu}
                        testId="area-actions-menu"
                        trigger={(triggerProps) => (
                            <IconButton
                                {...triggerProps}
                                label={t('project.moreOptions', 'More options')}
                            >
                                <EllipsisHorizontalIcon />
                            </IconButton>
                        )}
                    />
                </>
            }
        >
            {area.description && (
                <p className="max-w-3xl whitespace-pre-wrap text-body-m leading-relaxed text-surface-on-variant">
                    {area.description}
                </p>
            )}
        </PageHeader>
    );
};

export default AreaHero;
