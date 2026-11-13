// ---- Service reminders + mileage updates (shown on the Timeline page) ----
// Reminders: each routine job (oil, filters, fluids…) has an interval in miles and/or months.
//   The last time it was done comes from the logged services (JOBS in timeline.js), so nothing
//   extra is needed to start — defaults apply until intervals are changed.
// Mileage updates: quick odometer readings with no service attached, so "current mileage"
//   and "due in X mi" stay accurate between services.
// Both are saved to their own tabs in the Google Sheet:
//   mileage   → ID | Date | Vehicle | Mileage | Note
//   reminders → ID | Vehicle | Job | Miles | Months   (only intervals that were changed)

const MILEAGE_URL = '/api/sheet?sheet=mileage';
const REMINDERS_URL = '/api/sheet?sheet=reminders';

// Typical intervals ("whichever comes first"). 0 = not tracked by that measure.
const REMINDER_DEFAULTS = {
    oil: { miles: 5000, months: 6 },
    air_filter: { miles: 15000, months: 12 },
    cabin_filter: { miles: 15000, months: 12 },
    trans_fluid: { miles: 30000, months: 36 },
    brake_fluid: { miles: 0, months: 36 },
    coolant: { miles: 60000, months: 60 },
    spark_plugs: { miles: 100000, months: 0 },
    tires: { miles: 50000, months: 72 },
    inspection: { miles: 0, months: 12 }
};
// What "Log it" pre-fills in the service form (worded so the timeline recognizes the job).
const REMINDER_PREFILL = {
    oil: { parts: 'Engine Oil & Oil Filter', loc: 'Engine' },
    air_filter: { parts: 'Engine Air Filter', loc: 'Engine' },
    cabin_filter: { parts: 'Cabin Air Filter', loc: 'Interior' },
    trans_fluid: { parts: 'Transmission Fluid', loc: 'Transmission' },
    brake_fluid: { parts: 'Brake Fluid', loc: 'All Corners' },
    coolant: { parts: 'Coolant', loc: 'Engine' },
    spark_plugs: { parts: 'Spark Plugs', loc: 'Engine' },
    tires: { parts: 'Tires', loc: 'All Corners' },
    inspection: { parts: 'State Inspection', loc: 'Entire Vehicle', type: 'Inspection' }
};
const REMINDER_JOBS = Object.keys(REMINDER_DEFAULTS);
const DAY_MS = 86400000;

let mileageReadings = [];
let reminderRows = [];
const extras = { loaded: false, loading: null, mileageMissing: false, remindersMissing: false };
let remindersExpanded = false;

// Loads both tabs once. A missing tab just turns that feature's saving off (with a setup hint).
function loadTimelineExtras(force) {
    if (extras.loaded && !force) return Promise.resolve();
    if (extras.loading) return extras.loading;
    const load = async (url) => {
        try {
            const res = await apiFetch(url);
            const data = res.ok ? await res.json() : null;
            return Array.isArray(data) ? data : null;
        } catch (e) { if (e.message === 'unauthorized') throw e; return null; }
    };
    extras.loading = Promise.all([load(MILEAGE_URL), load(REMINDERS_URL)]).then(([m, r]) => {
        extras.mileageMissing = !m; extras.remindersMissing = !r;
        mileageReadings = m || []; reminderRows = r || [];
        extras.loaded = true;
    }).finally(() => { extras.loading = null; });
    return extras.loading;
}

const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const capFirst = s => s.charAt(0).toUpperCase() + s.slice(1);
function addMonths(d, n) { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; }

// Every odometer reading we know for a vehicle: services, mileage updates and scans.
function mileagePoints(vehicle) {
    const pts = [];
    allMaintenanceRecords.forEach(r => { if (r.Vehicle === vehicle) pts.push({ miles: parseMiles(r.Mileage), date: parseRecordDate(r.Date), src: 'service' }); });
    mileageReadings.forEach(r => { if (r.Vehicle === vehicle) pts.push({ miles: parseMiles(r.Mileage), date: parseRecordDate(r.Date), src: 'reading' }); });
    if (typeof allScans !== 'undefined') allScans.forEach(s => { if (s.Vehicle === vehicle) pts.push({ miles: parseMiles(s.Mileage), date: parseRecordDate(s.Date), src: 'scan' }); });
    return pts.filter(p => p.miles !== null && p.miles > 0);
}

