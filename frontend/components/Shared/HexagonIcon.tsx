import React from 'react';

interface HexagonIconProps {
    className?: string;
    filled?: boolean;
}

// Flat-top hexagon with slightly softened corners: the "facet" that Android
// reserves for habits (designsystem/components/Facet.kt). Habits only.
export const HEXAGON_PATH =
    'M7.3 3.6h9.4a1.2 1.2 0 0 1 1 .6l4 6.9a1.2 1.2 0 0 1 0 1.2l-4 6.9a1.2 1.2 0 0 1-1 .6H7.3a1.2 1.2 0 0 1-1-.6l-4-6.9a1.2 1.2 0 0 1 0-1.2l4-6.9a1.2 1.2 0 0 1 1-.6z';

const HexagonIcon: React.FC<HexagonIconProps> = ({
    className = 'h-6 w-6',
    filled = false,
}) => (
    <svg
        viewBox="0 0 24 24"
        className={className}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
        aria-hidden="true"
    >
        <path d={HEXAGON_PATH} />
    </svg>
);

export default HexagonIcon;
