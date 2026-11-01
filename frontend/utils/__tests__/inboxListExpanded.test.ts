const respond = (profile: unknown) => {
    global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => profile,
    }) as unknown as typeof fetch;
};

// The Inbox page shows its items: the list starts open until the user
// folds it, and that choice is kept.
describe('getInboxRecentlyCapturedExpanded', () => {
    beforeEach(() => jest.resetModules());

    it('is open when the user never chose', async () => {
        const { getInboxRecentlyCapturedExpanded: read } =
            await import('../profileService');
        respond({ ui_settings: {} });
        await expect(read()).resolves.toBe(true);
    });

    it('keeps a folded list folded', async () => {
        const { getInboxRecentlyCapturedExpanded: read } =
            await import('../profileService');
        respond({
            ui_settings: { inbox: { recentlyCapturedExpanded: false } },
        });
        await expect(read()).resolves.toBe(false);
    });
});
