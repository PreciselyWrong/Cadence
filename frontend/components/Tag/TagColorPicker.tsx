import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PALETTE, resolveColor, shadesOf } from '../../constants/colorPalette';

interface TagColorPickerProps {
    value?: string | null;
    // The color shown while nothing is chosen (inherited or derived).
    automatic: string;
    onChange: (color: string) => void;
}

const SHADE_KEYS = ['light', 'medium', 'deep'] as const;
const HEX = /^#[0-9a-f]{6}$/i;

// Each hue in three shades, a free hex entry, and "automatic" (the color
// derived from the tag's name or inherited from its parent).
const TagColorPicker: React.FC<TagColorPickerProps> = ({
    value,
    automatic,
    onChange,
}) => {
    const { t } = useTranslation();
    const selected = value ? (resolveColor(value)?.value ?? value) : '';
    const [hex, setHex] = useState(value || '');
    const swatch =
        'h-6 w-6 rounded-full transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
    const ring =
        'ring-2 ring-offset-2 ring-gray-900 dark:ring-white ring-offset-white dark:ring-offset-gray-900 scale-110';

    return (
        <div data-testid="tag-color-picker" className="space-y-3">
            <button
                type="button"
                role="radio"
                aria-checked={!selected}
                onClick={() => {
                    setHex('');
                    onChange('');
                }}
                className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
                    !selected
                        ? 'bg-gray-200 dark:bg-gray-700'
                        : 'bg-gray-100 dark:bg-gray-900'
                } text-gray-700 dark:text-gray-200`}
            >
                <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: automatic }}
                />
                {t('colors.automatic', 'Automatic')}
            </button>
            <div
                role="radiogroup"
                aria-label={t('colors.label', 'Color')}
                className="grid grid-cols-11 gap-y-2 justify-items-center"
            >
                {SHADE_KEYS.flatMap((shade, row) =>
                    PALETTE.map((color) => {
                        const hexValue = shadesOf(color)[row];
                        const label = `${t(`colors.${color.key}`, color.name)} ${t(`colors.${shade}`, shade)}`;
                        return (
                            <button
                                key={`${shade}-${color.key}`}
                                type="button"
                                role="radio"
                                aria-checked={
                                    selected.toLowerCase() === hexValue
                                }
                                aria-label={label}
                                title={label}
                                onClick={() => {
                                    setHex(hexValue);
                                    onChange(hexValue);
                                }}
                                className={`${swatch} ${selected.toLowerCase() === hexValue ? ring : 'hover:scale-110'}`}
                                style={{ backgroundColor: hexValue }}
                            />
                        );
                    })
                )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                <span>{t('colors.custom', 'Custom (hex)')}</span>
                <input
                    type="text"
                    value={hex}
                    maxLength={7}
                    placeholder="#3b82f6"
                    aria-invalid={hex !== '' && !HEX.test(hex)}
                    onChange={(e) => {
                        setHex(e.target.value);
                        if (HEX.test(e.target.value)) {
                            onChange(e.target.value.toLowerCase());
                        }
                    }}
                    className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                />
            </label>
        </div>
    );
};

export default TagColorPicker;
