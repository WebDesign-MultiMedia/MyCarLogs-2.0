// POST /api/logout → clears the session cookie.
const { clearedCookie, sameOrigin, send } = require('./_lib');

module.exports = (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
    res.setHeader('Set-Cookie', clearedCookie());
    send(res, 200, { ok: true });
};
