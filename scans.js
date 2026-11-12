// ---- Scan Reports ----
// Upload an OBD2 scanner report (Topdon PDF, or screenshots of it), extract the trouble
// codes, review/edit them, then save: data → Google Sheet "scans" tab (SheetDB),
// original file → your Google Drive (via the Apps Script in google-apps-script/).

const SCANS_URL = `${SHEETDB_URL}?sheet=scans`;
const PDFJS_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const SCAN_COLUMNS = ['ID', 'Date', 'Vehicle', 'Mileage', 'Scan_Type', 'Report_Number', 'VIN', 'Systems_Scanned', 'Systems_Faulty', 'DTC_Count', 'Systems', 'DTCs', 'Files', 'Notes'];

let allScans = [];
let scansState = 'idle';        // idle | loading | ready | error | missing (no "scans" tab)
let scanVehicleFilter = 'all';
let scanDraft = null;           // { info, systems, dtcs, files, fromImage, vehicle, notes }
let scanBusy = '';              // progress message while reading/saving
let scanMessage = null;         // { kind: 'ok' | 'error', text }
let driveFormOpen = false;
let pendingDeleteScan = null;
const expandedScans = new Set();

// ---------- Small helpers ----------
const scriptPromises = {};
function loadScript(src) {
    if (!scriptPromises[src]) {
        scriptPromises[src] = new Promise((resolve, reject) => {
            const el = document.createElement('script');
            el.src = src; el.async = true;
            el.onload = resolve;
            el.onerror = () => { delete scriptPromises[src]; reject(new Error('Could not load ' + src)); };
            document.head.appendChild(el);
        });
    }
    return scriptPromises[src];
}
function parseJsonCell(v, fallback) {
    try { const x = JSON.parse(v); return x == null ? fallback : x; } catch { return fallback; }
}
function getDriveConfig() {
    return { url: safeGet('scanDriveUrl') || '', key: safeGet('scanDriveKey') || '' };
}
// "SRS/SWS/PUH(Airbag System/...)" → { abbr: "SRS/SWS/PUH", full: "Airbag System/..." }
function splitSystemName(name) {
    const m = String(name || '').match(/^([^()]+?)\s*\((.*)\)\s*$/);
    return m ? { abbr: m[1].trim(), full: m[2].trim() } : { abbr: String(name || ''), full: '' };
}
const systemKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const dtcKey = d => systemKey(splitSystemName(d.system).abbr) + '|' + String(d.code || '').toUpperCase();

function statusClass(status) {
    const s = String(status || '').toLowerCase();
    if (/permanent/.test(s)) return 'bg-red-500/15 text-red-300 border-red-400/30';
    if (/pending|intermittent/.test(s)) return 'bg-amber-400/15 text-amber-300 border-amber-400/30';
    if (/current|active|confirmed/.test(s)) return 'bg-orange-400/15 text-orange-300 border-orange-400/30';
    return 'bg-white/5 text-gray-300 border-white/10';
}

