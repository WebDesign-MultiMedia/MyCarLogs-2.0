// ---- Vehicle profiles: synced to the sheet, with VIN scan + lookup ----
// Vehicles used to live only in this browser (localStorage). Now the sheet tab "vehicles" is
// the source of truth, so phone and computer show the same list; localStorage is just a cache
// so the page can draw instantly. Tab columns:
//   vehicles → ID | Code | Name | VIN | Year | Make | Model | Trim | Engine
// Code is what records store in their Vehicle column (HP07, HO10…) and never changes,
// so renaming a vehicle never breaks its history.
// VIN lookup uses NHTSA's free vPIC service; the barcode scanner uses the browser's own
// BarcodeDetector when it can read Code 39 (Android/Chrome), otherwise the ZXing library (iPhone).

const VEHICLES_URL = '/api/sheet?sheet=vehicles';
const ZXING_SRC = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
const vehicleSync = { loaded: false, tabMissing: false };
let vmView = { mode: 'list' };        // 'list' | 'edit'
let vmPendingDelete = false;

const VEHICLE_FIELDS = ['vin', 'year', 'make', 'model', 'trim', 'engine'];
const fromRow = r => ({ id: String(r.ID), value: String(r.Code), label: r.Name || String(r.Code),
    vin: r.VIN || '', year: r.Year || '', make: r.Make || '', model: r.Model || '', trim: r.Trim || '', engine: r.Engine || '' });
const toRow = v => ({ ID: v.id, Code: v.value, Name: v.label, VIN: v.vin || '', Year: v.year || '', Make: v.make || '',
    Model: v.model || '', Trim: v.trim || '', Engine: v.engine || '' });

// Loads the vehicles tab. First run (tab empty): copies this browser's list up to the sheet.
async function syncVehicles() {
    let rows = null;
    try {
        const res = await apiFetch(VEHICLES_URL);
        const data = res.ok ? await res.json() : null;
        rows = Array.isArray(data) ? data : null;
    } catch { return; }
    vehicleSync.loaded = true;
    if (!rows) { vehicleSync.tabMissing = true; refreshVehicleViews(); return; }
    vehicleSync.tabMissing = false;
    if (!rows.length) {
        const seeded = getVehicles().map((v, i) => ({ ...v, id: String(i + 1) }));
        try {
            const res = await apiFetch(VEHICLES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: seeded.map(toRow) }) });
            if (res.ok) saveVehicles(seeded);
        } catch (e) { console.error('Vehicle seed error:', e); }
    } else {
        saveVehicles(rows.filter(r => r.Code).map(fromRow));
    }
    refreshVehicleViews();
}

function refreshVehicleViews() {
    populateVehicleSelects();
    if (document.getElementById('timeline')?.style.display === 'block') renderTimeline();
    if (document.getElementById('scans')?.style.display === 'block' && typeof renderScans === 'function') renderScans();
    if (!vehicleModal.classList.contains('hidden')) renderVehicleManagerList();
}

sessionReady.then(() => { if (appSession.authed) syncVehicles(); });

// "2007 Honda Pilot EX-L · 3.5L V6"
function vehicleSpecLine(v) {
    const main = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ');
    return [main, v.engine].filter(Boolean).join(' · ');
}

// ---- VIN helpers ----
function cleanVin(s) {
    let v = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length === 18 && v[0] === 'I') v = v.slice(1); // door-jamb Code 39 barcodes often start with "I" (import)
    if (v.length > 17) { const m = v.match(/[A-HJ-NPR-Z0-9]{17}/); if (m) v = m[0]; }
    return v;
}
const vinFormatOk = v => /^[A-HJ-NPR-Z0-9]{17}$/.test(v);
// 9th character check digit (required on North American VINs).
function vinCheckDigitOk(v) {
    const map = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
    const w = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = [...v].reduce((s, c, i) => s + (/\d/.test(c) ? +c : map[c]) * w[i], 0);
    const r = sum % 11;
    return v[8] === (r === 10 ? 'X' : String(r));
}
const titleCase = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

async function decodeVin(vin) {
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const r = ((await res.json()).Results || [])[0] || {};
    if (!r.Make || !r.ModelYear) return null;
    const liters = parseFloat(r.DisplacementL);
    const cyl = parseInt(r.EngineCylinders, 10);
    const layout = /^V/i.test(r.EngineConfiguration || '') ? 'V' : /in-?line|straight/i.test(r.EngineConfiguration || '') ? 'I' : /flat|horizontal/i.test(r.EngineConfiguration || '') ? 'H' : '';
    const engine = [liters ? liters.toFixed(1) + 'L' : '', cyl ? (layout ? layout + cyl : cyl + ' cyl') : '',
        /electric/i.test(r.FuelTypePrimary || '') ? 'Electric' : /hybrid/i.test(r.ElectrificationLevel || '') ? 'Hybrid' : ''].filter(Boolean).join(' ');
    return { year: r.ModelYear, make: titleCase(r.Make), model: r.Model || '', trim: r.Trim || r.Series || '', engine };
}