// Highest reading = current mileage (with the date it was taken).
function currentMileageInfo(vehicle) {
    let best = null;
    mileagePoints(vehicle).forEach(p => {
        if (!best || p.miles > best.miles || (p.miles === best.miles && p.date && (!best.date || p.date > best.date))) best = p;
    });
    return best;
}

// Average miles per day over the last year of readings (null if there isn't enough history).
function milesPerDay(vehicle) {
    const pts = mileagePoints(vehicle).filter(p => p.date).sort((a, b) => a.date - b.date);
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1];
    const recent = pts.filter(p => last.date - p.date <= 366 * DAY_MS);
    const first = (recent.length >= 2 ? recent : pts)[0];
    const days = (last.date - first.date) / DAY_MS;
    const rate = (last.miles - first.miles) / days;
    return days >= 30 && rate > 0 && rate < 300 ? rate : null; // ignore typos that imply impossible driving
}

function reminderInterval(vehicle, job) {
    const row = reminderRows.find(r => r.Vehicle === vehicle && r.Job === job);
    if (!row) return { ...REMINDER_DEFAULTS[job], row: null };
    return { miles: parseMiles(row.Miles) || 0, months: parseMiles(row.Months) || 0, row };
}

// Status of every reminder for one vehicle, most urgent first.
function reminderStatus(vehicle) {
    const { list } = buildTimeline(vehicle);
    const cur = currentMileageInfo(vehicle);
    const current = cur ? cur.miles : null;
    const rate = milesPerDay(vehicle);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const rank = { overdue: 0, soon: 1, ok: 2, unknown: 3 };

    return REMINDER_JOBS.map(id => {
        const job = JOBS.find(j => j.id === id);
        const iv = reminderInterval(vehicle, id);
        if (!iv.miles && !iv.months) return null; // turned off
        const last = list.find(s => (s.jobEvents || []).some(ev => ev.job.id === id));
        const item = { id, job, iv, last, status: 'unknown' };
        if (!last) return item;

        item.dueMiles = iv.miles ? last.miles + iv.miles : null;
        item.dueDate = iv.months && last.date ? addMonths(last.date, iv.months) : null;
        item.milesLeft = item.dueMiles !== null && current !== null ? item.dueMiles - current : null;
        item.daysLeft = item.dueDate ? Math.round((item.dueDate - now) / DAY_MS) : null;
        // Days until the mileage is reached at the usual pace — used for "≈ 3 weeks".
        item.etaDays = item.milesLeft !== null && item.milesLeft > 0 && rate ? Math.round(item.milesLeft / rate) : null;

        const soonMiles = Math.max(500, iv.miles * 0.1);
        if ((item.milesLeft !== null && item.milesLeft <= 0) || (item.daysLeft !== null && item.daysLeft <= 0)) item.status = 'overdue';
        else if ((item.milesLeft !== null && item.milesLeft <= soonMiles) || (item.daysLeft !== null && item.daysLeft <= 30) ||
            (item.etaDays !== null && item.etaDays <= 30)) item.status = 'soon';
        else item.status = 'ok';
        // Sort key: how close it is, as a fraction of the interval (0 = due now).
        const fm = item.milesLeft !== null && iv.miles ? item.milesLeft / iv.miles : Infinity;
        const fd = item.daysLeft !== null && iv.months ? item.daysLeft / (iv.months * 30.4) : Infinity;
        item.urgency = Math.min(fm, fd);
        return item;
    }).filter(Boolean).sort((a, b) => rank[a.status] - rank[b.status] || (a.urgency ?? 9) - (b.urgency ?? 9));
}

