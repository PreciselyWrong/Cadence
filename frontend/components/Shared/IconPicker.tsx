import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ENTITY_ICONS, EntityIconDef } from '../../constants/entityIcons';
import EntityIcon from './EntityIcon';

interface IconPickerProps {
    value?: string | null;
    onChange: (icon: string | null) => void;
    disabled?: boolean;
}

const normalize = (text: string) =>
    text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const matches = (icon: EntityIconDef, query: string) =>
    !query ||
    [icon.labelFr, icon.labelEn, ...icon.terms].some((text) =>
        normalize(text).includes(query)
    );

// Picks an icon from the set shared with the Android app.
const IconPicker: React.FC<IconPickerProps> = ({
    value,
    onChange,
    disabled,
}) => {
    const { t, i18n } = useTranslation();
    const [query, setQuery] = useState('');
    const isFrench = (i18n?.language || '').startsWith('fr');
    const visible = ENTITY_ICONS.filter((icon) =>
        matches(icon, normalize(query))
    );

    const option = (
        id: string | null,
        label: string,
        content: React.ReactNode
    ) => {
        const isSelected = (value || null) === id;
        return (
            <button
                key={id ?? 'none'}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={label}
                title={label}
                disabled={disabled}
                onClick={() => onChange(id)}
                className={`flex h-9 w-9 items-center justify-center rounded-lg text-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:text-gray-200 ${
                    isSelected
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
            >
                {content}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-2">
            <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('iconPicker.search', 'Search icons')}
                aria-label={t('iconPicker.search', 'Search icons')}
                disabled={disabled}
                className="w-full rounded-lg border border-gray-200 bg-transparent px-3 py-1.5 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:text-gray-100"
            />
            <div
                role="radiogroup"
                aria-label={t('iconPicker.label', 'Icon')}
                className="flex max-h-48 flex-wrap gap-1 overflow-y-auto"
            >
                {option(
                    null,
                    t('iconPicker.none', 'No icon'),
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        ✕
                    </span>
                )}
                {visible.map((icon) =>
                    option(
                        icon.id,
                        isFrench ? icon.labelFr : icon.labelEn,
                        <EntityIcon icon={icon.id} className="h-5 w-5" />
                    )
                )}
            </div>
        </div>
    );
};

export default IconPicker;
