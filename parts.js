document.querySelector('#partsFormtwo form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = t('saving');

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

        const res = await apiFetch(SHEETDB_PARTS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: [record] })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const saved = JSON.parse(localStorage.getItem('partsRecords') || '[]');
        saved.push(record);
        localStorage.setItem('partsRecords', JSON.stringify(saved));

        e.target.reset();
        showFeedback('partsFormtwo', t('msg_parts_saved'));
    } catch (err) {
        showFeedback('partsFormtwo', t('msg_save_error'));
        console.error('SheetDB error:', err);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = t('submit');
    }
});
