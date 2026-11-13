// /api/sheet — signed-in proxy to SheetDB. The SheetDB URL and credentials never reach the browser.
//   GET    /api/sheet?sheet=parts              → all rows of a tab
//   POST   /api/sheet?sheet=scans   { data }   → add rows
//   PATCH  /api/sheet?id=12&sheet=parts { data } → update the row with that ID
//   DELETE /api/sheet?id=12&sheet=parts        → delete the row with that ID
// sheet is optional (default tab = maintenance/repairs).
const { protectedRoute, send, readJsonBody } = require('./_lib');

const SHEETS = new Set(['', 'parts', 'scans']);
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

module.exports = protectedRoute(async (req, res) => {
    const base = (process.env.SHEETDB_API_URL || '').replace(/\/+$/, '');
    if (!/^https:\/\/sheetdb\.io\/api\/v1\/[A-Za-z0-9]+$/.test(base)) return send(res, 500, { error: 'server not configured' });

    const method = req.method;
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return send(res, 405, { error: 'method not allowed' });
    const sheet = String(req.query.sheet || '');
    const id = req.query.id === undefined ? '' : String(req.query.id);
    if (!SHEETS.has(sheet)) return send(res, 400, { error: 'unknown sheet' });
    if (id && !ID_RE.test(id)) return send(res, 400, { error: 'bad id' });
    if ((method === 'PATCH' || method === 'DELETE') && !id) return send(res, 400, { error: 'id required' });
    if ((method === 'GET' || method === 'POST') && id) return send(res, 400, { error: 'id not allowed' });

    const url = base + (id ? `/ID/${encodeURIComponent(id)}` : '') + (sheet ? `?sheet=${sheet}` : '');
    const headers = { Accept: 'application/json' };
    if (process.env.SHEETDB_LOGIN && process.env.SHEETDB_PASSWORD) {
        headers.Authorization = 'Basic ' + Buffer.from(`${process.env.SHEETDB_LOGIN}:${process.env.SHEETDB_PASSWORD}`).toString('base64');
    }
    const init = { method, headers };
    if (method === 'POST' || method === 'PATCH') {
        const body = readJsonBody(req);
        if (!body || !body.data) return send(res, 400, { error: 'data required' });
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify({ data: body.data });
    }

    const upstream = await fetch(url, init);
    const text = await upstream.text();
    if (upstream.status === 401 || upstream.status === 403) {
        console.error('SheetDB rejected the credentials', upstream.status);
        return send(res, 502, { error: 'sheet credentials rejected' });
    }
    send(res, upstream.status, text || '{}');
});
