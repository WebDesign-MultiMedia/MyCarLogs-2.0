// ---- Mileage Timeline ----
// Per-vehicle history of past services, grouped by odometer reading (newest first).
// Uses maintenance records already loaded by ManRep.js (allMaintenanceRecords / fetchRecords).

const TIMELINE_PREVIEW_ITEMS = 4;
const TYPE_STYLES = {
    Maintenance: 'bg-logoClr/15 text-logoClr border-logoClr/30',
    Repair: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
    Inspection: 'bg-sky-400/15 text-sky-300 border-sky-400/30',
    Purchase: 'bg-violet-400/15 text-violet-300 border-violet-400/30'
};

let timelineVehicle = null;
const expandedTimelineCards = new Set();

// Filter state (kept when switching vehicles, so "brake" can be compared across cars).
let tlQuery = '';
let tlType = 'all';
let tlQuick = null;

// Quick searches. Data is stored in English, so these match English words regardless of UI language.
const TL_QUICK = [
    { id: 'oil', key: 'tl_quick_oil', icon: 'fa-oil-can', test: r => isOilChange(r) },
    { id: 'brakes', key: 'tl_quick_brakes', icon: 'fa-circle-stop', re: /brake|rotor|\babs\b/i },
    { id: 'tires', key: 'tl_quick_tires', icon: 'fa-circle-dot', re: /tire|tpms|wheel|alignment/i },
    { id: 'trans', key: 'tl_quick_trans', icon: 'fa-gears', re: /transmission|shift solenoid|control solenoid/i },
    { id: 'battery', key: 'tl_quick_battery', icon: 'fa-car-battery', re: /batter|alternator|starter/i }
];

const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const queryWords = () => normalize(tlQuery).split(/\s+/).filter(Boolean);
const filtersActive = () => !!(tlQuery.trim() || tlType !== 'all' || tlQuick);

function recordMatches(r) {
    if (tlType !== 'all' && r.MainenanceRepairs !== tlType) return false;
    if (tlQuick) {
        const q = TL_QUICK.find(x => x.id === tlQuick);
        const text = `${r.Parts} ${r.Notes_Issues}`;
        if (q && !(q.test ? q.test(r) : q.re.test(text))) return false;
    }
    const words = queryWords();
    if (!words.length) return true;
    const hay = normalize([r.Parts, r.Notes_Issues, r.VehicleSide, locationLabel(r.VehicleSide),
        r.MainenanceRepairs, typeLabel(r.MainenanceRepairs), r.Service_Provider, r.SPLocation].join(' '));
    return words.every(w => hay.includes(w));
}

// Escapes text and wraps search-word matches in <mark> (matching on raw text, so entities are never split).
function hl(text) {
    const raw = String(text || '');
    const words = queryWords();
    if (!words.length) return escapeHtml(raw);
    const norm = normalize(raw);
    const marks = new Array(raw.length).fill(false);
    // NFD normalize can change length for accented chars; only highlight when lengths line up.
    if (norm.length === raw.length) {
        words.forEach(w => { let i = norm.indexOf(w); while (i !== -1) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = norm.indexOf(w, i + 1); } });
    }
    let out = '', open = false;
    for (let i = 0; i < raw.length; i++) {
        if (marks[i] && !open) { out += '<mark class="bg-amber-300/25 text-amber-100 rounded-sm">'; open = true; }
        if (!marks[i] && open) { out += '</mark>'; open = false; }
        out += escapeHtml(raw[i]);
    }
    return out + (open ? '</mark>' : '');
}

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, val) { try { localStorage.setItem(key, val); } catch { /* ignore */ } }

