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
    return { list, undated, total: records.length };
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
    const items = stop.records.map(r => {
        const loc = r.VehicleSide ? `<span class="text-gray-500"> · ${escapeHtml(locationLabel(r.VehicleSide))}</span>` : '';
        const note = expanded && r.Notes_Issues
            ? `<p class="text-gray-400 text-xs mt-1 pl-1 border-l-2 border-white/10 ml-0.5">${escapeHtml(r.Notes_Issues)}</p>` : '';
        return `<li class="flex gap-2"><span class="text-logoClr mt-[0.45rem] w-1.5 h-1.5 rounded-full bg-logoClr shrink-0"></span>
          <div class="min-w-0">${escapeHtml(r.Parts || typeLabel(r.MainenanceRepairs) || '-')}${loc}${note}</div></li>`;
    });
    const shown = expanded ? items : items.slice(0, TIMELINE_PREVIEW_ITEMS);
    const hidden = items.length - shown.length;
    const hasMore = hidden > 0 || stop.records.some(r => r.Notes_Issues) || stop.providers.size;

    const badges = [...stop.types].map(ty =>
        `<span class="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border ${TYPE_STYLES[ty] || 'bg-white/5 text-gray-300 border-white/10'}">${escapeHtml(typeLabel(ty))}</span>`
    ).join('');

    const moreLine = hidden > 0
        ? `<li class="text-gray-500 text-sm pl-3.5">${t('tl_more').replace('{n}', hidden)}</li>` : '';
    const providers = expanded && stop.providers.size
        ? `<p class="text-gray-400 text-xs"><i class="fa-solid fa-user-tie mr-1.5 text-gray-500"></i>${escapeHtml([...stop.providers].join(', '))}</p>` : '';

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

    if (!list.length) {
        container.innerHTML = header + `<p class="text-gray-400 text-center py-8">${t('tl_empty')}</p>`;
        return;
    }

    let body = `
    <div class="relative flex items-center gap-3 mb-3">
      <span class="relative z-10 flex items-center justify-center w-8 h-8 rounded-full bg-logoClr text-gray-900 shadow-lg shadow-logoClr/30"><i class="fa-solid fa-car-side text-sm"></i></span>
      <span class="text-logoClr font-bold text-lg">${fmtMiles(current)} mi</span>
      <span class="flex-1 h-px bg-logoClr/30"></span>
      <span class="text-gray-500 text-xs">${t('tl_you_are_here')}</span>
    </div>`;
    list.forEach((stop, i) => {
        body += `<div class="relative pl-10">
          <span class="absolute left-[11px] top-6 z-10 w-2.5 h-2.5 rounded-full bg-gray-900 border-2 border-logoClr"></span>
          ${stopCardHtml(stop)}</div>`;
        if (i < list.length - 1) body += gapHtml(stop, list[i + 1]);
    });
    if (undated) body += `<p class="text-gray-500 text-xs text-center mt-6">${t('tl_undated').replace('{n}', undated)}</p>`;

    // Vertical rail runs behind the marker, nodes and gaps.
    container.innerHTML = header + `<div class="relative">
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
    const card = e.target.closest('[data-timeline-card]');
    if (card && card.classList.contains('cursor-pointer')) {
        const key = card.dataset.timelineCard;
        expandedTimelineCards.has(key) ? expandedTimelineCards.delete(key) : expandedTimelineCards.add(key);
        renderTimeline();
    }
});

document.getElementById('navTimeline').addEventListener('click', () => {
    showSection('timeline');
    openTimeline();
});