// ---- Vehicle manager modal ----
const vmInput = 'w-full text-base rounded-lg border border-white/10 bg-gray-950/60 text-txtWht px-3 py-2.5 focus:outline-none focus:border-logoClr/60 focus:ring-2 focus:ring-logoClr/20';
const vmLabel = 'text-gray-400 text-[11px] font-semibold uppercase tracking-wide';

function renderVehicleManagerList() {
    const box = document.getElementById('vehicleModalBody');
    if (!box) return;
    box.innerHTML = vmView.mode === 'edit' ? vehicleEditHtml() : vehicleListHtml();
}

function vehicleListHtml() {
    const vehicles = getVehicles();
    const hint = vehicleSync.tabMissing ? `<p class="text-amber-100 text-xs rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 [&_code]:text-amber-200 [&_b]:text-txtWht">${t('vh_missing_tab')}</p>` : '';
    const items = vehicles.length ? vehicles.map((v, i) => `
      <li><button type="button" data-vh-edit="${i}" class="w-full text-left flex items-center gap-3 rounded-xl border border-white/10 bg-gray-950/50 hover:border-logoClr/40 px-3 py-2.5">
        <span class="shrink-0 w-9 h-9 rounded-full bg-logoClr/10 text-logoClr flex items-center justify-center"><i class="fa-solid fa-car-side text-sm"></i></span>
        <span class="min-w-0 flex-1">
          <span class="block text-txtWht text-sm font-semibold truncate">${escapeHtml(v.label)}</span>
          <span class="block text-gray-500 text-xs truncate">${escapeHtml(vehicleSpecLine(v) || t('vh_no_details'))}</span>
          ${v.vin ? `<span class="block text-gray-500 text-[11px] font-mono">VIN ${escapeHtml(v.vin)}</span>` : ''}
        </span>
        <i class="fa-solid fa-pen text-gray-500 text-xs"></i>
      </button></li>`).join('') : `<li class="text-gray-400 text-sm text-center py-2">${t('no_vehicles')}</li>`;
    return `${hint}<ul class="flex flex-col gap-2 max-h-[55vh] overflow-y-auto">${items}</ul>
      <button type="button" data-vh-new class="w-full bg-logoClr text-gray-900 font-semibold rounded-xl p-2.5 hover:brightness-110"><i class="fa-solid fa-plus mr-1.5"></i>${t('vh_add')}</button>`;
}

