// POST /api/login  { password } → sets the session cookie.
const crypto = require('crypto');
const { makeToken, sessionCookie, sameOrigin, send, readJsonBody, sha256 } = require('./_lib');

const wait = ms => new Promise(r => setTimeout(r, ms));

module.exports = async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    if (!sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
    const expected = process.env.APP_PASSWORD || '';
    if (!expected || !process.env.SESSION_SECRET) return send(res, 500, { error: 'server not configured' });

    const { password } = readJsonBody(req);
    // Compare hashes so the comparison takes the same time whatever the input length.
    const ok = typeof password === 'string' && crypto.timingSafeEqual(sha256(password), sha256(expected));
    if (!ok) {
        await wait(1000); // slows down password guessing
        return send(res, 401, { error: 'wrong password' });
    }
    res.setHeader('Set-Cookie', sessionCookie(makeToken()));
    send(res, 200, { ok: true });
};
