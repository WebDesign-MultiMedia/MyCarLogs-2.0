// Shared helpers for the MyCarLogs API (Vercel serverless functions).
// Files starting with "_" are not exposed as routes.
//
// Required environment variables (Vercel → Project → Settings → Environment Variables):
//   APP_PASSWORD      password for signing in to the app
//   SESSION_SECRET    long random string used to sign the session cookie (32+ chars)
//   SHEETDB_API_URL   e.g. https://sheetdb.io/api/v1/xxxxxxxx
//   SHEETDB_LOGIN     SheetDB API basic-auth login     (optional but strongly recommended)
//   SHEETDB_PASSWORD  SheetDB API basic-auth password  (optional but strongly recommended)
//   DRIVE_SCRIPT_URL  Google Apps Script web app URL (…/exec)   (optional: scan file uploads)
//   DRIVE_UPLOAD_KEY  the UPLOAD_KEY set in that Apps Script    (optional: scan file uploads)

const crypto = require('crypto');

const COOKIE = 'mcl_session';
const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

function secret() {
    const s = process.env.SESSION_SECRET || '';
    if (s.length < 32) throw new Error('SESSION_SECRET is missing or too short');
    return s;
}
const sha256 = v => crypto.createHash('sha256').update(String(v)).digest();

// The signature also covers the app password, so changing APP_PASSWORD signs everyone out.
function sign(value) {
    return crypto.createHmac('sha256', secret())
        .update(value + '|' + sha256(process.env.APP_PASSWORD || '').toString('hex'))
        .digest('base64url');
}
function makeToken() {
    const value = `v1.${Math.floor(Date.now() / 1000) + MAX_AGE}`;
    return `${value}.${sign(value)}`;
}
function validToken(token) {
    if (!token || typeof token !== 'string') return false;
    const i = token.lastIndexOf('.');
    if (i < 0) return false;
    const value = token.slice(0, i), sig = token.slice(i + 1);
    const exp = Number(value.split('.')[1]);
    if (!value.startsWith('v1.') || !(exp > Date.now() / 1000)) return false;
    const a = Buffer.from(sig), b = Buffer.from(sign(value));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function getCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return decodeURIComponent(v.join('='));
    }
    return '';
}
function isAuthed(req) {
    try { return validToken(getCookie(req, COOKIE)); } catch { return false; }
}
const sessionCookie = token => `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
const clearedCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

// Blocks requests sent from other websites (defense in depth on top of SameSite=Strict).
function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true; // same-origin GETs and some browsers omit it
    try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function send(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

// Wraps a handler: checks origin + session, and turns crashes into a generic 500.
function protectedRoute(handler) {
    return async (req, res) => {
        if (!sameOrigin(req)) return send(res, 403, { error: 'forbidden' });
        if (!isAuthed(req)) return send(res, 401, { error: 'unauthorized' });
        try { await handler(req, res); }
        catch (err) { console.error(err); send(res, 500, { error: 'server error' }); }
    };
}

function readJsonBody(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

module.exports = { makeToken, isAuthed, sessionCookie, clearedCookie, sameOrigin, send, protectedRoute, readJsonBody, sha256 };
