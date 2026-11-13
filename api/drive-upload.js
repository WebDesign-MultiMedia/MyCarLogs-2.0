// POST /api/drive-upload { name, mimeType, data(base64) } → saves a scan report to Google Drive
// through the Apps Script web app. The script URL and upload key stay on the server.
// Vercel limits request bodies to 4.5 MB, so files must be under ~3 MB (base64 adds a third).
const { protectedRoute, send, readJsonBody } = require('./_lib');

const ALLOWED_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic']);

module.exports = protectedRoute(async (req, res) => {
    if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
    const scriptUrl = process.env.DRIVE_SCRIPT_URL || '', key = process.env.DRIVE_UPLOAD_KEY || '';
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(scriptUrl) || !key) return send(res, 503, { error: 'Google Drive is not set up' });

    const { name, mimeType, data } = readJsonBody(req);
    if (!ALLOWED_TYPES.has(mimeType)) return send(res, 400, { error: 'file type not allowed' });
    if (typeof data !== 'string' || !data || !/^[A-Za-z0-9+/=]+$/.test(data)) return send(res, 400, { error: 'bad file data' });

    // Apps Script answers a POST with a redirect; fetch follows it like a browser does.
    const upstream = await fetch(scriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ key, name: String(name || 'scan-report').slice(0, 150), mimeType, data })
    });
    let out;
    try { out = JSON.parse(await upstream.text()); } catch { return send(res, 502, { error: 'upload failed' }); }
    if (!out.ok) return send(res, 502, { error: out.error === 'unauthorized' ? 'Drive upload key rejected' : (out.error || 'upload failed') });
    send(res, 200, { ok: true, name: out.name, url: out.url });
});
