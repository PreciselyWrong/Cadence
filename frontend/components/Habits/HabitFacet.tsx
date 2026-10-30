import React from 'react';
import { HEXAGON_PATH } from '../Shared/HexagonIcon';

interface HabitFacetProps {
    // 0..1 share of the period goal already met
    fraction: number;
    done?: boolean;
    size?: number;
    children?: React.ReactNode;
}

// Android's FacetGauge: a flat-top hexagon whose edge fills with progress.
// Habits are the only hexagons in the app. Reads --accent-light/--accent-dark
// set on an ancestor (habitAccentStyle).
const HabitFacet: React.FC<HabitFacetProps> = ({
    fraction,
    done = false,
    size = 52,
    children,
}) => {
    const ratio = Math.max(0, Math.min(1, fraction));
    return (
        <div
            className="relative shrink-0 flex items-center justify-center"
            style={{ width: size, height: size }}
            data-testid="habit-facet"
        >
            <svg
                viewBox="0 0 24 24"
                width={size}
                height={size}
                aria-hidden="true"
                className="absolute inset-0 text-[color:var(--accent-light)] dark:text-[color:var(--accent-dark)]"
            >
                <path
                    d={HEXAGON_PATH}
                    fill="currentColor"
                    fillOpacity={done ? 0.28 : 0.12}
                />
                <path
                    d={HEXAGON_PATH}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.3}
                    strokeWidth={1.4}
                    strokeLinejoin="round"
                />
                {ratio > 0 && (
                    <path
                        d={HEXAGON_PATH}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.6}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        strokeDasharray={`${ratio} ${1 - ratio + 0.001}`}
                    />
                )}
            </svg>
            <div className="relative text-[color:var(--accent-light)] dark:text-[color:var(--accent-dark)] text-xs font-bold tabular-nums">
                {children ?? `${Math.round(ratio * 100)}%`}
            </div>
        </div>
    );
};

export default HabitFacet;
