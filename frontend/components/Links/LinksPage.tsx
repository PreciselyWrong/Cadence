import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useStore } from '../../store/useStore';
import { useLinksRefresh, useLinksStore } from '../../store/linksStore';
import {
    DEFAULT_LINK_FILTER,
    domainsOf,
    filterLinks,
    LINK_KINDS,
    LINK_STATUSES,
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

const readFilter = (): LinkFilter => {
    try {
        const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || 'null');
        return saved
            ? { ...DEFAULT_LINK_FILTER, ...saved, query: '' }
            : DEFAULT_LINK_FILTER;
    } catch {
        return DEFAULT_LINK_FILTER;
    }
};

const SELECT =
    'min-h-[36px] max-w-full rounded-lg border border-gray-200 bg-white pl-2 pr-8 text-[13px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

// Every saved link in one place: search, a few filters, cards.
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
    // List (cards with actions) or Gallery (pictures), remembered in
    // ui_settings.viewTypes.links.
    const { viewType, setViewType } = useViewType('links', 'gallery');
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
                JSON.stringify({ ...next, query: '' })
            );
        } catch {
            // Remembering the filter is a convenience.
        }
    };

    const shown = useMemo(() => filterLinks(links, filter), [links, filter]);
    const domains = useMemo(() => domainsOf(links), [links]);
    const themes = useMemo(() => linksByTheme(shown), [shown]);
    const tags = useMemo(() => tagsOf(links), [links]);

    const change = (uid: string) => (changes: Parameters<typeof save>[1]) =>
        save(uid, changes).catch(() =>
            showErrorToast(t('links.saveError', 'Could not save the link.'))
        );

    const toTask = (link: Link) => () =>
        linkToTask(link, save).then(
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

    const kindLabel = (kind: string) =>
        ({
            repo: t('links.kind.repo', 'Repo'),
            article: t('links.kind.article', 'Article'),
            video: t('links.kind.video', 'Video'),
            tool: t('links.kind.tool', 'Tool'),
            other: t('links.kind.other', 'Other'),
        })[kind] ?? kind;

    const statusLabel = (status: string) =>
        ({
            new: t('links.status.new', 'To read'),
            to_evaluate: t('links.status.to_evaluate', 'To evaluate'),
            tested: t('links.status.tested', 'To try'),
            kept: t('links.status.kept', 'Kept'),
            parked: t('links.status.parked', 'Later'),
            dropped: t('links.status.dropped', 'Archived'),
        })[status] ?? status;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 sm:px-6">
            <header className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-2xl font-light text-gray-900 dark:text-gray-100">
                        {t('links.title', 'Links')}
                    </h2>
                    {loaded && links.length > 0 && (
                        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                            {t('links.count', '{{count}} links', {
                                count: links.length,
                            })}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <label className="cursor-pointer whitespace-nowrap text-[13px] text-gray-600 underline underline-offset-2 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
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
                </div>
            </header>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <label className="relative min-w-0 flex-1 sm:min-w-[220px]">
                    <span className="sr-only">
                        {t('links.search', 'Search links')}
                    </span>
                    <MagnifyingGlassIcon
                        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={filter.query}
                        onChange={(e) => setFilter({ query: e.target.value })}
                        placeholder={t('links.search', 'Search links')}
                        className={`${SELECT} w-full pl-8`}
                    />
                </label>
                <div className="flex flex-wrap gap-2">
                    <select
                        aria-label={t('links.filter.kind', 'Kind')}
                        className={SELECT}
                        value={filter.kind}
                        onChange={(e) =>
                            setFilter({
                                kind: e.target.value as LinkFilter['kind'],
                            })
                        }
                    >
                        <option value="all">
                            {t('links.filter.allKinds', 'All kinds')}
                        </option>
                        {LINK_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                                {kindLabel(kind)}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label={t('links.filter.status', 'Status')}
                        className={SELECT}
                        value={filter.status}
                        onChange={(e) =>
                            setFilter({
                                status: e.target.value as LinkFilter['status'],
                            })
                        }
                    >
                        <option value="active">
                            {t('links.filter.active', 'Not dropped')}
                        </option>
                        <option value="all">
                            {t('links.filter.allStatuses', 'All statuses')}
                        </option>
                        {LINK_STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {statusLabel(status)}
                            </option>
                        ))}
                    </select>
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
                    {domains.length > 1 && (
                        <select
                            aria-label={t('links.filter.domain', 'Site')}
                            className={`${SELECT} max-w-[180px]`}
                            value={filter.domain}
                            onChange={(e) =>
                                setFilter({ domain: e.target.value })
                            }
                        >
                            <option value="all">
                                {t('links.filter.allDomains', 'All sites')}
                            </option>
                            {domains.map((domain) => (
                                <option key={domain} value={domain}>
                                    {domain}
                                </option>
                            ))}
                        </select>
                    )}
                    <select
                        aria-label={t('links.filter.sort', 'Sort')}
                        className={SELECT}
                        value={filter.sort}
                        onChange={(e) =>
                            setFilter({
                                sort: e.target.value as LinkFilter['sort'],
                            })
                        }
                    >
                        <option value="newest">
                            {t('links.sort.newest', 'Newest first')}
                        </option>
                        <option value="oldest">
                            {t('links.sort.oldest', 'Oldest first')}
                        </option>
                    </select>
                </div>
            </div>

            {loaded && loadError && links.length === 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('links.loadError', 'Could not load the links.')}
                </p>
            )}
            {loaded && !loadError && links.length === 0 && (
                <p className="max-w-md text-sm text-gray-600 dark:text-gray-300">
                    {t(
                        'links.empty',
                        'Links you capture in the inbox, a task or a note show up here, with what the page says about itself.'
                    )}
                </p>
            )}
            {links.length > 0 && shown.length === 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {t('links.noMatch', 'No link matches these filters.')}
                </p>
            )}

            {gallery ? (
                <div className="space-y-6">
                    {themes.map((theme) => (
                        <section key={theme.name ?? ''}>
                            {themes.length > 1 && (
                                <h2 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
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
                                                availableTags={tagsStore.tags}
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
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
    );
};

export default LinksPage;
