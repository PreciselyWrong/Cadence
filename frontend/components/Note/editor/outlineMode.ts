import { Facet } from '@codemirror/state';

// On in the outliner: bullets always read as dots, even on the caret's line.
export const outlineMode = Facet.define<boolean, boolean>({
    combine: (values) => values.some(Boolean),
});
