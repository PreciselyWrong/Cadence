import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ChevronRightIcon,
    MagnifyingGlassIcon,
    PlusIcon,
} from '@heroicons/react/24/outline';
import ConfirmDialog from './Shared/ConfirmDialog';
import TagModal from './Tag/TagModal';
import TagRow, { tagUseCount } from './Tag/TagRow';
import PageHeader from './Shared/ui/PageHeader';
import PageShell from './Shared/ui/PageShell';
import EmptyState from './Shared/ui/EmptyState';
import Button, { IconButton } from './Shared/ui/Button';
import SearchField from './Shared/ui/SearchField';
import { Tag } from '../entities/Tag';
import {
    deleteTag as apiDeleteTag,
    createTag,
    updateTag,
} from '../utils/tagsService';
import { useStore } from '../store/useStore';
import { buildTagTree, tagLeafName, TagTreeNode } from '../utils/tagTree';

// A search keeps a tag when it matches, with its whole subtree, and keeps an
// ancestor when one of its descendants matches.
const filterTagTree = (
    nodes: TagTreeNode[],
    matches: (tag: Tag) => boolean
): TagTreeNode[] =>
    nodes.flatMap((node) => {
        if (matches(node.tag)) return [node];
        const children = filterTagTree(node.children, matches);
        return children.length > 0 ? [{ ...node, children }] : [];
    });

