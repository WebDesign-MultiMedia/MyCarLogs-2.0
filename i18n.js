// ---- i18n: English / Spanish ----
// Loaded before ManRep.js / parts.js. Dynamic re-renders in those files are
// guarded with `typeof fn === 'function'` since they may not exist yet the
// first time applyLanguage() runs (on initial page load, before those scripts execute).
const translations = {
    en: {
        nav_log_title: 'Maintenance / Repair',
        nav_parts_title: 'Parts',
        nav_records_title: 'Records',
        nav_timeline_title: 'Mileage Timeline',
        tl_title: 'Mileage Timeline',
        tl_subtitle: 'Every service, by odometer reading',
        tl_current_mileage: 'Current Mileage',
        tl_log_service: '+ Log Service',
        tl_stat_services: 'Service Stops',
        tl_stat_tracked: 'Miles Tracked',
        tl_stat_spent: 'Total Spent',
        tl_you_are_here: 'Latest reading',
        tl_mi_service: '{mi} Mile Service',
        tl_more: '+{n} more · tap to view',
        tl_details: 'Details',
        tl_less: 'Less',
        tl_cost: 'Cost',
        tl_no_cost: 'No cost recorded',
        tl_gap: '{mi} mi earlier',
        tl_days: '{n} days',
        tl_oil_since: '<b class="text-amber-200">{mi} mi</b> since last oil change',
        tl_oil_first: 'First oil change on record',
        tl_search_placeholder: 'Search parts, notes, shop…',
        tl_quick_oil: 'Oil changes',
        tl_quick_brakes: 'Brakes',
        tl_quick_tires: 'Tires & wheels',
        tl_quick_trans: 'Transmission',
        tl_quick_battery: 'Battery & starting',
        tl_results: '{n} of {total} service stops',
        tl_no_match: 'No services match these filters.',
        tl_clear: 'Clear',
        tl_empty: 'No services with mileage logged for this vehicle yet.',
        tl_no_vehicles: 'Add a vehicle to see its timeline.',
        tl_undated: '{n} record(s) without mileage are not shown.',

        m_title: 'Maintenance & Repair',
        m_subtitle: 'Log service work and keep your history up to date',
        p_title: 'Parts',
        p_subtitle: "Track parts you've bought and where they went",

        label_date: 'Date',
        label_mileage: 'Mileage',
        label_type: 'Type',
        label_location: 'Location',
        label_vehicle: 'Vehicle',
        label_parts_replaced: 'Parts Replaced',
        label_notes: 'Notes / Issues',
        label_service_provider: 'Service Provider',
        label_address: 'Address',
        label_labor_cost: 'Labor Cost',
        label_part_name: 'Part Name',
        label_brand: 'Brand',
        label_install_location: 'Install Location',
        label_price: 'Price',
        label_purchased_at: 'Purchased At',

        placeholder_mileage: 'Enter Mileage',
        placeholder_parts_name: 'Name of the parts',
        placeholder_notes: 'Issues, concerns, reminders...',
        placeholder_service_provider: 'Who did the job?',
        placeholder_address: 'Shop address',
        placeholder_amount: '$ amount',
        placeholder_part_name: 'e.g. Brake pads',
        placeholder_brand: 'e.g. Bosch, ACDelco',
        placeholder_purchased_at: 'Amazon, AutoZone, Advance Auto...',

        opt_choose_type: '-- choose type --',
        opt_maintenance: 'Maintenance',
        opt_repair: 'Repair',
        opt_inspection: 'Inspection',
        opt_purchase: 'Purchase',
        opt_choose_location: 'Select a location',
        grp_corners: 'Wheels & Corners',
        grp_powertrain: 'Powertrain',
        grp_body: 'Body & Systems',
        opt_front_driver: 'Front – Driver Side',
        opt_front_pass: 'Front – Passenger Side',
        opt_rear_driver: 'Rear – Driver Side',
        opt_rear_pass: 'Rear – Passenger Side',
        opt_front_both: 'Front – Both Sides',
        opt_rear_both: 'Rear – Both Sides',
        opt_front_rear: 'Front & Rear',
        opt_all_corners: 'All Four Corners',
        opt_engine: 'Engine',
        opt_transmission: 'Transmission',
        opt_engine_trans: 'Engine & Transmission',
        opt_exhaust: 'Exhaust System',
        opt_interior: 'Interior / Cabin',
        opt_exterior: 'Exterior / Body',
        opt_electrical: 'Electrical System',
        opt_entire_vehicle: 'Entire Vehicle',
        opt_choose_car: '-- choose a car --',

        add_remove_vehicle: '+ Add / Remove Vehicle',
        add_service_info: '+ Add Service Info',
        hide_service_info: '- Hide Service Info',
        submit: 'Submit',
        saving: 'Saving...',

        records_title: 'Records',
        refresh: 'Refresh',
        filter_time: 'Time',
        filter_vehicle: 'Vehicle',
        filter_type: 'Type',
        filter_all: 'All',
        filter_last30: 'Last 30 Days',
        filter_last90: 'Last 90 Days',
        filter_type_maintenance: 'Maintenance / Repair',
        filter_type_parts: 'Parts',

        loading_records: 'Loading records...',
        could_not_load: 'Could not load records — check your connection.',
        no_records_match: 'No records match the selected filters.',
        section_maintenance: 'Maintenance / Repair',
        section_parts: 'Parts',

        col_date: 'Date',
        col_vehicle: 'Vehicle',
        col_type: 'Type',
        col_mileage: 'Mileage',
        col_location: 'Location',
        col_notes: 'Notes',
        col_cost: 'Cost',
        col_parts: 'Parts',
        col_actions: 'Actions',
        col_part: 'Part',
        col_brand: 'Brand',
        col_price: 'Price',
        col_bought_at: 'Bought At',
        card_notes: 'Notes',
        card_service: 'Service',

        action_edit: 'Edit',
        action_delete: 'Delete',
        action_save: 'Save',
        action_cancel: 'Cancel',
        no_id: 'No ID',
        no_id_title: 'Add an ID column value in the sheet to enable editing',

        delete_confirm_msg: 'Are you sure you want to delete this information?',

        manage_vehicles: 'Manage Vehicles',
        new_vehicle_placeholder: 'e.g. Toyota Camry 2020',
        add: 'Add',
        remove_title: 'Remove',
        no_vehicles: 'No vehicles added yet.',

        msg_maintenance_saved: 'Maintenance record saved!',
        msg_save_error: 'Error saving record — check your connection and try again.',
        msg_parts_saved: 'Parts record saved!',
        msg_delete_error: 'Could not delete record — check your connection and try again.',
        msg_update_error: 'Could not save changes — check your connection and try again.'
    },
    es: {
        nav_log_title: 'Mantenimiento / Reparación',
        nav_parts_title: 'Piezas',
        nav_records_title: 'Registros',
        nav_timeline_title: 'Historial de Millaje',
        tl_title: 'Historial de Millaje',
        tl_subtitle: 'Cada servicio, según el odómetro',
        tl_current_mileage: 'Millaje Actual',
        tl_log_service: '+ Registrar Servicio',
        tl_stat_services: 'Servicios',
        tl_stat_tracked: 'Millas Registradas',
        tl_stat_spent: 'Gasto Total',
        tl_you_are_here: 'Última lectura',
        tl_mi_service: 'Servicio de {mi} millas',
        tl_more: '+{n} más · toca para ver',
        tl_details: 'Detalles',
        tl_less: 'Menos',
        tl_cost: 'Costo',
        tl_no_cost: 'Sin costo registrado',
        tl_gap: '{mi} mi antes',
        tl_days: '{n} días',
        tl_oil_since: '<b class="text-amber-200">{mi} mi</b> desde el último cambio de aceite',
        tl_oil_first: 'Primer cambio de aceite registrado',
        tl_search_placeholder: 'Buscar piezas, notas, taller…',
        tl_quick_oil: 'Cambios de aceite',
        tl_quick_brakes: 'Frenos',
        tl_quick_tires: 'Llantas y ruedas',
        tl_quick_trans: 'Transmisión',
        tl_quick_battery: 'Batería y arranque',
        tl_results: '{n} de {total} servicios',
        tl_no_match: 'Ningún servicio coincide con estos filtros.',
        tl_clear: 'Limpiar',
        tl_empty: 'Aún no hay servicios con millaje para este vehículo.',
        tl_no_vehicles: 'Agrega un vehículo para ver su línea de tiempo.',
        tl_undated: '{n} registro(s) sin millaje no se muestran.',

        m_title: 'Mantenimiento y Reparación',
        m_subtitle: 'Registra el trabajo de servicio y mantén tu historial actualizado',
        p_title: 'Piezas',
        p_subtitle: 'Registra las piezas que has comprado y dónde se usaron',

        label_date: 'Fecha',
        label_mileage: 'Kilometraje',
        label_type: 'Tipo',
        label_location: 'Ubicación',
        label_vehicle: 'Vehículo',
        label_parts_replaced: 'Piezas Reemplazadas',
        label_notes: 'Notas / Problemas',
        label_service_provider: 'Proveedor de Servicio',
        label_address: 'Dirección',
        label_labor_cost: 'Costo de Mano de Obra',
        label_part_name: 'Nombre de la Pieza',
        label_brand: 'Marca',
        label_install_location: 'Ubicación de Instalación',
        label_price: 'Precio',
        label_purchased_at: 'Comprado En',

        placeholder_mileage: 'Ingresa el kilometraje',
        placeholder_parts_name: 'Nombre de las piezas',
        placeholder_notes: 'Problemas, inquietudes, recordatorios...',
        placeholder_service_provider: '¿Quién hizo el trabajo?',
        placeholder_address: 'Dirección del taller',
        placeholder_amount: '$ monto',
        placeholder_part_name: 'ej. Pastillas de freno',
        placeholder_brand: 'ej. Bosch, ACDelco',
        placeholder_purchased_at: 'Amazon, AutoZone, Advance Auto...',

        opt_choose_type: '-- elige el tipo --',
        opt_maintenance: 'Mantenimiento',
        opt_repair: 'Reparación',
        opt_inspection: 'Inspección',
        opt_purchase: 'Compra',
        opt_choose_location: 'Selecciona una ubicación',
        grp_corners: 'Ruedas y Esquinas',
        grp_powertrain: 'Tren Motriz',
        grp_body: 'Carrocería y Sistemas',
        opt_front_driver: 'Delantero – Lado del Conductor',
        opt_front_pass: 'Delantero – Lado del Pasajero',
        opt_rear_driver: 'Trasero – Lado del Conductor',
        opt_rear_pass: 'Trasero – Lado del Pasajero',
        opt_front_both: 'Delantero – Ambos Lados',
        opt_rear_both: 'Trasero – Ambos Lados',
        opt_front_rear: 'Delantero y Trasero',
        opt_all_corners: 'Las Cuatro Esquinas',
        opt_engine: 'Motor',
        opt_transmission: 'Transmisión',
        opt_engine_trans: 'Motor y Transmisión',
        opt_exhaust: 'Sistema de Escape',
        opt_interior: 'Interior / Cabina',
        opt_exterior: 'Exterior / Carrocería',
        opt_electrical: 'Sistema Eléctrico',
        opt_entire_vehicle: 'Vehículo Completo',
        opt_choose_car: '-- elige un auto --',

        add_remove_vehicle: '+ Agregar / Quitar Vehículo',
        add_service_info: '+ Agregar Información de Servicio',
        hide_service_info: '- Ocultar Información de Servicio',
        submit: 'Enviar',
        saving: 'Guardando...',

        records_title: 'Registros',
        refresh: 'Actualizar',
        filter_time: 'Tiempo',
        filter_vehicle: 'Vehículo',
        filter_type: 'Tipo',
        filter_all: 'Todos',
        filter_last30: 'Últimos 30 Días',
        filter_last90: 'Últimos 90 Días',
        filter_type_maintenance: 'Mantenimiento / Reparación',
        filter_type_parts: 'Piezas',

        loading_records: 'Cargando registros...',
        could_not_load: 'No se pudieron cargar los registros — revisa tu conexión.',
        no_records_match: 'Ningún registro coincide con los filtros seleccionados.',
        section_maintenance: 'Mantenimiento / Reparación',
        section_parts: 'Piezas',

        col_date: 'Fecha',
        col_vehicle: 'Vehículo',
        col_type: 'Tipo',
        col_mileage: 'Kilometraje',
        col_location: 'Ubicación',
        col_notes: 'Notas',
        col_cost: 'Costo',
        col_parts: 'Piezas',
        col_actions: 'Acciones',
        col_part: 'Pieza',
        col_brand: 'Marca',
        col_price: 'Precio',
        col_bought_at: 'Comprado En',
        card_notes: 'Notas',
        card_service: 'Servicio',

        action_edit: 'Editar',
        action_delete: 'Eliminar',
        action_save: 'Guardar',
        action_cancel: 'Cancelar',
        no_id: 'Sin ID',
        no_id_title: 'Agrega un valor en la columna ID de la hoja para habilitar la edición',

        delete_confirm_msg: '¿Estás seguro de que deseas eliminar esta información?',

        manage_vehicles: 'Administrar Vehículos',
        new_vehicle_placeholder: 'ej. Toyota Camry 2020',
        add: 'Agregar',
        remove_title: 'Eliminar',
        no_vehicles: 'Aún no se han agregado vehículos.',

        msg_maintenance_saved: '¡Registro de mantenimiento guardado!',
        msg_save_error: 'Error al guardar el registro — revisa tu conexión e intenta de nuevo.',
        msg_parts_saved: '¡Registro de pieza guardado!',
        msg_delete_error: 'No se pudo eliminar el registro — revisa tu conexión e intenta de nuevo.',
        msg_update_error: 'No se pudieron guardar los cambios — revisa tu conexión e intenta de nuevo.'
    }
};