function vehicleEditHtml() {
    const v = vmView.draft;
    const isNew = vmView.index === undefined;
    const field = (key, labelKey, attrs = '') => `<label class="flex flex-col gap-1.5"><span class="${vmLabel}">${t(labelKey)}</span>
      <input data-vh-field="${key}" value="${escapeHtml(v[key] || '')}" class="${vmInput}" ${attrs}></label>`;
    const scanVin = typeof allScans !== 'undefined' && !v.vin && !isNew
        ? (allScans.find(s => s.Vehicle === v.value && vinFormatOk(cleanVin(s.VIN))) || {}).VIN : '';
    const used = isNew ? 0 : countVehicleRecords(v.value);
    return `
      <div class="flex flex-col gap-1.5">
        <span class="${vmLabel}">VIN</span>
        <div class="flex gap-2">
          <input id="vhVin" data-vh-field="vin" value="${escapeHtml(v.vin || '')}" maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false"
            placeholder="${t('vh_vin_ph')}" class="${vmInput} font-mono uppercase min-w-0">
          <button type="button" data-vh-scan title="${t('vh_scan')}" class="shrink-0 px-3 rounded-lg border border-white/15 text-gray-200 hover:border-logoClr/50 hover:text-logoClr"><i class="fa-solid fa-barcode"></i></button>
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          <button type="button" data-vh-lookup class="text-xs font-semibold text-logoClr hover:underline"><i class="fa-solid fa-magnifying-glass mr-1"></i>${t('vh_lookup')}</button>
          <button type="button" data-vh-scan class="text-xs font-semibold text-gray-400 hover:text-txtWht"><i class="fa-solid fa-camera mr-1"></i>${t('vh_scan')}</button>
          ${scanVin ? `<button type="button" data-vh-use-vin="${escapeHtml(cleanVin(scanVin))}" class="text-xs font-semibold text-amber-200 hover:underline">${t('vh_use_scan_vin')}</button>` : ''}
        </div>
        <p id="vhVinMsg" class="text-xs text-gray-500">${t('vh_vin_where')}</p>
      </div>
      ${field('label', 'vh_name', 'required maxlength="40" placeholder="' + t('new_vehicle_placeholder') + '"')}
      <div class="grid grid-cols-2 gap-3">
        ${field('year', 'vh_year', 'inputmode="numeric" maxlength="4"')}
        ${field('make', 'vh_make', 'maxlength="30"')}
        ${field('model', 'vh_model', 'maxlength="40"')}
        ${field('trim', 'vh_trim', 'maxlength="40"')}
      </div>
      ${field('engine', 'vh_engine', 'maxlength="40" placeholder="e.g. 3.5L V6"')}
      <p id="vhMsg" class="hidden text-sm"></p>
      <div class="flex gap-2">
        <button type="button" data-vh-cancel class="flex-1 border border-white/15 text-gray-300 rounded-xl p-2.5 hover:border-white/30">${t('action_cancel')}</button>
        <button type="button" data-vh-save class="flex-[2] bg-logoClr text-gray-900 font-semibold rounded-xl p-2.5 hover:brightness-110 disabled:opacity-50">${t('vh_save')}</button>
      </div>
      ${isNew ? '' : `<div class="border-t border-white/5 pt-3 flex flex-col gap-1">
        <button type="button" data-vh-delete class="self-start text-xs font-semibold ${vmPendingDelete ? 'text-red-300' : 'text-gray-500 hover:text-red-300'}">
          <i class="fa-solid fa-trash-can mr-1"></i>${vmPendingDelete ? t('vh_delete_confirm') : t('vh_delete')}</button>
        ${vmPendingDelete && used ? `<p class="text-amber-200 text-xs">${t('vh_delete_used').replace('{n}', used)}</p>` : ''}
      </div>`}`;
}

function countVehicleRecords(code) {
    const n = list => (typeof list !== 'undefined' && Array.isArray(list) ? list.filter(r => r.Vehicle === code).length : 0);
    return n(allMaintenanceRecords) + n(allPartsRecords) + (typeof allScans !== 'undefined' ? n(allScans) : 0);
}

function readDraft() {
    document.querySelectorAll('#vehicleModalBody [data-vh-field]').forEach(el => { vmView.draft[el.dataset.vhField] = el.value.trim(); });
    vmView.draft.vin = cleanVin(vmView.draft.vin);
}

function vhMsg(id, text, cls) { const el = document.getElementById(id); if (el) { el.innerHTML = text; el.className = 'text-xs ' + cls; } }

async function lookupVin() {
    readDraft();
    const vin = vmView.draft.vin;
    const input = document.getElementById('vhVin');
    if (input) input.value = vin;
    if (!vinFormatOk(vin)) return vhMsg('vhVinMsg', t('vh_vin_bad'), 'text-red-300');
    vhMsg('vhVinMsg', `<i class="fa-solid fa-spinner fa-spin mr-1"></i>${t('vh_looking')}`, 'text-gray-400');
    try {
        const d = await decodeVin(vin);
        if (!d) return vhMsg('vhVinMsg', t('vh_not_found'), 'text-amber-200');
        const draft = vmView.draft;
        Object.assign(draft, d);
        if (!draft.label) draft.label = `${d.make} ${d.model} ${d.year}`.trim();
        renderVehicleManagerList();
        vhMsg('vhVinMsg', `<i class="fa-solid fa-circle-check mr-1"></i>${escapeHtml(vehicleSpecLine(draft))}` +
            (vinCheckDigitOk(vin) ? '' : ` · ${t('vh_check_digit')}`), vinCheckDigitOk(vin) ? 'text-logoClr' : 'text-amber-200');
    } catch (e) {
        console.error('VIN lookup error:', e);
        vhMsg('vhVinMsg', t('vh_lookup_error'), 'text-red-300');
    }
}

