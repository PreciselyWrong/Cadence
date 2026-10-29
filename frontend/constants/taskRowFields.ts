// The details on the right of a minimal task row, in their default order.
// The saved order and visibility live in ui_settings.appearance.rowFields; the
// backend sanitizer (sanitizeTaskRowFields in backend/modules/users/service.js)
// keeps the same keys.
export const TASK_ROW_FIELD_KEYS = [
    'recurrence',
    'comments',
    'tags',
    'project',
    'priority',
    'due',
] as const;

export type TaskRowFieldKey = (typeof TASK_ROW_FIELD_KEYS)[number];

export interface TaskRowField {
    key: TaskRowFieldKey;
    visible: boolean;
}

export const DEFAULT_TASK_ROW_FIELDS: TaskRowField[] = TASK_ROW_FIELD_KEYS.map(
    (key) => ({ key, visible: true })
);

const isTaskRowFieldKey = (value: unknown): value is TaskRowFieldKey =>
    typeof value === 'string' &&
    (TASK_ROW_FIELD_KEYS as readonly string[]).includes(value);

// Known keys only, first occurrence wins, invalid entries are dropped, and any
// chip the saved list leaves out is appended in its default place, visible.
export const normalizeTaskRowFields = (value: unknown): TaskRowField[] => {
    const saved: TaskRowField[] = [];
    if (Array.isArray(value)) {
        for (const entry of value) {
            if (!entry || typeof entry !== 'object') continue;
            const { key, visible } = entry as Record<string, unknown>;
            if (!isTaskRowFieldKey(key) || typeof visible !== 'boolean') {
                continue;
            }
            if (saved.some((field) => field.key === key)) continue;
            saved.push({ key, visible });
        }
    }
    const missing = DEFAULT_TASK_ROW_FIELDS.filter(
        (field) => !saved.some((s) => s.key === field.key)
    );
    return [...saved, ...missing];
};
