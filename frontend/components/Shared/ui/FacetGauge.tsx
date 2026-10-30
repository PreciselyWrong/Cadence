import React from 'react';

interface FacetGaugeProps {
    /** 0 to 1. */
    progress: number;
    /** The habit's own tint. */
    tint: string;
    size?: number;
    strokeWidth?: number;
    children?: React.ReactNode;
    className?: string;
}

// Flat-top hexagon with softened corners, same geometry as the Android
// facetPath (rotation -60 degrees, corner radius 12 % of the circumradius).
// Reserved for habits.
function facetPath(cx: number, cy: number, radius: number): string {
    const corner = radius * 0.12;
    const pts = Array.from({ length: 6 }, (_, i) => {
        const a = ((-60 + i * 60) * Math.PI) / 180;
        return [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
    });
    const toward = (p: number[], q: number[]) => {
        const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const step = Math.min(corner, len / 2) / len;
        return [p[0] + (q[0] - p[0]) * step, p[1] + (q[1] - p[1]) * step];
    };
    let d = '';
    pts.forEach((p, i) => {
        const [ex, ey] = toward(p, pts[(i + 5) % 6]);
        const [xx, xy] = toward(p, pts[(i + 1) % 6]);
        d += `${i === 0 ? 'M' : 'L'}${ex.toFixed(2)} ${ey.toFixed(2)}Q${p[0].toFixed(2)} ${p[1].toFixed(2)} ${xx.toFixed(2)} ${xy.toFixed(2)}`;
    });
    return `${d}Z`;
}

const FacetGauge: React.FC<FacetGaugeProps> = ({
    progress,
    tint,
    size = 52,
    strokeWidth = 3,
    children,
    className = '',
}) => {
    const ratio = Math.min(1, Math.max(0, progress));
    const path = facetPath(size / 2, size / 2, (size - strokeWidth) / 2);
    return (
        <span
            className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
            style={{ width: size, height: size }}
        >
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                aria-hidden="true"
            >
                <path d={path} fill={tint} fillOpacity={0.12} />
                <path
                    d={path}
                    fill="none"
                    className="stroke-outline-variant"
                    strokeWidth={strokeWidth}
                    strokeLinejoin="round"
                />
                {ratio > 0 && (
                    <path
                        d={path}
                        fill="none"
                        stroke={tint}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pathLength={1}
                        strokeDasharray={`${ratio} 1`}
                        style={{
                            transition: 'stroke-dasharray 240ms ease-out',
                        }}
                    />
                )}
            </svg>
            {children && (
                <span
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ color: tint }}
                >
                    {children}
                </span>
            )}
        </span>
    );
};

export default FacetGauge;