async function saveVehicle() {
    readDraft();
    const d = vmView.draft;
    const msg = text => { const el = document.getElementById('vhMsg'); el.textContent = text; el.className = 'text-sm text-red-300'; };
    if (!d.label) return msg(t('vh_name_required'));
    if (d.vin && !vinFormatOk(d.vin)) return msg(t('vh_vin_bad'));
    const vehicles = getVehicles();
    const isNew = vmView.index === undefined;
    if (vehicles.some((v, i) => i !== vmView.index && v.label.toLowerCase() === d.label.toLowerCase())) return msg(t('vh_name_taken'));
    if (isNew) {
        // Code = name (same as before), made unique; it stays fixed even if the name changes later.
        let code = d.label, n = 2;
        while (vehicles.some(v => v.value === code)) code = `${d.label} ${n++}`;
        d.value = code;
    }
    const btn = document.querySelector('[data-vh-save]');
    btn.disabled = true; btn.textContent = t('saving');
    try {
        if (!vehicleSync.tabMissing && vehicleSync.loaded) {
            if (isNew) {
                d.id = String(vehicles.reduce((m, v) => Math.max(m, parseInt(v.id, 10) || 0), 0) + 1);
                const res = await apiFetch(VEHICLES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [toRow(d)] }) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
            } else if (d.id) {
                const { ID, Code, ...fields } = toRow(d);
                const res = await apiFetch(sheetRowUrl(d.id, 'vehicles'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: fields }) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
            }
        }
        if (isNew) vehicles.push({ ...d }); else vehicles[vmView.index] = { ...d };
        saveVehicles(vehicles);
        vmView = { mode: 'list' };
        refreshVehicleViews();
    } catch (e) {
        console.error('Vehicle save error:', e);
        btn.disabled = false; btn.textContent = t('vh_save');
        msg(t('mi_error'));
    }
}

async function deleteVehicle() {
    if (!vmPendingDelete) { vmPendingDelete = true; readDraft(); renderVehicleManagerList(); return; }
    const vehicles = getVehicles();
    const v = vehicles[vmView.index];
    try {
        if (v.id && !vehicleSync.tabMissing && vehicleSync.loaded) {
            const res = await apiFetch(sheetRowUrl(v.id, 'vehicles'), { method: 'DELETE' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
        }
        vehicles.splice(vmView.index, 1);
        saveVehicles(vehicles);
        vmPendingDelete = false;
        vmView = { mode: 'list' };
        refreshVehicleViews();
    } catch (e) {
        console.error('Vehicle delete error:', e);
        const el = document.getElementById('vhMsg'); el.textContent = t('mi_error'); el.className = 'text-sm text-red-300';
    }
}

// ---- Barcode scanner ----
let scanStop = null;

async function startVinScan() {
    readDraft();
    const ov = document.createElement('div');
    ov.id = 'vinScanner';
    ov.className = 'fixed inset-0 z-[60] bg-black flex flex-col';
    ov.innerHTML = `
      <div class="relative flex-1 overflow-hidden">
        <video id="vinVideo" playsinline muted class="absolute inset-0 w-full h-full object-cover"></video>
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div class="w-[88%] max-w-xl h-28 rounded-xl border-2 border-logoClr shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"></div>
        </div>
        <p id="vinScanMsg" class="absolute top-4 inset-x-4 text-center text-txtWht text-sm bg-black/50 rounded-lg p-2">${t('vh_scan_help')}</p>
      </div>
      <div class="p-4 flex gap-2 bg-gray-950">
        <label class="flex-1 text-center border border-white/15 text-gray-200 rounded-xl p-3 cursor-pointer"><i class="fa-solid fa-image mr-1.5"></i>${t('vh_scan_photo')}
          <input id="vinPhoto" type="file" accept="image/*" capture="environment" class="hidden"></label>
        <button type="button" id="vinScanCancel" class="flex-1 bg-gray-800 text-txtWht rounded-xl p-3">${t('action_cancel')}</button>
      </div>`;
    document.body.appendChild(ov);
    const msg = text => { const el = document.getElementById('vinScanMsg'); if (el) el.textContent = text; };
    const done = vin => { stopVinScan(); if (vin) { vmView.draft.vin = vin; renderVehicleManagerList(); lookupVin(); } };
    ov.querySelector('#vinScanCancel').addEventListener('click', () => done(null));
    ov.querySelector('#vinPhoto').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        msg(t('vh_scan_reading'));
        const vin = await decodeVinFromImage(file).catch(() => null);
        if (vin) done(vin); else msg(t('vh_scan_none'));
    });
    const accept = text => { const v = cleanVin(text); return vinFormatOk(v) ? v : null; };

    try {
        const native = 'BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('code_39');
        const video = document.getElementById('vinVideo');
        if (native) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } });
            video.srcObject = stream; await video.play();
            const det = new BarcodeDetector({ formats: ['code_39', 'code_128', 'data_matrix', 'qr_code'] });
            let live = true;
            scanStop = () => { live = false; stream.getTracks().forEach(tr => tr.stop()); };
            (async function loop() {
                while (live) {
                    try { for (const c of await det.detect(video)) { const v = accept(c.rawValue); if (v) return done(v); } } catch { }
                    await new Promise(r => setTimeout(r, 150));
                }
            })();
        } else {
            msg(t('vh_scan_loading'));
            await loadScript(ZXING_SRC);
            const Z = window.ZXing;
            const hints = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.QR_CODE]], [Z.DecodeHintType.TRY_HARDER, true]]);
            const reader = new Z.BrowserMultiFormatReader(hints, 200);
            scanStop = () => reader.reset();
            msg(t('vh_scan_help'));
            await reader.decodeFromConstraints({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } }, video, result => {
                const v = result && accept(result.getText());
                if (v) done(v);
            });
        }
    } catch (e) {
        console.error('Camera error:', e);
        msg(t('vh_camera_error'));
    }
}