function fmtDuration(days) {
    if (days < 14) return t('rm_days').replace('{n}', Math.max(1, days));
    if (days < 60) return t('rm_weeks').replace('{n}', Math.round(days / 7));
    if (days < 730) return t('rm_months').replace('{n}', Math.round(days / 30.4));
    return t('rm_years').replace('{n}', Math.round(days / 365));
}

const RM_STYLE = {
    overdue: { pill: 'bg-red-500/15 text-red-300 border-red-400/40', icon: 'text-red-300 bg-red-500/10', row: 'border-red-400/25 bg-red-500/5' },
    soon: { pill: 'bg-amber-400/15 text-amber-200 border-amber-300/40', icon: 'text-amber-300 bg-amber-400/10', row: 'border-amber-300/20 bg-amber-400/5' },
    ok: { pill: 'bg-logoClr/10 text-logoClr border-logoClr/30', icon: 'text-logoClr bg-logoClr/10', row: 'border-white/5 bg-gray-950/40' },
    unknown: { pill: 'bg-white/5 text-gray-400 border-white/10', icon: 'text-gray-500 bg-white/5', row: 'border-white/5 bg-gray-950/40' }
};

function reminderRowHtml(it) {
    const st = RM_STYLE[it.status];
    let main, sub = '';
    if (it.status === 'unknown') {
        main = `<span class="text-gray-400">${t('rm_never')}</span>`;
    } else {
        const parts = [];
        if (it.status === 'overdue') {
            if (it.milesLeft !== null && it.milesLeft <= 0) parts.push(t('rm_over_miles').replace('{mi}', fmtMiles(-it.milesLeft)));
            if (it.daysLeft !== null && it.daysLeft <= 0) parts.push(t('rm_over_date').replace('{date}', fmtDate(it.dueDate)));
        } else {
            if (it.milesLeft !== null) parts.push(t('rm_due_miles').replace('{mi}', fmtMiles(it.milesLeft)));
            else if (it.dueMiles !== null) parts.push(t('rm_next_at').replace('{mi}', fmtMiles(it.dueMiles)));
            if (it.dueDate) parts.push(t('rm_due_date').replace('{date}', fmtDate(it.dueDate)));
        }
        main = capFirst(parts.join(` <span class="text-gray-600">${t('rm_or')}</span> `));
        if (it.status !== 'overdue' && it.etaDays !== null && (it.daysLeft === null || it.etaDays < it.daysLeft)) {
            main += ` <span class="text-gray-500">· ${t('rm_eta').replace('{when}', fmtDuration(it.etaDays))}</span>`;
        }
        sub = (it.last.date ? t('rm_last') : t('rm_last_nodate')).replace('{mi}', fmtMiles(it.last.miles)).replace('{date}', fmtDate(it.last.date));
    }
    const logBtn = it.status !== 'ok'
        ? `<button type="button" data-rm-log="${it.id}" class="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border border-logoClr/40 text-logoClr hover:bg-logoClr/10">${t('rm_log')}</button>` : '';
    return `<li class="flex items-center gap-3 rounded-xl border ${st.row} px-3 py-2.5">
      <span class="shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${st.icon}"><i class="fa-solid ${it.job.icon} text-sm"></i></span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-txtWht text-sm font-semibold">${escapeHtml(capFirst(t('job_' + it.id)))}</span>
          <span class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full border ${st.pill}">${t('rm_' + it.status)}</span>
        </div>
        <p class="text-gray-300 text-xs mt-0.5 [&_b]:text-txtWht">${main}</p>
        ${sub ? `<p class="text-gray-500 text-[11px]">${sub}</p>` : ''}
      </div>
      ${logBtn}
    </li>`;
}

