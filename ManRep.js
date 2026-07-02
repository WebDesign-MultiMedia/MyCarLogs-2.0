// ---- Service section toggle ----
const serviceForm = document.getElementById("Service");
serviceForm.style.display = 'none';

const serviceToggleBtn = document.getElementById('serviceToggleBtn');
const serviceToggleLabel = document.getElementById('serviceToggleLabel');
const serviceFields = serviceForm.querySelectorAll('input, select, textarea');

function toggleServiceSection() {
    const isHidden = serviceForm.style.display === 'none';
    serviceForm.style.display = isHidden ? 'grid' : 'none';
    serviceToggleBtn.classList.toggle('border-red-400', isHidden);
    serviceToggleBtn.classList.toggle('text-red-400', isHidden);
    serviceToggleBtn.classList.toggle('border-logoClr/50', !isHidden);
    serviceToggleBtn.classList.toggle('text-logoClr', !isHidden);
    serviceToggleLabel.textContent = isHidden ? '- Hide Service Info' : '+ Add Service Info';

    // Only require these fields while the section is visible — a hidden
    // required field still blocks form submission in most browsers.
    serviceFields.forEach(field => { field.required = isHidden; });
}

serviceToggleBtn.addEventListener('click', toggleServiceSection);

// ---- Nav section switching ----
const logFormSection = document.getElementById('logForm');
const partsFormSection = document.getElementById('partsFormtwo');
const recordsSection = document.getElementById('records');
const navClipboard = document.getElementById('navClipboard');
const navGears = document.getElementById('navGears');
const navSpreadsheet = document.getElementById('navSpreadsheet');

function showSection(name) {
    logFormSection.style.display = name === 'log' ? 'block' : 'none';
    partsFormSection.style.display = name === 'parts' ? 'block' : 'none';
    recordsSection.style.display = name === 'records' ? 'block' : 'none';
    navClipboard.style.opacity = name === 'log' ? '1' : '0.4';
    navGears.style.opacity = name === 'parts' ? '1' : '0.4';
    navSpreadsheet.style.opacity = name === 'records' ? '1' : '0.4';
}

showSection('log');

// ---- Filter state (declared early — used by renderVehicleFilters on load) ----
let allMaintenanceRecords = [];
let allPartsRecords = [];
let activeTimeFilter = 0;
let activeVehicleFilter = 'all';
let activeTypeFilter = 'all';

navClipboard.addEventListener('click', () => showSection('log'));
navGears.addEventListener('click', () => showSection('parts'));
navSpreadsheet.addEventListener('click', () => {
    showSection('records');
    fetchRecords();
});

// ---- Vehicle management ----
const DEFAULT_VEHICLES = [
    { value: 'HP07', label: 'Honda Pilot 2007' },
    { value: 'HO10', label: 'Honda Odyssey 2010' },
    { value: 'HC12', label: 'Honda Civic 2012' }
];

function getVehicles() {
    const stored = localStorage.getItem('vehicles');
    if (!stored) {
        saveVehicles([...DEFAULT_VEHICLES]);
        return [...DEFAULT_VEHICLES];
    }

    const vehicles = JSON.parse(stored);
    const missingDefaults = DEFAULT_VEHICLES.filter(
        dv => !vehicles.some(v => v.value === dv.value)
    );
    if (missingDefaults.length > 0) {
        vehicles.push(...missingDefaults);
        saveVehicles(vehicles);
    }
    return vehicles;
}

function saveVehicles(list) {
    localStorage.setItem('vehicles', JSON.stringify(list));
}

function populateVehicleSelects() {
    const vehicles = getVehicles();
    document.querySelectorAll('.vehicle-select').forEach(sel => {
        const currentVal = sel.value;
        sel.innerHTML = '<option value="">-- choose a car --</option>';
        vehicles.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.value;
            opt.textContent = v.label;
            sel.appendChild(opt);
        });
        if (currentVal) sel.value = currentVal;
    });
    renderVehicleFilters();
}

