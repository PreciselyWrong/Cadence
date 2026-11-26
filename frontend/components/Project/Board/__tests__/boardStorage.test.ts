import { normalizeBoardConfig } from '../boardStorage';
import { BOARD_CONFIG_VERSION, defaultBoardConfig } from '../boardModel';

jest.mock('../../../../utils/profileService', () => ({
    fetchProfile: jest.fn(),
    updateUiSettings: jest.fn(),
}));

describe('normalizeBoardConfig', () => {
    it('moves a board saved with the four old views to the two current ones, keeping custom views', () => {
        const current = defaultBoardConfig(true);
        const custom = {
            ...current.presets[0],
            id: 'custom-1',
            name: 'Urgent',
        };
        const saved = {
            activePresetId: 'icebox',
            includeSubProjects: true,
            hideSubProjectsList: false,
            presets: [
                {
                    ...current.presets[0],
                    name: 'Actifs',
                    hideEmptyColumns: false,
                },
                {
                    ...current.presets[1],
                    name: 'Portefeuille',
                    wipLimits: { in_progress: 3 },
                },
                { ...current.presets[0], id: 'all-tasks', mode: 'tasks' },
                { ...current.presets[1], id: 'icebox' },
                custom,
            ],
        };

        const config = normalizeBoardConfig(saved, true);

        expect(config.version).toBe(BOARD_CONFIG_VERSION);
        expect(config.presets.map((p) => p.id)).toEqual([
            'active-projects',
            'portfolio',
            'custom-1',
        ]);
        expect(config.presets[0].hideEmptyColumns).toBe(true);
        expect(config.presets[1].wipLimits).toEqual({});
        // The removed view was active: fall back to the first one.
        expect(config.activePresetId).toBe('active-projects');
        expect(config.hideSubProjectsList).toBe(false);
    });

    it('keeps a board already saved at the current version as it is', () => {
        const current = defaultBoardConfig(true);
        const saved = {
            ...current,
            activePresetId: 'portfolio',
            presets: [
                { ...current.presets[0], hideEmptyColumns: false },
                current.presets[1],
            ],
        };
        const config = normalizeBoardConfig(saved, true);
        expect(config.activePresetId).toBe('portfolio');
        expect(config.presets[0].hideEmptyColumns).toBe(false);
    });
});
