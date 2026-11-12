import React from 'react';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface SearchFieldProps {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
    autoFocus?: boolean;
    className?: string;
    testId?: string;
}

/** The filter field of list pages: a quiet filled field, no border. */
const SearchField: React.FC<SearchFieldProps> = ({
    value,
    onChange,
    placeholder,
    autoFocus = true,
    className = '',
    testId,
}) => (
    <label
        className={`flex h-9 items-center gap-2 rounded-lg bg-surface-high/70 px-3 text-body-m focus-within:ring-2 focus-within:ring-primary/40 max-sm:h-11 ${className}`}
    >
        <MagnifyingGlassIcon
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-surface-on-variant"
        />
        <input
            type="search"
            value={value}
            autoFocus={autoFocus}
            placeholder={placeholder}
            aria-label={placeholder}
            data-testid={testId}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
                if (event.key === 'Escape' && value) {
                    event.stopPropagation();
                    onChange('');
                }
            }}
            className="min-w-0 flex-1 border-0 bg-transparent p-0 text-surface-on placeholder:text-surface-on-variant focus:outline-none focus:ring-0"
        />
    </label>
);

export default SearchField;
