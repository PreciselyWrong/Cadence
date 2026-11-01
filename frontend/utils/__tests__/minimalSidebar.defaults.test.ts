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
        expect(
            resolved.smartLists.find((item) => item.key === 'tomorrow')
                ?.showCount
        ).toBe(false);
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
});
