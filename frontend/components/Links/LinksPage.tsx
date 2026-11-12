import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PageHeader from '../Shared/ui/PageHeader';
import SearchField from '../Shared/ui/SearchField';
import { useStore } from '../../store/useStore';
import { useLinksRefresh, useLinksStore } from '../../store/linksStore';
import {
    DEFAULT_LINK_FILTER,
    filterLinks,
    LinkFilter,
    tagsOf,
    linksByTheme,
} from '../../utils/linkFilters';
import { useToast } from '../Shared/ToastContext';
import GalleryCard from '../Shared/GalleryCard';
import { ViewTypeSwitch } from '../Task/TaskViewBody';
import { useViewType } from '../../hooks/useViewType';
import { linkToTask } from '../../utils/linkTriage';
import { inBatches, parseBookmarks } from '../../utils/bookmarksImport';
import { importLinks } from '../../utils/linksService';
import { Link } from '../../entities/Link';
import LinkActions from './LinkActions';
import LinkCard from './LinkCard';

const FILTER_KEY = 'links.filter';

// Only the tag and the project are remembered; older saved filters (kind,
// status, site, sort) are ignored.
const readFilter = (): LinkFilter => {
    try {
        const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
        return {
            ...DEFAULT_LINK_FILTER,
            tag: typeof saved?.tag === 'string' ? saved.tag : 'all',
            project: typeof saved?.project === 'string' ? saved.project : 'all',
        };
    } catch {
        return DEFAULT_LINK_FILTER;
    }
};

const SELECT =
    'h-9 max-w-full rounded-lg border-0 bg-surface-high/70 pl-2.5 pr-8 text-body-m text-surface-on focus:ring-2 focus:ring-primary/40 max-sm:h-11';