function parseMiles(v) {
    const n = parseInt(String(v || '').replace(/[^\d]/g, ''), 10);
    return isNaN(n) ? null : n;
}
function parseMoney(v) {
    const n = parseFloat(String(v || '').replace(/[^\d.]/g, ''));
    return isNaN(n) ? 0 : n;
}
function parseRecordDate(s) {
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
    const d = new Date(s);
    return isNaN(d) ? null : d;
}
function fmtMiles(n) { return n.toLocaleString(getLang() === 'es' ? 'es-US' : 'en-US'); }
function fmtMoney(n) { return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 }); }
function fmtDate(d) {
    return d ? d.toLocaleDateString(getLang() === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
function typeLabel(type) {
    const o = TYPE_OPTIONS.find(x => x.value === type);
    return o ? t(o.key) : type;
}
function locationLabel(loc) {
    const o = LOCATION_OPTIONS.find(x => x.value === loc);
    return o ? t(o.key) : loc;
}

// Groups one vehicle's records into service stops, one per mileage reading, newest first.
function buildTimeline(vehicle) {
    const records = allMaintenanceRecords.filter(r => r.Vehicle === vehicle);
    const stops = new Map();
    let undated = 0;
    records.forEach(r => {
        const miles = parseMiles(r.Mileage);
        if (miles === null) { undated++; return; }
        if (!stops.has(miles)) stops.set(miles, { miles, records: [], date: null, cost: 0, types: new Set(), providers: new Set() });
        const s = stops.get(miles);
        s.records.push(r);
        const d = parseRecordDate(r.Date);
        if (d && (!s.date || d > s.date)) s.date = d;
        s.cost += parseMoney(r.Cost);
        if (r.MainenanceRepairs) s.types.add(r.MainenanceRepairs);
        if (r.Service_Provider) s.providers.add(r.Service_Provider);
    });
    const list = [...stops.values()].sort((a, b) => b.miles - a.miles);

    // Link each oil change to the previous one (list is newest first, so "previous" is further down).
    const oilStops = list.filter(s => s.records.some(isOilChange));
    oilStops.forEach((s, i) => {
        s.isOil = true;
        const prev = oilStops[i + 1];
        s.oilGap = prev ? {
            miles: s.miles - prev.miles,
            days: s.date && prev.date ? Math.round((s.date - prev.date) / 86400000) : null
        } : null;
    });
    return { list, undated, total: records.length };
}

// Oil changes are written many ways ("Oil & Filter Changed", "Engine Oil, Oil Filter…",
// or only in the notes), so match "oil … filter" and skip other oil-related parts.
function isOilChange(r) {
    if (/\b(cap|solenoid|gasket|valve|pan|pump|leak)\b/i.test(r.Parts || '')) return false;
    return /\boil\b[^|;]{0,25}\bfilter\b/i.test(`${r.Parts || ''} ${r.Notes_Issues || ''}`);
}

// Splits "Tires | TPMS sensor | Rear Brake Pads" into separate items (display only — the sheet is untouched).
// Splits on | ; , outside brackets; never on "&" ("Engine Oil & Filter" is one job).
// A trailing "(…)" becomes gray detail text: "Cv Axle (Trakmotive; FR H08210)" → Cv Axle + detail.
function splitWorkItems(text) {
    const pieces = [];
    let depth = 0, cur = '';
    for (const ch of String(text || '')) {
        if (ch === '(') depth++;
        if (ch === ')') depth = Math.max(0, depth - 1);
        if (depth === 0 && /[|;,]/.test(ch)) { pieces.push(cur); cur = ''; } else cur += ch;
    }
    pieces.push(cur);
    return pieces.map(s => s.trim()).filter(Boolean).map(s => {
        const m = s.match(/^(.*\S)\s*\(([^()]*)\)\s*$/);
        return m ? { name: m[1].trim(), detail: m[2].trim().replace(/\s*;\s*/g, ' · ') } : { name: s, detail: '' };
    });
}

function oilGapHtml(stop) {
    if (!stop.isOil) return '';
    const text = stop.oilGap
        ? t('tl_oil_since').replace('{mi}', fmtMiles(stop.oilGap.miles)) +
          (stop.oilGap.days !== null ? ` · ${t('tl_days').replace('{n}', stop.oilGap.days.toLocaleString())}` : '')
        : t('tl_oil_first');
    return `<div class="flex items-center gap-2.5 rounded-lg bg-amber-400/10 border border-amber-400/20 px-3 py-2 text-xs text-amber-100">
      <i class="fa-solid fa-oil-can text-amber-300"></i><span>${text}</span></div>`;
}

function timelineVehicleChips(vehicles) {
    return vehicles.map(v => {
        const active = v.value === timelineVehicle;
        return `<button type="button" data-timeline-vehicle="${escapeHtml(v.value)}"
          class="px-3.5 py-1.5 rounded-full text-xs sm:text-sm border transition-colors duration-150 whitespace-nowrap ${active
            ? 'bg-logoClr text-gray-900 border-logoClr font-semibold'
            : 'border-white/15 text-gray-400 hover:border-logoClr hover:text-logoClr'}">${escapeHtml(v.label)}</button>`;
    }).join('');
}

function stopCardHtml(stop) {
    const key = `${timelineVehicle}:${stop.miles}`;
    const expanded = expandedTimelineCards.has(key);
    const items = (stop.shown || stop.records).flatMap(r => {
        const parts = splitWorkItems(r.Parts);
        if (!parts.length) parts.push({ name: typeLabel(r.MainenanceRepairs) || '-', detail: '' });
        return parts.map((p, i) => {
            // Location on the record's first item, notes after its last, so they aren't repeated.
            const loc = i === 0 && r.VehicleSide ? `<span class="text-gray-500"> · ${escapeHtml(locationLabel(r.VehicleSide))}</span>` : '';
            const detail = p.detail ? `<span class="block text-gray-500 text-xs">${hl(p.detail)}</span>` : '';
            const noteMatched = queryWords().length && queryWords().some(w => normalize(r.Notes_Issues).includes(w));
            const note = (expanded || noteMatched) && i === parts.length - 1 && r.Notes_Issues
                ? `<p class="text-gray-400 text-xs mt-1 pl-1 border-l-2 border-white/10 ml-0.5">${hl(r.Notes_Issues)}</p>` : '';
            return `<li class="flex gap-2"><span class="text-logoClr mt-[0.45rem] w-1.5 h-1.5 rounded-full bg-logoClr shrink-0"></span>
              <div class="min-w-0">${hl(p.name)}${loc}${detail}${note}</div></li>`;
        });
    });
    const shown = expanded ? items : items.slice(0, TIMELINE_PREVIEW_ITEMS);
    const hidden = items.length - shown.length;
    const hasMore = hidden > 0 || stop.records.some(r => r.Notes_Issues) || stop.providers.size;

    const badges = [...stop.types].map(ty =>
        `<span class="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${TYPE_STYLES[ty] || 'bg-white/5 text-gray-300 border-white/10'}">${escapeHtml(typeLabel(ty))}</span>`
    ).join('');

    const moreLine = hidden > 0
        ? `<li class="text-gray-500 text-sm pl-3.5">${t('tl_more').replace('{n}', hidden)}</li>` : '';
    const providerMatched = queryWords().some(w => normalize([...stop.providers].join(' ')).includes(w));
    const providers = (expanded || providerMatched) && stop.providers.size
        ? `<p class="text-gray-400 text-xs"><i class="fa-solid fa-user-tie mr-1.5 text-gray-500"></i>${hl([...stop.providers].join(', '))}</p>` : '';

    return `
    <article data-timeline-card="${escapeHtml(key)}"
      class="${hasMore ? 'cursor-pointer' : ''} rounded-2xl border border-white/10 bg-gray-950/60 hover:border-white/20 transition-colors duration-150 p-4 sm:p-5 flex flex-col gap-3">
      <header class="flex items-start justify-between gap-3">
        <div>
          <h3 class="text-txtWht text-base sm:text-lg font-semibold tracking-tight">${t('tl_mi_service').replace('{mi}', fmtMiles(stop.miles))}</h3>
          <p class="text-gray-500 text-xs">${fmtDate(stop.date)}</p>
        </div>
        <div class="flex flex-wrap justify-end gap-1.5">${badges}</div>
      </header>
      <ul class="flex flex-col gap-1.5 text-gray-200 text-sm">${shown.join('')}${moreLine}</ul>
      ${oilGapHtml(stop)}
      ${providers}
      <footer class="flex items-center justify-between pt-2 border-t border-white/5">
        <span class="text-sm font-semibold ${stop.cost ? 'text-txtWht' : 'text-gray-500'}">${stop.cost ? `${t('tl_cost')}: ${fmtMoney(stop.cost)}` : t('tl_no_cost')}</span>
        ${hasMore ? `<span class="text-gray-500 text-xs flex items-center gap-1">${expanded ? t('tl_less') : t('tl_details')}
          <i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'} text-[10px]"></i></span>` : ''}
      </footer>
    </article>`;
}

// Connector between two stops: "1,245 mi · 42 days before".
function gapHtml(newer, older) {
    const miles = newer.miles - older.miles;
    let days = '';
    if (newer.date && older.date) {
        const n = Math.round((newer.date - older.date) / 86400000);
        if (n >= 0) days = ` · ${t('tl_days').replace('{n}', n.toLocaleString())}`;
    }
    return `<div class="relative flex items-center h-9 pl-10 text-gray-500 text-xs">
      <span>${t('tl_gap').replace('{mi}', fmtMiles(miles))}${days}</span></div>`;
}

function renderTimeline() {
    const container = document.getElementById('timelineContent');
    if (!container || document.getElementById('timeline').style.display === 'none') return;

    const vehicles = getVehicles();
    if (!vehicles.length) { container.innerHTML = `<p class="text-gray-400 text-center py-8">${t('tl_no_vehicles')}</p>`; return; }
    if (!timelineVehicle || !vehicles.some(v => v.value === timelineVehicle)) {
        const saved = safeGet('timelineVehicle');
        timelineVehicle = vehicles.some(v => v.value === saved) ? saved : vehicles[0].value;
    }

    const { list, undated } = buildTimeline(timelineVehicle);
    const current = list.length ? list[0].miles : null;
    const first = list.length ? list[list.length - 1].miles : null;
    const totalCost = list.reduce((sum, s) => sum + s.cost, 0);

    const stat = (label, value) => `<div class="flex flex-col items-center gap-0.5 px-2">
      <span class="text-txtWht text-base sm:text-lg font-semibold">${value}</span>
      <span class="text-gray-500 text-[11px] uppercase tracking-wide text-center">${label}</span></div>`;

    const header = `
    <div class="rounded-2xl border border-white/10 bg-gradient-to-b from-gray-800/90 to-gray-900/95 shadow-2xl shadow-black/40 overflow-hidden mb-6">
      <div class="h-1.5 bg-gradient-to-r from-logoClr via-emerald-300 to-logoClr"></div>
      <div class="p-4 sm:p-6 flex flex-col gap-5">
        <div class="flex gap-2 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">${timelineVehicleChips(vehicles)}</div>
        <div class="flex items-end justify-between gap-4">
          <div>
            <p class="text-gray-400 text-xs font-semibold uppercase tracking-wide">${t('tl_current_mileage')}</p>
            <p class="text-txtWht text-3xl sm:text-4xl font-bold tracking-tight">${current !== null ? fmtMiles(current) : '—'}<span class="text-gray-500 text-lg font-medium ml-1">mi</span></p>
          </div>
          <button type="button" id="timelineLogBtn" class="text-logoClr text-sm font-semibold hover:underline whitespace-nowrap">${t('tl_log_service')}</button>
        </div>
        <div class="grid grid-cols-3 divide-x divide-white/10 rounded-xl bg-gray-950/40 border border-white/5 py-3">
          ${stat(t('tl_stat_services'), list.length)}
          ${stat(t('tl_stat_tracked'), current !== null ? fmtMiles(current - first) + ' mi' : '—')}
          ${stat(t('tl_stat_spent'), totalCost ? fmtMoney(totalCost) : '—')}
        </div>
      </div>
    </div>`;

    const chip = (attrs, active, label, icon) => `<button type="button" ${attrs}
      class="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition-colors duration-150 whitespace-nowrap ${active
        ? 'bg-amber-300/15 text-amber-200 border-amber-300/50 font-semibold'
        : 'border-white/10 text-gray-400 hover:border-white/30 hover:text-txtWht'}">${icon ? `<i class="fa-solid ${icon} text-[10px]"></i>` : ''}${label}</button>`;
    const rowCls = 'flex gap-2 overflow-x-auto -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

    const controls = `
    <div class="sticky top-2 z-20 mb-6 rounded-2xl border border-white/10 bg-gray-900/85 backdrop-blur-md shadow-xl shadow-black/40 p-3 flex flex-col gap-2.5">
      <div class="relative">
        <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none"></i>
        <input id="tlSearch" type="search" autocomplete="off" value="${escapeHtml(tlQuery)}" placeholder="${t('tl_search_placeholder')}"
          class="w-full text-base rounded-xl border border-white/10 bg-gray-950/60 text-txtWht pl-10 pr-10 py-2.5 placeholder:text-gray-500 focus:outline-none focus:border-amber-300/60 focus:ring-2 focus:ring-amber-300/20 [&::-webkit-search-cancel-button]:hidden" />
        <button type="button" id="tlSearchClear" aria-label="${t('tl_clear')}"
          class="${tlQuery ? '' : 'hidden'} absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full text-gray-400 hover:text-txtWht hover:bg-white/10"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="${rowCls}">
        ${chip('data-tl-type="all"', tlType === 'all', t('filter_all'))}
        ${TYPE_OPTIONS.map(o => chip(`data-tl-type="${o.value}"`, tlType === o.value, t(o.key), o.icon)).join('')}
      </div>
      <div class="${rowCls}">
        ${TL_QUICK.map(q => chip(`data-tl-quick="${q.id}"`, tlQuick === q.id, t(q.key), q.icon)).join('')}
      </div>
      <div id="tlResultInfo" class="flex items-center justify-between text-xs text-gray-400 px-1"></div>
    </div>`;

    container.innerHTML = header + (list.length ? controls : '') + '<div id="timelineList"></div>';
    renderTimelineList();
}

// Re-renders only the cards (so typing in the search box never loses focus).
function renderTimelineList() {
    const listEl = document.getElementById('timelineList');
    if (!listEl) return;
    const { list, undated } = buildTimeline(timelineVehicle);
    if (!list.length) { listEl.innerHTML = `<p class="text-gray-400 text-center py-8">${t('tl_empty')}</p>`; return; }
    const current = list[0].miles;

    const active = filtersActive();
    const visible = list
        .map(stop => ({ ...stop, shown: active ? stop.records.filter(recordMatches) : stop.records }))
        .filter(stop => stop.shown.length);

    const info = document.getElementById('tlResultInfo');
    if (info) {
        info.innerHTML = active
            ? `<span>${t('tl_results').replace('{n}', visible.length).replace('{total}', list.length)}</span>
               <button type="button" id="tlClearAll" class="text-amber-200 font-semibold hover:underline">${t('tl_clear')}</button>`
            : '';
        info.classList.toggle('hidden', !active);
    }

    let body = `
    <div class="relative flex items-center gap-3 mb-3">
      <span class="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-logoClr text-gray-900 shadow-lg shadow-logoClr/30"><i class="fa-solid fa-car-side text-sm"></i></span>
      <span class="text-logoClr font-bold text-lg">${fmtMiles(current)} mi</span>
      <span class="flex-1 h-px bg-logoClr/30"></span>
      <span class="text-gray-500 text-xs">${t('tl_you_are_here')}</span>
    </div>`;
    if (!visible.length) {
        body += `<div class="pl-10"><div class="rounded-2xl border border-dashed border-white/10 p-6 text-center flex flex-col items-center gap-3">
          <i class="fa-solid fa-magnifying-glass text-gray-600 text-xl"></i>
          <p class="text-gray-400 text-sm">${t('tl_no_match')}</p>
          <button type="button" id="tlClearAll" class="text-amber-200 text-sm font-semibold hover:underline">${t('tl_clear')}</button></div></div>`;
    }
    visible.forEach((stop, i) => {
        body += `<div class="relative pl-10">
          <span class="absolute left-[11px] top-6 z-10 w-2.5 h-2.5 rounded-full bg-gray-900 border-2 border-logoClr"></span>
          ${stopCardHtml(stop)}</div>`;
        if (i < visible.length - 1) body += gapHtml(stop, visible[i + 1]);
    });
    if (undated && !active) body += `<p class="text-gray-500 text-xs text-center mt-6">${t('tl_undated').replace('{n}', undated)}</p>`;

    // Vertical rail runs behind the marker, nodes and gaps.
    listEl.innerHTML = `<div class="relative">
      <span class="absolute left-[15px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-logoClr/60 via-white/10 to-transparent"></span>
      ${body}</div>`;
}

async function openTimeline() {
    if (!allMaintenanceRecords.length) {
        document.getElementById('timelineContent').innerHTML =
            `<p class="text-gray-400 text-center py-8 animate-pulse">${t('loading_records')}</p>`;
        await fetchRecords();
    }
    renderTimeline();
}

document.getElementById('timelineContent').addEventListener('click', e => {
    const chip = e.target.closest('[data-timeline-vehicle]');
    if (chip) {
        timelineVehicle = chip.dataset.timelineVehicle;
        safeSet('timelineVehicle', timelineVehicle);
        renderTimeline();
        return;
    }
    if (e.target.closest('#timelineLogBtn')) {
        showSection('log');
        const sel = document.getElementById('vehicle');
        if (sel && [...sel.options].some(o => o.value === timelineVehicle)) sel.value = timelineVehicle;
        return;
    }
    const typeChip = e.target.closest('[data-tl-type]');
    if (typeChip) { tlType = typeChip.dataset.tlType; renderTimeline(); return; }
    const quickChip = e.target.closest('[data-tl-quick]');
    if (quickChip) { tlQuick = tlQuick === quickChip.dataset.tlQuick ? null : quickChip.dataset.tlQuick; renderTimeline(); return; }
    if (e.target.closest('#tlClearAll')) { tlQuery = ''; tlType = 'all'; tlQuick = null; renderTimeline(); return; }
    if (e.target.closest('#tlSearchClear')) {
        tlQuery = '';
        renderTimeline();
        document.getElementById('tlSearch')?.focus();
        return;
    }
    const card = e.target.closest('[data-timeline-card]');
    if (card && card.classList.contains('cursor-pointer') && !window.getSelection().toString()) {
        const key = card.dataset.timelineCard;
        expandedTimelineCards.has(key) ? expandedTimelineCards.delete(key) : expandedTimelineCards.add(key);
        renderTimelineList();
    }
});

document.getElementById('timelineContent').addEventListener('input', e => {
    if (e.target.id !== 'tlSearch') return;
    tlQuery = e.target.value;
    document.getElementById('tlSearchClear')?.classList.toggle('hidden', !tlQuery);
    renderTimelineList();
});

document.getElementById('navTimeline').addEventListener('click', () => {
    showSection('timeline');
    openTimeline();
});