function renderVehicleManagerList() {
    const vehicles = getVehicles();
    const list = document.getElementById('vehicleList');
    if (!list) return;

    if (vehicles.length === 0) {
        list.innerHTML = '<li class="text-gray-400 text-sm text-center py-2">No vehicles added yet.</li>';
        return;
    }

    list.innerHTML = vehicles.map((v, i) => `
    <li class="flex justify-between items-center bg-gray-700/50 rounded-lg px-3 py-2">
      <span class="text-txtWht text-sm">${v.label}</span>
      <button type="button" class="delete-vehicle text-red-400 hover:text-red-300 text-xl leading-none ml-2" data-index="${i}" title="Remove">&times;</button>
    </li>`).join('');

    list.querySelectorAll('.delete-vehicle').forEach(btn => {
        btn.addEventListener('click', () => {
            const vehicles = getVehicles();
            vehicles.splice(parseInt(btn.dataset.index), 1);
            saveVehicles(vehicles);
            populateVehicleSelects();
            renderVehicleManagerList();
        });
    });
}

// Modal open / close
const vehicleModal = document.getElementById('vehicleModal');

document.querySelectorAll('.open-vehicle-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        vehicleModal.classList.remove('hidden');
        renderVehicleManagerList();
    });
});

document.getElementById('closeVehicleModal').addEventListener('click', () => {
    vehicleModal.classList.add('hidden');
});

vehicleModal.addEventListener('click', e => {
    if (e.target === vehicleModal) vehicleModal.classList.add('hidden');
});

// Add vehicle
document.getElementById('addVehicleBtn').addEventListener('click', () => {
    const input = document.getElementById('newVehicleInput');
    const name = input.value.trim();
    if (!name) return;
    const vehicles = getVehicles();
    vehicles.push({ value: name, label: name });
    saveVehicles(vehicles);
    populateVehicleSelects();
    renderVehicleManagerList();
    input.value = '';
});

document.getElementById('newVehicleInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('addVehicleBtn').click();
    }
});

// Populate selects on page load
populateVehicleSelects();

// ---- Maintenance/Repair form submit ----
const SHEETDB_URL = 'https://sheetdb.io/api/v1/f85paemez3pqc';
const SHEETDB_PARTS_URL = `${SHEETDB_URL}?sheet=Sheet2`;

// Unique per-record ID so a single row can be targeted precisely for edit/delete
// (SheetDB matches ALL rows with a given column value, so a stable unique key is required).
// IDs continue sequentially from the highest existing ID in that sheet (1, 2, 3, ...),
// rather than filling gaps left by deleted rows.
async function nextSequentialId(sheetUrl) {
    const res = await fetch(sheetUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const records = await res.json();
    const maxId = records.reduce((max, r) => {
        const n = parseInt(r.ID, 10);
        return !isNaN(n) && n > max ? n : max;
    }, 0);
    return String(maxId + 1);
}

// Builds a SheetDB URL that targets the single row where the ID column equals `id`.
function sheetRowUrl(id, sheetName) {
    const base = `${SHEETDB_URL}/ID/${encodeURIComponent(id)}`;
    return sheetName ? `${base}?sheet=${sheetName}` : base;
}

document.querySelector('#logForm form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        const record = {
            ID: await nextSequentialId(SHEETDB_URL),
            Date: document.getElementById('date').value,
            Mileage: document.getElementById('mileage').value,
            MainenanceRepairs: document.getElementById('type').value,
            VehicleSide: document.getElementById('VehicleSide').value,
            Vehicle: document.getElementById('vehicle').value,
            Parts: document.getElementById('partCount').value,
            Notes_Issues: document.getElementById('Notes_Issues').value,
            Service_Provider: document.getElementById('service').value,
            SPLocation: document.getElementById('address').value,
            Cost: document.getElementById('cost').value
        };

        const res = await fetch(SHEETDB_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [record] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const saved = JSON.parse(localStorage.getItem('maintenanceRecords') || '[]');
        saved.push(record);
        localStorage.setItem('maintenanceRecords', JSON.stringify(saved));

        e.target.reset();
        if (serviceForm.style.display !== 'none') toggleServiceSection();
        showFeedback('logForm', 'Maintenance record saved!');
    } catch (err) {
        showFeedback('logForm', 'Error saving record — check your connection and try again.');
        console.error('SheetDB error:', err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
    }
});