// ---------- Parser (shared by PDF text and screenshot OCR) ----------
// pages = [{ width, height, items: [{ x, y, str }] }]. Works by column position, because in
// Topdon reports the code and status sit vertically centred against multi-line descriptions.
// extraText (e.g. file names) is only used as a fallback for header fields.
function parseScanReport(pages, extraText = '') {
    const items = [];
    pages.forEach((pg, pi) => pg.items.forEach(it => {
        const s = String(it.str || '').replace(/\s+/g, ' ').trim();
        if (!s) return;
        const ry = it.y / pg.height;
        items.push({ s, x: it.x / pg.width, y: pi + ry, band: ry < 0.075 ? 'head' : ry > 0.955 ? 'foot' : 'body' });
    }));

    const LINE_TOL = 0.006;
    const joinParts = parts => parts.reduce((acc, p) => (acc && !/[/-]$/.test(acc) ? acc + ' ' : acc) + p, '');
    const toLines = list => {
        const lines = [];
        [...list].sort((a, b) => a.y - b.y || a.x - b.x).forEach(it => {
            const last = lines[lines.length - 1];
            if (last && Math.abs(it.y - last.y) < LINE_TOL) last.items.push(it);
            else lines.push({ y: it.y, items: [it] });
        });
        lines.forEach(l => { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map(i => i.s).join(' '); });
        return lines;
    };
    const docText = toLines(items).map(l => l.text).join('\n');
    const allText = docText + '\n' + extraText;
    const body = items.filter(i => i.band === 'body');
    const bodyLines = toLines(body);

    const grab = (re, text = docText) => { const m = text.match(re); return m ? m[1].trim() : ''; };
    const info = {
        reportNumber: grab(/Report Number\s*:\s*([A-Z0-9-]+)/i),
        date: grab(/Date Created\s*:\s*(\d{4}-\d{2}-\d{2})/i) || grab(/Diagnostic Time\s*:\s*(\d{4}-\d{2}-\d{2})/i) ||
              grab(/(\d{4}-\d{2}-\d{2})/, extraText),
        vin: grab(/\bVIN\s*:\s*([A-HJ-NPR-Z0-9]{17})\b/i).toUpperCase(),
        make: grab(/\bMake\s*:\s*([A-Za-z][A-Za-z-]*)(?!\s*:)/),
        model: grab(/(?<!Sub )\bModel\s*:\s*([A-Za-z0-9][A-Za-z0-9-]*)(?!\s*:)/),
        year: grab(/\bYear\s*:\s*((?:19|20)\d{2})\b/),
        mileage: '', scanType: 'Scan', systemsScanned: null, systemsFaulty: null, dtcTotal: null
    };
    // File names like "HONDA-ODYSSEY-2010_Pre-Scan_..." fill in what OCR may miss.
    const fromName = extraText.match(/(?<![A-Za-z])([A-Z][A-Z]+)-([A-Z0-9][A-Z0-9]+)-((?:19|20)\d{2})(?!\d)/i);
    if (fromName) {
        info.make = info.make || fromName[1].toUpperCase();
        info.model = info.model || fromName[2].toUpperCase();
        info.year = info.year || fromName[3];
    }
    const dist = docText.match(/Distance Traveled\s*:\s*([\d,.]+)\s*(miles|mi|km)\b/i);
    if (dist) {
        const n = parseFloat(dist[1].replace(/,/g, ''));
        info.mileage = String(Math.round(/km/i.test(dist[2]) ? n * 0.621371 : n));
    }
    const st = allText.match(/(?<![A-Za-z])(Pre|Post)[-\s_]?Scan(?![a-z])/i);
    if (st) info.scanType = `${st[1][0].toUpperCase()}${st[1].slice(1).toLowerCase()}-Scan`;
    const sum = docText.replace(/\n/g, ' ').match(/(\d+)\s+systems?\s+were\s+scanned,?\s+and\s+(\d+)\s+of\s+them.*?Altogether\s+(\d+)\s+DTCs?/i);
    if (sum) { info.systemsScanned = +sum[1]; info.systemsFaulty = +sum[2]; info.dtcTotal = +sum[3]; }

    const nearest = (anchors, it, maxDy) => {
        let best = null, bestDy = Infinity;
        anchors.forEach(a => { const dy = Math.abs(a.y - it.y); if (dy < bestDy) { bestDy = dy; best = a; } });
        return bestDy <= maxDy ? best : null;
    };

    // DTC tables: header row "DTC | Description | Status", titled by the line just above it.
    const headers = bodyLines.filter(l => l.items.some(i => /^DTC$/i.test(i.s) && i.x < 0.2) && /Description/i.test(l.text));
    const tables = headers.map(h => {
        const title = [...bodyLines].reverse().find(l => l.y < h.y - LINE_TOL && h.y - l.y < 0.06);
        return { title: title ? title.text : '', start: h.y, titleY: title ? title.y : h.y };
    });
    tables.forEach((tb, i) => { tb.end = i + 1 < tables.length ? tables[i + 1].titleY - LINE_TOL : Infinity; });

    const STATUS_RE = /\b(DTC|pending|current|history|historic|stored|permanent|confirmed|active|intermittent|inactive)\b/i;
    const CODE_RE = /^[A-Z0-9][A-Z0-9-]{0,9}$/i;
    const MAX_DY = 0.025;
    const dtcs = [];
    tables.forEach(tb => {
        const region = body.filter(i => i.y > tb.start + LINE_TOL && i.y < tb.end);
        const statuses = region.filter(i => i.x >= 0.78 && STATUS_RE.test(i.s));
        const codes = region.filter(i => i.x < 0.2 && CODE_RE.test(i.s) && !/^DTC$/i.test(i.s));
        const descs = region.filter(i => i.x >= 0.2 && i.x < 0.78);
        const anchors = (statuses.length ? statuses : codes).map(a => ({ y: a.y, status: statuses.length ? a.s : '', code: '', desc: [] }));
        codes.forEach(c => { const a = nearest(anchors, c, MAX_DY); if (a && !a.code) a.code = c.s.toUpperCase(); });
        descs.forEach(d => { const a = nearest(anchors, d, MAX_DY); if (a) a.desc.push(d); });
        anchors.filter(a => a.code || a.desc.length).forEach(a => dtcs.push({
            system: tb.title,
            code: a.code,
            desc: joinParts(a.desc.sort((p, q) => p.y - q.y || p.x - q.x).map(d => d.s)),
            status: a.status
        }));
    });

    // Systems overview ("System | ... | System Status"), before the first DTC table.
    const systems = [];
    const sysHeader = bodyLines.find(l => /System Status/i.test(l.text));
    if (sysHeader) {
        const end = tables.length ? tables[0].titleY - LINE_TOL : Infinity;
        const region = body.filter(i => i.y > sysHeader.y + LINE_TOL && i.y < end);
        const anchors = region.filter(i => i.x >= 0.55 && i.x < 0.8 && /fault|tested|response|fail|pass|ok/i.test(i.s))
            .map(a => ({ y: a.y, status: a.s, name: [], count: '' }));
        region.forEach(i => {
            if (i.x < 0.55) { const a = nearest(anchors, i, 0.03); if (a) a.name.push(i); }
            else if (i.x >= 0.8 && /^\d+$/.test(i.s)) { const a = nearest(anchors, i, 0.03); if (a) a.count = i.s; }
        });
        anchors.forEach(a => systems.push({
            name: joinParts(a.name.sort((p, q) => p.y - q.y).map(n => n.s)),
            status: /no fault|pass|ok/i.test(a.status) ? 'ok' : 'fault',
            count: a.count === '' ? null : +a.count
        }));
    }
    dtcs.forEach(d => {
        if (d.system && !systems.some(s => systemKey(s.name) === systemKey(d.system)))
            systems.push({ name: d.system, status: 'fault', count: null });
    });
    systems.forEach(s => {
        if (s.count === null && s.status === 'fault') s.count = dtcs.filter(d => systemKey(d.system) === systemKey(s.name)).length;
    });
    return { info, systems, dtcs };
}

// ---------- Text extraction ----------
async function extractPdfPages(file) {
    await loadScript(PDFJS_SRC);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    const doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const vp = page.getViewport({ scale: 1 });
        const tc = await page.getTextContent();
        pages.push({ width: vp.width, height: vp.height, items: tc.items.map(it => ({ x: it.transform[4], y: vp.height - it.transform[5], str: it.str })) });
    }
    return pages;
}