function stopVinScan() {
    try { scanStop && scanStop(); } catch { }
    scanStop = null;
    document.getElementById('vinScanner')?.remove();
}

// A photo of the barcode (or of the VIN plate text, read with OCR as a last resort).
async function decodeVinFromImage(file) {
    const accept = text => { const v = cleanVin(text); return vinFormatOk(v) ? v : null; };
    if ('BarcodeDetector' in window) {
        try {
            const det = new BarcodeDetector({ formats: ['code_39', 'code_128', 'data_matrix', 'qr_code'] });
            for (const c of await det.detect(await createImageBitmap(file))) { const v = accept(c.rawValue); if (v) return v; }
        } catch { }
    }
    try {
        await loadScript(ZXING_SRC);
        const Z = window.ZXing;
        const hints = new Map([[Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.DATA_MATRIX, Z.BarcodeFormat.QR_CODE]], [Z.DecodeHintType.TRY_HARDER, true]]);
        const url = URL.createObjectURL(file);
        try { const v = accept((await new Z.BrowserMultiFormatReader(hints).decodeFromImageUrl(url)).getText()); if (v) return v; }
        finally { URL.revokeObjectURL(url); }
    } catch { }
    // OCR: look for a 17-character VIN in the text (letters I, O, Q never appear in VINs).
    await loadScript(TESSERACT_SRC);
    const worker = await window.Tesseract.createWorker('eng');
    try {
        const { data } = await worker.recognize(file);
        const words = data.text.toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/);
        const joined = data.text.toUpperCase().replace(/[^A-Z0-9]/g, '');
        for (const w of [...words, joined]) {
            for (const m of w.matchAll(/(?=([A-HJ-NPR-Z0-9]{17}))/g)) if (vinCheckDigitOk(m[1])) return m[1];
        }
    } finally { worker.terminate(); }
    return null;
}

// ---- Events ----
document.querySelectorAll('.open-vehicle-modal').forEach(btn => btn.addEventListener('click', () => {
    vmView = { mode: 'list' }; vmPendingDelete = false;
    vehicleModal.classList.remove('hidden');
    renderVehicleManagerList();
}));
const closeVehicleModal = () => { vehicleModal.classList.add('hidden'); vmView = { mode: 'list' }; };
document.getElementById('closeVehicleModal').addEventListener('click', closeVehicleModal);
vehicleModal.addEventListener('click', e => {
    if (e.target === vehicleModal) return closeVehicleModal();
    const edit = e.target.closest('[data-vh-edit]');
    if (edit) { const i = +edit.dataset.vhEdit; vmPendingDelete = false; vmView = { mode: 'edit', index: i, draft: { ...getVehicles()[i] } }; return renderVehicleManagerList(); }
    if (e.target.closest('[data-vh-new]')) { vmView = { mode: 'edit', draft: { label: '', value: '' } }; renderVehicleManagerList(); return document.getElementById('vhVin')?.focus(); }
    if (e.target.closest('[data-vh-cancel]')) { vmView = { mode: 'list' }; vmPendingDelete = false; return renderVehicleManagerList(); }
    if (e.target.closest('[data-vh-lookup]')) return lookupVin();
    if (e.target.closest('[data-vh-scan]')) return startVinScan();
    if (e.target.closest('[data-vh-save]')) return saveVehicle();
    if (e.target.closest('[data-vh-delete]')) return deleteVehicle();
    const use = e.target.closest('[data-vh-use-vin]');
    if (use) { readDraft(); vmView.draft.vin = use.dataset.vhUseVin; renderVehicleManagerList(); lookupVin(); }
});
vehicleModal.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'vhVin') { e.preventDefault(); lookupVin(); }
});
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (document.getElementById('vinScanner')) return stopVinScan();
    if (!vehicleModal.classList.contains('hidden')) closeVehicleModal();
});
