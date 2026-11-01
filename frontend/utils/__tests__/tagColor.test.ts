import fs from 'fs';
import path from 'path';
import { MEDIUM_SHADES, PALETTE } from '../../constants/colorPalette';
import { derivedTagColor, resolveTagColor } from '../tagColor';

const fixture = JSON.parse(
    fs.readFileSync(
        path.resolve(__dirname, '../../../fixtures/tags/colors.json'),
        'utf8'
    )
);

describe('tag colors, shared with Android (fixtures/tags/colors.json)', () => {
    it('uses the same palette', () => {
        expect(fixture.palette).toEqual(
            PALETTE.map((c) => ({
                key: c.key,
                value: c.value,
                dark: c.dark,
                medium: MEDIUM_SHADES[c.key],
            }))
        );
    });

    it.each(fixture.derived)('derives $name -> $color', ({ name, color }) => {
        expect(derivedTagColor(name).value).toBe(color);
    });

    it.each(fixture.resolve)('resolves $title', ({ tag, tags, color }) => {
        expect(resolveTagColor(tag, tags).value).toBe(color);
    });
});
