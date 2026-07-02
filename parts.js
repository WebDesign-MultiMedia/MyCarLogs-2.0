document.querySelector('#partsFormtwo form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';

    try {
        const record = {
            ID: await nextSequentialId(SHEETDB_PARTS_URL),
            Date_Purchased: document.getElementById('partsDate').value,
            Parts_Name: document.getElementById('parts').value,
            Parts_Location: document.getElementById('partsVehicleSide').value,
            Parts_Brand: document.getElementById('brand').value,
            Price: document.getElementById('price').value,
            Purchased: document.getElementById('purchased').value,
            Vehicle: document.getElementById('partsVehicle').value
        };

        const res = await fetch(SHEETDB_PARTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [record] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const saved = JSON.parse(localStorage.getItem('partsRecords') || '[]');
        saved.push(record);
        localStorage.setItem('partsRecords', JSON.stringify(saved));

        e.target.reset();
        showFeedback('partsFormtwo', 'Parts record saved!');
    } catch (err) {
        showFeedback('partsFormtwo', 'Error saving record — check your connection and try again.');
        console.error('SheetDB error:', err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
    }
});
