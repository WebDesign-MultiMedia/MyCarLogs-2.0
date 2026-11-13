// ---- VIN Scanner page (its own nav tab) ----
// Scan a VIN barcode, take a photo of it, or type it in, and see the vehicle and its full
// NHTSA specs. Works for any vehicle, not only yours: if the VIN already belongs to one of
// your vehicles it says so, otherwise it offers to save it as a new vehicle.
// Uses the scanner and VIN helpers from vehicles.js and the spec sheet from vehicle-specs.js.

let vinPage = { vin: '', state: 'idle', decoded: null, specs: null }; // state: idle | loading | done | notfound | error | bad

function renderVinPage() {
    const box = document.getElementById('vinPageContent');
    if (!box) return;
    const p = vinPage;
    const card = 'rounded-2xl border border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/95 shadow-2xl shadow-black/50 p-5 flex flex-col gap-4';
    box.innerHTML = `
      <div class="${card}">
        <button type="button" data-vp-scan class="w-full bg-logoClr text-gray-900 font-semibold rounded-xl p-3.5 text-base hover:brightness-110">
          <i class="fa-solid fa-barcode mr-2"></i>${t('vp_scan_btn')}</button>
        <label class="w-full text-center border border-white/15 text-gray-200 rounded-xl p-3 cursor-pointer hover:border-logoClr/50">
          <i class="fa-solid fa-camera mr-1.5"></i>${t('vh_scan_photo')}
          <input id="vpPhoto" type="file" accept="image/*" capture="environment" class="hidden"></label>
        <div class="flex flex-col gap-1.5">
          <span class="text-gray-400 text-[11px] font-semibold uppercase tracking-wide">${t('vp_or_type')}</span>
          <div class="flex gap-2">
            <input id="vpVin" value="${escapeHtml(p.vin)}" maxlength="20" autocapitalize="characters" autocomplete="off" spellcheck="false"
              placeholder="${t('vh_vin_ph')}" class="${vmInput} font-mono uppercase min-w-0">
            <button type="button" data-vp-lookup class="shrink-0 px-4 rounded-lg bg-gray-800 border border-white/15 text-txtWht font-semibold hover:border-logoClr/50">${t('vh_lookup')}</button>
          </div>
          <p class="text-xs text-gray-500">${t('vh_vin_where')}</p>
        </div>
      </div>
      <div id="vpResult" class="mt-4">${vinResultHtml()}</div>`;
}

function vinResultHtml() {
    const p = vinPage;
    const note = (text, cls) => `<p class="rounded-xl border border-white/10 bg-gray-950/40 p-4 text-sm ${cls}">${text}</p>`;
    if (p.state === 'loading') return note(`<i class="fa-solid fa-spinner fa-spin mr-1.5"></i>${p.msg || t('vh_looking')}`, 'text-gray-300');
    if (p.state === 'bad') return note(p.msg || t('vh_vin_bad'), 'text-red-300');
    if (p.state === 'notfound') return note(t('vh_not_found'), 'text-amber-200');
    if (p.state === 'error') return note(t('vh_lookup_error'), 'text-red-300');
    if (p.state !== 'done') return '';
    const d = p.decoded;
    const mine = getVehicles().find(v => cleanVin(v.vin) === p.vin);
    const action = mine
        ? `<div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-logoClr/30 bg-logoClr/10 px-3 py-2.5 text-sm">
             <span class="text-gray-300">${t('vp_saved_as')} <b class="text-txtWht">${escapeHtml(mine.label)}</b></span>
             <button type="button" data-vp-open="${escapeHtml(mine.value)}" class="text-logoClr font-semibold hover:underline">${t('vp_open_vehicle')}</button></div>`
        : `<button type="button" data-vp-save class="w-full bg-logoClr text-gray-900 font-semibold rounded-xl p-3 hover:brightness-110">
             <i class="fa-solid fa-plus mr-1.5"></i>${t('vp_save_vehicle')}</button>`;
    return `<div class="rounded-2xl border border-white/10 bg-gray-900/80 p-5 flex flex-col gap-4">
        <div class="flex items-start gap-3">
          <span class="shrink-0 w-11 h-11 rounded-full bg-logoClr/10 text-logoClr flex items-center justify-center"><i class="fa-solid fa-car-side"></i></span>
          <div class="min-w-0">
            <h3 class="text-txtWht text-lg font-semibold leading-snug">${escapeHtml(vehicleSpecLine(d))}</h3>
            <p class="text-gray-400 text-xs font-mono mt-0.5 break-all">VIN ${escapeHtml(p.vin)}</p>
          </div>
        </div>
        ${vinCheckDigitOk(p.vin) ? '' : `<p class="text-amber-200 text-xs">${t('vp_check_digit')}</p>`}
        ${action}
        <div class="flex flex-col gap-4">${specsHtml(p.specs)}</div>
      </div>`;
}

