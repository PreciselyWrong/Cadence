const { needsCsrf } = require('../../../middleware/csrf');

describe('needsCsrf', () => {
    const session = { userId: 1 };

    it('checks a write from a browser session', () => {
        expect(needsCsrf({ method: 'POST', session, headers: {} })).toBe(true);
    });

    it('skips a write signed by a bearer token, even with a session cookie', () => {
        expect(
            needsCsrf({
                method: 'POST',
                session,
                headers: { authorization: 'Bearer tt_abc' },
            })
        ).toBe(false);
    });

    it('skips reads and requests without a session', () => {
        expect(needsCsrf({ method: 'GET', session, headers: {} })).toBe(false);
        expect(needsCsrf({ method: 'POST', session: {}, headers: {} })).toBe(
            false
        );
    });
});