// Tesseract words → text runs: words on one visual line merge unless separated by a column gap.
function wordsToItems(words, width, height) {
    const ws = words.filter(w => w.text.trim() && w.confidence > 20)
        .map(w => ({ t: w.text.trim(), x0: w.bbox.x0, x1: w.bbox.x1, yc: (w.bbox.y0 + w.bbox.y1) / 2 }))
        .sort((a, b) => a.yc - b.yc || a.x0 - b.x0);
    const rows = [];
    ws.forEach(w => {
        const r = rows.find(r => Math.abs(r.yc - w.yc) < Math.max(4, height * 0.006));
        r ? r.words.push(w) : rows.push({ yc: w.yc, words: [w] });
    });
    const items = [];
    rows.forEach(r => {
        let cur = null;
        r.words.sort((a, b) => a.x0 - b.x0).forEach(w => {
            if (cur && w.x0 - cur.x1 < width * 0.02) { cur.str += ' ' + w.t; cur.x1 = w.x1; }
            else { if (cur) items.push(cur); cur = { x: w.x0, x1: w.x1, y: r.yc, str: w.t }; }
        });
        if (cur) items.push(cur);
    });
    return items;
}

async function extractImagePages(files) {
    await loadScript(TESSERACT_SRC);
    const worker = await window.Tesseract.createWorker('eng');
    // Mode 4 (single column of variable-size text) keeps two-line table cells apart.
    await worker.setParameters({ tessedit_pageseg_mode: '4', preserve_interword_spaces: '1' });
    const pages = [];
    try {
        for (let i = 0; i < files.length; i++) {
            setScanBusy(t('sc_reading_image').replace('{n}', i + 1).replace('{total}', files.length));
            const bmp = await createImageBitmap(files[i]);
            const { width, height } = bmp;
            bmp.close && bmp.close();
            const { data } = await worker.recognize(files[i]);
            pages.push({ width, height, items: wordsToItems(data.words || [], width, height) });
        }
    } finally {
        await worker.terminate();
    }
    return pages;
}

function matchVehicle(info) {
    const vehicles = getVehicles();
    const has = (label, s) => s && label.toLowerCase().includes(String(s).toLowerCase());
    const hit = vehicles.find(v => has(v.label, info.model) && has(v.label, info.year)) ||
        vehicles.find(v => has(v.label, info.make) && has(v.label, info.model));
    return hit ? hit.value : (scanVehicleFilter !== 'all' ? scanVehicleFilter : '');
}

async function handleScanFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    scanMessage = null;
    const pdf = files.find(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    const images = files.filter(f => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const chosen = pdf ? [pdf] : images;
    if (!chosen.length) { scanMessage = { kind: 'error', text: t('sc_bad_file') }; renderScans(); return; }
    const tooBig = chosen.find(f => f.size > MAX_UPLOAD_BYTES);
    if (tooBig) { scanMessage = { kind: 'error', text: t('sc_too_big').replace('{name}', tooBig.name) }; renderScans(); return; }

    try {
        setScanBusy(t('sc_loading_reader'));
        const pages = pdf ? await extractPdfPages(pdf) : await extractImagePages(images);
        const parsed = parseScanReport(pages, chosen.map(f => f.name).join('\n'));
        scanDraft = {
            ...parsed,
            files: chosen,
            fromImage: !pdf,
            vehicle: matchVehicle(parsed.info),
            notes: ''
        };
        if (!parsed.dtcs.length && !parsed.systems.length) scanMessage = { kind: 'error', text: t('sc_parse_none') };
    } catch (err) {
        console.error('Scan read error:', err);
        scanMessage = { kind: 'error', text: t('sc_read_error') };
    }
    scanBusy = '';
    renderScans();
    document.getElementById('scanReview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setScanBusy(text) {
    scanBusy = text;
    const el = document.getElementById('scanBusy');
    if (el) el.textContent = text; else renderScans();
}

// ---------- Saving ----------
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(file);
    });
}

async function uploadToDrive(file) {
    const { url, key } = getDriveConfig();
    // text/plain body avoids a CORS preflight, which Apps Script web apps don't answer.
    const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ key, name: file.name, mimeType: file.type || 'application/pdf', data: await fileToBase64(file) })
    });
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'upload failed');
    return { name: out.name || file.name, url: out.url };
}