function setVinResult(patch) {
    Object.assign(vinPage, patch);
    const el = document.getElementById('vpResult');
    if (el) el.innerHTML = vinResultHtml(); else renderVinPage();
}

async function vinPageLookup(raw) {
    const vin = extractVin(raw) || cleanVin(raw);
    vinPage.vin = vin;
    const input = document.getElementById('vpVin');
    if (input) input.value = vin;
    if (!vinFormatOk(vin)) return setVinResult({ state: 'bad', msg: '' });
    setVinResult({ state: 'loading', msg: '' });
    try {
        const decoded = await decodeVin(vin); // also caches the full spec sheet
        if (vinPage.vin !== vin) return; // a newer lookup started
        if (!decoded) return setVinResult({ state: 'notfound' });
        const specs = await fetchVinSpecs(vin);
        if (vinPage.vin !== vin) return;
        setVinResult({ state: 'done', decoded, specs });
    } catch (e) {
        console.error('VIN page lookup error:', e);
        if (vinPage.vin === vin) setVinResult({ state: 'error' });
    }
}

function openVehicleEditor(draft, index) {
    vmPendingDelete = false;
    vmView = { mode: 'edit', draft, ...(index >= 0 ? { index } : {}) };
    vehicleModal.classList.remove('hidden');
    renderVehicleManagerList();
}

// ---- Events ----
const vinPageContent = document.getElementById('vinPageContent');
vinPageContent.addEventListener('click', e => {
    if (e.target.closest('[data-vp-scan]')) return startVinScan(vin => vinPageLookup(vin));
    if (e.target.closest('[data-vp-lookup]')) return vinPageLookup(document.getElementById('vpVin').value);
    if (e.target.closest('[data-vp-save]')) {
        const d = vinPage.decoded || {};
        return openVehicleEditor({ label: [d.year, d.make, d.model].filter(Boolean).join(' '), value: '', vin: vinPage.vin,
            year: d.year || '', make: d.make || '', model: d.model || '', trim: d.trim || '', engine: d.engine || '' });
    }
    const open = e.target.closest('[data-vp-open]');
    if (open) {
        const i = getVehicles().findIndex(v => v.value === open.dataset.vpOpen);
        if (i >= 0) openVehicleEditor({ ...getVehicles()[i] }, i);
    }
});
vinPageContent.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.id === 'vpVin') { e.preventDefault(); vinPageLookup(e.target.value); }
});
vinPageContent.addEventListener('change', async e => {
    if (e.target.id !== 'vpPhoto') return;
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setVinResult({ state: 'loading', msg: t('vh_scan_reading') });
    const vin = await decodeVinFromImage(file).catch(() => null);
    if (vin) vinPageLookup(vin); else setVinResult({ state: 'bad', msg: t('vh_scan_none') });
});
document.getElementById('navVin').addEventListener('click', () => {
    showSection('vin');
    renderVinPage();
});
