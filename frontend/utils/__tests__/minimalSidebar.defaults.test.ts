import {
    DEFAULT_MINIMAL_SIDEBAR,
    resolveMinimalSidebar,
} from '../minimalSidebar';

// Calm by default: a count only where it asks for something (Today, Inbox).
describe('minimal sidebar defaults', () => {
    it('counts Today and Inbox only', () => {
        const counted = DEFAULT_MINIMAL_SIDEBAR.smartLists
            .filter((item) => item.showCount)
            .map((item) => item.key);
        expect(counted.sort()).toEqual(['inbox', 'today']);
    });

    it('shows no count on section headers', () => {
        expect(
            Object.values(DEFAULT_MINIMAL_SIDEBAR.sectionBadges).some(Boolean)
        ).toBe(false);
    });

    it('falls back to the calm defaults when nothing is saved', () => {
        const resolved = resolveMinimalSidebar({});
        expect(resolved.sectionBadges.tags).toBe(false);
        expect(resolved.smartLists.map((item) => item.key)).toEqual([
            'inbox',
            'today',
            'next7',
        ]);
    });

    it('drops Tomorrow from a saved list, keeping the rest as saved', () => {
        const resolved = resolveMinimalSidebar({
            smartLists: [
                { key: 'tomorrow', visible: true, showCount: true },
                { key: 'today', visible: true, showCount: false },
            ],
        });
        expect(resolved.smartLists.map((item) => item.key)).toEqual([
            'today',
            'inbox',
            'next7',
        ]);
        expect(
            resolved.smartLists.find((item) => item.key === 'today')
        ).toEqual({ key: 'today', visible: true, showCount: false });
    });

    it('maps the legacy order with Tomorrow to the new default order', () => {
        const resolved = resolveMinimalSidebar({
            smartLists: [
                { key: 'today', visible: true, showCount: true },
                { key: 'tomorrow', visible: true, showCount: false },
                { key: 'next7', visible: false, showCount: false },
                { key: 'inbox', visible: true, showCount: true },
            ],
        });
        expect(resolved.smartLists).toEqual([
            { key: 'inbox', visible: true, showCount: true },
            { key: 'today', visible: true, showCount: true },
            { key: 'next7', visible: false, showCount: false },
        ]);
    });

    it('keeps a count the user turned on', () => {
        const resolved = resolveMinimalSidebar({
            smartLists: [{ key: 'next7', visible: true, showCount: true }],
            sectionBadges: { projects: true },
        });
        expect(
            resolved.smartLists.find((item) => item.key === 'next7')?.showCount
        ).toBe(true);
        expect(resolved.sectionBadges.projects).toBe(true);
    });

    it('hides the Inbox row for new accounts', () => {
        const inbox = DEFAULT_MINIMAL_SIDEBAR.smartLists.find(
            (item) => item.key === 'inbox'
        );
        expect(inbox?.visible).toBe(false);
        expect(
            DEFAULT_MINIMAL_SIDEBAR.smartLists.find(
                (item) => item.key === 'today'
            )?.visible
        ).toBe(true);
    });

    it('keeps an Inbox row the user saved as shown', () => {
        const resolved = resolveMinimalSidebar({
            smartLists: [{ key: 'inbox', visible: true, showCount: true }],
        });
        expect(
            resolved.smartLists.find((item) => item.key === 'inbox')?.visible
        ).toBe(true);
    });
});
