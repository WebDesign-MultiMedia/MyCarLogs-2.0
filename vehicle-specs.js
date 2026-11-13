// ---- Full vehicle specifications from the VIN (NHTSA vPIC, free, no key) ----
// One lookup returns ~150 fields; the empty / "Not Applicable" ones are dropped and the rest
// are grouped for display. Results are cached in this browser per VIN, so opening the specs
// again is instant and works offline. Values come from NHTSA in English.
// Not in this database (needs paid data): oil capacity/type, tire size, fluid specs, paint code.

const SPEC_CACHE_PREFIX = 'vinSpecs:';
const SPEC_EMPTY = /^(|0|not applicable|null)$/i;

async function fetchVinSpecs(vin, { fresh = false } = {}) {
    const key = SPEC_CACHE_PREFIX + vin;
    if (!fresh) {
        try { const c = JSON.parse(localStorage.getItem(key)); if (c && c.ModelYear) return c; } catch { }
    }
    const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw = ((await res.json()).Results || [])[0] || {};
    const specs = {};
    Object.entries(raw).forEach(([k, v]) => { if (v !== null && !SPEC_EMPTY.test(String(v).trim())) specs[k] = String(v).trim(); });
    if (specs.ModelYear) { try { localStorage.setItem(key, JSON.stringify(specs)); } catch { } }
    return specs;
}

const specTc = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\bUsa\b/, 'USA').replace(/\bLlc\b/, 'LLC');
const specNum = (v, d = 0) => { const n = parseFloat(v); return isNaN(n) ? '' : n.toLocaleString('en-US', { maximumFractionDigits: d }); };
const specRange = (a, b, unit) => a ? (b && b !== a ? `${a}–${b}${unit}` : `${a}${unit}`) : '';
const specJoin = (parts, sep = ' · ') => parts.filter(Boolean).join(sep);

function cylinderText(s) {
    if (!s.EngineCylinders) return '';
    const layout = /^V/i.test(s.EngineConfiguration || '') ? 'V' : /in-?line|straight/i.test(s.EngineConfiguration || '') ? 'Inline-' : /flat|horizontal/i.test(s.EngineConfiguration || '') ? 'Flat-' : '';
    return layout ? `${layout}${s.EngineCylinders}` : s.EngineCylinders;
}

