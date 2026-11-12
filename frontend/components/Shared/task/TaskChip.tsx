import React from 'react';

export type TaskChipTone = 'neutral' | 'warning';

// The one meta chip of task rows and cards (Today, Plan, every list):
// project, tags, length, due day. A late due day takes the warning tone,
// never red.
const TaskChip: React.FC<{
    children: React.ReactNode;
    tone?: TaskChipTone;
    title?: string;
    testId?: string;
}> = ({ children, tone = 'neutral', title, testId }) => (
    <span
        title={title}
        data-testid={testId}
        className={`inline-flex h-5 max-w-[12rem] items-center gap-1 truncate rounded-md px-1.5 text-xs tabular-nums ${
            tone === 'warning'
                ? 'bg-warning-container/70 text-warning'
                : 'bg-surface-high text-surface-on-variant'
        }`}
    >
        {children}
    </span>
);

export default TaskChip;
