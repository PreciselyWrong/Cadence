import fs from 'fs';
import path from 'path';
import i18next, { type TFunction } from 'i18next';
import { aliasPluralLocale } from '../utils/intlLocale';

const localesDir = path.join(__dirname, '../../public/locales');

const loadTranslation = (lang: string) =>
    JSON.parse(
        fs.readFileSync(path.join(localesDir, lang, 'translation.json'), 'utf8')
    );

const createT = async (lang: string): Promise<TFunction> => {
    const instance = i18next.createInstance();
    await instance.init({
        lng: lang,
        fallbackLng: 'en',
        resources: {
            [lang]: { translation: loadTranslation(lang) },
            en: { translation: loadTranslation('en') },
        },
        interpolation: { escapeValue: false },
    });
    aliasPluralLocale(instance.services.pluralResolver);
    return instance.t.bind(instance) as TFunction;
};

describe('plural forms in locales', () => {
    const cases: Array<[string, string, number, string]> = [
        ['ru', 'project.fileCount', 1, '1 файл'],
        ['ru', 'project.fileCount', 3, '3 файла'],
        ['ru', 'project.fileCount', 5, '5 файлов'],
        ['ru', 'project.fileCount', 21, '21 файл'],
        ['ua', 'project.fileCount', 3, '3 файли'],
        ['ua', 'project.fileCount', 5, '5 файлів'],
        ['pl', 'project.fileCount', 3, '3 pliki'],
        ['pl', 'project.fileCount', 5, '5 plików'],
        ['sk', 'project.fileCount', 3, '3 súbory'],
        ['sk', 'project.fileCount', 5, '5 súborov'],
        ['sl', 'project.fileCount', 2, '2 datoteki'],
        ['sl', 'project.fileCount', 3, '3 datoteke'],
        ['sl', 'project.fileCount', 5, '5 datotek'],
        // Count keys that once had a single plural text ("1 tâches").
        ['fr', 'spreadsheet.import.countCreate', 1, '1 nouvelle tâche'],
        ['fr', 'spreadsheet.import.countCreate', 3, '3 nouvelles tâches'],
        ['en', 'comments.count', 1, '1 comment'],
        ['fr', 'upcoming.plannedOnDayHint', 1, '1 planifiée un jour'],
        ['ru', 'profile.planning.maxOption', 1, '1 задача'],
    ];

    it.each(cases)(
        '%s %s renders count %d as "%s"',
        async (lang, key, count, expected) => {
            const t = await createT(lang);
            expect(t(key, { count })).toBe(expected);
        }
    );
});