// Each row: label {en, es} + a function that formats the value from the specs (empty = hidden).
const SPEC_GROUPS = [
    { icon: 'fa-car-side', title: { en: 'Vehicle', es: 'Vehículo' }, rows: [
        [{ en: 'Year', es: 'Año' }, s => s.ModelYear],
        [{ en: 'Make', es: 'Marca' }, s => specTc(s.Make)],
        [{ en: 'Model', es: 'Modelo' }, s => s.Model],
        [{ en: 'Trim', es: 'Versión' }, s => specJoin([s.Trim, s.Trim2], ' / ')],
        [{ en: 'Series', es: 'Serie' }, s => specJoin([s.Series, s.Series2], ' / ')],
        [{ en: 'Body style', es: 'Carrocería' }, s => s.BodyClass],
        [{ en: 'Cab / bed', es: 'Cabina / caja' }, s => specJoin([s.BodyCabType, s.BedType, s.BedLengthIN && s.BedLengthIN + ' in'])],
        [{ en: 'Doors', es: 'Puertas' }, s => s.Doors],
        [{ en: 'Seats', es: 'Asientos' }, s => specJoin([s.Seats, s.SeatRows && `${s.SeatRows} rows`])],
        [{ en: 'Vehicle type', es: 'Tipo de vehículo' }, s => specTc(s.VehicleType)],
        [{ en: 'Manufacturer', es: 'Fabricante' }, s => specTc(s.Manufacturer)],
        [{ en: 'Built in', es: 'Fabricado en' }, s => specJoin([specTc(s.PlantCity), specTc(s.PlantState), specTc(s.PlantCountry)], ', ')],
        [{ en: 'Base price', es: 'Precio base' }, s => s.BasePrice && '$' + specNum(s.BasePrice)]
    ] },
    { icon: 'fa-gear', title: { en: 'Engine', es: 'Motor' }, rows: [
        [{ en: 'Displacement', es: 'Cilindrada' }, s => s.DisplacementL && `${parseFloat(s.DisplacementL).toFixed(1)} L` + (s.DisplacementCC ? ` (${specNum(s.DisplacementCC)} cc${s.DisplacementCI ? ' / ' + specNum(s.DisplacementCI) + ' ci' : ''})` : '')],
        [{ en: 'Cylinders', es: 'Cilindros' }, s => cylinderText(s)],
        [{ en: 'Horsepower', es: 'Caballos de fuerza' }, s => specJoin([specRange(s.EngineHP, s.EngineHP_to, ' hp'), s.EngineKW && specNum(s.EngineKW) + ' kW'])],
        [{ en: 'Engine code', es: 'Código de motor' }, s => s.EngineModel],
        [{ en: 'Engine maker', es: 'Fabricante del motor' }, s => specTc(s.EngineManufacturer)],
        [{ en: 'Valve train', es: 'Distribución' }, s => s.ValveTrainDesign],
        [{ en: 'Fuel injection', es: 'Inyección' }, s => s.FuelInjectionType],
        [{ en: 'Turbo', es: 'Turbo' }, s => s.Turbo],
        [{ en: 'Fuel', es: 'Combustible' }, s => specJoin([s.FuelTypePrimary, s.FuelTypeSecondary], ' / ')],
        [{ en: 'Electrification', es: 'Electrificación' }, s => s.ElectrificationLevel],
        [{ en: 'Battery', es: 'Batería' }, s => specJoin([s.BatteryType, specRange(s.BatteryKWh, s.BatteryKWh_to, ' kWh'), specRange(s.BatteryV, s.BatteryV_to, ' V')])],
        [{ en: 'Cooling', es: 'Enfriamiento' }, s => s.CoolingType],
        [{ en: 'Top speed', es: 'Velocidad máxima' }, s => s.TopSpeedMPH && s.TopSpeedMPH + ' mph'],
        [{ en: 'Other', es: 'Otros' }, s => s.OtherEngineInfo]
    ] },
    { icon: 'fa-gears', title: { en: 'Drivetrain', es: 'Tren motriz' }, rows: [
        [{ en: 'Transmission', es: 'Transmisión' }, s => specJoin([s.TransmissionSpeeds && `${s.TransmissionSpeeds}-speed`, s.TransmissionStyle], ' ')],
        [{ en: 'Drive type', es: 'Tracción' }, s => s.DriveType],
        [{ en: 'Axles', es: 'Ejes' }, s => specJoin([s.Axles, s.AxleConfiguration])]
    ] },
    { icon: 'fa-ruler-combined', title: { en: 'Chassis & size', es: 'Chasis y medidas' }, rows: [
        [{ en: 'Brakes', es: 'Frenos' }, s => specJoin([s.BrakeSystemType, s.BrakeSystemDesc])],
        [{ en: 'Wheelbase', es: 'Distancia entre ejes' }, s => specRange(s.WheelBaseShort, s.WheelBaseLong, ' in')],
        [{ en: 'Track width', es: 'Ancho de vía' }, s => s.TrackWidth && s.TrackWidth + ' in'],
        [{ en: 'Wheel size', es: 'Tamaño de rueda' }, s => s.WheelSizeFront && (s.WheelSizeRear && s.WheelSizeRear !== s.WheelSizeFront ? `${s.WheelSizeFront} in front / ${s.WheelSizeRear} in rear` : s.WheelSizeFront + ' in')],
        [{ en: 'Wheels', es: 'Ruedas' }, s => s.Wheels],
        [{ en: 'Curb weight', es: 'Peso en vacío' }, s => s.CurbWeightLB && specNum(s.CurbWeightLB) + ' lb'],
        [{ en: 'Weight rating (GVWR)', es: 'Peso bruto (GVWR)' }, s => s.GVWR],
        [{ en: 'Towing rating (GCWR)', es: 'Peso combinado (GCWR)' }, s => s.GCWR],
        [{ en: 'Steering', es: 'Volante' }, s => s.SteeringLocation],
        [{ en: 'Windows', es: 'Ventanas' }, s => s.Windows]
    ] },
    { icon: 'fa-shield-halved', title: { en: 'Safety', es: 'Seguridad' }, rows: [
        [{ en: 'Front airbags', es: 'Bolsas de aire frontales' }, s => s.AirBagLocFront],
        [{ en: 'Side airbags', es: 'Bolsas de aire laterales' }, s => s.AirBagLocSide],
        [{ en: 'Curtain airbags', es: 'Bolsas de aire de cortina' }, s => s.AirBagLocCurtain],
        [{ en: 'Knee airbags', es: 'Bolsas de aire de rodilla' }, s => s.AirBagLocKnee],
        [{ en: 'Seat cushion airbags', es: 'Bolsas de aire en asiento' }, s => s.AirBagLocSeatCushion],
        [{ en: 'Seat belts', es: 'Cinturones' }, s => specJoin([s.SeatBeltsAll, s.Pretensioner && `Pretensioner: ${s.Pretensioner}`])],
        [{ en: 'ABS', es: 'ABS' }, s => s.ABS],
        [{ en: 'Stability control (ESC)', es: 'Control de estabilidad (ESC)' }, s => s.ESC],
        [{ en: 'Traction control', es: 'Control de tracción' }, s => s.TractionControl],
        [{ en: 'Tire pressure monitor', es: 'Monitor de presión de llantas' }, s => s.TPMS],
        [{ en: 'Backup camera', es: 'Cámara de reversa' }, s => s.RearVisibilitySystem],
        [{ en: 'Forward collision warning', es: 'Alerta de colisión frontal' }, s => s.ForwardCollisionWarning],
        [{ en: 'Automatic emergency braking', es: 'Frenado automático de emergencia' }, s => s.CIB],
        [{ en: 'Pedestrian braking', es: 'Frenado por peatones' }, s => s.PedestrianAutomaticEmergencyBraking],
        [{ en: 'Lane departure warning', es: 'Alerta de cambio de carril' }, s => s.LaneDepartureWarning],
        [{ en: 'Lane keeping', es: 'Asistente de carril' }, s => s.LaneKeepSystem],
        [{ en: 'Blind spot monitor', es: 'Monitor de punto ciego' }, s => s.BlindSpotMon],
        [{ en: 'Rear cross traffic alert', es: 'Alerta de tráfico cruzado' }, s => s.RearCrossTrafficAlert],
        [{ en: 'Adaptive cruise control', es: 'Control crucero adaptativo' }, s => s.AdaptiveCruiseControl],
        [{ en: 'Parking assist', es: 'Asistente de estacionamiento' }, s => s.ParkAssist],
        [{ en: 'Daytime running lights', es: 'Luces diurnas' }, s => s.DaytimeRunningLight],
        [{ en: 'Headlights', es: 'Faros' }, s => s.LowerBeamHeadlampLightSource],
        [{ en: 'Keyless ignition', es: 'Encendido sin llave' }, s => s.KeylessIgnition],
        [{ en: 'Other', es: 'Otros' }, s => s.OtherRestraintSystemInfo]
    ] }
];

