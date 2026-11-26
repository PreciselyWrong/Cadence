// The editable step list of « Découper en étapes » (docs/fork/WEB-UX-NOTES.md).
// Pure rules; the bounds are those of backend/modules/breakdown/core/steps.js.

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 720;
export const NAME_MAX = 200;
export const MAX_STEPS = 50;

// Minutes stay text while typed ('' = no estimate).
export interface DraftStep {
    id: string;
    name: string;
    minutes: string;
}

export interface ApplyStep {
    name: string;
    minutes: number | null;
}

export type StepProblem = 'name' | 'minutes';

let counter = 0;
const nextId = () => `step-${++counter}`;

export const newStep = (name = '', minutes = ''): DraftStep => ({
    id: nextId(),
    name,
    minutes,
});

export const draftsFromProposal = (
    steps: { name: string; minutes: number }[]
): DraftStep[] => steps.map((s) => newStep(s.name, String(s.minutes)));

// No proposal: one empty step to type, at the smallest stored estimate.
export const fallbackDrafts = (): DraftStep[] => [
    newStep('', String(MIN_MINUTES)),
];

export const addStep = (steps: DraftStep[]): DraftStep[] =>
    steps.length >= MAX_STEPS
        ? steps
        : [...steps, newStep('', String(MIN_MINUTES))];

export const updateStep = (
    steps: DraftStep[],
    id: string,
    patch: Partial<Pick<DraftStep, 'name' | 'minutes'>>
): DraftStep[] => steps.map((s) => (s.id === id ? { ...s, ...patch } : s));

export const removeStep = (steps: DraftStep[], id: string): DraftStep[] =>
    steps.filter((s) => s.id !== id);

export const moveStep = (
    steps: DraftStep[],
    id: string,
    offset: -1 | 1
): DraftStep[] => {
    const from = steps.findIndex((s) => s.id === id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= steps.length) return steps;
    const next = [...steps];
    [next[from], next[to]] = [next[to], next[from]];
    return next;
};

export type MinutesParse = { ok: true; value: number | null } | { ok: false };

export const parseMinutes = (text: string): MinutesParse => {
    const trimmed = text.trim();
    if (trimmed === '') return { ok: true, value: null };
    if (!/^\d+$/.test(trimmed)) return { ok: false };
    const value = Number(trimmed);
    return value >= MIN_MINUTES && value <= MAX_MINUTES
        ? { ok: true, value }
        : { ok: false };
};

// A step with no name is a blank row: it is left out, never an error.
const isNamed = (step: DraftStep) => step.name.trim() !== '';

export const stepProblem = (step: DraftStep): StepProblem | null => {
    if (!isNamed(step)) return null;
    if (step.name.trim().length > NAME_MAX) return 'name';
    return parseMinutes(step.minutes).ok ? null : 'minutes';
};

export const readySteps = (steps: DraftStep[]): ApplyStep[] =>
    steps.filter(isNamed).map((step) => {
        const parsed = parseMinutes(step.minutes);
        return {
            name: step.name.trim(),
            minutes: parsed.ok ? parsed.value : null,
        };
    });

export const canApply = (steps: DraftStep[]): boolean => {
    const named = steps.filter(isNamed);
    return (
        named.length > 0 &&
        named.length <= MAX_STEPS &&
        named.every((step) => stepProblem(step) === null)
    );
};

export const totalMinutes = (steps: DraftStep[]): number =>
    steps.filter(isNamed).reduce((sum, step) => {
        const parsed = parseMinutes(step.minutes);
        return sum + (parsed.ok && parsed.value !== null ? parsed.value : 0);
    }, 0);