async function saveScanDraft() {
    if (!scanDraft) return;
    if (!scanDraft.vehicle) { scanMessage = { kind: 'error', text: t('sc_pick_vehicle') }; renderScans(); return; }
    scanMessage = null;
    const d = scanDraft;
    const dtcs = d.dtcs.filter(x => x.code.trim() || x.desc.trim());
    try {
        const files = [];
        if (getDriveConfig().url) {
            for (let i = 0; i < d.files.length; i++) {
                setScanBusy(t('sc_uploading').replace('{n}', i + 1).replace('{total}', d.files.length));
                files.push(await uploadToDrive(d.files[i]));
            }
        }
        setScanBusy(t('sc_saving'));
        const faulty = d.systems.filter(s => s.status === 'fault').length;
        const row = {
            ID: await nextSequentialId(SCANS_URL),
            Date: d.info.date,
            Vehicle: d.vehicle,
            Mileage: d.info.mileage,
            Scan_Type: d.info.scanType,
            Report_Number: d.info.reportNumber,
            VIN: d.info.vin,
            Systems_Scanned: String(d.systems.length || d.info.systemsScanned || ''),
            Systems_Faulty: String(faulty),
            DTC_Count: String(dtcs.length),
            Systems: JSON.stringify(d.systems),
            DTCs: JSON.stringify(dtcs),
            Files: JSON.stringify(files),
            Notes: d.notes
        };
        const res = await fetch(SCANS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [row] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        allScans.push(row);
        expandedScans.add(row.ID);
        scanVehicleFilter = d.vehicle;
        scanDraft = null;
        scanMessage = { kind: 'ok', text: t('sc_saved') };
    } catch (err) {
        console.error('Scan save error:', err);
        scanMessage = { kind: 'error', text: /upload|unauthor|type|large/i.test(String(err.message)) && getDriveConfig().url
            ? t('sc_upload_failed').replace('{err}', err.message) : t('sc_save_error') };
    }
    scanBusy = '';
    renderScans();
}

async function deleteScan(id) {
    try {
        const res = await fetch(`${SHEETDB_URL}/ID/${encodeURIComponent(id)}?sheet=scans`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        allScans = allScans.filter(s => s.ID !== id);
        scanMessage = { kind: 'ok', text: t('sc_deleted') };
    } catch (err) {
        console.error('Scan delete error:', err);
        scanMessage = { kind: 'error', text: t('sc_delete_error') };
    }
    pendingDeleteScan = null;
    renderScans();
}

async function fetchScans() {
    scansState = 'loading';
    renderScans();
    try {
        const res = await fetch(SCANS_URL);
        const data = await res.json();
        if (data && !Array.isArray(data) && data.error) { scansState = 'missing'; allScans = []; }
        else { allScans = Array.isArray(data) ? data : []; scansState = 'ready'; }
    } catch (err) {
        console.error('Scan fetch error:', err);
        scansState = 'error';
    }
    renderScans();
}

// ---------- Rendering ----------
const inputCls = 'w-full text-sm rounded-lg border border-white/10 bg-gray-950/50 text-txtWht px-3 py-2 placeholder:text-gray-500 focus:outline-none focus:border-red-400/60 focus:ring-2 focus:ring-red-400/20';
const labelCls = 'text-gray-400 text-[11px] font-semibold uppercase tracking-wide';

function uploadCardHtml() {
    const drive = getDriveConfig();
    const driveLine = drive.url
        ? `<span class="text-emerald-300"><i class="fa-brands fa-google-drive mr-1.5"></i>${t('sc_drive_connected')}</span>`
        : `<span class="text-gray-400"><i class="fa-brands fa-google-drive mr-1.5"></i>${t('sc_drive_not_connected')}</span>`;
    const driveForm = driveFormOpen ? `
      <div class="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-gray-950/40 p-3">
        <p class="text-gray-400 text-xs">${t('sc_drive_help')}</p>
        <label class="${labelCls}" for="driveUrlInput">${t('sc_drive_url')}</label>
        <input id="driveUrlInput" class="${inputCls}" placeholder="https://script.google.com/macros/s/…/exec" value="${escapeHtml(drive.url)}">
        <label class="${labelCls}" for="driveKeyInput">${t('sc_drive_key')}</label>
        <input id="driveKeyInput" type="password" class="${inputCls}" value="${escapeHtml(drive.key)}">
        <div class="flex gap-3 justify-end">
          ${drive.url ? `<button type="button" data-scan-action="drive-disconnect" class="text-gray-400 text-sm hover:text-txtWht">${t('sc_drive_disconnect')}</button>` : ''}
          <button type="button" data-scan-action="drive-save" class="bg-red-400 text-gray-900 text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-red-300">${t('sc_drive_save')}</button>
        </div>
      </div>` : '';

    return `
    <div class="rounded-2xl border border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/95 shadow-2xl shadow-black/40 overflow-hidden mb-6">
      <div class="h-1.5 bg-gradient-to-r from-red-400 via-rose-300 to-red-400"></div>
      <div class="p-4 sm:p-6 flex flex-col gap-4">
        <label for="scanFileInput" class="${scanBusy ? 'pointer-events-none opacity-60' : 'cursor-pointer'} flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-red-400/40 hover:border-red-400 hover:bg-red-400/5 transition-colors duration-150 px-4 py-7 text-center" id="scanDrop">
          <i class="fa-solid fa-file-arrow-up text-red-300 text-2xl"></i>
          <span class="text-txtWht font-semibold">${t('sc_upload_title')}</span>
          <span class="text-gray-400 text-xs">${t('sc_upload_hint')}</span>
        </label>
        <input id="scanFileInput" type="file" accept="application/pdf,image/*" multiple class="sr-only">
        ${scanBusy ? `<p class="flex items-center justify-center gap-2 text-red-200 text-sm"><i class="fa-solid fa-spinner fa-spin"></i><span id="scanBusy">${escapeHtml(scanBusy)}</span></p>` : ''}
        ${scanMessage ? `<p class="text-sm text-center ${scanMessage.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}">${escapeHtml(scanMessage.text)}</p>` : ''}
        <div class="flex items-center justify-between text-xs border-t border-white/5 pt-3">
          ${driveLine}
          <button type="button" data-scan-action="drive-toggle" class="text-red-300 font-semibold hover:underline">${drive.url ? t('sc_drive_edit') : t('sc_drive_connect')}</button>
        </div>
        ${driveForm}
      </div>
    </div>`;
}

function reviewHtml() {
    if (!scanDraft) return '';
    const d = scanDraft;
    const vehicleOpts = getVehicles().map(v => `<option value="${escapeHtml(v.value)}"${v.value === d.vehicle ? ' selected' : ''}>${escapeHtml(v.label)}</option>`).join('');
    const field = (key, label, value, type = 'text') => `
      <div class="flex flex-col gap-1">
        <label class="${labelCls}" for="draft_${key}">${label}</label>
        <input id="draft_${key}" type="${type}" data-draft-field="${key}" class="${inputCls}${type === 'date' ? ' [color-scheme:dark]' : ''}" value="${escapeHtml(value || '')}">
      </div>`;
    const okSystems = d.systems.filter(s => s.status === 'ok');
    const rows = d.dtcs.map((x, i) => `
      <div class="grid grid-cols-[5.5rem_1fr_auto] gap-2 items-start rounded-xl border border-white/5 bg-gray-950/30 p-2.5">
        <input data-dtc="${i}" data-k="code" class="${inputCls} font-mono uppercase" value="${escapeHtml(x.code)}" placeholder="${t('sc_col_code')}">
        <div class="flex flex-col gap-1.5 min-w-0">
          <input data-dtc="${i}" data-k="desc" class="${inputCls}" value="${escapeHtml(x.desc)}" placeholder="${t('sc_col_desc')}">
          <div class="grid grid-cols-2 gap-1.5">
            <input data-dtc="${i}" data-k="system" class="${inputCls} text-xs" value="${escapeHtml(x.system)}" placeholder="${t('sc_col_system')}">
            <input data-dtc="${i}" data-k="status" class="${inputCls} text-xs" value="${escapeHtml(x.status)}" placeholder="${t('sc_col_status')}">
          </div>
        </div>
        <button type="button" data-scan-action="dtc-remove" data-idx="${i}" aria-label="${t('sc_remove')}" class="w-8 h-8 rounded-lg text-gray-500 hover:text-red-300 hover:bg-red-400/10"><i class="fa-solid fa-trash-can text-sm"></i></button>
      </div>`).join('');

    return `
    <div id="scanReview" class="rounded-2xl border border-red-400/30 bg-gray-900/90 shadow-2xl shadow-black/40 p-4 sm:p-6 mb-6 flex flex-col gap-5 scroll-mt-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-txtWht text-lg font-semibold">${t('sc_review_title')}</h3>
          <p class="text-gray-400 text-xs">${d.files.map(f => escapeHtml(f.name)).join(', ')}</p>
        </div>
        <button type="button" data-scan-action="draft-cancel" class="text-gray-400 hover:text-txtWht text-sm">${t('action_cancel')}</button>
      </div>
      ${d.fromImage ? `<p class="rounded-lg bg-amber-400/10 border border-amber-400/25 text-amber-100 text-xs px-3 py-2"><i class="fa-solid fa-triangle-exclamation mr-1.5 text-amber-300"></i>${t('sc_ocr_warning')}</p>` : ''}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="flex flex-col gap-1">
          <label class="${labelCls}" for="draft_vehicle">${t('sc_field_vehicle')}</label>
          <div class="relative">
            <select id="draft_vehicle" data-draft-field="vehicle" class="${inputCls} appearance-none pr-9 [color-scheme:dark] [&_option]:bg-gray-900">
              <option value="">${t('opt_choose_car')}</option>${vehicleOpts}
            </select>
            <i class="fa-solid fa-chevron-down pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500"></i>
          </div>
        </div>
        ${field('date', t('sc_field_date'), toDateInputValue(d.info.date), 'date')}
        ${field('mileage', t('sc_field_mileage'), d.info.mileage, 'number')}
        ${field('scanType', t('sc_field_type'), d.info.scanType)}
        ${field('vin', 'VIN', d.info.vin)}
        ${field('reportNumber', t('sc_field_report'), d.info.reportNumber)}
      </div>
      ${d.systems.length ? `<div class="flex flex-col gap-2">
        <p class="${labelCls}">${t('sc_systems_label')} · ${d.systems.length}</p>
        <div class="flex flex-wrap gap-1.5">${d.systems.map(s => `<span class="text-xs px-2 py-1 rounded-full border ${s.status === 'ok'
            ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-red-400/30 bg-red-500/10 text-red-200'}">${escapeHtml(splitSystemName(s.name).abbr)}${s.status === 'fault' ? ` · ${s.count ?? ''}` : ''}</span>`).join('')}</div>
        ${okSystems.length === d.systems.length ? `<p class="text-emerald-300 text-xs">${t('sc_all_ok')}</p>` : ''}
      </div>` : ''}
      <div class="flex flex-col gap-2">
        <p class="${labelCls}">${t('sc_codes_label')} · ${d.dtcs.length}${d.info.dtcTotal !== null && d.info.dtcTotal !== d.dtcs.length
            ? ` <span class="normal-case text-amber-300 font-normal">(${t('sc_count_mismatch').replace('{n}', d.info.dtcTotal)})</span>` : ''}</p>
        ${rows || `<p class="text-gray-500 text-sm">${t('sc_parse_none')}</p>`}
        <button type="button" data-scan-action="dtc-add" class="self-start text-red-300 text-sm font-semibold hover:underline">${t('sc_add_code')}</button>
      </div>
      <div class="flex flex-col gap-1">
        <label class="${labelCls}" for="draft_notes">${t('sc_notes')}</label>
        <textarea id="draft_notes" data-draft-field="notes" class="${inputCls} min-h-[80px] resize-none" placeholder="${t('sc_notes_placeholder')}">${escapeHtml(d.notes)}</textarea>
      </div>
      ${!getDriveConfig().url ? `<p class="text-gray-400 text-xs"><i class="fa-brands fa-google-drive mr-1.5"></i>${t('sc_no_drive_note')}</p>` : ''}
      <button type="button" data-scan-action="draft-save" ${scanBusy ? 'disabled' : ''}
        class="w-full sm:w-2/3 mx-auto bg-gradient-to-r from-red-400 to-rose-400 text-gray-900 p-3 rounded-xl font-semibold shadow-lg shadow-red-400/20 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 disabled:opacity-60">${t('sc_save')}</button>
    </div>`;
}

const DG_SEV_DOT = { safety: 'bg-red-400', soon: 'bg-amber-300', monitor: 'bg-sky-300' };
const DG_SEV_PILL = {
    safety: 'bg-red-500/15 text-red-300 border-red-400/30',
    soon: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    monitor: 'bg-sky-400/10 text-sky-300 border-sky-400/25'
};

// One code row; tapping it opens the plain-language guide (dtc-guide.js).
function dtcRowHtml(x, ctx) {
    const gd = getDtcGuide(x, ctx);
    const list = items => `<ul class="flex flex-col gap-1 list-disc pl-4 marker:text-gray-600">${items.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
    const block = (label, body) => `<div class="flex flex-col gap-1"><p class="${labelCls}">${label}</p><div class="text-gray-300 text-sm">${body}</div></div>`;
    return `<details class="group rounded-lg bg-gray-950/40 border border-white/5 open:border-white/15">
      <summary class="flex items-start gap-3 px-3 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${DG_SEV_DOT[gd.sev]}" title="${t('dg_sev_' + gd.sev)}"></span>
        <span class="font-mono text-sm text-txtWht w-12 shrink-0">${escapeHtml(x.code || '—')}</span>
        <span class="flex-1 min-w-0 text-gray-300 text-sm">${escapeHtml(x.desc)}</span>
        ${x.status ? `<span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${statusClass(x.status)}">${escapeHtml(x.status.replace(/\s*DTC$/i, ''))}</span>` : ''}
        <i class="fa-solid fa-chevron-down text-[10px] text-gray-500 mt-1.5 transition-transform group-open:rotate-180"></i>
      </summary>
      <div class="flex flex-col gap-3 px-3 pb-3 pt-1 border-t border-white/5">
        <div class="flex flex-wrap items-center gap-2 pt-2">
          <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${DG_SEV_PILL[gd.sev]}">${t('dg_sev_' + gd.sev)}</span>
          ${gd.codeType ? `<span class="text-gray-500 text-xs">${escapeHtml(gd.codeType)}</span>` : ''}
        </div>
        ${block(t('dg_means'), escapeHtml(gd.means))}
        ${gd.where ? block(t('dg_where'), escapeHtml(gd.where)) : ''}
        ${gd.parts.length ? block(t('dg_parts'), `<div class="flex flex-wrap gap-1.5">${gd.parts.map((p, i) => `<span class="text-xs px-2 py-1 rounded-md border ${i === 0 && gd.module ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-white/10 bg-white/5 text-gray-200'}">${escapeHtml(p)}</span>`).join('')}</div>`) : ''}
        ${gd.check.length ? block(t('dg_check'), list(gd.check)) : ''}
        ${gd.fix ? block(t('dg_fix'), escapeHtml(gd.fix)) : ''}
        <div class="flex flex-wrap items-center justify-between gap-2">
          <a href="${escapeHtml(gd.searchUrl)}" target="_blank" rel="noopener" class="text-red-300 text-xs font-semibold hover:underline"><i class="fa-solid fa-magnifying-glass mr-1"></i>${t('dg_search')}</a>
          <p class="text-gray-600 text-[11px]">${t('dg_disclaimer')}</p>
        </div>
      </div>
    </details>`;
}

function scanCardHtml(scan, prev) {
    const id = scan.ID;
    const systems = parseJsonCell(scan.Systems, []);
    const dtcs = parseJsonCell(scan.DTCs, []);
    const files = parseJsonCell(scan.Files, []);
    const expanded = expandedScans.has(id);
    const date = parseRecordDate(scan.Date);
    const miles = parseMiles(scan.Mileage);
    const faulty = systems.filter(s => s.status === 'fault');
    const okCount = systems.length - faulty.length;

    let compare = `<span class="text-gray-500">${t('sc_first_scan')}</span>`;
    if (prev) {
        const prevKeys = new Set(parseJsonCell(prev.DTCs, []).map(dtcKey));
        const curKeys = new Set(dtcs.map(dtcKey));
        const added = [...curKeys].filter(k => !prevKeys.has(k)).length;
        const cleared = [...prevKeys].filter(k => !curKeys.has(k)).length;
        const still = [...curKeys].filter(k => prevKeys.has(k)).length;
        const pDate = parseRecordDate(prev.Date);
        compare = `<span class="text-gray-500">${t('sc_vs_prev')}${pDate ? ` (${fmtDate(pDate)})` : ''}:</span>
          ${added ? `<span class="text-red-300 font-semibold">${t('sc_new').replace('{n}', added)}</span>` : ''}
          ${cleared ? `<span class="text-emerald-300 font-semibold">${t('sc_cleared').replace('{n}', cleared)}</span>` : ''}
          ${still ? `<span class="text-gray-300">${t('sc_still').replace('{n}', still)}</span>` : ''}
          ${!added && !cleared && !still ? `<span class="text-gray-300">${t('sc_no_codes')}</span>` : ''}`;
    }

    const ctx = { vehicleLabel: getVehicleLabel(scan.Vehicle), modelYear: vinModelYear(scan.VIN) || (+(String(getVehicleLabel(scan.Vehicle)).match(/\b(?:19|20)\d{2}\b/) || [])[0] || null) };
    const tips = expanded ? dtcPatternInsights(dtcs, ctx) : [];
    const tipsHtml = tips.length ? `<div class="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p class="${labelCls}"><i class="fa-solid fa-route mr-1.5"></i>${t('dg_start')}</p>
        ${tips.map(tp => `<p class="flex gap-2 text-sm text-gray-200"><span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${DG_SEV_DOT[tp.sev]}"></span><span>${escapeHtml(tp.text)}</span></p>`).join('')}
      </div>` : '';

    // Group codes by system for display.
    const groups = [];
    dtcs.forEach(dtc => {
        let g = groups.find(x => systemKey(x.name) === systemKey(dtc.system));
        if (!g) groups.push(g = { name: dtc.system, items: [] });
        g.items.push(dtc);
    });
    const groupHtml = groups.map(g => {
        const n = splitSystemName(g.name);
        return `<div class="flex flex-col gap-1.5">
          <p class="text-sm"><span class="text-red-200 font-semibold">${escapeHtml(n.abbr || t('sc_other_system'))}</span>${n.full ? `<span class="text-gray-500 text-xs"> · ${escapeHtml(n.full)}</span>` : ''}</p>
          ${g.items.map(x => dtcRowHtml(x, ctx)).join('')}
        </div>`;
    }).join('');

    const okChips = systems.filter(s => s.status === 'ok').map(s =>
        `<span class="text-[11px] px-2 py-0.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 text-emerald-200">${escapeHtml(splitSystemName(s.name).abbr)}</span>`).join('');

    const deleting = pendingDeleteScan === id;
    return `
    <article class="rounded-2xl border border-white/10 bg-gray-950/60 p-4 sm:p-5 flex flex-col gap-3">
      <header data-scan-toggle="${escapeHtml(id)}" class="cursor-pointer flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h3 class="text-txtWht text-base sm:text-lg font-semibold tracking-tight">${date ? fmtDate(date) : escapeHtml(scan.Date || '—')}</h3>
          <p class="text-gray-500 text-xs truncate">${escapeHtml(getVehicleLabel(scan.Vehicle))}${miles !== null ? ` · ${fmtMiles(miles)} mi` : ''}</p>
        </div>
        <div class="flex flex-wrap justify-end gap-1.5 shrink-0">
          ${scan.Scan_Type ? `<span class="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-white/10 bg-white/5 text-gray-300">${escapeHtml(scan.Scan_Type)}</span>` : ''}
          <span class="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${dtcs.length ? 'bg-red-500/15 text-red-300 border-red-400/30' : 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30'}">${dtcs.length ? t('sc_codes_n').replace('{n}', dtcs.length) : t('sc_no_codes')}</span>
        </div>
      </header>
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">${compare}</div>
      ${systems.length ? `<p class="text-gray-400 text-xs">${t('sc_systems_faulty').replace('{f}', faulty.length).replace('{n}', systems.length)}${okCount ? ` · <span class="text-emerald-300">${t('sc_ok_count').replace('{n}', okCount)}</span>` : ''}</p>` : ''}
      ${expanded ? `
        ${tipsHtml}
        ${groupHtml ? `<p class="text-gray-500 text-xs -mb-1"><i class="fa-regular fa-hand-pointer mr-1"></i>${t('dg_tap_hint')}</p><div class="flex flex-col gap-4">${groupHtml}</div>` : ''}
        ${okChips ? `<div class="flex flex-col gap-1.5"><p class="${labelCls}">${t('sc_ok_systems')}</p><div class="flex flex-wrap gap-1.5">${okChips}</div></div>` : ''}
        ${scan.Notes ? `<p class="text-gray-300 text-sm border-l-2 border-white/10 pl-3">${escapeHtml(scan.Notes)}</p>` : ''}
        ${scan.VIN || scan.Report_Number ? `<p class="text-gray-500 text-xs">${scan.VIN ? `VIN ${escapeHtml(scan.VIN)}` : ''}${scan.VIN && scan.Report_Number ? ' · ' : ''}${scan.Report_Number ? `${t('sc_field_report')} ${escapeHtml(scan.Report_Number)}` : ''}</p>` : ''}
      ` : ''}
      <footer class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5">
        <div class="flex flex-wrap gap-3">
          ${files.map(f => `<a href="${escapeHtml(f.url)}" target="_blank" rel="noopener" class="text-red-300 text-xs font-semibold hover:underline"><i class="fa-brands fa-google-drive mr-1"></i>${t('sc_view_file')}${files.length > 1 ? ` ${files.indexOf(f) + 1}` : ''}</a>`).join('')}
        </div>
        <div class="flex items-center gap-4">
          <button type="button" data-scan-action="delete" data-id="${escapeHtml(id)}" class="text-xs ${deleting ? 'text-red-300 font-semibold' : 'text-gray-500 hover:text-red-300'}">${deleting ? t('sc_delete_confirm') : t('action_delete')}</button>
          <button type="button" data-scan-toggle="${escapeHtml(id)}" class="text-gray-500 text-xs flex items-center gap-1">${expanded ? t('tl_less') : t('tl_details')}
            <i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[10px]"></i></button>
        </div>
      </footer>
    </article>`;
}

function scanListHtml() {
    if (scansState === 'loading') return `<p class="text-gray-400 text-center py-8 animate-pulse">${t('sc_loading')}</p>`;
    if (scansState === 'error') return `<p class="text-red-400 text-center py-8">${t('sc_load_error')}</p>`;
    if (scansState === 'missing') return `<div class="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm text-amber-100 flex flex-col gap-2">
        <p class="font-semibold"><i class="fa-solid fa-table mr-1.5"></i>${t('sc_no_sheet_title')}</p>
        <p class="text-amber-100/80">${t('sc_no_sheet')}</p>
        <code class="text-[11px] text-amber-200 break-all bg-gray-950/50 rounded-lg p-2">${SCAN_COLUMNS.join(' | ')}</code>
        <button type="button" data-scan-action="copy-headers" class="self-start bg-amber-300 text-gray-900 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-200"><i class="fa-solid fa-copy mr-1.5"></i>${t('sc_copy_headers')}</button>
      </div>`;

    const vehicles = getVehicles();
    const chips = [{ value: 'all', label: t('filter_all') }, ...vehicles].map(v => {
        const active = v.value === scanVehicleFilter;
        return `<button type="button" data-scan-vehicle="${escapeHtml(v.value)}" class="shrink-0 px-3.5 py-1.5 rounded-full text-xs sm:text-sm border transition-colors duration-150 whitespace-nowrap ${active
            ? 'bg-red-400 text-gray-900 border-red-400 font-semibold' : 'border-white/15 text-gray-400 hover:border-red-400 hover:text-red-300'}">${escapeHtml(v.label)}</button>`;
    }).join('');

    const byDateDesc = (a, b) => (parseRecordDate(b.Date) || 0) - (parseRecordDate(a.Date) || 0) || (+b.ID || 0) - (+a.ID || 0);
    const list = allScans.filter(s => scanVehicleFilter === 'all' || s.Vehicle === scanVehicleFilter).sort(byDateDesc);
    const cards = list.map(scan => {
        const older = allScans.filter(s => s.Vehicle === scan.Vehicle && s !== scan && byDateDesc(scan, s) < 0).sort(byDateDesc);
        return scanCardHtml(scan, older[0]);
    }).join('');

    return `<div class="flex gap-2 overflow-x-auto -mx-1 px-1 mb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">${chips}</div>
      ${cards ? `<div class="flex flex-col gap-4">${cards}</div>` : `<p class="text-gray-400 text-center py-8">${t('sc_empty')}</p>`}`;
}