const specLabel = l => l[getLang()] || l.en;

// Grouped spec sheet. Groups with no data are left out.
function specsHtml(specs) {
    const groups = SPEC_GROUPS.map(g => {
        const rows = g.rows.map(([label, fmt]) => { let v = ''; try { v = fmt(specs) || ''; } catch { } return v ? [label, v] : null; }).filter(Boolean);
        if (!rows.length) return '';
        return `<section class="flex flex-col gap-2">
          <h4 class="text-logoClr text-xs font-semibold uppercase tracking-wide flex items-center gap-2"><i class="fa-solid ${g.icon}"></i>${specLabel(g.title)}</h4>
          <dl class="rounded-xl border border-white/5 bg-gray-950/50 divide-y divide-white/5">${rows.map(([label, v]) => `
            <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-sm">
              <dt class="text-gray-400">${escapeHtml(specLabel(label))}</dt>
              <dd class="text-txtWht break-words">${escapeHtml(v)}</dd>
            </div>`).join('')}</dl>
        </section>`;
    }).filter(Boolean).join('');
    const note = specs.ErrorCode && !/^0\b/.test(specs.ErrorCode) && specs.ErrorText
        ? `<p class="text-amber-200 text-xs">${escapeHtml(specs.ErrorText)}</p>` : '';
    return `${note}${groups || `<p class="text-gray-400 text-sm">${t('vh_specs_empty')}</p>`}
      <p class="text-gray-500 text-[11px]">${t('vh_specs_source')}</p>`;
}

// Modal from the Timeline ("Full specs" next to the vehicle details).
async function openSpecsModal(code) {
    const v = getVehicles().find(x => x.value === code);
    if (!v) return;
    const head = `<div class="flex items-start justify-between gap-3">
        <div><h2 class="text-txtWht text-lg font-semibold">${escapeHtml(v.label)}</h2>
          <p class="text-gray-400 text-xs mt-0.5">${escapeHtml(vehicleSpecLine(v))}${v.vin ? ` · <span class="font-mono">VIN ${escapeHtml(v.vin)}</span>` : ''}</p></div>
        <button type="button" data-tl-close class="text-gray-400 hover:text-txtWht text-2xl leading-none" aria-label="Close">&times;</button></div>`;
    if (!v.vin) { openTlModal(head + `<p class="text-gray-400 text-sm">${t('vh_specs_need_vin')}</p>`); return; }
    openTlModal(head + `<p class="text-gray-400 text-sm animate-pulse">${t('vh_specs_loading')}</p>`);
    try {
        const specs = await fetchVinSpecs(v.vin);
        openTlModal(head + specsHtml(specs));
    } catch (e) {
        console.error('Specs error:', e);
        openTlModal(head + `<p class="text-red-300 text-sm">${t('vh_specs_error')}</p>`);
    }
}

// Inline in the vehicle edit form: <details> that loads the first time it's opened.
async function loadSpecsInto(el, vin) {
    el.innerHTML = `<p class="text-gray-400 text-sm animate-pulse">${t('vh_specs_loading')}</p>`;
    try { el.innerHTML = specsHtml(await fetchVinSpecs(vin)); }
    catch (e) { console.error('Specs error:', e); el.innerHTML = `<p class="text-red-300 text-sm">${t('vh_specs_error')}</p>`; }
}

document.addEventListener('click', e => {
    const b = e.target.closest('[data-vh-specs]');
    if (b) openSpecsModal(b.dataset.vhSpecs);
});
document.addEventListener('toggle', e => {
    const d = e.target;
    if (d.id === 'vhSpecs' && d.open && !d.dataset.loaded) { d.dataset.loaded = '1'; loadSpecsInto(d.querySelector('[data-specs-body]'), d.dataset.vin); }
}, true);