// Time filter (static buttons)
document.querySelectorAll('.filter-time').forEach(btn => {
    btn.addEventListener('click', () => {
        activeTimeFilter = parseInt(btn.dataset.days);
        document.querySelectorAll('.filter-time').forEach(b => {
            b.classList.toggle('border-logoClr', false);
            b.classList.toggle('text-logoClr', false);
            b.classList.toggle('border-gray-600', true);
            b.classList.toggle('text-gray-400', true);
        });
        btn.classList.toggle('border-gray-600', false);
        btn.classList.toggle('text-gray-400', false);
        btn.classList.toggle('border-logoClr', true);
        btn.classList.toggle('text-logoClr', true);
        applyFiltersAndRender();
    });
});

// Type filter (static buttons)
const typeFilterBtns = document.querySelectorAll('.filter-type');
typeFilterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        activeTypeFilter = btn.dataset.type;
        typeFilterBtns.forEach(b => {
            b.classList.remove('border-logoClr', 'text-logoClr');
            b.classList.add('border-gray-600', 'text-gray-400');
        });
        btn.classList.remove('border-gray-600', 'text-gray-400');
        btn.classList.add('border-logoClr', 'text-logoClr');
        applyFiltersAndRender();
    });
});

// Vehicle filter (dynamic — rendered by renderVehicleFilters)
function renderVehicleFilters() {
    const vehicles = getVehicles();
    const row = document.getElementById('vehicleFilterRow');
    if (!row) return;

    const allActive = activeVehicleFilter === 'all';
    let html = `<button class="filter-vehicle px-3 py-1 rounded-full text-xs sm:text-sm border transition hover:border-logoClr hover:text-logoClr ${allActive ? 'border-logoClr text-logoClr' : 'border-gray-600 text-gray-400'}" data-vehicle="all">All</button>`;

    vehicles.forEach(v => {
        const active = activeVehicleFilter === v.value;
        html += `<button class="filter-vehicle px-3 py-1 rounded-full text-xs sm:text-sm border transition hover:border-logoClr hover:text-logoClr ${active ? 'border-logoClr text-logoClr' : 'border-gray-600 text-gray-400'}" data-vehicle="${v.value}">${v.label}</button>`;
    });

    row.innerHTML = html;

    row.querySelectorAll('.filter-vehicle').forEach(btn => {
        btn.addEventListener('click', () => {
            activeVehicleFilter = btn.dataset.vehicle;
            renderVehicleFilters();
            applyFiltersAndRender();
        });
    });
}

document.getElementById('refreshRecords').addEventListener('click', () => fetchRecords());

// ---- Click-to-expand tooltip for truncated cells ----
function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

// Builds a <td> that truncates long text with an ellipsis, and shows the
// full value in a tooltip (hover on desktop, tap on mobile — see handlers below).
function truncTd(value) {
    if (!value || value === '-') return '<td class="p-2 truncate">-</td>';
    return `<td class="p-2 truncate cursor-pointer underline decoration-dotted decoration-gray-500" data-tooltip="${escapeHtml(value)}">${value}</td>`;
}

function closeTooltip() {
    const existing = document.getElementById('activeTooltip');
    if (existing) existing.remove();
}

function showTooltip(anchor, text) {
    closeTooltip();
    const tip = document.createElement('div');
    tip.id = 'activeTooltip';
    tip.className = 'fixed z-50 max-w-xs bg-gray-800 border border-logoClr text-txtWht text-xs rounded-lg p-2 shadow-lg';
    tip.textContent = text;
    document.body.appendChild(tip);

    const rect = anchor.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - tip.offsetWidth - 8);
    const top = Math.min(rect.bottom + 4, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
}

document.getElementById('recordsContent').addEventListener('click', e => {
    const cell = e.target.closest('[data-tooltip]');
    if (cell) {
        e.stopPropagation();
        showTooltip(cell, cell.dataset.tooltip);
    }
});
document.addEventListener('click', closeTooltip);

// Laptop/desktop: show on hover. Mobile (no real hover): handled by the click listener above.
if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.getElementById('recordsContent').addEventListener('mouseover', e => {
        const cell = e.target.closest('[data-tooltip]');
        if (cell) showTooltip(cell, cell.dataset.tooltip);
    });
    document.getElementById('recordsContent').addEventListener('mouseout', e => {
        const cell = e.target.closest('[data-tooltip]');
        if (cell && !cell.contains(e.relatedTarget)) closeTooltip();
    });
}

