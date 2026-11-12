import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
    FolderIcon,
    PlusIcon,
    Squares2X2Icon,
} from '@heroicons/react/24/outline';
import ConfirmDialog from './Shared/ConfirmDialog';
import AreaModal from './Area/AreaModal';
import PageHeader from './Shared/ui/PageHeader';
import Button from './Shared/ui/Button';
import ListRow, { countsLine } from './Shared/ui/ListRow';
import EntityMark from './Shared/ui/EntityMark';
import BlankSlate from './Shared/BlankSlate';
import IconSortDropdown from './Shared/IconSortDropdown';
import { SortOption } from './Shared/SortFilterButton';
import SortableItem from './Shared/SortableItem';
import { useToast } from './Shared/ToastContext';
import {
    mergeVisibleOrder,
    resetSortableCursor,
    sortableCursorHandlers,
    swallowNextClick,
    useSortableSensors,
} from './Shared/sortableList';
import { useCan } from '../hooks/useCan';
import { useStore } from '../store/useStore';
import {
    fetchAreas,
    createArea,
    updateArea,
    deleteArea,
    reorderAreas,
} from '../utils/areasService';
import { Area } from '../entities/Area';

const areaPath = (area: Area) =>
    area.uid
        ? `/area/${area.uid}-${area.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')}`
        : `/areas`;

const compareCustomOrder = (a: Area, b: Area) => {
    const posA = a.sort_position ?? null;
    const posB = b.sort_position ?? null;
    if (posA === null || posB === null) {
        if (posA !== posB) return posA === null ? -1 : 1;
        return a.name.localeCompare(b.name);
    }
    return posA - posB;
};

const compareAreas = (a: Area, b: Area, orderBy: string): number => {
    const [field, direction] = orderBy.split(':');
    if (field === 'custom') return compareCustomOrder(a, b);
    const sign = direction === 'desc' ? -1 : 1;
    let result: number;
    switch (field) {
        case 'projects':
            result = (a.projects_count ?? 0) - (b.projects_count ?? 0);
            break;
        case 'goals':
            result = (a.goals_count ?? 0) - (b.goals_count ?? 0);
            break;
        case 'tasks':
            result = (a.tasks_count ?? 0) - (b.tasks_count ?? 0);
            break;
        default:
            return sign * a.name.localeCompare(b.name);
    }
    return sign * result || a.name.localeCompare(b.name);
};

