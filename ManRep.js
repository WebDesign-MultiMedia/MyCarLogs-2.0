const serviceForm = document.getElementById("Service");
serviceForm.style.display = 'none';

const carWrenchIcon = document.querySelector('.fa-car-wrench');
const serviceInputs = serviceForm.querySelectorAll("input");

carWrenchIcon.addEventListener('click', () => {
    const isHidden = serviceForm.style.display === 'none';
    serviceForm.style.display = isHidden ? 'block' : 'none';
    carWrenchIcon.style.color = isHidden ? 'red' : '';
    serviceInputs.forEach(input => {
        input.style.border = isHidden ? '2px solid red' : '';
    });
});

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

navClipboard.addEventListener('click', () => showSection('log'));
navGears.addEventListener('click', () => showSection('parts'));
navSpreadsheet.addEventListener('click', () => {
    showSection('records');
    renderRecords();
});

// ---- Maintenance/Repair form submit ----
document.querySelector('#logForm form').addEventListener('submit', (e) => {
    e.preventDefault();
    const record = {
        date: document.getElementById('date').value,
        mileage: document.getElementById('mileage').value,
        type: document.getElementById('type').value,
        location: document.getElementById('VehicleSide').value,
        vehicle: document.getElementById('vehicle').value,
        partCount: document.getElementById('partCount').value,
        notes: document.getElementById('Notes_Issues').value,
        service: document.getElementById('service').value,
        address: document.getElementById('address').value,
        cost: document.getElementById('cost').value
    };
    const saved = JSON.parse(localStorage.getItem('maintenanceRecords') || '[]');
    saved.push(record);
    localStorage.setItem('maintenanceRecords', JSON.stringify(saved));
    e.target.reset();
    serviceForm.style.display = 'none';
    carWrenchIcon.style.color = '';
    serviceInputs.forEach(i => i.style.border = '');
    showFeedback('logForm', 'Maintenance record saved!');
});

// ---- Records display ----
function renderRecords() {
    const maintenance = JSON.parse(localStorage.getItem('maintenanceRecords') || '[]');
    const parts = JSON.parse(localStorage.getItem('partsRecords') || '[]');
    const container = document.getElementById('recordsContent');

    if (maintenance.length === 0 && parts.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-8">No records saved yet.</p>';
        return;
    }

    let html = '';

    if (maintenance.length > 0) {
        html += `
        <h3 class="text-logoClr text-xl mb-3">Maintenance / Repair</h3>
        <div class="overflow-x-auto mb-8">
          <table class="w-full text-txtWht text-sm border-collapse">
            <thead>
              <tr class="border-b border-logoClr text-logoClr">
                <th class="text-left p-2">Date</th>
                <th class="text-left p-2">Vehicle</th>
                <th class="text-left p-2">Type</th>
                <th class="text-left p-2">Mileage</th>
                <th class="text-left p-2">Location</th>
                <th class="text-left p-2">Notes</th>
                <th class="text-left p-2">Cost</th>
              </tr>
            </thead>
            <tbody>
              ${[...maintenance].reverse().map(r => `
              <tr class="border-b border-gray-700 hover:bg-gray-700">
                <td class="p-2">${r.date || '-'}</td>
                <td class="p-2">${r.vehicle || '-'}</td>
                <td class="p-2">${r.type || '-'}</td>
                <td class="p-2">${r.mileage || '-'}</td>
                <td class="p-2">${r.location || '-'}</td>
                <td class="p-2">${r.notes || '-'}</td>
                <td class="p-2">${r.cost ? '$' + r.cost : '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    if (parts.length > 0) {
        html += `
        <h3 class="text-logoClrBlue text-xl mb-3">Parts</h3>
        <div class="overflow-x-auto">
          <table class="w-full text-txtWht text-sm border-collapse">
            <thead>
              <tr class="border-b border-logoClrBlue text-logoClrBlue">
                <th class="text-left p-2">Date</th>
                <th class="text-left p-2">Vehicle</th>
                <th class="text-left p-2">Part</th>
                <th class="text-left p-2">Brand</th>
                <th class="text-left p-2">Location</th>
                <th class="text-left p-2">Price</th>
                <th class="text-left p-2">Bought At</th>
              </tr>
            </thead>
            <tbody>
              ${[...parts].reverse().map(r => `
              <tr class="border-b border-gray-700 hover:bg-gray-700">
                <td class="p-2">${r.date || '-'}</td>
                <td class="p-2">${r.vehicle || '-'}</td>
                <td class="p-2">${r.parts || '-'}</td>
                <td class="p-2">${r.brand || '-'}</td>
                <td class="p-2">${r.location || '-'}</td>
                <td class="p-2">${r.price ? '$' + r.price : '-'}</td>
                <td class="p-2">${r.purchased || '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }

    container.innerHTML = html;
}

document.getElementById('clearRecords').addEventListener('click', () => {
    if (confirm('Clear all records? This cannot be undone.')) {
        localStorage.removeItem('maintenanceRecords');
        localStorage.removeItem('partsRecords');
        renderRecords();
    }
});

function showFeedback(sectionId, message) {
    const section = document.getElementById(sectionId);
    const existing = section.querySelector('.feedback-msg');
    if (existing) existing.remove();
    const msg = document.createElement('p');
    msg.className = 'feedback-msg text-center text-green-400 mt-4 text-lg';
    msg.textContent = message;
    section.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}
