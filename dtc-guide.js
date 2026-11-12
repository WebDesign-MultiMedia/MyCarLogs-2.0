// ---------- DTC guide ----------
// Explains a trouble code in plain language: what it means, which parts it points to,
// what to check first and the usual fix. Works from the code itself (standard OBD-II
// structure + common codes) and from the scanner's description (keyword rules), so it
// also covers manufacturer codes like Honda's "61-20" or TPMS "32".
// Text is bilingual: every entry has { en, es }. General guidance only.

const dgLang = () => (typeof getLang === 'function' ? getLang() : 'en') === 'es' ? 'es' : 'en';
const L = v => (v && typeof v === 'object' && !Array.isArray(v) ? (v[dgLang()] || v.en) : v);
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));

// Pulls the module name out of "X lost communication with Power Window Master Switch (...)".
function commTarget(desc) {
    const m = String(desc || '').match(/(?:lost communication|no communication|communication (?:lost|error|failure))\s+with\s+(?:the\s+)?([^()]+?)\s*(?:\(|$)/i);
    return m ? m[1].trim() : '';
}
const isComm = (code, desc) => /^U/i.test(code) || /lost communication|no communication|communication (failure|error|lost)|\b[FB]?-?CAN\b|bus off/i.test(desc);

// Model year from VIN position 10 (letters cycle every 30 years; position 7 tells which cycle).
function vinModelYear(vin) {
    vin = String(vin || '').toUpperCase();
    if (vin.length !== 17) return null;
    const c = vin[9];
    const letters = 'ABCDEFGHJKLMNPRSTVWXY';
    const now = new Date().getFullYear() + 1;
    let y = null;
    if (letters.includes(c)) y = (/[A-Z]/.test(vin[6]) ? 2010 : 1980) + letters.indexOf(c);
    else if (/[1-9]/.test(c)) y = (/[A-Z]/.test(vin[6]) ? 2030 : 2000) + +c;
    return y && y <= now ? y : null;
}

// ---------- Code structure (standard 5-character codes) ----------
const DG_LETTER = {
    P: { en: 'Powertrain (engine, fuel, emissions, transmission)', es: 'Tren motriz (motor, combustible, emisiones, transmisión)' },
    B: { en: 'Body (airbags, doors, windows, lights, climate, gauges)', es: 'Carrocería (bolsas de aire, puertas, ventanas, luces, clima, tablero)' },
    C: { en: 'Chassis (brakes/ABS, steering, suspension)', es: 'Chasis (frenos/ABS, dirección, suspensión)' },
    U: { en: 'Network (communication between control modules)', es: 'Red (comunicación entre módulos de control)' }
};
const DG_P_SUB = {
    0: { en: 'fuel/air & emission controls', es: 'controles de combustible/aire y emisiones' },
    1: { en: 'fuel & air metering', es: 'medición de aire y combustible' },
    2: { en: 'fuel & air metering (injectors)', es: 'medición de aire y combustible (inyectores)' },
    3: { en: 'ignition system / misfire', es: 'encendido / fallo de cilindro' },
    4: { en: 'auxiliary emission controls', es: 'controles auxiliares de emisiones' },
    5: { en: 'vehicle speed, idle control & inputs', es: 'velocidad, ralentí y entradas' },
    6: { en: 'engine computer & output circuits', es: 'computadora del motor y circuitos de salida' },
    7: { en: 'transmission', es: 'transmisión' }, 8: { en: 'transmission', es: 'transmisión' }, 9: { en: 'transmission', es: 'transmisión' },
    A: { en: 'hybrid / high-voltage system', es: 'sistema híbrido / alto voltaje' }
};
function decodeCodeStructure(code) {
    code = String(code || '').toUpperCase().trim();
    const m = code.match(/^([PBCU])([0-3])([0-9A-F])([0-9A-F]{2})$/);
    if (!m) return {
        en: 'Manufacturer code — numbers like this only have meaning together with the system they came from, so the scanner\'s description is the definition.',
        es: 'Código del fabricante — estos números solo tienen sentido junto con el sistema que los reportó; la descripción del escáner es su definición.'
    };
    const generic = m[2] === '0' || (m[1] === 'P' && m[2] === '2');
    const kind = generic
        ? { en: 'generic (same meaning on every car)', es: 'genérico (mismo significado en todos los autos)' }
        : { en: 'manufacturer-specific', es: 'específico del fabricante' };
    const sub = m[1] === 'P' && DG_P_SUB[m[3]] ? ` · ${L(DG_P_SUB[m[3]])}` : '';
    return { en: `${L(DG_LETTER[m[1]])} · ${L(kind)}${sub}`, es: `${L(DG_LETTER[m[1]])} · ${L(kind)}${sub}` };
}

// ---------- Location hints from the code/description ----------
function locationHint(code, desc) {
    const d = String(desc || '');
    const c = String(code || '').toUpperCase();
    const side = d.match(/\b(left|right|driver|passenger)['’]?s?[\s-]*(?:side\s*)?(front|rear)\b|\b(front|rear)[\s-]*(left|right|driver|passenger)\b/i);
    if (side) {
        const lr = (side[1] || side[4]).toLowerCase(), fr = (side[2] || side[3]).toLowerCase();
        const isDriver = lr === 'left' || lr === 'driver';
        const T = {
            front: { en: 'Front', es: 'Delantero' }, rear: { en: 'Rear', es: 'Trasero' },
            drv: { en: 'driver side (left, on US cars)', es: 'lado del conductor (izquierdo en autos de EE. UU.)' },
            pas: { en: 'passenger side (right, on US cars)', es: 'lado del pasajero (derecho en autos de EE. UU.)' }
        };
        return `${L(T[fr])} · ${L(isDriver ? T.drv : T.pas)}`;
    }
    const tire = d.match(/\bTire\s*([1-5])\b/i);
    if (tire) return fill(L({
        en: 'Tire {n} — the wheel position saved when the sensors were registered. Use the scanner\'s TPMS tool (trigger/activate) to see which wheel it is.',
        es: 'Llanta {n} — la posición guardada al registrar los sensores. Usa la herramienta TPMS del escáner (activar sensor) para ver qué rueda es.'
    }), { n: tire[1] });
    const cyl = d.match(/\bcylinder\s*(\d{1,2})\b/i) || c.match(/^P03(?:0([1-9])|1([0-2]))$/);
    if (cyl) return fill(L({ en: 'Cylinder {n}', es: 'Cilindro {n}' }), { n: cyl[1] || (cyl[2] ? '1' + cyl[2] : '') });
    let bank = (d.match(/\bbank\s*([12])\b/i) || [])[1], sensor = (d.match(/\bsensor\s*([123])\b/i) || [])[1];
    const o2 = c.match(/^P01([3-6])([0-9])$/);
    if (o2 && !bank) {
        const n = (+o2[1] - 3) * 10 + +o2[2]; // 0..39 within P0130–P0169
        const map = [[0, 5, 1, 1], [6, 11, 1, 2], [12, 16, 1, 3], [20, 25, 2, 1], [26, 31, 2, 2], [32, 36, 2, 3]];
        const hit = map.find(([a, b]) => n >= a && n <= b);
        if (hit) { bank = hit[2]; sensor = hit[3]; }
    }
    if (bank || sensor) return [
        bank ? fill(L({ en: 'Bank {n} (bank 1 = the side with cylinder 1)', es: 'Banco {n} (banco 1 = el lado del cilindro 1)' }), { n: bank }) : '',
        sensor ? fill(L({ en: 'sensor {n} ({w})', es: 'sensor {n} ({w})' }), { n: sensor, w: L(sensor === '1'
            ? { en: 'before the catalytic converter', es: 'antes del convertidor catalítico' }
            : { en: 'after the catalytic converter', es: 'después del convertidor catalítico' }) }) : ''
    ].filter(Boolean).join(' · ');
    return '';
}

// ---------- Rules (first match wins) ----------
// test(code, desc, system) → boolean. Text fields can use {module} (from "lost communication with X").
const range = (code, a, b) => { const m = String(code).toUpperCase().match(/^P(\d{4})$/); return !!m && +m[1] >= a && +m[1] <= b; };
const DTC_RULES = [
    {
        id: 'srs_belt', sev: 'safety',
        test: (c, d) => /seat ?belt|buckle/i.test(d),
        means: { en: 'The airbag computer sees a problem in a seat-belt buckle switch circuit — it can\'t tell if the belt is latched.', es: 'La computadora de bolsas de aire ve un problema en el circuito del interruptor de la hebilla — no sabe si el cinturón está abrochado.' },
        parts: { en: ['Seat-belt buckle switch (buckle assembly)', 'Connector and wiring under the seat', 'SRS (airbag) control unit'], es: ['Interruptor de la hebilla (conjunto de hebilla)', 'Conector y cables debajo del asiento', 'Unidad de control SRS (bolsas de aire)'] },
        check: {
            en: ['Look under that seat: connectors get kicked loose by feet, cargo or moving the seat.', 'Before unplugging any airbag connector: ignition off, disconnect the battery and wait 3 minutes.', 'Never test airbag wiring with a test light or power probe.', 'Buckle and unbuckle — a sticky buckle can also set this.'],
            es: ['Revisa debajo de ese asiento: los conectores se aflojan con los pies, la carga o al mover el asiento.', 'Antes de desconectar cualquier conector de bolsa de aire: apaga, desconecta la batería y espera 3 minutos.', 'Nunca pruebes cables de bolsas de aire con lámpara de prueba.', 'Abrocha y desabrocha — una hebilla trabada también lo causa.']
        },
        fix: { en: 'Reseat or repair the connector; otherwise replace the buckle assembly. Clear the code with the scanner afterwards — airbag codes usually don\'t clear on their own.', es: 'Reconectar o reparar el conector; si no, reemplazar la hebilla. Luego borra el código con el escáner — los códigos de bolsas de aire casi nunca se borran solos.' }
    },
    {
        id: 'srs', sev: 'safety',
        test: (c, d, s) => /airbag|squib|clock ?spring|spiral cable|inflator|pretension|occupant|\bSRS\b|side curtain/i.test(d) || (/\bSRS\b|airbag/i.test(s) && !isComm(c, d)),
        means: { en: 'A fault in the airbag (SRS) system. While the airbag light is on, airbags may not deploy in a crash.', es: 'Falla en el sistema de bolsas de aire (SRS). Mientras la luz esté encendida, las bolsas podrían no activarse en un choque.' },
        parts: { en: ['Part named in the description (airbag module, seat-belt pretensioner, sensor)', 'Clock spring / spiral cable (steering wheel)', 'Under-seat and dash connectors', 'SRS control unit'], es: ['La pieza indicada en la descripción (módulo de bolsa, pretensor, sensor)', 'Resorte de reloj / cable espiral (volante)', 'Conectores debajo de asientos y tablero', 'Unidad de control SRS'] },
        check: {
            en: ['Check connectors under the front seats first.', 'If the horn or steering-wheel buttons also fail, suspect the clock spring.', 'Disconnect the battery and wait 3 minutes before touching airbag parts; never probe them with a test light.'],
            es: ['Revisa primero los conectores debajo de los asientos delanteros.', 'Si la bocina o los botones del volante también fallan, sospecha del resorte de reloj.', 'Desconecta la batería y espera 3 minutos antes de tocar piezas de bolsas; nunca las pruebes con lámpara.']
        },
        fix: { en: 'Repair the connector or replace the named part, then clear the code with the scanner. Airbag work is best left to a shop if you\'re unsure.', es: 'Reparar el conector o reemplazar la pieza indicada y borrar el código con el escáner. Si tienes dudas, mejor en un taller.' }
    },
    {
        id: 'comm', sev: 'soon',
        test: (c, d) => isComm(c, d),
        means: { en: 'One control module stopped receiving messages from another module on the car\'s data network.', es: 'Un módulo de control dejó de recibir mensajes de otro módulo en la red de datos del auto.' },
        parts: { en: ['{module}', 'Network wiring (CAN bus) and connectors', 'Fuse feeding that module', 'Module power & ground', 'Battery (low voltage causes these)'], es: ['{module}', 'Cableado de red (bus CAN) y conectores', 'Fusible de ese módulo', 'Alimentación y tierra del módulo', 'Batería (el bajo voltaje los causa)'] },
        check: {
            en: ['Test the battery: about 12.6 V engine off and 13.5–14.7 V running.', 'Does the module\'s feature still work? (e.g. the window switch, door locks.)', 'Check its fuse, then look for corrosion or water at its connector.', 'For door-mounted parts, inspect the wiring in the rubber boot between the door and body — wires break there from opening the door.', 'Clear the codes and scan again — if they don\'t come back, it was a one-time event (battery work, jump-start).'],
            es: ['Prueba la batería: unos 12.6 V apagado y 13.5–14.7 V encendido.', '¿Funciona lo que controla ese módulo? (p. ej. el interruptor de ventanas, los seguros.)', 'Revisa su fusible y busca corrosión o agua en su conector.', 'Para piezas en la puerta, revisa los cables dentro del fuelle de goma entre la puerta y la carrocería — se rompen de tanto abrir la puerta.', 'Borra los códigos y escanea de nuevo — si no regresan, fue algo de una sola vez (trabajo en la batería, arranque con cables).']
        },
        fix: { en: 'Often nothing, if it followed battery work. Otherwise repair the broken wire/connector or fuse; replace the module only if it has power and ground but still doesn\'t talk.', es: 'Muchas veces nada, si ocurrió tras trabajar en la batería. Si no, reparar el cable/conector o fusible; reemplazar el módulo solo si tiene corriente y tierra y aun así no comunica.' }
    },
    {
        id: 'tpms_low', sev: 'soon',
        test: (c, d) => /low (air )?pressure|under-?inflat|pressure (too )?low/i.test(d),
        means: { en: 'The tire-pressure system read low pressure on a tire.', es: 'El sistema de presión de llantas leyó presión baja en una llanta.' },
        parts: { en: ['Tire', 'Valve stem / valve core', 'TPMS sensor (if pressure is actually fine)'], es: ['Llanta', 'Válvula / núcleo de válvula', 'Sensor TPMS (si la presión en realidad está bien)'] },
        check: {
            en: ['Check all four tires cold with a gauge; set them to the door-jamb sticker, not the tire sidewall.', 'Look for nails and spray soapy water on the tread and valve stem to find slow leaks.', 'If pressures are correct and the code returns, the sensor is giving a bad reading.'],
            es: ['Mide las cuatro llantas en frío con un medidor; ajústalas a la etiqueta del marco de la puerta, no al costado de la llanta.', 'Busca clavos y rocía agua jabonosa en la banda y la válvula para encontrar fugas lentas.', 'Si la presión está bien y el código vuelve, el sensor está leyendo mal.']
        },
        fix: { en: 'Inflate or patch the tire, replace a leaking valve core/stem. The code clears after driving, or after a TPMS reset/relearn.', es: 'Inflar o parchar la llanta, cambiar el núcleo/válvula si fuga. El código se borra al manejar o tras un reinicio/reaprendizaje TPMS.' }
    },
    {
        id: 'tpms_sensor', sev: 'monitor',
        test: (c, d, s) => (/TPMS|tire/i.test(s) || /tire/i.test(d)) && /sensor/i.test(d) && /signal|fail|malfunction|no (data|response)|battery|missing/i.test(d),
        means: { en: 'The TPMS receiver isn\'t getting a usable signal from a tire\'s pressure sensor.', es: 'El receptor TPMS no recibe una señal válida del sensor de presión de una llanta.' },
        parts: { en: ['TPMS sensor inside the wheel (sealed battery, ~7–10 years)', 'Sensor ID registration in the TPMS module', 'Valve stem (sensor mounts to it)'], es: ['Sensor TPMS dentro de la rueda (batería sellada, ~7–10 años)', 'Registro del ID del sensor en el módulo TPMS', 'Válvula (el sensor va montado en ella)'] },
        check: {
            en: ['Use the scanner\'s TPMS tool to trigger the sensor — no response usually means a dead sensor battery.', 'Were tires or wheels changed recently? A sensor may be missing, damaged or not registered.', 'A spare wheel without a sensor will also set this.'],
            es: ['Usa la herramienta TPMS del escáner para activar el sensor — si no responde, normalmente la batería está agotada.', '¿Cambiaron llantas o rines recientemente? El sensor puede faltar, estar dañado o sin registrar.', 'Una llanta de repuesto sin sensor también lo provoca.']
        },
        fix: { en: 'Replace the sensor (the battery can\'t be swapped) and program/relearn its ID with the scanner. Replace the valve-stem seal at the same time.', es: 'Reemplazar el sensor (la batería no se cambia) y programar/reaprender su ID con el escáner. Cambia el sello de la válvula al mismo tiempo.' }
    },
    {
        id: 'tpms_unit', sev: 'monitor',
        test: (c, d) => /TPMS (control )?(unit|module|receiver)|tire pressure (monitor(ing)? )?(control )?(unit|module)/i.test(d),
        means: { en: 'The TPMS control unit reported an internal fault.', es: 'La unidad de control TPMS reportó una falla interna.' },
        parts: { en: ['TPMS control unit / receiver', 'Its fuse, power and ground'], es: ['Unidad de control / receptor TPMS', 'Su fusible, alimentación y tierra'] },
        check: {
            en: ['Fix sensor and pressure codes first, clear everything and scan again — this often sets along with them.', 'Check the battery and the unit\'s fuse.'],
            es: ['Repara primero los códigos de sensores y presión, borra todo y escanea otra vez — suele aparecer junto con ellos.', 'Revisa la batería y el fusible de la unidad.']
        },
        fix: { en: 'Replace the TPMS unit only if this code returns after the sensors are fixed.', es: 'Reemplazar la unidad TPMS solo si el código regresa después de reparar los sensores.' }
    },
    {
        id: 'hvac_door', sev: 'monitor',
        test: (c, d) => /mode (control )?(motor|door|actuator)|air ?mix|blend door|recirc|fresh\/?recirc|damper motor/i.test(d),
        means: { en: 'A climate-control door motor (actuator) isn\'t moving or reporting position correctly.', es: 'Un motor (actuador) de compuerta del clima no se mueve o no reporta bien su posición.' },
        parts: { en: ['HVAC door actuator (motor) behind the dash{rear}', 'Door linkage / the flap itself', 'Actuator wiring & connector', 'Climate control unit'], es: ['Actuador (motor) de compuerta del clima detrás del tablero{rear}', 'Varillaje / la compuerta', 'Cables y conector del actuador', 'Unidad de control del clima'] },
        check: {
            en: ['Switch between face, feet, defrost (or hot/cold) — does air come out where it should?', 'Listen behind the dash for clicking or knocking: a stripped actuator gear.', 'Check its connector, then clear the code and turn the key off and on so the system recalibrates.'],
            es: ['Cambia entre cara, pies, desempañador (o frío/calor) — ¿sale el aire por donde debe?', 'Escucha detrás del tablero si hay clics o golpeteo: engrane del actuador barrido.', 'Revisa su conector, borra el código y apaga/enciende para que el sistema se recalibre.']
        },
        fix: { en: 'Usually replace the actuator (often DIY behind a dash panel). Fix a broken linkage if the motor runs but the flap doesn\'t move.', es: 'Normalmente se reemplaza el actuador (muchas veces se hace en casa detrás de un panel). Si el motor gira pero la compuerta no, reparar el varillaje.' }
    },
    {
        id: 'abs_wheel', sev: 'safety',
        test: (c, d) => /wheel speed|speed sensor.*(wheel|front|rear)|tone ring|reluctor/i.test(d) && !/vehicle speed/i.test(d),
        means: { en: 'The ABS computer has a bad or missing signal from a wheel speed sensor. ABS and stability control may be off.', es: 'La computadora del ABS tiene una señal mala o ausente de un sensor de velocidad de rueda. El ABS y el control de estabilidad pueden estar desactivados.' },
        parts: { en: ['Wheel speed sensor at that wheel', 'Sensor wiring (often rubbed or broken near the suspension)', 'Tone ring / wheel hub bearing'], es: ['Sensor de velocidad de esa rueda', 'Cableado del sensor (se roza o rompe cerca de la suspensión)', 'Anillo dentado / rodamiento del cubo'] },
        check: {
            en: ['Inspect the sensor wire from the wheel to the body for damage.', 'Clean rust or debris off the sensor tip and tone ring.', 'Compare live wheel speeds on the scanner while driving slowly — the bad one reads 0 or erratic.'],
            es: ['Revisa el cable del sensor desde la rueda hasta la carrocería.', 'Limpia óxido o suciedad de la punta del sensor y del anillo dentado.', 'Compara las velocidades en vivo en el escáner manejando despacio — el malo marca 0 o salta.']
        },
        fix: { en: 'Replace the sensor or repair its wire; replace the hub bearing if the tone ring is part of it and damaged.', es: 'Reemplazar el sensor o reparar su cable; cambiar el rodamiento si el anillo dentado viene integrado y está dañado.' }
    },
    {
        id: 'abs', sev: 'safety',
        test: (c, d, s) => /\bABS\b|VSA|ESC|stability|brake (pressure|fluid|switch)|modulator|pump motor/i.test(d) || (/^C/i.test(c) && /ABS|brak/i.test(s)),
        means: { en: 'A fault in the anti-lock brake / stability system. Normal brakes work, but ABS may be disabled.', es: 'Falla en el sistema de frenos antibloqueo / estabilidad. Los frenos normales funcionan, pero el ABS puede estar desactivado.' },
        parts: { en: ['Part named in the description', 'ABS modulator / pump', 'Brake fluid level & brake light switch', 'Fuses and relays for ABS'], es: ['La pieza indicada en la descripción', 'Modulador / bomba del ABS', 'Nivel de líquido de frenos e interruptor de luz de freno', 'Fusibles y relevadores del ABS'] },
        check: { en: ['Check brake fluid level and the brake lights.', 'Check ABS fuses (there are usually two large ones).', 'Read live data / run the ABS self-test with the scanner if supported.'], es: ['Revisa el nivel de líquido de frenos y las luces de freno.', 'Revisa los fusibles del ABS (normalmente hay dos grandes).', 'Lee datos en vivo o ejecuta la autoprueba del ABS si el escáner lo permite.'] },
        fix: { en: 'Depends on the part named; have brakes checked soon.', es: 'Depende de la pieza indicada; revisa los frenos pronto.' }
    },
    {
        id: 'misfire', sev: 'soon',
        test: (c, d) => range(c, 300, 312) || /misfire/i.test(d),
        means: { en: 'The engine computer detected a cylinder not firing properly. A flashing check-engine light means severe misfire — ease off and avoid driving far (it can damage the catalytic converter).', es: 'La computadora detectó un cilindro que no enciende bien. Si la luz de motor parpadea, el fallo es fuerte — no manejes lejos (puede dañar el catalizador).' },
        parts: { en: ['Spark plug', 'Ignition coil', 'Fuel injector', 'Vacuum leak / intake gasket', 'Valve clearance or compression (higher mileage)'], es: ['Bujía', 'Bobina de encendido', 'Inyector', 'Fuga de vacío / empaque de admisión', 'Holgura de válvulas o compresión (alto kilometraje)'] },
        check: { en: ['Swap that cylinder\'s coil with a neighbor, clear the code and drive: if the misfire moves, the coil is bad.', 'Pull the plug — check wear, gap and oil in the plug well.', 'P0300 (random) with several cylinders usually means a vacuum leak or fuel problem, not one coil.'], es: ['Intercambia la bobina de ese cilindro con la de al lado, borra y maneja: si el fallo se mueve, la bobina está mala.', 'Saca la bujía — revisa desgaste, separación y aceite en el pozo.', 'P0300 (aleatorio) en varios cilindros suele ser fuga de vacío o combustible, no una bobina.'] },
        fix: { en: 'Replace plugs (if due) and the bad coil or injector; fix vacuum leaks.', es: 'Cambiar bujías (si toca) y la bobina o inyector malo; reparar fugas de vacío.' }
    },
    {
        id: 'lean', sev: 'soon',
        test: (c) => /^P017[14]$/i.test(c),
        means: { en: 'The engine is running lean: more air or less fuel than expected.', es: 'El motor funciona pobre: más aire o menos combustible de lo esperado.' },
        parts: { en: ['Vacuum hoses & intake boot (cracks)', 'PCV valve/hose', 'Mass airflow (MAF) sensor', 'Fuel pump / filter / injectors'], es: ['Mangueras de vacío y ducto de admisión (grietas)', 'Válvula/manguera PCV', 'Sensor de flujo de aire (MAF)', 'Bomba / filtro / inyectores de combustible'] },
        check: { en: ['Listen for hissing at idle; inspect the intake boot after the air filter.', 'Clean the MAF sensor with MAF cleaner.', 'Check fuel trims on the scanner: high at idle but normal at 2500 rpm = vacuum leak.'], es: ['Escucha siseos en ralentí; revisa el ducto después del filtro de aire.', 'Limpia el sensor MAF con limpiador especial.', 'Revisa los ajustes de combustible: altos en ralentí y normales a 2500 rpm = fuga de vacío.'] },
        fix: { en: 'Replace the leaking hose/boot or clean/replace the MAF; fuel delivery if trims are high everywhere.', es: 'Cambiar la manguera/ducto con fuga o limpiar/cambiar el MAF; revisar combustible si los ajustes están altos siempre.' }
    },
    {
        id: 'rich', sev: 'soon',
        test: (c) => /^P017[25]$/i.test(c),
        means: { en: 'The engine is running rich: too much fuel.', es: 'El motor funciona rico: demasiado combustible.' },
        parts: { en: ['Leaking fuel injector', 'Oxygen / air-fuel sensor', 'MAF sensor', 'Fuel pressure regulator', 'Dirty air filter'], es: ['Inyector con fuga', 'Sensor de oxígeno / aire-combustible', 'Sensor MAF', 'Regulador de presión de combustible', 'Filtro de aire sucio'] },
        check: { en: ['Check the air filter and look for fuel smell or black smoke.', 'Check the upstream O2 / A-F sensor reading on the scanner.'], es: ['Revisa el filtro de aire; busca olor a gasolina o humo negro.', 'Revisa la lectura del sensor O2 / A-F delantero en el escáner.'] },
        fix: { en: 'Replace the faulty sensor or injector.', es: 'Reemplazar el sensor o inyector defectuoso.' }
    },
    {
        id: 'cat', sev: 'monitor',
        test: (c) => /^P04(2[0-4]|3[0-4])$/i.test(c),
        means: { en: 'The catalytic converter isn\'t cleaning the exhaust as well as it should.', es: 'El convertidor catalítico no limpia el escape como debería.' },
        parts: { en: ['Catalytic converter', 'Downstream oxygen sensor', 'Exhaust leak before the rear sensor'], es: ['Convertidor catalítico', 'Sensor de oxígeno trasero', 'Fuga de escape antes del sensor trasero'] },
        check: { en: ['Fix any misfire or fuel-trim codes first — they damage the converter.', 'Check for exhaust leaks (ticking, soot marks).', 'Compare upstream vs downstream O2 readings: the rear should be steady.'], es: ['Repara primero fallos de cilindro o de mezcla — dañan el catalizador.', 'Busca fugas de escape (tic-tic, marcas de hollín).', 'Compara los sensores O2 delantero y trasero: el trasero debe estar estable.'] },
        fix: { en: 'Repair leaks or the rear sensor; replace the converter if it\'s truly worn.', es: 'Reparar fugas o el sensor trasero; reemplazar el catalizador si de verdad está agotado.' }
    },
    {
        id: 'o2', sev: 'monitor',
        test: (c, d) => range(c, 130, 167) || range(c, 2195, 2198) || /\b(O2|oxygen|A\/F|air[- ]fuel ratio) sensor/i.test(d),
        means: { en: 'A problem with an oxygen (or air-fuel) sensor or its heater circuit.', es: 'Un problema con un sensor de oxígeno (o aire-combustible) o con su calentador.' },
        parts: { en: ['Oxygen / A-F sensor at the position shown', 'Sensor heater circuit fuse', 'Sensor wiring near the exhaust', 'Exhaust leak near the sensor'], es: ['Sensor de oxígeno / A-F en la posición indicada', 'Fusible del circuito del calentador', 'Cableado cerca del escape', 'Fuga de escape cerca del sensor'] },
        check: { en: ['Heater codes (P0135, P0141, …): check the fuse and connector first.', 'Look for melted wires touching the exhaust.'], es: ['Códigos de calentador (P0135, P0141, …): revisa primero el fusible y el conector.', 'Busca cables derretidos tocando el escape.'] },
        fix: { en: 'Replace the sensor (use penetrating oil and an O2 socket).', es: 'Reemplazar el sensor (usa aceite penetrante y una copa para sensor O2).' }
    },
    {
        id: 'evap', sev: 'monitor',
        test: (c) => range(c, 440, 457) || range(c, 496, 499),
        means: { en: 'The fuel-vapor (EVAP) system found a leak or a valve problem. Harmless to drive, but it fails emissions.', es: 'El sistema de vapores de combustible (EVAP) detectó una fuga o falla de válvula. No es peligroso, pero no pasa la verificación.' },
        parts: { en: ['Gas cap', 'Purge valve (solenoid)', 'Vent valve', 'EVAP hoses', 'Charcoal canister'], es: ['Tapón de gasolina', 'Válvula de purga (solenoide)', 'Válvula de ventilación', 'Mangueras EVAP', 'Canister de carbón'] },
        check: { en: ['Tighten or replace the gas cap first — the cheapest and most common fix.', 'Inspect hoses near the canister and fuel tank.'], es: ['Aprieta o cambia el tapón de gasolina primero — la solución más barata y común.', 'Revisa las mangueras cerca del canister y del tanque.'] },
        fix: { en: 'Gas cap, purge/vent valve, or a cracked hose. A smoke test finds small leaks.', es: 'Tapón, válvula de purga/ventilación o manguera rota. Una prueba de humo encuentra fugas pequeñas.' }
    },
    {
        id: 'vtc', sev: 'soon',
        test: (c) => range(c, 10, 25) || range(c, 2646, 2649),
        means: { en: 'Cam timing (variable valve timing / VTEC) isn\'t where the computer expects.', es: 'La sincronización del árbol de levas (VTC / VTEC) no está donde la computadora espera.' },
        parts: { en: ['Engine oil level and condition', 'Oil control solenoid / VTEC spool valve (and its screen)', 'VTC / cam phaser actuator', 'Timing chain or belt'], es: ['Nivel y estado del aceite', 'Solenoide de control de aceite / válvula VTEC (y su filtro)', 'Actuador VTC / desfasador', 'Cadena o banda de distribución'] },
        check: { en: ['Check the oil level first and when it was last changed.', 'Listen for a rattle at cold start (worn chain/actuator).'], es: ['Revisa primero el nivel de aceite y cuándo se cambió.', 'Escucha traqueteo al arrancar en frío (cadena/actuador gastado).'] },
        fix: { en: 'Oil change with the correct oil, clean/replace the solenoid; timing parts if worn.', es: 'Cambio de aceite correcto, limpiar/cambiar el solenoide; partes de distribución si están gastadas.' }
    },
    {
        id: 'egr', sev: 'monitor',
        test: (c) => range(c, 400, 409),
        means: { en: 'Exhaust gas recirculation (EGR) flow is off.', es: 'El flujo de recirculación de gases (EGR) no es el correcto.' },
        parts: { en: ['EGR valve', 'Carbon-clogged EGR passages in the intake', 'EGR sensor / vacuum hose'], es: ['Válvula EGR', 'Conductos EGR tapados de carbón en la admisión', 'Sensor / manguera de vacío EGR'] },
        check: { en: ['Remove and inspect the EGR valve for carbon.', 'On many Hondas the intake EGR ports clog — clean them.'], es: ['Quita y revisa la válvula EGR por carbón.', 'En muchos Honda se tapan los puertos EGR de la admisión — límpialos.'] },
        fix: { en: 'Clean the valve and passages; replace the valve if it doesn\'t move.', es: 'Limpiar la válvula y los conductos; reemplazarla si no se mueve.' }
    },
    {
        id: 'thermostat', sev: 'monitor',
        test: (c) => /^P012[58]$/i.test(c),
        means: { en: 'The engine takes too long to warm up — usually a thermostat stuck open.', es: 'El motor tarda demasiado en calentar — normalmente el termostato está pegado abierto.' },
        parts: { en: ['Thermostat', 'Coolant temperature sensor', 'Coolant level'], es: ['Termostato', 'Sensor de temperatura del refrigerante', 'Nivel de refrigerante'] },
        check: { en: ['Check coolant level; watch the temp gauge — does it stay low on the highway?'], es: ['Revisa el refrigerante; observa el indicador — ¿se queda bajo en carretera?'] },
        fix: { en: 'Replace the thermostat (and gasket); refill and bleed the coolant.', es: 'Reemplazar el termostato (y empaque); rellenar y purgar el refrigerante.' }
    },
    {
        id: 'sensor_engine', sev: 'soon',
        test: (c) => range(c, 100, 124) || range(c, 220, 229) || range(c, 335, 349) || range(c, 325, 334) || range(c, 365, 369),
        means: { en: 'An engine sensor or its circuit is reading out of range.', es: 'Un sensor del motor o su circuito está fuera de rango.' },
        parts: { en: ['Sensor named in the description (MAF, MAP, intake temp, coolant temp, throttle position, crank, cam or knock sensor)', 'Its connector and wiring'], es: ['El sensor indicado en la descripción (MAF, MAP, temperatura de admisión o refrigerante, posición del acelerador, cigüeñal, levas o detonación)', 'Su conector y cableado'] },
        check: { en: ['Inspect the connector for oil, corrosion or a loose lock.', 'Compare the sensor\'s live reading with what makes sense (e.g. coolant temp = outside temp on a cold engine).', 'Crank/cam sensor codes can cause stalling or no-start — don\'t ignore them.'], es: ['Revisa el conector por aceite, corrosión o seguro flojo.', 'Compara la lectura en vivo con lo lógico (p. ej. temp. del refrigerante = temp. exterior con motor frío).', 'Los códigos de cigüeñal/levas pueden apagar el motor o impedir que arranque — no los ignores.'] },
        fix: { en: 'Repair wiring or replace the sensor.', es: 'Reparar el cableado o reemplazar el sensor.' }
    },
    {
        id: 'injector_coil', sev: 'soon',
        test: (c) => range(c, 200, 212) || range(c, 350, 362),
        means: { en: 'The computer sees an electrical fault in an injector or ignition-coil circuit.', es: 'La computadora ve una falla eléctrica en el circuito de un inyector o bobina.' },
        parts: { en: ['Fuel injector or ignition coil for that cylinder', 'Its connector and wiring'], es: ['Inyector o bobina de ese cilindro', 'Su conector y cableado'] },
        check: { en: ['Check the connector; swap coils between cylinders to see if the code follows.'], es: ['Revisa el conector; intercambia bobinas entre cilindros para ver si el código se mueve.'] },
        fix: { en: 'Replace the coil/injector or repair the wire.', es: 'Reemplazar la bobina/inyector o reparar el cable.' }
    },
    {
        id: 'idle', sev: 'monitor',
        test: (c) => range(c, 505, 509),
        means: { en: 'Idle speed isn\'t where the computer wants it.', es: 'El ralentí no está donde la computadora lo quiere.' },
        parts: { en: ['Idle air control valve', 'Dirty throttle body', 'Vacuum leak'], es: ['Válvula de control de aire en ralentí', 'Cuerpo de aceleración sucio', 'Fuga de vacío'] },
        check: { en: ['Clean the throttle body; check for vacuum leaks.'], es: ['Limpia el cuerpo de aceleración; busca fugas de vacío.'] },
        fix: { en: 'Clean or replace the idle valve; do an idle relearn.', es: 'Limpiar o cambiar la válvula; hacer reaprendizaje del ralentí.' }
    },
    {
        id: 'voltage', sev: 'soon',
        test: (c, d) => range(c, 560, 563) || range(c, 620, 625) || /system voltage|battery voltage|voltage (low|high)|charging|alternator/i.test(d),
        means: { en: 'System voltage is too low or too high — a battery or charging issue.', es: 'El voltaje del sistema es muy bajo o muy alto — problema de batería o carga.' },
        parts: { en: ['Battery', 'Alternator', 'Battery terminals & ground straps'], es: ['Batería', 'Alternador', 'Terminales y cables de tierra'] },
        check: { en: ['Battery ~12.6 V off; 13.5–14.7 V running.', 'Clean and tighten terminals; check the main ground.', 'Most parts stores test battery and alternator for free.'], es: ['Batería ~12.6 V apagado; 13.5–14.7 V encendido.', 'Limpia y aprieta terminales; revisa la tierra principal.', 'Muchas refaccionarias prueban batería y alternador gratis.'] },
        fix: { en: 'Replace the weak battery or alternator; repair terminals/grounds.', es: 'Reemplazar la batería o el alternador débil; reparar terminales/tierras.' }
    },
    {
        id: 'trans', sev: 'soon',
        test: (c, d) => range(c, 700, 799) || range(c, 2700, 2799) || /transmission|shift solenoid|torque converter|gear ratio|line pressure/i.test(d),
        means: { en: 'The transmission computer detected a shifting, pressure, solenoid or sensor problem.', es: 'La computadora de la transmisión detectó un problema de cambios, presión, solenoide o sensor.' },
        parts: { en: ['Transmission fluid (level & condition)', 'Shift / pressure control solenoids', 'Speed sensors', 'Torque converter clutch', 'Internal clutches (slipping codes)'], es: ['Líquido de transmisión (nivel y estado)', 'Solenoides de cambio / control de presión', 'Sensores de velocidad', 'Embrague del convertidor de torque', 'Embragues internos (códigos de patinaje)'] },
        check: { en: ['Check fluid level and smell/color — burnt or dark fluid is a warning sign.', 'Use the manufacturer\'s fluid (Honda: ATF DW-1).', 'Solenoid codes: check its connector; some solenoids have a small filter screen.'], es: ['Revisa nivel, olor y color del líquido — quemado u oscuro es mala señal.', 'Usa el líquido del fabricante (Honda: ATF DW-1).', 'Códigos de solenoide: revisa el conector; algunos tienen un filtro pequeño.'] },
        fix: { en: 'Fluid service, replace the solenoid or sensor; internal repair for gear-ratio/slip codes.', es: 'Servicio de líquido, reemplazar el solenoide o sensor; reparación interna para códigos de patinaje.' }
    },
    {
        id: 'speed', sev: 'monitor',
        test: (c, d) => range(c, 500, 503) || /vehicle speed/i.test(d),
        means: { en: 'The vehicle speed signal is missing or erratic.', es: 'La señal de velocidad del vehículo falta o es errática.' },
        parts: { en: ['Vehicle / output speed sensor', 'ABS wheel speed signal (on newer cars)', 'Wiring'], es: ['Sensor de velocidad del vehículo / salida', 'Señal de velocidad del ABS (autos nuevos)', 'Cableado'] },
        check: { en: ['Does the speedometer work? Check the sensor connector.'], es: ['¿Funciona el velocímetro? Revisa el conector del sensor.'] },
        fix: { en: 'Replace the sensor or repair the wire.', es: 'Reemplazar el sensor o reparar el cable.' }
    },
    {
        id: 'power_window', sev: 'monitor',
        test: (c, d) => /power window|window (motor|switch|regulator)|auto[- ]?up|pinch/i.test(d),
        means: { en: 'A power-window switch, motor or its control circuit reported a fault.', es: 'Un interruptor, motor o circuito de ventana eléctrica reportó una falla.' },
        parts: { en: ['Window switch', 'Window motor / regulator', 'Door wiring (hinge boot)'], es: ['Interruptor de ventana', 'Motor / regulador de ventana', 'Cableado de la puerta (fuelle de bisagra)'] },
        check: { en: ['Test each window from its own switch and from the driver\'s switch.', 'Auto-up not working after battery work usually just needs the window reset (hold up for 2 s at the top).'], es: ['Prueba cada ventana desde su interruptor y desde el del conductor.', 'Si la subida automática falla tras trabajar en la batería, normalmente solo hay que reiniciar (mantén arriba 2 s al cerrar).'] },
        fix: { en: 'Reset the window, repair wiring, or replace the switch/motor.', es: 'Reiniciar la ventana, reparar cables o cambiar el interruptor/motor.' }
    }
];

const DG_FALLBACK = {
    sev: 'monitor',
    means: { en: 'The scanner\'s description above is the definition. Use the code type and the search link below for repair details for your vehicle.', es: 'La descripción del escáner es la definición. Usa el tipo de código y el enlace de búsqueda para detalles de tu vehículo.' },
    parts: { en: ['Part or circuit named in the description'], es: ['La pieza o circuito indicado en la descripción'] },
    check: { en: ['Check the connector and fuse for the part named.', 'Clear the code and scan again to see if it returns.'], es: ['Revisa el conector y el fusible de la pieza indicada.', 'Borra el código y escanea otra vez para ver si regresa.'] },
    fix: null
};

// dtc = { system, code, desc, status }; ctx = { vehicleLabel }
function getDtcGuide(dtc, ctx = {}) {
    const code = String(dtc.code || '').trim(), desc = String(dtc.desc || ''), system = String(dtc.system || '');
    const rule = DTC_RULES.find(r => r.test(code, desc, system)) || DG_FALLBACK;
    const module = commTarget(desc);
    const rear = /\brear\b/i.test(desc) ? L({ en: ' (rear climate unit)', es: ' (unidad de clima trasera)' }) : '';
    const vars = { module, rear };
    const parts = (L(rule.parts) || []).map(p => fill(p, vars)).filter(p => p && !/\{module\}/.test(p) && p.trim());
    const q = [ctx.vehicleLabel && ctx.vehicleLabel !== '-' ? ctx.vehicleLabel : '', code, desc].filter(Boolean).join(' ');
    return {
        id: rule.id || 'other',
        sev: rule.sev,
        means: L(rule.means),
        parts,
        check: L(rule.check) || [],
        fix: rule.fix ? L(rule.fix) : '',
        where: locationHint(code, desc),
        codeType: code ? L(decodeCodeStructure(code)) : '',
        module,
        searchUrl: 'https://www.google.com/search?q=' + encodeURIComponent(q)
    };
}

// Patterns across all codes of one scan → "Where to start" tips.
function dtcPatternInsights(dtcs, ctx = {}) {
    const tips = [];
    const comm = dtcs.filter(d => isComm(d.code, d.desc));
    const byModule = {};
    comm.forEach(d => { const m = commTarget(d.desc); if (m) (byModule[m.toLowerCase()] = byModule[m.toLowerCase()] || { name: m, n: 0 }).n++; });
    Object.values(byModule).filter(m => m.n >= 2).sort((a, b) => b.n - a.n).forEach(m => tips.push({
        sev: 'soon', text: fill(L({
            en: '{n} modules lost contact with the {m}. One fault there is likely setting all of them — start with that part: does it work, its fuse, its connector{door}.',
            es: '{n} módulos perdieron contacto con: {m}. Probablemente una sola falla ahí causa todos — empieza por esa pieza: si funciona, su fusible, su conector{door}.'
        }), { n: m.n, m: m.name, door: /door|window|mirror|switch/i.test(m.name)
            ? L({ en: ' and the wires in the door-hinge rubber boot', es: ' y los cables en el fuelle de goma de la bisagra' }) : '' })
    }));
    if (comm.length >= 3) tips.push({ sev: 'monitor', text: L({
        en: 'Several communication codes at once often follow a weak battery, a jump-start or a battery disconnect. Test the battery, clear the codes and scan again before replacing parts.',
        es: 'Varios códigos de comunicación a la vez suelen venir de una batería débil, un arranque con cables o desconectar la batería. Prueba la batería, borra los códigos y escanea otra vez antes de cambiar piezas.'
    }) });

    const tireNo = d => (String(d.desc).match(/\bTire\s*([1-5])\b/i) || [])[1];
    const sensorFails = dtcs.filter(d => getDtcGuide(d).id === 'tpms_sensor');
    if (sensorFails.length >= 3) {
        const year = ctx.modelYear;
        const age = year ? new Date().getFullYear() - year : null;
        tips.push({ sev: 'monitor', text: fill(L({
            en: '{n} tire sensors stopped sending at the same time. That usually means worn-out sensor batteries (sealed, ~7–10 years){age}. Trigger one with the scanner\'s TPMS tool — if none respond, plan on a set of sensors.',
            es: '{n} sensores de llanta dejaron de transmitir al mismo tiempo. Normalmente significa baterías agotadas (selladas, ~7–10 años){age}. Activa uno con la herramienta TPMS del escáner — si ninguno responde, planea un juego de sensores.'
        }), { n: sensorFails.length, age: age !== null && age >= 7
            ? fill(L({ en: ' — this is a {y} model, {a} years old', es: ' — este es modelo {y}, de {a} años' }), { y: year, a: age }) : '' }) });
        const failTires = new Set(sensorFails.map(tireNo).filter(Boolean));
        if (dtcs.some(d => getDtcGuide(d).id === 'tpms_low' && failTires.has(tireNo(d)))) tips.push({ sev: 'monitor', text: L({
            en: 'Low-pressure codes are on the same tires whose sensors are failing, so they may be false. Check the real pressures with a gauge.',
            es: 'Los códigos de presión baja están en las mismas llantas con sensor fallando, así que pueden ser falsos. Mide la presión real con un medidor.'
        }) });
    }
    if (dtcs.some(d => getDtcGuide(d).sev === 'safety')) tips.unshift({ sev: 'safety', text: L({
        en: 'Safety system code present (airbags or brakes). That warning system may not work until it\'s repaired — handle this one first.',
        es: 'Hay un código de sistema de seguridad (bolsas de aire o frenos). Ese sistema podría no funcionar hasta repararlo — atiéndelo primero.'
    }) });
    return tips;
}

if (typeof module !== 'undefined') module.exports = { getDtcGuide, dtcPatternInsights, vinModelYear, decodeCodeStructure, locationHint };