// Every kept link in one place: search, tag, project, the archive.
const LinksPage: React.FC = () => {
    const { t } = useTranslation();
    const { showErrorToast, showSuccessToast } = useToast();
    useLinksRefresh();
    const links = useLinksStore((s) => s.links);
    const loaded = useLinksStore((s) => s.loaded);
    const loadError = useLinksStore((s) => s.error);
    const save = useLinksStore((s) => s.save);
    const removeLink = useLinksStore((s) => s.remove);
    const load = useLinksStore((s) => s.load);
    const tagsStore = useStore((s) => s.tagsStore);
    const projectsStore = useStore((s) => s.projectsStore);
    const [filter, setFilterState] = useState<LinkFilter>(readFilter);
    // List (cards with actions, the default) or Gallery (pictures),
    // remembered in ui_settings.viewTypes.links.
    const { viewType, setViewType } = useViewType('links', 'list');
    const gallery = viewType === 'gallery';

    useEffect(() => {
        if (!tagsStore.hasLoaded) void tagsStore.loadTags();
    }, [tagsStore]);

    useEffect(() => {
        if (!projectsStore.hasLoaded && !projectsStore.isLoading) {
            void projectsStore.loadProjects();
        }
    }, [projectsStore]);

    const setFilter = (changes: Partial<LinkFilter>) => {
        const next = { ...filter, ...changes };
        setFilterState(next);
        try {
            localStorage.setItem(
                FILTER_KEY,
                JSON.stringify({ tag: next.tag, project: next.project })
            );
        } catch {
            // Remembering the filter is a convenience.
        }
    };

    const shown = useMemo(() => filterLinks(links, filter), [links, filter]);
    const themes = useMemo(() => linksByTheme(shown), [shown]);
    const tags = useMemo(() => tagsOf(links), [links]);

    const change = (uid: string) => (changes: Parameters<typeof save>[1]) =>
        save(uid, changes).catch(() =>
            showErrorToast(t('links.saveError', 'Could not save the link.'))
        );

    const toTask = (link: Link) => () =>
        linkToTask(link).then(
            (task) =>
                showSuccessToast(
                    t('links.taskCreated', 'Task created: {{name}}', {
                        name: task.name,
                    })
                ),
            () =>
                showErrorToast(t('links.saveError', 'Could not save the link.'))
        );

    const importFile = async (file: File) => {
        const bookmarks = parseBookmarks(await file.text());
        const total = { created: 0, existing: 0, invalid: 0 };
        try {
            for (const batch of inBatches(bookmarks)) {
                const result = await importLinks(batch);
                total.created += result.created;
                total.existing += result.existing;
                total.invalid += result.invalid;
            }
            showSuccessToast(
                t(
                    'links.import.result',
                    '{{created}} added, {{existing}} already there',
                    total
                )
            );
            void load(true);
        } catch {
            showErrorToast(
                t('links.import.error', 'The bookmarks could not be imported.')
            );
        }
    };

    const remove = (uid: string) => () =>
        removeLink(uid).catch(() =>
            showErrorToast(t('links.deleteError', 'Could not delete the link.'))
        );

    // Fails on to its caller: the edit form stays open on a refusal.
    const edit = (uid: string) => (changes: Parameters<typeof save>[1]) =>
        save(uid, changes).catch((error) => {
            showErrorToast(t('links.saveError', 'Could not save the link.'));
            throw error;
        });

    return (
        <div
            className={`mx-auto w-full pb-10 ${gallery ? 'max-w-6xl' : 'max-w-4xl'}`}
        >
            <PageHeader
                title={t('links.title', 'Links')}
                meta={
                    loaded && links.length > 0
                        ? t('links.count', '{{count}} links', {
                              count: links.length,
                          })
                        : undefined
                }
                actions={
                    <>
                        <label className="inline-flex h-7 cursor-pointer items-center whitespace-nowrap rounded-lg px-2.5 text-body-m font-medium text-surface-on-variant hover:bg-surface-high hover:text-surface-on focus-within:ring-2 focus-within:ring-primary/60">
                            {t('links.import.button', 'Import bookmarks')}
                            <input
                                type="file"
                                accept=".html,text/html"
                                className="sr-only"
                                onChange={(event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = '';
                                    if (file) void importFile(file);
                                }}
                            />
                        </label>
                        {links.length > 0 && (
                            <ViewTypeSwitch
                                value={gallery ? 'gallery' : 'list'}
                                onChange={setViewType}
                                keys={['list', 'gallery']}
                            />
                        )}
                    </>
                }
            >
                <div className="flex flex-wrap items-center gap-2">
                    <SearchField
                        className="min-w-[12rem] flex-1"
                        autoFocus={false}
                        value={filter.query}
                        onChange={(query) => setFilter({ query })}
                        placeholder={t('links.search', 'Search links')}
                    />
                    {tags.length > 0 && (
                        <select
                            aria-label={t('links.filter.tag', 'Tag')}
                            className={SELECT}
                            value={filter.tag}
                            onChange={(e) => setFilter({ tag: e.target.value })}
                        >
                            <option value="all">
                                {t('links.filter.allTags', 'All tags')}
                            </option>
                            {tags.map((tag) => (
                                <option key={tag} value={tag}>
                                    #{tag}
                                </option>
                            ))}
                        </select>
                    )}
                    {projectsStore.projects.length > 0 && (
                        <select
                            aria-label={t('links.tryProject', 'Project')}
                            className={`${SELECT} max-w-[180px]`}
                            value={filter.project}
                            onChange={(e) =>
                                setFilter({ project: e.target.value })
                            }
                        >
                            <option value="all">
                                {t('links.filter.allProjects', 'All projects')}
                            </option>
                            {projectsStore.projects.map((project) => (
                                <option key={project.uid} value={project.uid}>
                                    {project.name}
                                </option>
                            ))}
                        </select>
                    )}
                    <button
                        type="button"
                        aria-pressed={filter.archived}
                        onClick={() =>
                            setFilter({ archived: !filter.archived })
                        }
                        className={`h-9 rounded-lg px-3 text-body-m font-medium max-sm:h-11 ${
                            filter.archived
                                ? 'bg-primary-container text-primary-on-container'
                                : 'text-surface-on-variant hover:bg-surface-high hover:text-surface-on'
                        }`}
                    >
                        {t('links.filter.archived', 'Archived')}
                    </button>
                </div>
            </PageHeader>

            <div className="px-3 max-sm:px-1">
                {loaded && loadError && links.length === 0 && (
                    <p className="px-3 py-6 text-body-m text-surface-on-variant">
                        {t('links.loadError', 'Could not load the links.')}
                    </p>
                )}
                {loaded && !loadError && links.length === 0 && (
                    <p className="px-3 py-6 text-body-m text-surface-on-variant">
                        {t(
                            'links.empty',
                            'Links you keep from the inbox show up here, with what the page says about itself.'
                        )}
                    </p>
                )}
                {links.length > 0 && shown.length === 0 && (
                    <p className="px-3 py-6 text-body-m text-surface-on-variant">
                        {t('links.noMatch', 'No link matches these filters.')}
                    </p>
                )}

                {gallery ? (
                    <div className="space-y-6">
                        {themes.map((theme) => (
                            <section key={theme.name ?? ''}>
                                {themes.length > 1 && (
                                    <h2 className="flex h-8 items-center px-1 text-xs font-medium text-surface-on-variant">
                                        {theme.name ??
                                            t('links.noTheme', 'No theme')}
                                    </h2>
                                )}
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                                    {theme.links.map((link) => (
                                        <GalleryCard
                                            key={link.uid}
                                            title={
                                                link.title ||
                                                link.domain ||
                                                link.url
                                            }
                                            image={link.image_url}
                                            meta={[
                                                link.site_name || link.domain,
                                                link.project_name,
                                            ]
                                                .filter(Boolean)
                                                .join(' · ')}
                                            tags={link.tags}
                                            href={link.url}
                                            dimmed={link.status === 'dropped'}
                                            footer={
                                                <LinkActions
                                                    link={link}
                                                    projects={
                                                        projectsStore.projects
                                                    }
                                                    availableTags={
                                                        tagsStore.tags
                                                    }
                                                    onChange={edit(link.uid)}
                                                    onTask={toTask(link)}
                                                    onDelete={remove(link.uid)}
                                                />
                                            }
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                ) : (
                    <div role="list">
                        {shown.map((link) => (
                            <LinkCard
                                key={link.uid}
                                link={link}
                                onChange={edit(link.uid)}
                                onNote={change(link.uid)}
                                availableTags={tagsStore.tags}
                                projects={projectsStore.projects}
                                onTask={toTask(link)}
                                onDelete={remove(link.uid)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LinksPage;