// ---- Fetch from SheetDB then render ----
async function fetchRecords() {
    const container = document.getElementById('recordsContent');
    container.innerHTML = '<p class="text-gray-400 text-center py-8 animate-pulse">Loading records...</p>';
    renderVehicleFilters();

    try {
        const [mRes, pRes] = await Promise.all([fetch(SHEETDB_URL), fetch(SHEETDB_PARTS_URL)]);
        if (!mRes.ok) throw new Error(`HTTP ${mRes.status}`);
        if (!pRes.ok) throw new Error(`HTTP ${pRes.status}`);
        allMaintenanceRecords = await mRes.json();
        allPartsRecords = await pRes.json();
    } catch (err) {
        container.innerHTML = '<p class="text-red-400 text-center py-8">Could not load records — check your connection.</p>';
        console.error('SheetDB fetch error:', err);
        return;
    }

    applyFiltersAndRender();
}

// ---- Vehicle name lookup ----
const VEHICLE_NAMES = { 'HP07': 'Honda Pilot 2007', 'HO10': 'Honda Odyssey 2010', 'HC12': 'Honda Civic 2012' };

function getVehicleLabel(value) {
    if (!value) return '-';
    if (VEHICLE_NAMES[value]) return VEHICLE_NAMES[value];
    const found = getVehicles().find(v => v.value === value);
    return found ? found.label : value;
}

// ---- Inline edit / delete ----
const LOCATION_OPTIONS = ['Front-Driver', 'Front-Pass', 'Rear-Driver', 'Rear-Pass', 'Front-(Drive|Pass)', 'Rear-(Drive|Pass)', 'Engine', 'Transmission'];
const TYPE_OPTIONS = ['Maintenance', 'Repair'];

const MAINTENANCE_FIELDS = [
    { key: 'Date', label: 'Date', type: 'date', nowrap: true },
    { key: 'Vehicle', label: 'Vehicle', type: 'vehicle', truncate: true },
    { key: 'MainenanceRepairs', label: 'Type', type: 'select', options: TYPE_OPTIONS },
    { key: 'Mileage', label: 'Mileage', type: 'number' },
    { key: 'VehicleSide', label: 'Location', type: 'select', options: LOCATION_OPTIONS, truncate: true },
    { key: 'Notes_Issues', label: 'Notes', type: 'text' },
    { key: 'Cost', label: 'Cost', type: 'money', nowrap: true },
    { key: 'Parts', label: 'Parts', type: 'text', truncate: true }
];

const PARTS_FIELDS = [
    { key: 'Date_Purchased', label: 'Date', type: 'date', nowrap: true },
    { key: 'Vehicle', label: 'Vehicle', type: 'vehicle', truncate: true },
    { key: 'Parts_Name', label: 'Part', type: 'text', truncate: true },
    { key: 'Parts_Brand', label: 'Brand', type: 'text', truncate: true },
    { key: 'Parts_Location', label: 'Location', type: 'select', options: LOCATION_OPTIONS, truncate: true },
    { key: 'Price', label: 'Price', type: 'money', nowrap: true },
    { key: 'Purchased', label: 'Bought At', type: 'text', truncate: true }
];

// Only one row can be edited at a time, app-wide.
let editingRow = null; // { type: 'maintenance' | 'parts', id: string }

function displayValue(field, record) {
    const raw = record[field.key];
    if (field.type === 'vehicle') return getVehicleLabel(raw);
    if (field.type === 'money') return raw ? '$' + raw : '-';
    return raw || '-';
}