const Areas: React.FC = () => {
    const { t } = useTranslation();
    const { showErrorToast } = useToast();

    // Use global store for consistency
    const { areas, loadAreas } = useStore((state: any) => state.areasStore);

    const canCreateAreas = useCan('create_projects');
    const [isAreaModalOpen, setIsAreaModalOpen] = useState<boolean>(false);
    const [selectedArea, setSelectedArea] = useState<Area | null>(null);
    const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
        useState<boolean>(false);
    const [areaToDelete, setAreaToDelete] = useState<Area | null>(null);
    const [orderBy, setOrderBy] = useState<string>(() => {
        try {
            return localStorage.getItem('areasSortOrder') || 'name:asc';
        } catch {
            return 'name:asc';
        }
    });
    const sensors = useSortableSensors();

    useEffect(() => {
        // Force a fresh fetch on every visit so the goal/task/project counts
        // shown on the cards don't go stale after edits made elsewhere in the app.
        loadAreas(true);
    }, [loadAreas]);

    useEffect(() => {
        try {
            localStorage.setItem('areasSortOrder', orderBy);
        } catch {
            // Storage can be unavailable (private mode), sorting still works
        }
    }, [orderBy]);

    const handleSaveArea = async (areaData: Partial<Area>) => {
        try {
            useStore.getState().areasStore.setLoading(true);
            let result: Area;
            if (areaData.uid) {
                result = await updateArea(areaData.uid, {
                    name: areaData.name,
                    description: areaData.description,
                    color: areaData.color,
                });
                // Update the existing area in the list
                const currentAreas = useStore.getState().areasStore.areas;
                useStore
                    .getState()
                    .areasStore.setAreas(
                        currentAreas.map((area: any) =>
                            area.uid === result.uid ? result : area
                        )
                    );
            } else {
                result = await createArea({
                    name: areaData.name,
                    description: areaData.description,
                    color: areaData.color,
                });

                // Add the new area immediately to global state
                const currentAreas = useStore.getState().areasStore.areas;
                const newAreas = [...currentAreas, result];
                useStore.getState().areasStore.setAreas(newAreas);
            }

            // Close modal only on success
            setIsAreaModalOpen(false);
            setSelectedArea(null);
            useStore.getState().areasStore.setError(false);
        } catch (error) {
            console.error('Error saving area:', error);
            useStore.getState().areasStore.setError(true);
        } finally {
            useStore.getState().areasStore.setLoading(false);
        }
    };

    // One click from the blank slate: an area with just a name, no modal.
    const addPresetArea = async (name: string) => {
        const existing = useStore.getState().areasStore.areas;
        if (
            existing.some(
                (area: any) => area.name?.toLowerCase() === name.toLowerCase()
            )
        ) {
            return;
        }
        try {
            const result = await createArea({ name });
            useStore
                .getState()
                .areasStore.setAreas([
                    ...useStore.getState().areasStore.areas,
                    result,
                ]);
            useStore.getState().areasStore.setError(false);
        } catch (error) {
            console.error('Error creating area:', error);
            useStore.getState().areasStore.setError(true);
        }
    };

    // The five domains offered on request (never created on their own), in
    // the user's language; names that already exist are left alone.
    const suggestedDomains = [
        t('areas.domains.business', 'Business & Money'),
        t('areas.domains.tech', 'Tech & Systems'),
        t('areas.domains.personal', 'Personal'),
        t('areas.domains.family', 'Family & Social'),
        t('areas.domains.logistics', 'Logistics'),
    ];
    const missingDomains = suggestedDomains.filter(
        (name) =>
            !areas.some(
                (area: Area) => area.name?.toLowerCase() === name.toLowerCase()
            )
    );

    const addSuggestedDomains = async () => {
        for (const name of suggestedDomains) {
            await addPresetArea(name);
        }
    };

    const areaPresets = [
        t('areas.presetHome', 'Home'),
        t('areas.presetWork', 'Work'),
        t('areas.presetHealth', 'Health'),
        t('areas.presetFamily', 'Family'),
    ];

    const handleNewArea = () => {
        setSelectedArea(null);
        setIsAreaModalOpen(true);
    };

    const handleEditArea = (area: Area) => {
        setSelectedArea(area);
        setIsAreaModalOpen(true);
    };

    const openConfirmDialog = (area: Area) => {
        setAreaToDelete(area);
        setIsConfirmDialogOpen(true);
    };

    const handleDeleteArea = async () => {
        if (!areaToDelete) return;

        useStore.getState().areasStore.setLoading(true);
        try {
            await deleteArea(areaToDelete.uid!);
            // Remove the area from global state immediately
            const currentAreas = useStore.getState().areasStore.areas;
            useStore
                .getState()
                .areasStore.setAreas(
                    currentAreas.filter(
                        (area: any) => area.uid !== areaToDelete.uid
                    )
                );
            setIsConfirmDialogOpen(false);
            setAreaToDelete(null);
            useStore.getState().areasStore.setError(false);
        } catch (error) {
            console.error('Error deleting area:', error);
            useStore.getState().areasStore.setError(true);
        } finally {
            useStore.getState().areasStore.setLoading(false);
        }
    };

    const closeConfirmDialog = () => {
        setIsConfirmDialogOpen(false);
        setAreaToDelete(null);
    };

    const sortedAreas = [...areas].sort((a: Area, b: Area) =>
        compareAreas(a, b, orderBy)
    );

    const sortOptions: SortOption[] = [
        { value: 'name:asc', label: t('areas.sort.nameAsc', 'Name A to Z') },
        { value: 'name:desc', label: t('areas.sort.nameDesc', 'Name Z to A') },
        {
            value: 'projects:desc',
            label: t('areas.sort.projects', 'Most projects'),
        },
        { value: 'goals:desc', label: t('areas.sort.goals', 'Most goals') },
        { value: 'tasks:desc', label: t('areas.sort.tasks', 'Most tasks') },
        { value: 'custom:asc', label: t('areas.sort.custom', 'Custom order') },
    ];

    const isCustomOrder = orderBy.startsWith('custom:');

    const handleDragEnd = async ({ active, over }: DragEndEvent) => {
        resetSortableCursor();
        if (!over || active.id === over.id) return;
        swallowNextClick();

        const visibleUids = sortedAreas.map((a: Area) => a.uid as string);
        const from = visibleUids.indexOf(active.id as string);
        const to = visibleUids.indexOf(over.id as string);
        if (from === -1 || to === -1) return;
        const movedVisible = arrayMove(visibleUids, from, to);

        const fullOrder = [...areas]
            .sort((a: Area, b: Area) => compareAreas(a, b, orderBy))
            .map((a: Area) => a.uid as string);
        const newOrder = mergeVisibleOrder(fullOrder, movedVisible);

        const positionByUid = new Map(newOrder.map((uid, i) => [uid, i]));
        const prevAreas = areas;
        useStore
            .getState()
            .areasStore.setAreas(
                areas.map((a: Area) =>
                    a.uid && positionByUid.has(a.uid)
                        ? { ...a, sort_position: positionByUid.get(a.uid) }
                        : a
                )
            );
        // Dragging under another sort starts a custom order from what is
        // on screen.
        const prevOrderBy = orderBy;
        if (!isCustomOrder) setOrderBy('custom:asc');
        try {
            await reorderAreas(newOrder);
        } catch (error) {
            console.error('Error saving area order:', error);
            useStore.getState().areasStore.setAreas(prevAreas);
            setOrderBy(prevOrderBy);
            showErrorToast(
                t('areas.reorderError', 'Failed to save area order')
            );
        }
    };

    const areaUses = (area: Area) =>
        countsLine(t, {
            projects: area.projects_count,
            goals: area.goals_count,
            tasks: area.tasks_count,
        });

    return (
        <div className="mx-auto w-full max-w-4xl pb-8">
            <PageHeader
                title={t('areas.title')}
                actions={
                    <>
                        {canCreateAreas &&
                            areas.length > 0 &&
                            missingDomains.length > 0 && (
                                <Button
                                    variant="ghost"
                                    onClick={addSuggestedDomains}
                                    data-testid="suggest-domains-link"
                                >
                                    {t(
                                        'areas.suggestDomains',
                                        'Suggest 5 domains'
                                    )}
                                </Button>
                            )}
                        {areas.length > 0 && (
                            <IconSortDropdown
                                options={sortOptions}
                                value={orderBy}
                                onChange={setOrderBy}
                                ariaLabel={t('areas.sort.label', 'Sort areas')}
                                title={t('areas.sort.label', 'Sort areas')}
                                dropdownLabel={t(
                                    'areas.sort.label',
                                    'Sort areas'
                                )}
                                align="right"
                            />
                        )}
                        {canCreateAreas && (
                            <Button
                                variant="primary"
                                icon={<PlusIcon className="h-4 w-4" />}
                                onClick={handleNewArea}
                                data-testid="new-area-button"
                            >
                                {t('areas.new', 'New Area')}
                            </Button>
                        )}
                    </>
                }
            />
            <div className="px-3 max-sm:px-1">
                {areas.length === 0 ? (
                    <BlankSlate
                        title={t('areas.noAreasYet', 'No areas yet.')}
                        hint={t(
                            'areas.blankSlateHint',
                            'Areas are the parts of your life you keep up over time, like Work, Health or Home. Put your projects and goals in them to see each part in one place.'
                        )}
                        actions={[
                            ...(canCreateAreas
                                ? [
                                      {
                                          label: t(
                                              'areas.blankSlateNew',
                                              'Create your first area'
                                          ),
                                          icon: PlusIcon,
                                          onClick: handleNewArea,
                                      },
                                      {
                                          label: t(
                                              'areas.suggestDomains',
                                              'Suggest 5 domains'
                                          ),
                                          icon: Squares2X2Icon,
                                          onClick: addSuggestedDomains,
                                          testId: 'suggest-domains-button',
                                      },
                                  ]
                                : []),
                            {
                                label: t(
                                    'areas.blankSlateProjects',
                                    'Go to projects'
                                ),
                                icon: FolderIcon,
                                to: '/projects',
                            },
                        ]}
                        presetsLabel={
                            canCreateAreas
                                ? t(
                                      'areas.presetsLabel',
                                      'Most people start with'
                                  )
                                : undefined
                        }
                        presets={
                            canCreateAreas
                                ? areaPresets.map((name) => ({
                                      label: name,
                                      onClick: () => addPresetArea(name),
                                      testId: `area-preset-${name.toLowerCase()}`,
                                  }))
                                : []
                        }
                    />
                ) : (
                    <>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            {...sortableCursorHandlers}
                            onDragEnd={handleDragEnd}
                        >
                            <SortableContext
                                items={sortedAreas.map(
                                    (a: Area) => a.uid as string
                                )}
                                strategy={verticalListSortingStrategy}
                            >
                                <div role="list">
                                    {sortedAreas.map((area: Area) => (
                                        <SortableItem
                                            key={area.uid}
                                            id={area.uid as string}
                                            label={area.name}
                                            roleDescription={t(
                                                'sortable.area',
                                                'sortable area'
                                            )}
                                            testIdPrefix="sortable-area"
                                        >
                                            <ListRow
                                                to={areaPath(area)}
                                                testId={`area-row-${area.uid}`}
                                                leading={
                                                    <EntityMark
                                                        kind="area"
                                                        color={area.color}
                                                    />
                                                }
                                                title={area.name}
                                                meta={areaUses(area)}
                                                menu={[
                                                    {
                                                        key: 'edit',
                                                        label: t(
                                                            'areas.edit',
                                                            'Edit'
                                                        ),
                                                        testId: `area-edit-${area.uid}`,
                                                        onSelect: () =>
                                                            handleEditArea(
                                                                area
                                                            ),
                                                    },
                                                    {
                                                        key: 'delete',
                                                        label: t(
                                                            'areas.delete',
                                                            'Delete'
                                                        ),
                                                        danger: true,
                                                        testId: `area-delete-${area.uid}`,
                                                        onSelect: () =>
                                                            openConfirmDialog(
                                                                area
                                                            ),
                                                    },
                                                ]}
                                                menuTestId={`area-dropdown-${area.uid}`}
                                                menuLabel={t(
                                                    'areas.toggleDropdownMenu'
                                                )}
                                            />
                                        </SortableItem>
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    </>
                )}

                {/* AreaModal */}
                {isAreaModalOpen && (
                    <AreaModal
                        isOpen={isAreaModalOpen}
                        onClose={() => setIsAreaModalOpen(false)}
                        onSave={handleSaveArea}
                        onDelete={async (areaUid: string) => {
                            try {
                                await deleteArea(areaUid);
                                const updatedAreas = await fetchAreas();
                                useStore
                                    .getState()
                                    .areasStore.setAreas(updatedAreas);
                                setIsAreaModalOpen(false);
                                setSelectedArea(null);
                            } catch (error) {
                                console.error(
                                    'Error deleting area from modal:',
                                    error
                                );
                                useStore.getState().areasStore.setError(true);
                            }
                        }}
                        area={selectedArea}
                    />
                )}

                {/* ConfirmDialog */}
                {isConfirmDialogOpen && areaToDelete && (
                    <ConfirmDialog
                        title={t('modals.deleteArea.title')}
                        message={`Are you sure you want to delete the area "${areaToDelete.name}"?`}
                        onConfirm={handleDeleteArea}
                        onCancel={closeConfirmDialog}
                    />
                )}
            </div>
        </div>
    );
};

export default Areas;