function remindersCardHtml(vehicle) {
    const items = reminderStatus(vehicle);
    const urgent = items.filter(i => i.status === 'overdue' || i.status === 'soon');
    const rest = items.filter(i => !urgent.includes(i));
    const shown = remindersExpanded ? items : urgent;
    const okCount = items.filter(i => i.status === 'ok').length;
    const counts = urgent.length
        ? `<span class="text-xs font-semibold px-2 py-0.5 rounded-full ${items.some(i => i.status === 'overdue') ? 'bg-red-500/15 text-red-300' : 'bg-amber-400/15 text-amber-200'}">${urgent.length}</span>` : '';
    const allGood = !urgent.length && !remindersExpanded
        ? `<p class="text-gray-400 text-sm flex items-center gap-2"><i class="fa-solid fa-circle-check text-logoClr"></i>${t('rm_all_good').replace('{n}', okCount)}</p>` : '';
    const toggle = rest.length
        ? `<button type="button" id="rmToggle" class="self-start text-xs font-semibold text-gray-400 hover:text-txtWht">${remindersExpanded ? t('rm_show_less') : t('rm_show_all').replace('{n}', items.length)}
            <i class="fa-solid fa-chevron-${remindersExpanded ? 'up' : 'down'} text-[10px] ml-1"></i></button>` : '';
    return `
    <div class="rounded-2xl border border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/95 shadow-2xl shadow-black/40 p-4 sm:p-5 mb-6 flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-txtWht font-semibold flex items-center gap-2"><i class="fa-solid fa-bell text-amber-300"></i>${t('rm_title')} ${counts}</h3>
        <button type="button" id="rmEdit" class="text-xs font-semibold text-gray-400 hover:text-txtWht flex items-center gap-1.5"><i class="fa-solid fa-sliders"></i>${t('rm_edit')}</button>
      </div>
      ${allGood}
      ${shown.length ? `<ul class="flex flex-col gap-2">${shown.map(reminderRowHtml).join('')}</ul>` : ''}
      ${toggle}
    </div>`;
}

// Small line under "Current Mileage": where the number came from and the usual pace.
function mileageMetaHtml(vehicle) {
    const cur = currentMileageInfo(vehicle);
    const rate = milesPerDay(vehicle);
    const bits = [];
    if (cur && cur.date) bits.push(t('rm_updated').replace('{date}', fmtDate(cur.date)));
    if (rate) bits.push(t('rm_rate').replace('{mi}', fmtMiles(Math.round(rate * 30.4 / 10) * 10)));
    return bits.length ? `<p class="text-gray-500 text-xs mt-1">${bits.join(' · ')}</p>` : '';
}

// ---- Modal (shared by "Update mileage" and "Intervals") ----
function openTlModal(html) {
    let el = document.getElementById('tlModal');
    if (!el) {
        el = document.createElement('div');
        el.id = 'tlModal';
        el.className = 'fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4';
        el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-tl-close]')) closeTlModal(); });
        document.body.appendChild(el);
    }
    el.innerHTML = `<div class="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-gray-900 shadow-2xl shadow-black/50 p-5 flex flex-col gap-4">${html}</div>`;
    el.classList.remove('hidden');
    document.documentElement.style.overflow = 'hidden';
}
function closeTlModal() {
    document.getElementById('tlModal')?.classList.add('hidden');
    document.documentElement.style.overflow = '';
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !document.getElementById('tlModal')?.classList.contains('hidden')) closeTlModal(); });

const modalHeader = (title, subtitle) => `
  <div class="flex items-start justify-between gap-3">
    <div><h2 class="text-txtWht text-lg font-semibold">${title}</h2>${subtitle ? `<p class="text-gray-400 text-xs mt-0.5">${subtitle}</p>` : ''}</div>
    <button type="button" data-tl-close class="text-gray-400 hover:text-txtWht text-2xl leading-none" aria-label="Close">&times;</button>
  </div>`;
const rmInputCls = 'w-full text-base rounded-lg border border-white/10 bg-gray-950/60 text-txtWht px-3 py-2.5 focus:outline-none focus:border-logoClr/60 focus:ring-2 focus:ring-logoClr/20';
const rmLabelCls = 'text-gray-400 text-[11px] font-semibold uppercase tracking-wide';
const setupHint = key => `<p class="text-amber-100 text-xs rounded-lg border border-amber-300/30 bg-amber-400/10 p-3 [&_code]:text-amber-200 [&_b]:text-txtWht">${t(key)}</p>`;