const Tags: React.FC = () => {
    const { t } = useTranslation();
    const {
        tagsStore: { tags, setTags, isLoading, isError, hasLoaded, loadTags },
    } = useStore();

    const [isConfirmDialogOpen, setIsConfirmDialogOpen] =
        useState<boolean>(false);
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [isTagModalOpen, setIsTagModalOpen] = useState<boolean>(false);
    const [selectedTag, setSelectedTag] = useState<Tag | null>(null);
    const [collapsedParents, setCollapsedParents] = useState<Set<string>>(
        () => new Set()
    );

    const toggleParent = (uid: string) =>
        setCollapsedParents((prev) => {
            const next = new Set(prev);
            if (next.has(uid)) next.delete(uid);
            else next.add(uid);
            return next;
        });

    useEffect(() => {
        if (!hasLoaded && !isLoading && !isError) {
            loadTags();
        }
    }, [hasLoaded, isLoading, isError, loadTags]);

    const handleDeleteTag = async () => {
        if (!tagToDelete) return;
        try {
            await apiDeleteTag(tagToDelete.uid!);
            setTags(tags.filter((tag) => tag.uid !== tagToDelete.uid));
            // Child tags lose their parent server-side.
            await loadTags(true);
            setIsConfirmDialogOpen(false);
            setTagToDelete(null);
        } catch (err) {
            console.error('Failed to delete tag:', err);
        }
    };

    const handleEditTag = (tag: Tag) => {
        setSelectedTag(tag);
        setIsTagModalOpen(true);
    };

    const handleNewTag = () => {
        setSelectedTag(null);
        setIsTagModalOpen(true);
    };

    const handleSaveTag = async (tagData: Tag) => {
        try {
            if (tagData.uid) {
                await updateTag(tagData.uid, tagData);
            } else {
                await createTag(tagData);
            }
            // A rename moves the whole namespace and a nested name creates
            // its missing ancestors, so reload the list from the server.
            await loadTags(true);
            setIsTagModalOpen(false);
            setSelectedTag(null);
        } catch (error) {
            console.error('Error saving tag:', error);
            throw error;
        }
    };

    const openConfirmDialog = (tag: Tag) => {
        setTagToDelete(tag);
        setIsConfirmDialogOpen(true);
    };

    const closeConfirmDialog = () => {
        setIsConfirmDialogOpen(false);
        setTagToDelete(null);
    };

    const query = searchQuery.toLowerCase();
    const matches = (tag: Tag) => tag.name.toLowerCase().includes(query);

    const filteredTree = filterTagTree(buildTagTree(tags), matches);

    // Most useful first: pinned, then by how much uses the tag (its whole
    // subtree), then by name. No letter groups: they sorted by spelling.
    const subtreeUse = (node: TagTreeNode): number =>
        tagUseCount(node.tag) +
        node.children.reduce((sum, child) => sum + subtreeUse(child), 0);
    const sortedTree = [...filteredTree].sort(
        (a, b) =>
            Number(!!b.tag.pinned) - Number(!!a.tag.pinned) ||
            subtreeUse(b) - subtreeUse(a) ||
            a.tag.name.localeCompare(b.tag.name)
    );

    const renderNode = (
        { tag, children }: TagTreeNode,
        depth = 0
    ): JSX.Element => {
        const uid = tag.uid || '';
        const isCollapsed = !query && collapsedParents.has(uid);
        return (
            <div key={tag.uid || tag.id}>
                <div className="flex items-center">
                    <span className="flex w-5 shrink-0 justify-center">
                        {children.length > 0 && (
                            <button
                                type="button"
                                onClick={() => toggleParent(uid)}
                                aria-expanded={!isCollapsed}
                                aria-label={
                                    isCollapsed
                                        ? t(
                                              'tags.showChildTags',
                                              'Show child tags'
                                          )
                                        : t(
                                              'tags.hideChildTags',
                                              'Hide child tags'
                                          )
                                }
                                className="rounded p-0.5 text-surface-on-variant hover:text-surface-on"
                                data-testid={`tag-toggle-${uid}`}
                            >
                                <ChevronRightIcon
                                    className="h-3 w-3 transition-transform duration-150"
                                    style={{
                                        transform: isCollapsed
                                            ? 'none'
                                            : 'rotate(90deg)',
                                    }}
                                />
                            </button>
                        )}
                    </span>
                    <div className="min-w-0 flex-1">
                        <TagRow
                            tag={tag}
                            label={depth > 0 ? tagLeafName(tag.name) : tag.name}
                            onEdit={handleEditTag}
                            onDelete={openConfirmDialog}
                        />
                    </div>
                </div>
                {!isCollapsed && children.length > 0 && (
                    <div
                        role="list"
                        className="pl-5"
                        data-testid={`tag-children-${uid}`}
                    >
                        {children.map((child) => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="p-8 text-body-m text-surface-on-variant">
                {t('tags.loadingTags', 'Loading tags...')}
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-8 text-body-m text-danger">
                {t('tags.errorLoadingTags', 'Error loading tags.')}
            </div>
        );
    }

    return (
        <PageShell template="list">
            <PageHeader
                title={t('tags.title', 'Tags')}
                actions={
                    <>
                        <IconButton
                            label={
                                isSearchExpanded
                                    ? t(
                                          'common.hideSearch',
                                          'Collapse search panel'
                                      )
                                    : t(
                                          'common.showSearch',
                                          'Show search input'
                                      )
                            }
                            active={isSearchExpanded}
                            aria-expanded={isSearchExpanded}
                            onClick={() => {
                                if (isSearchExpanded) setSearchQuery('');
                                setIsSearchExpanded(!isSearchExpanded);
                            }}
                        >
                            <MagnifyingGlassIcon />
                        </IconButton>
                        <Button
                            variant="primary"
                            icon={<PlusIcon className="h-4 w-4" />}
                            onClick={handleNewTag}
                            data-testid="new-tag-button"
                        >
                            {t('tags.new', 'New Tag')}
                        </Button>
                    </>
                }
            >
                {isSearchExpanded && (
                    <SearchField
                        value={searchQuery}
                        onChange={setSearchQuery}
                        placeholder={t(
                            'tags.searchPlaceholder',
                            'Search tags...'
                        )}
                    />
                )}
            </PageHeader>

            <div className="px-3 max-sm:px-1">
                {sortedTree.length === 0 ? (
                    <EmptyState
                        title={t('tags.noTagsFound', 'No tags found.')}
                    />
                ) : (
                    <div role="list">
                        {sortedTree.map((node) => renderNode(node))}
                    </div>
                )}

                {/* TagModal */}
                {isTagModalOpen && (
                    <TagModal
                        isOpen={isTagModalOpen}
                        onClose={() => {
                            setIsTagModalOpen(false);
                            setSelectedTag(null);
                        }}
                        onSave={handleSaveTag}
                        onDelete={async (tagUid) => {
                            try {
                                await apiDeleteTag(tagUid);
                                setTags(
                                    tags.filter((tag) => tag.uid !== tagUid)
                                );
                                await loadTags(true);
                                setIsTagModalOpen(false);
                                setSelectedTag(null);
                            } catch (error) {
                                console.error('Error deleting tag:', error);
                            }
                        }}
                        tag={selectedTag}
                    />
                )}

                {/* ConfirmDialog */}
                {isConfirmDialogOpen && tagToDelete && (
                    <ConfirmDialog
                        title={t('modals.deleteTag.title')}
                        message={`Are you sure you want to delete the tag "${tagToDelete.name}"?`}
                        onConfirm={handleDeleteTag}
                        onCancel={closeConfirmDialog}
                    />
                )}
            </div>
        </PageShell>
    );
};

export default Tags;
