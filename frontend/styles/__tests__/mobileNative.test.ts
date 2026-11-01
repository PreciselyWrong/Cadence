import fs from 'fs';
import path from 'path';
import postcss, { AtRule, Rule } from 'postcss';

// Resolves `display` for a selector the way the cascade does for rules of
// equal specificity: the last matching declaration in source order wins.
const displayAt = (css: string, selector: string, width: number) => {
    let display: string | undefined;
    postcss.parse(css).walkRules((rule: Rule) => {
        if (!rule.selectors.includes(selector)) return;
        const media =
            rule.parent?.type === 'atrule' ? (rule.parent as AtRule) : null;
        if (media) {
            const min = /min-width:\s*(\d+)px/.exec(media.params);
            const max = /max-width:\s*(\d+)px/.exec(media.params);
            if (min && width < Number(min[1])) return;
            if (max && width > Number(max[1])) return;
        }
        rule.walkDecls('display', (decl) => {
            display = decl.value;
        });
    });
    return display;
};

describe('mobile-native.css', () => {
    const css = fs.readFileSync(
        path.join(__dirname, '..', 'mobile-native.css'),
        'utf8'
    );

    it.each(['.cdm-fab', '.cdm-bar'])('shows %s on phones only', (selector) => {
        expect(displayAt(css, selector, 375)).toBe('flex');
        expect(displayAt(css, selector, 768)).toBe('none');
        expect(displayAt(css, selector, 1440)).toBe('none');
    });
});
