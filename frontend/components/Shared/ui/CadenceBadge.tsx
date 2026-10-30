import React from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'error';

interface CadenceBadgeProps {
    children: React.ReactNode;
    tone?: BadgeTone;
    /** A project or calendar colour; replaces the tone, shown at 16 % tint. */
    color?: string;
    icon?: React.ReactNode;
    className?: string;
}

const TONES: Record<BadgeTone, string> = {
    neutral: 'bg-surface-variant text-surface-on-variant',
    primary: 'bg-primary-container text-primary-on-container',
    success: 'bg-success-container text-success',
    warning: 'bg-warning-container text-warning',
    error: 'bg-danger-container text-danger-on-container',
};

// Android CadenceBadge: 24px pill, label-m text.
const CadenceBadge: React.FC<CadenceBadgeProps> = ({
    children,
    tone = 'neutral',
    color,
    icon,
    className = '',
}) => (
    <span
        className={`inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2 text-label-m ${
            color ? '' : TONES[tone]
        } ${className}`}
        style={color ? { backgroundColor: `${color}29`, color } : undefined}
    >
        {icon}
        <span className="truncate">{children}</span>
    </span>
);

export default CadenceBadge;
