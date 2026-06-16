document.querySelector('#partsFormtwo form').addEventListener('submit', (e) => {
    e.preventDefault();
    const record = {
        date: document.getElementById('partsDate').value,
        parts: document.getElementById('parts').value,
        brand: document.getElementById('brand').value,
        location: document.getElementById('partsVehicleSide').value,
        vehicle: document.getElementById('partsVehicle').value,
        price: document.getElementById('price').value,
        purchased: document.getElementById('purchased').value
    };
    const saved = JSON.parse(localStorage.getItem('partsRecords') || '[]');
    saved.push(record);
    localStorage.setItem('partsRecords', JSON.stringify(saved));
    e.target.reset();
    showFeedback('partsFormtwo', 'Parts record saved!');
});