function toDateInputValue(dateStr) {
    if (!dateStr) return '';
    // Already yyyy-mm-dd (every new record is saved in this format) — return as-is.
    // Parsing it through `new Date()` would read it as UTC midnight and then
    // format it back in local time, silently shifting the day in negative-UTC timezones.
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const d = new Date(dateStr);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fieldInputHtml(field, record) {
    const raw = record[field.key] || '';
    const common = `class="w-full bg-gray-800 border border-logoClr rounded p-1 text-txtWht text-xs" data-field="${field.key}"`;

    if (field.type === 'vehicle') {
        const opts = getVehicles().map(v => `<option value="${v.value}"${v.value === raw ? ' selected' : ''}>${v.label}</option>`).join('');
        return `<select ${common}><option value="">-- choose --</option>${opts}</select>`;
    }
    if (field.type === 'select') {
        const opts = field.options.map(o => `<option value="${o}"${o === raw ? ' selected' : ''}>${o}</option>`).join('');
        return `<select ${common}>${opts}</select>`;
    }
    if (field.type === 'date') {
        return `<input type="date" ${common} value="${toDateInputValue(raw)}">`;
    }
    if (field.type === 'number') {
        return `<input type="number" ${common} value="${escapeHtml(raw)}">`;
    }
    return `<input type="text" ${common} value="${escapeHtml(raw)}">`;
}

function actionsCellView(type, id) {
    if (!id) return `<td class="p-2 whitespace-nowrap text-gray-500 text-xs" title="Add an ID column value in the sheet to enable editing">No ID</td>`;
    return `<td class="p-2 whitespace-nowrap">
      <button type="button" class="text-logoClr hover:underline text-xs mr-2" data-action="edit" data-type="${type}" data-id="${escapeHtml(id)}">Edit</button>
      <button type="button" class="text-red-400 hover:underline text-xs" data-action="delete" data-type="${type}" data-id="${escapeHtml(id)}">Delete</button>
    </td>`;
}

function actionsCellEdit(type, id) {
    return `<td class="p-2 whitespace-nowrap">
      <button type="button" class="text-green-400 hover:underline text-xs mr-2" data-action="save" data-type="${type}" data-id="${escapeHtml(id)}">Save</button>
      <button type="button" class="text-gray-400 hover:underline text-xs" data-action="cancel" data-type="${type}" data-id="${escapeHtml(id)}">Cancel</button>
    </td>`;
}

function tableRowHtml(record, fields, type) {
    const id = record.ID;
    const isEditing = editingRow && editingRow.type === type && editingRow.id === id;

    const cells = fields.map(f => {
        if (isEditing) return `<td class="p-2">${fieldInputHtml(f, record)}</td>`;
        const val = displayValue(f, record);
        if (f.truncate) return truncTd(val);
        return `<td class="p-2${f.nowrap ? ' whitespace-nowrap' : ''}">${val}</td>`;
    }).join('');

    const actions = isEditing ? actionsCellEdit(type, id) : actionsCellView(type, id);
    return `<tr class="border-b border-gray-700 hover:bg-gray-700" data-row-id="${escapeHtml(id || '')}">${cells}${actions}</tr>`;
}

function cardHtml(record, fields, type, borderColor, accentText, extraViewHtml) {
    const id = record.ID;
    const isEditing = editingRow && editingRow.type === type && editingRow.id === id;

    if (isEditing) {
        const inputsHtml = fields.map(f => `
          <div>
            <p class="text-gray-400 text-xs uppercase tracking-wide">${f.label}</p>
            ${fieldInputHtml(f, record)}
          </div>`).join('');
        return `
        <div class="border ${borderColor} rounded-lg p-4 bg-gray-900/50" data-row-id="${escapeHtml(id)}">
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-3">${inputsHtml}</div>
          <div class="flex justify-end gap-4 border-t border-gray-600 pt-2">
            <button type="button" class="text-green-400 hover:underline text-sm" data-action="save" data-type="${type}" data-id="${escapeHtml(id)}">Save</button>
            <button type="button" class="text-gray-400 hover:underline text-sm" data-action="cancel" data-type="${type}" data-id="${escapeHtml(id)}">Cancel</button>
          </div>
        </div>`;
    }

    const actionsHtml = id
        ? `<button type="button" class="${accentText} hover:underline text-xs" data-action="edit" data-type="${type}" data-id="${escapeHtml(id)}">Edit</button>
           <button type="button" class="text-red-400 hover:underline text-xs" data-action="delete" data-type="${type}" data-id="${escapeHtml(id)}">Delete</button>`
        : `<span class="text-gray-500 text-xs" title="Add an ID column value in the sheet to enable editing">No ID</span>`;

    return `
    <div class="border ${borderColor} rounded-lg p-4 bg-gray-900/50" data-row-id="${escapeHtml(id || '')}">
      <div class="flex justify-between items-center border-b border-gray-600 pb-2 mb-3">
        <span class="${accentText} font-semibold text-sm">${displayValue(fields[1], record)}</span>
        <span class="text-gray-400 text-xs">${displayValue(fields[0], record)}</span>
      </div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        ${fields.slice(2).map(f => `
        <div${f.key === 'Purchased' ? ' class="col-span-2"' : ''}>
          <p class="text-gray-400 text-xs uppercase tracking-wide">${f.label}</p>
          <p class="text-txtWht">${displayValue(f, record)}</p>
        </div>`).join('')}
        ${extraViewHtml ? extraViewHtml(record) : ''}
      </div>
      <div class="flex justify-end gap-3 border-t border-gray-600 pt-2 mt-3">${actionsHtml}</div>
    </div>`;
}

// ---- Delete confirmation modal ----
const deleteModal = document.getElementById('deleteModal');
const deleteModalCancel = document.getElementById('deleteModalCancel');
const deleteModalConfirm = document.getElementById('deleteModalConfirm');

function confirmDelete() {
    return new Promise(resolve => {
        deleteModal.classList.remove('hidden');

        const cleanup = result => {
            deleteModal.classList.add('hidden');
            deleteModalConfirm.removeEventListener('click', onConfirm);
            deleteModalCancel.removeEventListener('click', onCancel);
            deleteModal.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = e => { if (e.target === deleteModal) cleanup(false); };

        deleteModalConfirm.addEventListener('click', onConfirm);
        deleteModalCancel.addEventListener('click', onCancel);
        deleteModal.addEventListener('click', onBackdrop);
    });
}

async function deleteRecord(type, id, btn) {
    if (!(await confirmDelete())) return;
    const isMaintenance = type === 'maintenance';

    btn.disabled = true;
    try {
        const res = await fetch(sheetRowUrl(id, isMaintenance ? null : 'Sheet2'), { method: 'DELETE' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        if (isMaintenance) {
            allMaintenanceRecords = allMaintenanceRecords.filter(r => r.ID !== id);
        } else {
            allPartsRecords = allPartsRecords.filter(r => r.ID !== id);
        }
        applyFiltersAndRender();
    } catch (err) {
        console.error('Delete error:', err);
        alert('Could not delete record — check your connection and try again.');
        btn.disabled = false;
    }
}

async function saveRecord(type, id, btn) {
    const isMaintenance = type === 'maintenance';
    const fields = isMaintenance ? MAINTENANCE_FIELDS : PARTS_FIELDS;
    const row = btn.closest('[data-row-id]');
    const updates = {};
    fields.forEach(f => {
        const input = row.querySelector(`[data-field="${f.key}"]`);
        if (input) updates[f.key] = input.value;
    });

    btn.disabled = true;
    try {
        const res = await fetch(sheetRowUrl(id, isMaintenance ? null : 'Sheet2'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: updates })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const list = isMaintenance ? allMaintenanceRecords : allPartsRecords;
        const rec = list.find(r => r.ID === id);
        if (rec) Object.assign(rec, updates);

        editingRow = null;
        applyFiltersAndRender();
    } catch (err) {
        console.error('Update error:', err);
        alert('Could not save changes — check your connection and try again.');
        btn.disabled = false;
    }
}

document.getElementById('recordsContent').addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    const { action, type, id } = btn.dataset;

    if (action === 'edit') {
        editingRow = { type, id };
        applyFiltersAndRender();
    } else if (action === 'cancel') {
        editingRow = null;
        applyFiltersAndRender();
    } else if (action === 'delete') {
        deleteRecord(type, id, btn);
    } else if (action === 'save') {
        saveRecord(type, id, btn);
    }
});

// ---- Filter stored data and rebuild display ----
function applyFiltersAndRender() {
    const container = document.getElementById('recordsContent');

    let maintenance = [...allMaintenanceRecords].reverse();

    if (activeTimeFilter > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - activeTimeFilter);
        maintenance = maintenance.filter(r => {
            const d = new Date(r.Date);
            return !isNaN(d) && d >= cutoff;
        });
    }
    if (activeVehicleFilter !== 'all') {
        maintenance = maintenance.filter(r => r.Vehicle === activeVehicleFilter);
    }

    let parts = [...allPartsRecords].reverse();
    if (activeTimeFilter > 0) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - activeTimeFilter);
        parts = parts.filter(r => {
            const d = new Date(r.Date_Purchased);
            return !isNaN(d) && d >= cutoff;
        });
    }
    if (activeVehicleFilter !== 'all') {
        parts = parts.filter(r => r.Vehicle === activeVehicleFilter);
    }

    // Type filter
    if (activeTypeFilter === 'maintenance') parts = [];
    if (activeTypeFilter === 'parts') maintenance = [];

    if (maintenance.length === 0 && parts.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">No records match the selected filters.</p>';
        return;
    }

    let html = '';

    // ---- Maintenance / Repair ----
    if (maintenance.length > 0) {
        const mExtras = r => `
            ${r.Notes_Issues ? `
            <div class="col-span-2">
              <p class="text-gray-400 text-xs uppercase tracking-wide">Notes</p>
              <p class="text-txtWht">${r.Notes_Issues}</p>
            </div>` : ''}
            ${r.Service_Provider ? `
            <div class="col-span-2 border-t border-gray-600 pt-2 mt-1">
              <p class="text-gray-400 text-xs uppercase tracking-wide">Service</p>
              <p class="text-txtWht">${r.Service_Provider}${r.SPLocation ? ' — ' + r.SPLocation : ''}</p>
            </div>` : ''}`;

        const mCards = maintenance.map(r => cardHtml(r, MAINTENANCE_FIELDS, 'maintenance', 'border-logoClr', 'text-logoClr', mExtras)).join('');

        const mTable = `
        <table class="w-full text-txtWht text-sm border-collapse table-fixed">
          <colgroup>
            <col class="w-20">
            <col class="w-32">
            <col class="w-24">
            <col class="w-20">
            <col class="w-28">
            <col>
            <col class="w-16">
            <col class="w-28">
            <col class="w-24">
          </colgroup>
          <thead>
            <tr class="border-b border-logoClr text-logoClr">
              <th class="text-left p-2 whitespace-nowrap">Date</th>
              <th class="text-left p-2 whitespace-nowrap">Vehicle</th>
              <th class="text-left p-2">Type</th>
              <th class="text-left p-2 whitespace-nowrap">Mileage</th>
              <th class="text-left p-2">Location</th>
              <th class="text-left p-2">Notes</th>
              <th class="text-left p-2 whitespace-nowrap">Cost</th>
              <th class="text-left p-2 whitespace-nowrap">Parts</th>
              <th class="text-left p-2 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${maintenance.map(r => tableRowHtml(r, MAINTENANCE_FIELDS, 'maintenance')).join('')}
          </tbody>
        </table>`;

        html += `
        <h3 class="text-logoClr text-lg sm:text-xl mb-3">Maintenance / Repair</h3>
        <div class="sm:hidden space-y-3 mb-8">${mCards}</div>
        <div class="hidden sm:block mb-8">${mTable}</div>`;
    }

    // ---- Parts ----
    if (parts.length > 0) {
        const pCards = parts.map(r => cardHtml(r, PARTS_FIELDS, 'parts', 'border-logoClrBlue', 'text-logoClrBlue')).join('');

        const pTable = `
        <table class="w-full text-txtWht text-sm border-collapse table-fixed">
          <colgroup>
            <col class="w-20">
            <col class="w-32">
            <col class="w-36">
            <col class="w-24">
            <col class="w-28">
            <col class="w-16">
            <col class="w-32">
            <col class="w-24">
          </colgroup>
          <thead>
            <tr class="border-b border-logoClrBlue text-logoClrBlue">
              <th class="text-left p-2 whitespace-nowrap">Date</th>
              <th class="text-left p-2 whitespace-nowrap">Vehicle</th>
              <th class="text-left p-2">Part</th>
              <th class="text-left p-2">Brand</th>
              <th class="text-left p-2">Location</th>
              <th class="text-left p-2 whitespace-nowrap">Price</th>
              <th class="text-left p-2">Bought At</th>
              <th class="text-left p-2 whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${parts.map(r => tableRowHtml(r, PARTS_FIELDS, 'parts')).join('')}
          </tbody>
        </table>`;

        html += `
        <h3 class="text-logoClrBlue text-lg sm:text-xl mb-3">Parts</h3>
        <div class="sm:hidden space-y-3 mb-8">${pCards}</div>
        <div class="hidden sm:block mb-8">${pTable}</div>`;
    }

    container.innerHTML = html;
}

function showFeedback(sectionId, message) {
    const section = document.getElementById(sectionId);
    const existing = section.querySelector('.feedback-msg');
    if (existing) existing.remove();
    const msg = document.createElement('p');
    msg.className = 'feedback-msg text-center text-green-400 mt-4 text-base sm:text-lg';
    msg.textContent = message;
    section.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}
