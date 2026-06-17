// ---- Service section toggle ----
const serviceForm = document.getElementById("Service");
serviceForm.style.display = 'none';

const serviceToggleBtn = document.getElementById('serviceToggleBtn');
const serviceToggleLabel = document.getElementById('serviceToggleLabel');

function toggleServiceSection() {
    const isHidden = serviceForm.style.display === 'none';
    serviceForm.style.display = isHidden ? 'grid' : 'none';
    serviceToggleBtn.classList.toggle('border-red-400', isHidden);
    serviceToggleBtn.classList.toggle('text-red-400', isHidden);
    serviceToggleBtn.classList.toggle('border-logoClr/50', !isHidden);
    serviceToggleBtn.classList.toggle('text-logoClr', !isHidden);
    serviceToggleLabel.textContent = isHidden ? '- Hide Service Info' : '+ Add Service Info';
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
    { value: 'HO10', label: 'Honda Odyssey 2010' }
];

function getVehicles() {
    const stored = localStorage.getItem('vehicles');
    if (!stored) {
        saveVehicles([...DEFAULT_VEHICLES]);
        return [...DEFAULT_VEHICLES];
    }
    return JSON.parse(stored);
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

document.querySelector('#logForm form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const record = {
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

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
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

// ---- Fetch from SheetDB then render ----
async function fetchRecords() {
    const container = document.getElementById('recordsContent');
    container.innerHTML = '<p class="text-gray-400 text-center py-8 animate-pulse">Loading records...</p>';
    renderVehicleFilters();

    try {
        const res = await fetch(SHEETDB_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        allMaintenanceRecords = await res.json();
    } catch (err) {
        container.innerHTML = '<p class="text-red-400 text-center py-8">Could not load records — check your connection.</p>';
        console.error('SheetDB fetch error:', err);
        return;
    }

    applyFiltersAndRender();
}

// ---- Vehicle name lookup ----
const VEHICLE_NAMES = { 'HP07': 'Honda Pilot 2007', 'HO10': 'Honda Odyssey 2010' };

function getVehicleLabel(value) {
    if (!value) return '-';
    if (VEHICLE_NAMES[value]) return VEHICLE_NAMES[value];
    const found = getVehicles().find(v => v.value === value);
    return found ? found.label : value;
}

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

    let parts = [...(JSON.parse(localStorage.getItem('partsRecords') || '[]'))].reverse();
    if (activeVehicleFilter !== 'all') {
        parts = parts.filter(r => r.vehicle === activeVehicleFilter);
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
        const mCards = maintenance.map(r => `
        <div class="border border-logoClr rounded-lg p-4 bg-gray-900/50">
          <div class="flex justify-between items-center border-b border-gray-600 pb-2 mb-3">
            <span class="text-logoClr font-semibold text-sm">${getVehicleLabel(r.Vehicle)}</span>
            <span class="text-gray-400 text-xs">${r.Date || '-'}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Type</p>
              <p class="text-txtWht">${r.MainenanceRepairs || '-'}</p>
            </div>
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Mileage</p>
              <p class="text-txtWht">${r.Mileage || '-'}</p>
            </div>
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Location</p>
              <p class="text-txtWht">${r.VehicleSide || '-'}</p>
            </div>
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Cost</p>
              <p class="text-txtWht">${r.Cost ? '$' + r.Cost : '-'}</p>
            </div>
            ${r.Notes_Issues ? `
            <div class="col-span-2">
              <p class="text-gray-400 text-xs uppercase tracking-wide">Notes</p>
              <p class="text-txtWht">${r.Notes_Issues}</p>
            </div>` : ''}
            ${r.Service_Provider ? `
            <div class="col-span-2 border-t border-gray-600 pt-2 mt-1">
              <p class="text-gray-400 text-xs uppercase tracking-wide">Service</p>
              <p class="text-txtWht">${r.Service_Provider}${r.SPLocation ? ' — ' + r.SPLocation : ''}</p>
            </div>` : ''}
          </div>
        </div>`).join('');

        const mTable = `
        <table class="w-full text-txtWht text-sm border-collapse">
          <thead>
            <tr class="border-b border-logoClr text-logoClr">
              <th class="text-left p-2 whitespace-nowrap">Date</th>
              <th class="text-left p-2 whitespace-nowrap">Vehicle</th>
              <th class="text-left p-2">Type</th>
              <th class="text-left p-2 whitespace-nowrap">Mileage</th>
              <th class="text-left p-2">Location</th>
              <th class="text-left p-2">Notes</th>
              <th class="text-left p-2 whitespace-nowrap">Cost</th>
            </tr>
          </thead>
          <tbody>
            ${maintenance.map(r => `
            <tr class="border-b border-gray-700 hover:bg-gray-700">
              <td class="p-2 whitespace-nowrap">${r.Date || '-'}</td>
              <td class="p-2 whitespace-nowrap">${getVehicleLabel(r.Vehicle)}</td>
              <td class="p-2">${r.MainenanceRepairs || '-'}</td>
              <td class="p-2">${r.Mileage || '-'}</td>
              <td class="p-2">${r.VehicleSide || '-'}</td>
              <td class="p-2">${r.Notes_Issues || '-'}</td>
              <td class="p-2 whitespace-nowrap">${r.Cost ? '$' + r.Cost : '-'}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;

        html += `
        <h3 class="text-logoClr text-lg sm:text-xl mb-3">Maintenance / Repair</h3>
        <div class="sm:hidden space-y-3 mb-8">${mCards}</div>
        <div class="hidden sm:block mb-8">${mTable}</div>`;
    }

    // ---- Parts ----
    if (parts.length > 0) {
        const pCards = parts.map(r => `
        <div class="border border-logoClrBlue rounded-lg p-4 bg-gray-900/50">
          <div class="flex justify-between items-center border-b border-gray-600 pb-2 mb-3">
            <span class="text-logoClrBlue font-semibold text-sm">${getVehicleLabel(r.vehicle)}</span>
            <span class="text-gray-400 text-xs">${r.date || '-'}</span>
          </div>
          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Part</p>
              <p class="text-txtWht">${r.parts || '-'}</p>
            </div>
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Brand</p>
              <p class="text-txtWht">${r.brand || '-'}</p>
            </div>
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Location</p>
              <p class="text-txtWht">${r.location || '-'}</p>
            </div>
            <div>
              <p class="text-gray-400 text-xs uppercase tracking-wide">Price</p>
              <p class="text-txtWht">${r.price ? '$' + r.price : '-'}</p>
            </div>
            <div class="col-span-2">
              <p class="text-gray-400 text-xs uppercase tracking-wide">Bought At</p>
              <p class="text-txtWht">${r.purchased || '-'}</p>
            </div>
          </div>
        </div>`).join('');

        const pTable = `
        <table class="w-full text-txtWht text-sm border-collapse">
          <thead>
            <tr class="border-b border-logoClrBlue text-logoClrBlue">
              <th class="text-left p-2 whitespace-nowrap">Date</th>
              <th class="text-left p-2 whitespace-nowrap">Vehicle</th>
              <th class="text-left p-2">Part</th>
              <th class="text-left p-2">Brand</th>
              <th class="text-left p-2">Location</th>
              <th class="text-left p-2 whitespace-nowrap">Price</th>
              <th class="text-left p-2">Bought At</th>
            </tr>
          </thead>
          <tbody>
            ${parts.map(r => `
            <tr class="border-b border-gray-700 hover:bg-gray-700">
              <td class="p-2 whitespace-nowrap">${r.date || '-'}</td>
              <td class="p-2 whitespace-nowrap">${getVehicleLabel(r.vehicle)}</td>
              <td class="p-2">${r.parts || '-'}</td>
              <td class="p-2">${r.brand || '-'}</td>
              <td class="p-2">${r.location || '-'}</td>
              <td class="p-2 whitespace-nowrap">${r.price ? '$' + r.price : '-'}</td>
              <td class="p-2">${r.purchased || '-'}</td>
            </tr>`).join('')}
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