// ---- Update mileage ----
let mileageSaveAnyway = false;
let pendingDeleteReading = null;

function openMileageModal() {
    const vehicle = timelineVehicle;
    const cur = currentMileageInfo(vehicle);
    mileageSaveAnyway = false; pendingDeleteReading = null;
    openTlModal(`
      ${modalHeader(t('mi_title'), `${escapeHtml(getVehicleLabel(vehicle))} · ${t('mi_subtitle')}`)}
      ${extras.mileageMissing ? setupHint('mi_missing_tab') : ''}
      <form id="mileageForm" class="flex flex-col gap-3">
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5"><span class="${rmLabelCls}">${t('mi_odometer')}</span>
            <input id="miMiles" type="number" inputmode="numeric" min="1" max="999999" required class="${rmInputCls}" placeholder="${cur ? cur.miles : ''}"></label>
          <label class="flex flex-col gap-1.5"><span class="${rmLabelCls}">${t('mi_date')}</span>
            <input id="miDate" type="date" required value="${todayIso()}" max="${todayIso()}" class="${rmInputCls}"></label>
        </div>
        <label class="flex flex-col gap-1.5"><span class="${rmLabelCls}">${t('mi_note')}</span>
          <input id="miNote" type="text" maxlength="120" class="${rmInputCls}" placeholder="${t('mi_note_ph')}"></label>
        <p id="miMsg" class="hidden text-sm"></p>
        <button type="submit" ${extras.mileageMissing ? 'disabled' : ''} class="bg-logoClr text-gray-900 font-semibold rounded-xl p-2.5 hover:brightness-110 disabled:opacity-50">${t('mi_save')}</button>
      </form>
      <div id="miRecent">${recentReadingsHtml(vehicle)}</div>`);
    setTimeout(() => document.getElementById('miMiles')?.focus(), 50);
}

function recentReadingsHtml(vehicle) {
    const list = mileageReadings.filter(r => r.Vehicle === vehicle)
        .sort((a, b) => (parseRecordDate(b.Date) || 0) - (parseRecordDate(a.Date) || 0) || (+b.ID || 0) - (+a.ID || 0)).slice(0, 5);
    if (!list.length) return extras.mileageMissing ? '' : `<p class="text-gray-500 text-xs">${t('mi_none')}</p>`;
    return `<p class="${rmLabelCls} mb-2">${t('mi_recent')}</p><ul class="flex flex-col gap-1.5">${list.map(r => `
      <li class="flex items-center gap-3 rounded-lg bg-gray-950/50 border border-white/5 px-3 py-2 text-sm">
        <span class="text-txtWht font-semibold">${fmtMiles(parseMiles(r.Mileage) || 0)} mi</span>
        <span class="text-gray-500 text-xs flex-1 truncate">${fmtDate(parseRecordDate(r.Date))}${r.Note ? ' · ' + escapeHtml(r.Note) : ''}</span>
        <button type="button" data-mi-delete="${escapeHtml(r.ID)}" class="text-xs ${pendingDeleteReading === r.ID ? 'text-red-300 font-semibold' : 'text-gray-500 hover:text-red-300'}">
          ${pendingDeleteReading === r.ID ? t('mi_confirm_delete') : '<i class="fa-solid fa-trash-can"></i>'}</button>
      </li>`).join('')}</ul>`;
}

async function saveMileage(form) {
    const msg = document.getElementById('miMsg');
    const btn = form.querySelector('button[type="submit"]');
    const show = (text, cls) => { msg.innerHTML = text; msg.className = 'text-sm ' + cls; };
    const miles = parseInt(document.getElementById('miMiles').value, 10);
    const date = document.getElementById('miDate').value;
    if (!(miles > 0 && miles < 1000000) || !date) return show(t('mi_bad'), 'text-red-300');
    const cur = currentMileageInfo(timelineVehicle);
    if (cur && miles < cur.miles && !mileageSaveAnyway) {
        mileageSaveAnyway = true;
        btn.textContent = t('mi_save_anyway');
        return show(t('mi_lower').replace('{mi}', fmtMiles(cur.miles)), 'text-amber-200');
    }
    btn.disabled = true; btn.textContent = t('saving');
    try {
        const row = { ID: await nextSequentialId(MILEAGE_URL), Date: date, Vehicle: timelineVehicle, Mileage: String(miles), Note: document.getElementById('miNote').value.trim() };
        const res = await apiFetch(MILEAGE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: [row] }) });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        mileageReadings.push(row);
        closeTlModal();
        renderTimeline();
    } catch (err) {
        console.error('Mileage save error:', err);
        btn.disabled = false; btn.textContent = t('mi_save');
        show(t('mi_error'), 'text-red-300');
    }
}

