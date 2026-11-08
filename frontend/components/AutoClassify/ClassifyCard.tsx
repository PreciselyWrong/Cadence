import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORM } from '../../constants/formClasses';
import { Project } from '../../entities/Project';
import { fetchProjects } from '../../utils/projectsService';
import {
    acceptAllChoice,
    ClassifyChoice,
    ClassifyPayload,
    ProjectChoice,
} from '../../utils/autoClassifyService';

const buttonBase =
    'min-h-[40px] rounded-lg px-3 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500';
const secondary = `${buttonBase} text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-800`;
const primary = `${buttonBase} bg-indigo-600 text-white hover:bg-indigo-700`;
const rowTitle =
    'text-[13px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400';
const option =
    'flex min-h-[36px] cursor-pointer items-center gap-2 text-[15px] text-gray-900 dark:text-gray-100';

interface ClassifyCardProps {
    payload: ClassifyPayload;
    onApply: (choice: ClassifyChoice | 'all') => void;
    onDismiss: () => void;
}

const percent = (value: number | null) =>
    value === null ? '' : ` · ${Math.round(value * 100)} %`;

// The classifier was unsure: project, tags and priority in one card, each row
// shown only when it has something to ask. The best answers are preselected,
// so "Appliquer" right away is "Tout accepter"; a new project or tag is only
// created when the user picks it.
const ClassifyCard: React.FC<ClassifyCardProps> = ({
    payload,
    onApply,
    onDismiss,
}) => {
    const { t } = useTranslation();
    const best = acceptAllChoice(payload);
    const [project, setProject] = useState<string>(
        best.project.type === 'project'
            ? `project:${best.project.uid}`
            : best.project.type === 'area'
              ? 'area'
              : 'none'
    );
    const [newName, setNewName] = useState(
        payload.project?.new_project?.name ?? ''
    );
    const [otherUid, setOtherUid] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [tags, setTags] = useState<Set<string>>(new Set(best.tags));
    const [newTag, setNewTag] = useState(false);
    const [priority, setPriority] = useState(best.priority !== null);

    useEffect(() => {
        if (project !== 'other' || projects.length > 0) return;
        fetchProjects('active')
            .then(setProjects)
            .catch(() => setProjects([]));
    }, [project, projects.length]);

    const projectChoice = (): ProjectChoice => {
        if (project.startsWith('project:')) {
            return { type: 'project', uid: project.slice('project:'.length) };
        }
        if (project === 'area' && payload.project?.area) {
            return { type: 'area', uid: payload.project.area.uid };
        }
        if (project === 'new' && newName.trim()) {
            return {
                type: 'new_project',
                name: newName.trim(),
                area_uid: payload.project?.new_project?.area_uid ?? null,
            };
        }
        if (project === 'other' && otherUid) {
            return { type: 'project', uid: otherUid };
        }
        return { type: 'none' };
    };

    const submit = () =>
        onApply({
            project: payload.project ? projectChoice() : { type: 'none' },
            tags: [...tags],
            new_tag: newTag ? (payload.tags?.new_tag ?? null) : null,
            priority: priority ? (payload.priority?.value ?? null) : null,
        });

    const toggleTag = (name: string) =>
        setTags((prev) => {
            const next = new Set(prev);
            if (next.has(name)) next.delete(name);
            else next.add(name);
            return next;
        });

    const radio = (value: string, label: React.ReactNode) => (
        <label className={option} key={value}>
            <input
                type="radio"
                name="classify-project"
                checked={project === value}
                onChange={() => setProject(value)}
            />
            <span>{label}</span>
        </label>
    );

    return (
        <div data-testid="classify-card">
            {payload.project && (
                <fieldset className="mt-3">
                    <legend className={rowTitle}>
                        {t('autoClassify.card.project', 'Projet')}
                    </legend>
                    {payload.project.options.map((choice) =>
                        radio(
                            `project:${choice.uid}`,
                            <>
                                {choice.name}
                                <span className="text-[13px] text-gray-600 dark:text-gray-300">
                                    {choice.area_name
                                        ? ` · ${choice.area_name}`
                                        : ''}
                                    {percent(choice.confidence)}
                                </span>
                            </>
                        )
                    )}
                    {payload.project.area &&
                        radio(
                            'area',
                            t('autoClassify.card.area', 'Domaine : {{name}}', {
                                name: payload.project.area.name,
                            })
                        )}
                    {radio(
                        'new',
                        t('autoClassify.card.newProject', 'Nouveau projet')
                    )}
                    {project === 'new' && (
                        <div className="ml-6">
                            <input
                                type="text"
                                className={`${FORM.input} w-full`}
                                value={newName}
                                maxLength={100}
                                aria-label={t(
                                    'autoClassify.card.newProjectName',
                                    'Nom du nouveau projet'
                                )}
                                onChange={(event) =>
                                    setNewName(event.target.value)
                                }
                            />
                            {payload.project.new_project?.area_name && (
                                <p className="mt-1 text-[13px] text-gray-600 dark:text-gray-300">
                                    {t(
                                        'autoClassify.card.inArea',
                                        'Dans {{name}}',
                                        {
                                            name: payload.project.new_project
                                                .area_name,
                                        }
                                    )}
                                </p>
                            )}
                        </div>
                    )}
                    {radio('other', t('autoClassify.card.other', 'Autre…'))}
                    {project === 'other' && (
                        <select
                            className={`${FORM.select} ml-6 w-[calc(100%-1.5rem)]`}
                            value={otherUid}
                            aria-label={t(
                                'autoClassify.card.pickProject',
                                'Choisir un projet'
                            )}
                            onChange={(event) =>
                                setOtherUid(event.target.value)
                            }
                        >
                            <option value="">
                                {t(
                                    'autoClassify.card.pickProject',
                                    'Choisir un projet'
                                )}
                            </option>
                            {projects
                                .filter((candidate) => candidate.uid)
                                .map((candidate) => (
                                    <option
                                        key={candidate.uid}
                                        value={candidate.uid}
                                    >
                                        {candidate.name}
                                    </option>
                                ))}
                        </select>
                    )}
                    {radio('none', t('autoClassify.card.none', 'Aucun'))}
                </fieldset>
            )}
            {payload.tags && (
                <fieldset className="mt-3">
                    <legend className={rowTitle}>
                        {t('autoClassify.card.tags', 'Tags')}
                    </legend>
                    {payload.tags.options.map((name) => (
                        <label className={option} key={name}>
                            <input
                                type="checkbox"
                                checked={tags.has(name)}
                                onChange={() => toggleTag(name)}
                            />
                            <span>#{name}</span>
                        </label>
                    ))}
                    {payload.tags.new_tag && (
                        <label className={option}>
                            <input
                                type="checkbox"
                                checked={newTag}
                                onChange={() => setNewTag((on) => !on)}
                            />
                            <span>
                                {t(
                                    'autoClassify.card.newTag',
                                    'Nouveau tag : #{{name}}',
                                    { name: payload.tags.new_tag }
                                )}
                            </span>
                        </label>
                    )}
                </fieldset>
            )}
            {payload.priority && (
                <fieldset className="mt-3">
                    <legend className={rowTitle}>
                        {t('autoClassify.card.priority', 'Priorité')}
                    </legend>
                    <label className={option}>
                        <input
                            type="checkbox"
                            checked={priority}
                            onChange={() => setPriority((on) => !on)}
                        />
                        <span>
                            {payload.priority.value === 2
                                ? t('autoClassify.card.high', 'Haute')
                                : t('autoClassify.card.medium', 'Moyenne')}
                        </span>
                    </label>
                </fieldset>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={primary} onClick={submit}>
                    {t('autoClassify.card.apply', 'Appliquer')}
                </button>
                <button
                    type="button"
                    className={secondary}
                    onClick={() => onApply('all')}
                >
                    {t('autoClassify.card.acceptAll', 'Tout accepter')}
                </button>
                <button type="button" className={secondary} onClick={onDismiss}>
                    {t('autoClassify.card.dismiss', 'Ignorer')}
                </button>
            </div>
        </div>
    );
};

export default ClassifyCard;
