import fs from 'fs';
import path from 'path';

type Flat = Record<string, unknown>;

const LOCALES_DIR = path.resolve(__dirname, '../../public/locales');

const flatten = (value: unknown, prefix = '', out: Flat = {}): Flat => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [key, child] of Object.entries(value)) {
            flatten(child, prefix ? `${prefix}.${key}` : key, out);
        }
    } else {
        out[prefix] = value;
    }
    return out;
};

const load = (locale: string): Flat =>
    flatten(
        JSON.parse(
            fs.readFileSync(
                path.join(LOCALES_DIR, locale, 'translation.json'),
                'utf8'
            )
        )
    );

const placeholders = (text: unknown): string =>
    typeof text === 'string'
        ? (text.match(/{{\s*\w+\s*}}/g) ?? []).sort().join(',')
        : '';

describe('French translation', () => {
    const en = load('en');
    const fr = load('fr');

    it('has every key that English has', () => {
        const missing = Object.keys(en).filter((key) => !(key in fr));
        expect(missing).toEqual([]);
    });

    it('keeps the interpolation placeholders of the English text', () => {
        const mismatched = Object.keys(en).filter(
            (key) =>
                key in fr && placeholders(en[key]) !== placeholders(fr[key])
        );
        expect(mismatched).toEqual([]);
    });
});
