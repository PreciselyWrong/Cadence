import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { livePreviewTheme } from '../livePreviewTheme';

// The rules CodeMirror mounted for a selector, as CSS text.
const mountedRules = (selector: string): string =>
    Array.from(document.querySelectorAll('style'))
        .map((style) => style.textContent ?? '')
        .join('\n')
        .split('}')
        .filter((rule) => rule.includes(`${selector} {`))
        .join('}');

describe('livePreviewTheme', () => {
    it("keeps link chips out of a list line's hanging indent", () => {
        const view = new EditorView({
            state: EditorState.create({ extensions: [livePreviewTheme] }),
            parent: document.body,
        });

        // A chip in "- Point [[Note]]" would otherwise start 1.6em to the
        // left and cover the words before it.
        expect(mountedRules('.cm-md-wikilink-chip')).toMatch(
            /text-indent:\s*0/
        );
        view.destroy();
    });
});