async function deleteReading(id) {
    if (pendingDeleteReading !== id) { pendingDeleteReading = id; document.getElementById('miRecent').innerHTML = recentReadingsHtml(timelineVehicle); return; }
    try {
        const res = await apiFetch(sheetRowUrl(id, 'mileage'), { method: 'DELETE' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        mileageReadings = mileageReadings.filter(r => r.ID !== id);
        pendingDeleteReading = null;
        document.getElementById('miRecent').innerHTML = recentReadingsHtml(timelineVehicle);
        renderTimeline();
    } catch (err) {
        console.error('Mileage delete error:', err);
        const m = document.getElementById('miMsg'); m.textContent = t('mi_error'); m.className = 'text-sm text-red-300';
    }
}

// ---- Reminder intervals ----
function openIntervalsModal() {
    const vehicle = timelineVehicle;
    const rows = REMINDER_JOBS.map(id => {
        const iv = reminderInterval(vehicle, id), def = REMINDER_DEFAULTS[id];
        const val = n => n ? n : '';
        return `<li class="grid grid-cols-[1fr_5.5rem_4.5rem] items-center gap-2" data-iv-job="${id}">
          <span class="min-w-0"><span class="text-txtWht text-sm block truncate">${escapeHtml(capFirst(t('job_' + id)))}</span>
            <span class="text-gray-500 text-[11px]">${t('iv_default').replace('{mi}', def.miles ? fmtMiles(def.miles) : '—').replace('{mo}', def.months || '—')}</span></span>
          <input type="number" inputmode="numeric" min="0" max="300000" step="500" data-iv="miles" value="${val(iv.miles)}" placeholder="—" class="${rmInputCls} !px-2 !py-1.5 text-sm">
          <input type="number" inputmode="numeric" min="0" max="240" data-iv="months" value="${val(iv.months)}" placeholder="—" class="${rmInputCls} !px-2 !py-1.5 text-sm">
        </li>`;
    }).join('');
    openTlModal(`
      ${modalHeader(t('iv_title'), `${escapeHtml(getVehicleLabel(vehicle))} · ${t('iv_subtitle')}`)}
      ${extras.remindersMissing ? setupHint('iv_missing_tab') : ''}
      <form id="intervalsForm" class="flex flex-col gap-3">
        <div class="grid grid-cols-[1fr_5.5rem_4.5rem] gap-2 ${rmLabelCls}"><span></span><span>${t('iv_miles')}</span><span>${t('iv_months')}</span></div>
        <ul class="flex flex-col gap-2.5">${rows}</ul>
        <p id="ivMsg" class="hidden text-sm"></p>
        <div class="flex gap-2">
          <button type="button" id="ivDefaults" class="flex-1 border border-white/15 text-gray-300 rounded-xl p-2.5 hover:border-white/30">${t('iv_reset')}</button>
          <button type="submit" ${extras.remindersMissing ? 'disabled' : ''} class="flex-[2] bg-logoClr text-gray-900 font-semibold rounded-xl p-2.5 hover:brightness-110 disabled:opacity-50">${t('iv_save')}</button>
        </div>
      </form>`);
}

async function saveIntervals(form) {
    const vehicle = timelineVehicle;
    const btn = form.querySelector('button[type="submit"]');
    const msg = document.getElementById('ivMsg');
    const changes = [];
    form.querySelectorAll('[data-iv-job]').forEach(li => {
        const id = li.dataset.ivJob;
        const miles = Math.max(0, parseInt(li.querySelector('[data-iv="miles"]').value, 10) || 0);
        const months = Math.max(0, parseInt(li.querySelector('[data-iv="months"]').value, 10) || 0);
        const iv = reminderInterval(vehicle, id);
        if (iv.miles !== miles || iv.months !== months) changes.push({ id, miles, months, row: iv.row });
    });
    if (!changes.length) { closeTlModal(); return; }
    btn.disabled = true; btn.textContent = t('saving');
    try {
        for (const c of changes.filter(c => c.row)) {
            const res = await apiFetch(sheetRowUrl(c.row.ID, 'reminders'), { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { Miles: String(c.miles), Months: String(c.months) } }) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            c.row.Miles = String(c.miles); c.row.Months = String(c.months);
        }
        const fresh = changes.filter(c => !c.row);
        if (fresh.length) {
            let next = await nextSequentialId(REMINDERS_URL);
            const rows = fresh.map(c => ({ ID: String(next++), Vehicle: vehicle, Job: c.id, Miles: String(c.miles), Months: String(c.months) }));
            const res = await apiFetch(REMINDERS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: rows }) });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            reminderRows.push(...rows);
        }
        closeTlModal();
        renderTimeline();
    } catch (err) {
        console.error('Intervals save error:', err);
        btn.disabled = false; btn.textContent = t('iv_save');
        msg.textContent = t('mi_error'); msg.className = 'text-sm text-red-300';
    }
}

