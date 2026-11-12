import React from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

const VARIANTS: Record<ButtonVariant, string> = {
    primary:
        'bg-primary text-primary-on hover:bg-primary/90 active:bg-primary/80',
    secondary:
        'text-surface-on ring-1 ring-inset ring-outline-variant hover:bg-surface-high active:bg-surface-highest',
    ghost: 'text-surface-on-variant hover:bg-surface-high hover:text-surface-on active:bg-surface-highest',
    danger: 'text-danger ring-1 ring-inset ring-danger/40 hover:bg-danger-container/60',
};

// Touch screens get 44 px targets; pointer screens keep the compact size.
const SIZES: Record<ButtonSize, string> = {
    sm: 'h-7 px-2.5 text-body-m max-sm:min-h-[44px]',
    md: 'h-9 px-3.5 text-body-m max-sm:min-h-[44px]',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: React.ReactNode;
}

/** The one button of the design system (docs/fork/TODAY-REDESIGN.md). */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    (
        {
            variant = 'secondary',
            size = 'sm',
            icon,
            className = '',
            type = 'button',
            children,
            ...rest
        },
        ref
    ) => (
        <button
            ref={ref}
            type={type}
            className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
            {...rest}
        >
            {icon}
            {children}
        </button>
    )
);
Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    /** Accessible name; also the tooltip. */
    label: string;
    active?: boolean;
}

/** Square, quiet button holding one 16 px icon. */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
    (
        {
            label,
            active = false,
            className = '',
            type = 'button',
            children,
            ...rest
        },
        ref
    ) => (
        <button
            ref={ref}
            type={type}
            aria-label={label}
            title={label}
            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 max-sm:h-11 max-sm:w-11 disabled:pointer-events-none disabled:opacity-40 [&>svg]:h-4 [&>svg]:w-4 ${
                active
                    ? 'bg-primary-container text-primary-on-container'
                    : 'text-surface-on-variant hover:bg-surface-high hover:text-surface-on'
            } ${className}`}
            {...rest}
        >
            {children}
        </button>
    )
);
IconButton.displayName = 'IconButton';

export default Button;
