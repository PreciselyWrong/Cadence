import {
    BoardPreset,
    DEFAULT_CARD_FIELDS,
    ProjectBoardConfig,
    defaultBoardConfig,
} from './boardModel';
import { fetchProfile, updateUiSettings } from '../../../utils/profileService';

const storageKey = (projectUid: string) => `cadence_project_board:${projectUid}`;

const normalizePreset = (raw: Partial<BoardPreset>, fallback: BoardPreset): BoardPreset => ({
    ...fallback,
    ...raw,
    projectStatuses: Array.isArray(raw.projectStatuses)
        ? raw.projectStatuses
        : fallback.projectStatuses,
    selectedTags: Array.isArray(raw.selectedTags)
        ? raw.selectedTags
        : fallback.selectedTags,
    collapsedColumns: Array.isArray(raw.collapsedColumns)
        ? raw.collapsedColumns
        : fallback.collapsedColumns,
    wipLimits:
        raw.wipLimits && typeof raw.wipLimits === 'object'
            ? raw.wipLimits
            : fallback.wipLimits,
    cardFields: {
        ...DEFAULT_CARD_FIELDS,
        ...(raw.cardFields || {}),
    },
});

export const normalizeBoardConfig = (
    raw: unknown,
    hasSubProjects: boolean
): ProjectBoardConfig => {
    const base = defaultBoardConfig(hasSubProjects);
    if (!raw || typeof raw !== 'object') return base;
    const obj = raw as Partial<ProjectBoardConfig>;
    const rawPresets = Array.isArray(obj.presets) ? obj.presets : [];
    const presets =
        rawPresets.length > 0
            ? rawPresets.map((p, idx) =>
                  normalizePreset(p, base.presets[idx] || base.presets[0])
              )
            : base.presets;
    const activePresetId = presets.some((p) => p.id === obj.activePresetId)
        ? (obj.activePresetId as string)
        : presets[0].id;
    return {
        activePresetId,
        includeSubProjects:
            typeof obj.includeSubProjects === 'boolean'
                ? obj.includeSubProjects
                : base.includeSubProjects,
        hideSubProjectsList:
            typeof obj.hideSubProjectsList === 'boolean'
                ? obj.hideSubProjectsList
                : base.hideSubProjectsList,
        presets,
    };
};

export const readLocalBoardConfig = (
    projectUid: string,
    hasSubProjects: boolean
): ProjectBoardConfig => {
    try {
        const raw = localStorage.getItem(storageKey(projectUid));
        if (!raw) return defaultBoardConfig(hasSubProjects);
        return normalizeBoardConfig(JSON.parse(raw), hasSubProjects);
    } catch {
        return defaultBoardConfig(hasSubProjects);
    }
};

export const writeLocalBoardConfig = (
    projectUid: string,
    config: ProjectBoardConfig
): void => {
    try {
        localStorage.setItem(storageKey(projectUid), JSON.stringify(config));
    } catch {
        // Storage quota or private mode: ignore silently.
    }
};

export const loadRemoteBoardConfig = async (
    projectUid: string,
    hasSubProjects: boolean
): Promise<ProjectBoardConfig | null> => {
    try {
        const profile = await fetchProfile();
        const saved = profile?.ui_settings?.projectBoards?.[projectUid];
        if (!saved) return null;
        const normalized = normalizeBoardConfig(saved, hasSubProjects);
        writeLocalBoardConfig(projectUid, normalized);
        return normalized;
    } catch {
        return null;
    }
};

export const saveBoardConfig = async (
    projectUid: string,
    config: ProjectBoardConfig
): Promise<void> => {
    writeLocalBoardConfig(projectUid, config);
    try {
        await updateUiSettings({
            projectBoards: {
                [projectUid]: config,
            },
        });
    } catch {
        // Local copy is already persisted; remote sync will retry on next edit.
    }
};
