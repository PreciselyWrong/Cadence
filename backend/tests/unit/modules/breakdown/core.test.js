const { normalizeSteps } = require('../../../../modules/breakdown/core/steps');
const { buildMessages } = require('../../../../modules/breakdown/core/prompt');
const {
    resolveSettings,
    sanitizeUserSettings,
    serverDefaults,
} = require('../../../../modules/breakdown/settings');

const settings = {
    max_steps: 4,
    min_step_minutes: 5,
    max_step_minutes: 25,
};

describe('breakdown steps', () => {
    it('trims names, clamps minutes and keeps the order', () => {
        const steps = normalizeSteps(
            [
                { name: '  Ouvrir   le dossier ', minutes: 2 },
                { name: 'Lire les relevés', minutes: 12.4 },
                { name: 'Remplir le formulaire', minutes: 90 },
            ],
            { settings }
        );
        expect(steps).toEqual([
            { name: 'Ouvrir le dossier', minutes: 5 },
            { name: 'Lire les relevés', minutes: 12 },
            { name: 'Remplir le formulaire', minutes: 25 },
        ]);
    });

    it('drops empty, duplicate and already existing steps, then caps the count', () => {
        const steps = normalizeSteps(
            [
                { name: '', minutes: 5 },
                { name: 'A', minutes: 5 },
                { name: 'a', minutes: 10 },
                { name: 'Déjà là', minutes: 5 },
                { name: 'B', minutes: 'x' },
                { name: 'C', minutes: 5 },
                { name: 'D', minutes: 5 },
                { name: 'E', minutes: 5 },
                { name: 'F', minutes: 5 },
            ],
            { settings, existing: ['déjà LÀ'] }
        );
        expect(steps.map((s) => s.name)).toEqual(['A', 'B', 'C', 'D']);
        expect(steps[1].minutes).toBe(5);
    });

    it('cuts a long name and ignores anything that is not a step', () => {
        const steps = normalizeSteps(
            [
                null,
                'texte',
                { name: 42 },
                { name: 'x'.repeat(300), minutes: 7 },
            ],
            { settings }
        );
        expect(steps).toEqual([{ name: 'x'.repeat(200), minutes: 7 }]);
        expect(normalizeSteps(undefined, { settings })).toEqual([]);
    });
});

describe('breakdown prompt', () => {
    it('sends only the name, the shortened note and the existing subtasks', () => {
        const messages = buildMessages(
            {
                name: 'Déclaration d’impôts',
                note: 'abcdefghij',
                subtasks: ['Trouver le certificat de salaire'],
            },
            { ...settings, note_chars: 4 }
        );
        const user = JSON.parse(messages[1].content);
        expect(user).toEqual({
            task: 'Déclaration d’impôts',
            note: 'abcd',
            existing_steps: ['Trouver le certificat de salaire'],
            max_steps: 4,
            min_minutes: 5,
            max_minutes: 25,
        });
        expect(messages[0].role).toBe('system');
    });
});

describe('breakdown settings', () => {
    it('reads the user value over the environment over the defaults', () => {
        const env = {
            CADENCE_BREAKDOWN_MAX_STEPS: '8',
            CADENCE_BREAKDOWN_MODEL: 'small-model',
        };
        expect(serverDefaults(env)).toMatchObject({
            enabled: true,
            max_steps: 8,
            model: 'small-model',
        });
        expect(
            resolveSettings({ breakdown: { max_steps: 3 } }, env)
        ).toMatchObject({ max_steps: 3, model: 'small-model' });
    });

    it('ignores out of bounds values and keeps the minimum below the maximum', () => {
        expect(
            resolveSettings({ breakdown: { max_steps: 99 } }, {}).max_steps
        ).toBe(serverDefaults({}).max_steps);
        const crossed = resolveSettings(
            { breakdown: { min_step_minutes: 30, max_step_minutes: 10 } },
            {}
        );
        expect(crossed.min_step_minutes).toBe(10);
    });

    it('refuses an invalid stored value and drops unknown fields', () => {
        expect(sanitizeUserSettings({ max_steps: 0 })).toBeNull();
        expect(sanitizeUserSettings({ enabled: 'maybe' })).toBeNull();
        expect(
            sanitizeUserSettings({ max_steps: 5, other: 1, model: ' m ' })
        ).toEqual({ max_steps: 5, model: 'm' });
    });
});
