const lusca = require('lusca');

const csrfMiddleware = lusca.csrf({
    header: 'x-csrf-token',
    cookie: false,
});

const csrfProtection = (req, res, next) => {
    if (
        process.env.NODE_ENV === 'test' ||
        req.user ||
        req.headers.authorization?.startsWith('Bearer ')
    ) {
        return next();
    }

    return lusca.csrf({
        header: 'x-csrf-token',
        cookie: false,
    })(req, res, next);
};

const STATEFUL = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Only a write riding a browser session can be forged by another site. A
// request signed by a bearer token is not, even when the browser (an
// add-on) also sends the session cookie.
function needsCsrf(req) {
    if (!STATEFUL.includes(req.method)) return false;
    if (!req.session?.userId) return false;
    return !req.headers?.authorization?.startsWith('Bearer ');
}

const generateToken = (req, res) => {
    if (typeof req.csrfToken === 'function') {
        return req.csrfToken();
    }
    if (res.locals._csrf) {
        return res.locals._csrf;
    }
    return '';
};

module.exports = {
    csrfProtection,
    csrfMiddleware,
    needsCsrf,
    generateToken,
};