function renderScans() {
    const el = document.getElementById('scansContent');
    if (!el || document.getElementById('scans').style.display === 'none') return;
    el.innerHTML = uploadCardHtml() + reviewHtml() + scanListHtml();
}

// ---------- Events ----------
const scansContent = document.getElementById('scansContent');

scansContent.addEventListener('change', e => {
    if (e.target.id === 'scanFileInput') { handleScanFiles(e.target.files); e.target.value = ''; }
});

scansContent.addEventListener('input', e => {
    if (!scanDraft) return;
    const f = e.target.dataset.draftField;
    if (f === 'vehicle') scanDraft.vehicle = e.target.value;
    else if (f === 'notes') scanDraft.notes = e.target.value;
    else if (f) scanDraft.info[f] = e.target.value;
    const i = e.target.dataset.dtc;
    if (i !== undefined) scanDraft.dtcs[+i][e.target.dataset.k] = e.target.value;
});

scansContent.addEventListener('click', e => {
    const act = e.target.closest('[data-scan-action]');
    if (act) {
        const a = act.dataset.scanAction;
        if (a === 'drive-toggle') { driveFormOpen = !driveFormOpen; renderScans(); }
        else if (a === 'drive-save') {
            const url = document.getElementById('driveUrlInput').value.trim();
            const key = document.getElementById('driveKeyInput').value.trim();
            if (url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { scanMessage = { kind: 'error', text: t('sc_drive_bad_url') }; renderScans(); return; }
            safeSet('scanDriveUrl', url); safeSet('scanDriveKey', key);
            driveFormOpen = false; scanMessage = { kind: 'ok', text: url ? t('sc_drive_connected') : t('sc_drive_not_connected') }; renderScans();
        }
        else if (a === 'drive-disconnect') { safeSet('scanDriveUrl', ''); safeSet('scanDriveKey', ''); driveFormOpen = false; renderScans(); }
        else if (a === 'copy-headers') {
            navigator.clipboard.writeText(SCAN_COLUMNS.join('\t'))
                .then(() => { act.innerHTML = `<i class="fa-solid fa-check mr-1.5"></i>${t('sc_copied')}`; })
                .catch(() => { act.textContent = SCAN_COLUMNS.join(' '); });
        }
        else if (a === 'draft-cancel') { scanDraft = null; scanMessage = null; renderScans(); }
        else if (a === 'draft-save') saveScanDraft();
        else if (a === 'dtc-add') { scanDraft.dtcs.push({ system: '', code: '', desc: '', status: '' }); renderScans(); }
        else if (a === 'dtc-remove') { scanDraft.dtcs.splice(+act.dataset.idx, 1); renderScans(); }
        else if (a === 'delete') {
            const id = act.dataset.id;
            if (pendingDeleteScan === id) deleteScan(id);
            else { pendingDeleteScan = id; renderScans(); }
        }
        return;
    }
    const chip = e.target.closest('[data-scan-vehicle]');
    if (chip) { scanVehicleFilter = chip.dataset.scanVehicle; pendingDeleteScan = null; renderScans(); return; }
    const toggle = e.target.closest('[data-scan-toggle]');
    if (toggle) {
        const id = toggle.dataset.scanToggle;
        expandedScans.has(id) ? expandedScans.delete(id) : expandedScans.add(id);
        renderScans();
    }
});

// Drag & drop onto the upload area.
scansContent.addEventListener('dragover', e => { if (e.target.closest('#scanDrop')) e.preventDefault(); });
scansContent.addEventListener('drop', e => {
    if (!e.target.closest('#scanDrop')) return;
    e.preventDefault();
    handleScanFiles(e.dataTransfer.files);
});

document.getElementById('navScans').addEventListener('click', () => {
    showSection('scans');
    if (scansState === 'idle' || scansState === 'error') fetchScans(); else renderScans();
});