// "Log it": open the service form already filled in for this job.
function logReminder(id) {
    const p = REMINDER_PREFILL[id] || {};
    const cur = currentMileageInfo(timelineVehicle);
    showSection('log');
    window.scrollTo(0, 0);
    const set = (elId, v) => { const el = document.getElementById(elId); if (el && v !== undefined) el.value = v; };
    const sel = document.getElementById('vehicle');
    if (sel && [...sel.options].some(o => o.value === timelineVehicle)) sel.value = timelineVehicle;
    set('date', todayIso());
    if (cur) set('mileage', cur.miles);
    set('partCount', p.parts);
    const loc = document.getElementById('VehicleSide');
    if (loc && [...loc.options].some(o => o.value === p.loc)) loc.value = p.loc;
    const radio = document.querySelector(`#typeGroup input[value="${p.type || 'Maintenance'}"]`);
    if (radio) radio.checked = true;
    document.getElementById('mileage')?.focus();
}

// ---- Events ----
document.getElementById('timelineContent').addEventListener('click', e => {
    if (e.target.closest('#tlMileageBtn')) return openMileageModal();
    if (e.target.closest('#rmEdit')) return openIntervalsModal();
    if (e.target.closest('#rmToggle')) { remindersExpanded = !remindersExpanded; renderTimeline(); return; }
    const log = e.target.closest('[data-rm-log]');
    if (log) logReminder(log.dataset.rmLog);
});

document.addEventListener('submit', e => {
    if (e.target.id === 'mileageForm') { e.preventDefault(); saveMileage(e.target); }
    if (e.target.id === 'intervalsForm') { e.preventDefault(); saveIntervals(e.target); }
});

document.addEventListener('click', e => {
    const del = e.target.closest('[data-mi-delete]');
    if (del) return deleteReading(del.dataset.miDelete);
    if (e.target.closest('#ivDefaults')) {
        document.querySelectorAll('#intervalsForm [data-iv-job]').forEach(li => {
            const def = REMINDER_DEFAULTS[li.dataset.ivJob];
            li.querySelector('[data-iv="miles"]').value = def.miles || '';
            li.querySelector('[data-iv="months"]').value = def.months || '';
        });
    }
});
document.addEventListener('input', e => {
    if (e.target.id === 'miMiles' && mileageSaveAnyway) { mileageSaveAnyway = false; const b = document.querySelector('#mileageForm button[type="submit"]'); if (b) b.textContent = t('mi_save'); }
});
