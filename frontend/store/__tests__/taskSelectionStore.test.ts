import { rangeBetween, useTaskSelection } from '../taskSelectionStore';

describe('rangeBetween', () => {
    const order = ['a', 'b', 'c', 'd'];

    it('takes the rows between the anchor and the click, either way', () => {
        expect(rangeBetween(order, 'b', 'd')).toEqual(['b', 'c', 'd']);
        expect(rangeBetween(order, 'd', 'b')).toEqual(['b', 'c', 'd']);
    });

    it('takes only the clicked row without an anchor on the page', () => {
        expect(rangeBetween(order, null, 'c')).toEqual(['c']);
        expect(rangeBetween(order, 'gone', 'c')).toEqual(['c']);
    });
});

describe('useTaskSelection', () => {
    beforeEach(() => useTaskSelection.getState().clear());

    it('toggles a row and keeps it as the anchor', () => {
        const { toggle } = useTaskSelection.getState();
        toggle('a');
        toggle('b');
        toggle('a');
        expect(useTaskSelection.getState().uids).toEqual(['b']);
        expect(useTaskSelection.getState().anchor).toBe('a');
    });

    it('adds a range from the anchor without dropping the others', () => {
        const { toggle, selectRange } = useTaskSelection.getState();
        toggle('a');
        toggle('c');
        selectRange('e', ['a', 'b', 'c', 'd', 'e']);
        expect(useTaskSelection.getState().uids).toEqual(['a', 'c', 'd', 'e']);
    });
});