function getLang() {
    return localStorage.getItem('lang') || 'en';
}

function t(key) {
    const lang = getLang();
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
}

function applyLanguage() {
    const lang = getLang();
    document.documentElement.lang = lang;

    document.querySelectorAll('.lang-btn').forEach(btn => {
        const active = btn.dataset.lang === lang;
        btn.classList.toggle('bg-logoClr', active);
        btn.classList.toggle('text-gray-900', active);
        btn.classList.toggle('text-gray-400', !active);
    });

    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        el.placeholder = t(el.dataset.i18nPlaceholder);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = t(el.dataset.i18nTitle);
    });

    // These functions live in ManRep.js, which may not have executed yet the
    // first time applyLanguage() runs on initial load — safe to skip then,
    // since ManRep.js's own startup will render with the right language already.
    if (typeof renderFormOptions === 'function') renderFormOptions();
    if (typeof renderTimeline === 'function') renderTimeline();
    if (typeof updateServiceToggleLabel === 'function') updateServiceToggleLabel();
    if (typeof renderVehicleFilters === 'function') renderVehicleFilters();
    if (typeof vehicleModal !== 'undefined' && vehicleModal && !vehicleModal.classList.contains('hidden') && typeof renderVehicleManagerList === 'function') {
        renderVehicleManagerList();
    }
    if (typeof applyFiltersAndRender === 'function' && typeof allMaintenanceRecords !== 'undefined' &&
        (allMaintenanceRecords.length || allPartsRecords.length)) {
        applyFiltersAndRender();
    }
}

function setLang(lang) {
    localStorage.setItem('lang', lang);
    applyLanguage();
}

document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => setLang(btn.dataset.lang));
});

applyLanguage();
