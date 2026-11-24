import { absenceStates, adminSettings, changeConcertArchive, client, find, quotePriceLists, rows, rpc, saveBooking, withExpenses } from './data.js';
import { absenceButton, nextAbsence, setAbsence, sortVariants } from './lists.js';
import {
    button, check, e, euro, flash, grid, input, it, merchTypes, quoteInfo, redirect, select, sizes, fits, statuses, submit,
    sum, textarea, today, total, values,
} from './ui.js';

const numeric = 'step="0.01" min="0"';
const nameLimits = 'maxlength="255"';
const small = (label, action, css = 'ghost') =>
    `<button type="button" class="btn btn--${css} btn--small" data-action="${action}">${e(label)}</button>`;
const tagOptions = (tags, placeholder = '') => [['', placeholder], ...values(tags)];
const amount = (value) => Number(String(value || 0).replace(',', '.')) || 0;
const textFields = (data, names) => Object.fromEntries(names.map((name) => [name, String(data.get(name) ?? '').trim()]));
const requiresSize = (type) => ['felpa', 'tshirt', 'canotta'].includes(type);

function money(value) {
    const number = Number(String(value ?? '').trim().replace(',', '.'));
    const cents = number * 100;
    if (!Number.isFinite(number) || number < 0 || number > 99999999.99
        || Math.abs(cents - Math.round(cents)) > 0.00001) {
        throw new Error('Inserisci importi positivi o pari a zero, con al massimo due decimali.');
    }
    return number;
}

const saveButton = button('Salva', null, 'primary', 'type="submit" id="save-control" form="record-form"');

export class MissingRecord extends Error {
    constructor() { super('Scheda non trovata.'); }
}

async function record(table, id, initial = {}) {
    if (!id) return initial;
    const item = await find(table, id);
    if (!item) throw new MissingRecord();
    return item;
}

function formPage(title, active, fields, persist, bind, actions = saveButton) {
    return {
        title, active, actions, narrow: true,
        content: `<form method="post" id="record-form" class="stack">${fields}</form>`,
        bind(root) {
            const form = root.querySelector('#record-form');
            const save = root.querySelector('#save-control');
            const state = bind?.(form, save) ?? {};
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!persist || save.disabled) return;
                const data = new FormData(form);
                void submit(() => persist(form, data, state), [save, ...form.querySelectorAll('button')]);
            });
        },
    };
}

function subpanel(title, body, actions = '') {
    return `<section class="subpanel"><div class="subpanel__head"><h3>${title}</h3>${actions}</div>${body}</section>`;
}

function expenseRow(expense = {}, tags = null) {
    const amountValue = expense.amount ?? 0;
    const fields = tags
        ? input('Ammontare', 'expense_amount', amountValue, 'number', numeric)
            + select('Unità', 'expense_unit', [['eur', '€'], ['h', 'h']], expense.unit ?? 'eur')
            + select('Persona', 'expense_person', tagOptions(tags), expense.person_tag ?? '')
        : input('Euro', 'expense_amount', amountValue === '' ? '' : it(amountValue, 2, false), 'text',
            `inputmode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?" title="Inserisci un importo con al massimo due decimali"${amountValue === '' ? ' required' : ''}`);
    return `<div class="${tags ? 'project-expense-row' : 'expense-row'}">
        ${input(tags ? 'Spesa' : 'Descrizione', 'expense_description', expense.description, 'text', nameLimits)}
        ${fields}${small('Rimuovi', 'remove-expense', 'danger')}
    </div>`;
}

function readExpenses(list, { tags = null, validate = false } = {}) {
    return [...list.children].flatMap((row) => {
        const description = row.querySelector('[name="expense_description"]').value.trim();
        const raw = row.querySelector('[name="expense_amount"]').value;
        const value = validate ? money(raw) : amount(raw);
        if (!description && !value) return [];
        const expense = { description: description || 'Spesa', amount: value };
        if (tags) {
            expense.unit = row.querySelector('[name="expense_unit"]').value;
            expense.person_tag = row.querySelector('[name="expense_person"]').value;
            if (validate && (!['eur', 'h'].includes(expense.unit) || (expense.person_tag && !tags.includes(expense.person_tag)))) {
                throw new Error('Seleziona un’unità e una persona valide per la spesa.');
            }
        }
        return [expense];
    });
}

function bindExpenses(form, refresh, tags = null) {
    const list = form.querySelector(tags ? '#project-expenses-list' : '#expenses-list');
    form.addEventListener('click', (event) => {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        if (button.dataset.action === 'add-expense' || button.dataset.action === 'add-sound-engineer') {
            const isSoundEngineer = button.dataset.action === 'add-sound-engineer';
            const initial = isSoundEngineer ? { description: 'Fonico', amount: '' } : {};
            list.insertAdjacentHTML('beforeend', expenseRow(initial, tags));
            if (isSoundEngineer) list.lastElementChild.querySelector('[name="expense_amount"]').focus();
        } else if (button.dataset.action === 'remove-expense') {
            const row = button.closest(tags ? '.project-expense-row' : '.expense-row');
            if (list.children.length === 1) row.outerHTML = expenseRow({}, tags);
            else row.remove();
        } else {
            return;
        }
        refresh();
    });
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    refresh();
    return list;
}

const vatRates = (rate) => [[0, '0%'], [rate, `${rate}%`]];
const statusesForForm = Object.entries(statuses).map(([value, [label]]) => [value, label]);
function fitzCoordinates(latitude, longitude, origin) {
    if (latitude == null || longitude == null) return null;
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    // Usa la stessa precisione con cui PostgreSQL conserva le coordinate.
    const place_latitude = Number(lat.toFixed(7));
    const place_longitude = Number(lon.toFixed(7));
    const radians = (angle) => angle * Math.PI / 180;
    const angle = Math.sin(radians(place_latitude - origin.fitz_latitude) / 2) ** 2
        + Math.cos(radians(origin.fitz_latitude)) * Math.cos(radians(place_latitude))
        * Math.sin(radians(place_longitude - origin.fitz_longitude) / 2) ** 2;
    const distance = 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, angle))));
    return { place_latitude, place_longitude, fitz_index: Math.round(distance * 10) / 10 };
}

async function geocodePlace(place, origin) {
    const lookup = await client.functions.invoke('geocode', { body: { place } }).catch(() => null);
    if (lookup?.data?.status === 'ok') return fitzCoordinates(lookup.data.latitude, lookup.data.longitude, origin);
    if (lookup?.data?.status !== 'browser_lookup') return null;

    const url = new URL('https://photon.komoot.io/api/');
    url.search = new URLSearchParams({ q: place, limit: '5', lat: origin.fitz_latitude.toFixed(1), lon: origin.fitz_longitude.toFixed(1) });
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(6000), credentials: 'omit', redirect: 'error' });
        if (!response.ok) return null;
        const { features } = await response.json();
        if (!Array.isArray(features)) return null;
        const feature = features.find((item) => item && !['county', 'state', 'country'].includes(item.properties?.type));
        if (feature?.geometry?.type !== 'Point') return null;
        const [longitude, latitude] = feature.geometry.coordinates ?? [];
        return fitzCoordinates(latitude, longitude, origin);
    } catch {
        return null;
    }
}

const concertTextFields = ['concert_date', 'place', 'name', 'status', 'notes', 'contact_name', 'contact_phone', 'contact_email', 'contact_notes'];

function bindConcert(form, save, item) {
    const list = form.querySelector('#expenses-list');
    const field = (name) => form.elements.namedItem(name);
    const refresh = () => {
        const cachet = amount(field('cachet').value);
        const service = amount(field('service_included').value);
        const taxedCachet = cachet * (1 + amount(field('cachet_vat_rate').value) / 100);
        const taxedService = service * (1 + amount(field('service_vat_rate').value) / 100);
        field('cachet-total').value = Math.round(taxedCachet);
        field('service-total').value = Math.round(taxedService);
        field('quote-total-excluding-vat').value = Math.round(cachet + service);
        field('quote-total-including-vat').value = Math.round(taxedCachet + taxedService);
        form.querySelector('#net-total').textContent = euro(cachet - sum(readExpenses(list), 'amount'));
    };
    bindExpenses(form, refresh);

    const absenceButtons = [...form.querySelectorAll('.concert-absence-check')];
    let loadedDate = item.concert_date;
    let requestNumber = 0;
    field('concert_date').addEventListener('change', async (event) => {
        const date = event.target.value;
        const currentRequest = ++requestNumber;
        loadedDate = null;
        absenceButtons.forEach((control) => { control.disabled = true; });
        if (save) save.disabled = true;
        flash('');
        if (!date) return;
        try {
            const states = await absenceStates(date);
            if (currentRequest !== requestNumber || field('concert_date').value !== date) return;
            absenceButtons.forEach((control) => {
                setAbsence(control, states[control.dataset.tag]);
                control.disabled = false;
            });
            loadedDate = date;
            if (save) save.disabled = false;
        } catch {
            if (currentRequest === requestNumber) flash('Impossibile caricare le assenze. Seleziona di nuovo la data.');
        }
    });

    form.addEventListener('click', (event) => {
        const absence = event.target.closest('.concert-absence-check');
        if (absence && !absence.disabled) setAbsence(absence, nextAbsence(absence));

        const control = event.target.closest('[data-concert-action]');
        if (!control) return;
        const action = control.dataset.concertAction;
        if (action === 'delete' && !confirm('Vuoi eliminare questo concerto?')) return;
        if (action === 'archive' && !confirm('Vuoi archiviare questo concerto e bloccare tutti i dati?')) return;
        const messages = { archive: 'Concerto archiviato.', unarchive: 'Concerto disarchiviato.', delete: 'Concerto eliminato.' };
        void submit(async () => {
            await changeConcertArchive(item.id, action);
            if (action === 'delete') redirect('concerts', {}, messages[action]);
            else redirect('concert-form', { id: item.id }, messages[action]);
        }, [save, ...form.querySelectorAll('button')].filter(Boolean));
    });

    return {
        states(date) {
            if (loadedDate !== date) throw new Error('Attendi il caricamento delle assenze per la data selezionata.');
            return Object.fromEntries(absenceButtons.filter((control) => control.dataset.state !== 'available')
                .map((control) => [control.dataset.tag, control.dataset.state]));
        },
    };
}

export async function concertForm(id) {
    const initial = { concert_date: today(), status: 'richiesta', cachet: 0, cachet_vat_rate: 10,
        service_included: 0, service_vat_rate: 22, meal_included: true, sound_engineer: 0 };
    const item = await record('concerts', id, initial);
    const [settings, expenses, states, priceLists] = await Promise.all([
        adminSettings(),
        id ? rows('concert_expenses', (query) => query.eq('concert_id', id)) : [],
        absenceStates(item.concert_date),
        quotePriceLists(),
    ]);
    const { person_tags: tags } = settings;
    const concert = withExpenses(item, expenses);
    const storedExpenses = concert.expenses.length ? concert.expenses : [{}];
    const archived = concert.is_archived;
    const archiveMessage = archived ? '<div class="flash flash--archived">Concerto archiviato: i dati sono bloccati. Premi “Disarchivia” per modificarli.</div>' : '';
    const archiveActions = id ? `<div class="form-actions">${archived
        ? '<button type="button" class="btn btn--active" data-concert-action="unarchive">Disarchivia</button>'
        : '<button type="button" class="btn btn--danger" data-concert-action="delete">Elimina</button><button type="button" class="btn btn--ghost" data-concert-action="archive">Archivia</button>'}</div>` : '';
    const priced = (label, field, rate, max, calculated, calculatedLabel) => grid(3,
        input(label, field, concert[field], 'number', numeric),
        select(`IVA ${field === 'cachet' ? 'cachet' : 'service'}`, rate, vatRates(max), Number(concert[rate]) === 0 ? 0 : max),
        input(calculatedLabel, calculated, 0, 'number', 'readonly'));
    const quote = priced('Cachet (€)', 'cachet', 'cachet_vat_rate', 10, 'cachet-total', 'Totale cachet (€)')
        + priced('Service (€)', 'service_included', 'service_vat_rate', 22, 'service-total', 'Totale service (€)')
        + grid(2, input('Totale senza IVA (€)', 'quote-total-excluding-vat', 0, 'number', 'readonly'),
            input('Totale IVA inclusa (€)', 'quote-total-including-vat', 0, 'number', 'readonly'))
        + `<div class="field"><span>Inclusi</span><div class="checkbox-grid">
            ${check('Pasto', 'meal_included', concert.meal_included)}
            ${check('Pernottamento', 'overnight_included', concert.overnight_included)}</div></div>` + quoteInfo(priceLists);
    const absenceGrid = `<div class="field"><span>Assenza</span><div class="absence-state-grid">
        ${tags.map((tag) => `<label class="absence-state-item" data-absence-tag="${e(tag)}">
            ${absenceButton(tag, '', states[tag], 'concert-absence-check')}<span>${e(tag)}</span></label>`).join('')}
    </div></div>`;
    const contact = grid(3, input('Nominativo', 'contact_name', concert.contact_name, 'text', nameLimits),
        input('Tel', 'contact_phone', concert.contact_phone, 'text', 'maxlength="64"'),
        input('Email', 'contact_email', concert.contact_email, 'email', nameLimits))
        + textarea('Note contatto', 'contact_notes', concert.contact_notes, 3);

    const fields = archiveMessage + `<fieldset class="stack form-fields" ${archived ? 'disabled' : ''}>
        ${grid(3, input('Data', 'concert_date', concert.concert_date, 'date', 'required'),
            input('Luogo', 'place', concert.place, 'text', `required ${nameLimits}`),
            input('Nome', 'name', concert.name, 'text', nameLimits))}
        ${grid(2, select('Stato', 'status', statusesForForm, concert.status, 'required'), absenceGrid)}
        ${textarea('Note', 'notes', concert.notes, 4)}
        ${subpanel('Preventivo', quote)}
        ${subpanel('Spese', `<div id="expenses-list" class="stack">${storedExpenses.map((expense) => expenseRow(expense)).join('')}</div>`
            + total('Pulito', euro(concert.net), 'net-total'),
        `<div class="inline-actions">${small('Aggiungi fonico', 'add-sound-engineer')}${small('Aggiungi spesa', 'add-expense')}</div>`)}
        ${subpanel('Contatto', contact)}
        ${input('Indice Fitz (km)', 'fitz-index', concert.fitz_index == null ? 'Non disponibile' : it(concert.fitz_index, 1), 'text', 'readonly')}
    </fieldset>${archiveActions}`;

    return formPage(id ? 'Dettaglio concerto' : 'Nuovo concerto', 'concerts', fields,
        archived ? null : async (form, data, state) => {
            const details = textFields(data, concertTextFields);
            if (!details.concert_date || !details.place) throw new Error('Data e luogo sono obbligatori.');
            if (!Object.hasOwn(statuses, details.status)) throw new Error('Seleziona uno stato valido.');
            const states = state.states(details.concert_date);
            const expenses = readExpenses(form.querySelector('#expenses-list'), { validate: true });
            details.cachet = money(data.get('cachet'));
            details.service_included = money(data.get('service_included'));
            const cachetVat = data.get('cachet_vat_rate');
            const serviceVat = data.get('service_vat_rate');
            if (!['0', '10'].includes(cachetVat) || !['0', '22'].includes(serviceVat)) throw new Error('Seleziona aliquote IVA valide.');
            details.cachet_vat_rate = Number(cachetVat);
            details.service_vat_rate = Number(serviceVat);
            details.meal_included = data.has('meal_included');
            details.overnight_included = data.has('overnight_included');

            let coordinates = details.place === concert.place
                ? fitzCoordinates(concert.place_latitude, concert.place_longitude, settings) : null;
            if (!coordinates) coordinates = await geocodePlace(details.place, settings);
            if (coordinates) Object.assign(details, coordinates);
            const saved = await rpc('lou_save_concert', {
                record_id: id, details, expenses, states,
            });
            redirect('concert-form', { id: saved }, 'Concerto salvato correttamente.');
        }, (form, save) => bindConcert(form, save, concert), archived ? '' : saveButton);
}

export async function projectForm(id) {
    const [{ person_tags: tags }, item, expenses] = await Promise.all([
        adminSettings(), record('projects', id), id ? rows('project_expenses', (query) => query.eq('project_id', id)) : [],
    ]);
    const fields = input('Nome', 'name', item.name, 'text', `required ${nameLimits}`) + textarea('Note', 'notes', item.notes, 5)
        + subpanel('Spese', `<div id="project-expenses-list" class="stack">
            ${(expenses.length ? expenses : [{}]).map((expense) => expenseRow(expense, tags)).join('')}</div>`
            + grid(2, total('Totale h', '0 h', 'project-total-hours'), total('Totale €', '0 €', 'project-total-euros')),
        small('Aggiungi spesa', 'add-expense'));
    return formPage(id ? 'Dettaglio progetto' : 'Nuovo progetto', 'projects', fields, async (form, data) => {
        const projectName = data.get('name').trim();
        if (!projectName) throw new Error('Il nome progetto è obbligatorio.');
        const saved = await rpc('lou_save_project', {
            record_id: id, project_name: projectName, project_notes: data.get('notes').trim(),
            expenses: readExpenses(form.querySelector('#project-expenses-list'), { tags, validate: true }),
        });
        redirect('project-form', { id: saved }, 'Progetto salvato correttamente.');
    }, (form) => {
        const list = form.querySelector('#project-expenses-list');
        bindExpenses(form, () => {
            const expenses = readExpenses(list, { tags });
            const format = (unit) => sum(expenses.filter((expense) => expense.unit === unit), 'amount')
                .toLocaleString('it-IT', { maximumFractionDigits: 2 });
            form.querySelector('#project-total-hours').textContent = `${format('h')} h`;
            form.querySelector('#project-total-euros').textContent = `${format('eur')} €`;
        }, tags);
    });
}

export async function bookingForm(id) {
    const [{ person_tags: tags }, item] = await Promise.all([adminSettings(), record('booking_requests', id)]);
    const fields = grid(2, input('Nome evento', 'event_name', item.event_name, 'text', `required ${nameLimits}`),
        select('Contatto di', 'contact_person', tagOptions(tags, 'Seleziona'), item.contact_person, 'required'))
        + input('Luogo', 'place', item.place, 'text', nameLimits)
        + grid(2, input('Email contatto', 'contact_email', item.contact_email, 'email', nameLimits),
            input('Tel contatto', 'contact_phone', item.contact_phone, 'tel', 'maxlength="64"'))
        + textarea('Note', 'notes', item.notes, 6) + check('Richiesta 2027', 'request_2027', item.request_2027);
    return formPage(id ? 'Dettaglio richiesta' : 'Nuova richiesta', 'booking', fields, async (form, data) => {
        const details = textFields(data, ['event_name', 'contact_person', 'place', 'contact_email', 'contact_phone', 'notes']);
        if (!details.event_name || !tags.includes(details.contact_person)) {
            throw new Error('Inserisci il nome dell’evento e seleziona un contatto.');
        }
        details.request_2027 = data.has('request_2027');
        const saved = await saveBooking(id, details);
        redirect('booking-form', { id: saved }, 'Richiesta salvata correttamente.');
    });
}

function variantRow(item = {}) {
    return `<div class="merch-variant">
        ${select('Taglia', 'size', [['', '-'], ...values(sizes)], item.size ?? '')}
        ${select('Vestibilità', 'fit', [['', '-'], ...Object.entries(fits)], item.fit ?? '')}
        ${input('Quantità', 'quantity', item.quantity ?? 0, 'number', 'min="0" max="2147483647" step="1" required')}
        ${small('Rimuovi', 'remove-variant', 'danger')}
    </div>`;
}

function readVariants(list) {
    return [...list.children].map((row) => ({
        size: row.querySelector('[name="size"]').value,
        fit: row.querySelector('[name="fit"]').value,
        quantity: Number(row.querySelector('[name="quantity"]').value),
    }));
}

export async function merchForm(id) {
    const item = await record('merch_articles', id);
    const variants = id ? await rows('merch_variants', (query) => query.eq('merch_id', id)) : [];
    const fields = input('Nome', 'name', item.name, 'text', `required ${nameLimits}`)
        + select('Tipologia', 'type', [['', 'Seleziona'], ...Object.entries(merchTypes)], item.type, 'required')
        + `<section class="subpanel stack"><div class="subpanel__head"><h2>Varianti</h2>${small('Aggiungi variante', 'add-variant')}</div>
            <div id="merch-variants" class="stack">${(variants.length ? variants.sort(sortVariants) : [{}]).map(variantRow).join('')}</div>
            <div class="summary-label">Quantità totale: <strong id="merch-total">0</strong></div></section>`;
    return formPage(id ? 'Dettaglio articolo' : 'Nuovo articolo', 'merch', fields, async (form, data) => {
        const name = data.get('name').trim();
        const type = data.get('type');
        if (!name) throw new Error('Il nome articolo è obbligatorio.');
        if (!Object.hasOwn(merchTypes, type)) throw new Error('Seleziona una tipologia valida.');

        const variants = readVariants(form.querySelector('#merch-variants'));
        if (!variants.length || variants.length > 100) throw new Error('Inserisci da 1 a 100 varianti.');
        const combinations = new Set();
        for (const { size, fit, quantity } of variants) {
            if ((size && !sizes.includes(size)) || (requiresSize(type) && !size)) throw new Error('Seleziona una taglia valida.');
            if (fit && !Object.hasOwn(fits, fit)) throw new Error('Seleziona una vestibilità valida.');
            if (!Number.isInteger(quantity) || quantity < 0 || quantity > 2147483647) {
                throw new Error('La quantità deve essere un numero intero tra 0 e 2147483647.');
            }
            const combination = `${size}/${fit}`;
            if (combinations.has(combination)) throw new Error('Una combinazione di taglia e vestibilità compare più volte.');
            combinations.add(combination);
        }

        const saved = await rpc('lou_save_merch', { record_id: id, article_name: name, article_type: type, variants })
            .catch((error) => {
                if (error.code === '23505') throw new Error('Esiste già un articolo con questo nome e tipologia.');
                throw error;
            });
        redirect('merch-form', { id: saved }, 'Articolo salvato correttamente.');
    }, (form) => {
        const list = form.querySelector('#merch-variants');
        const refresh = () => {
            const clothing = requiresSize(form.elements.type.value);
            list.querySelectorAll('[name="size"]').forEach((size) => { size.required = clothing; });
            form.querySelector('#merch-total').textContent = readVariants(list).reduce((total, { quantity }) =>
                total + (Number.isInteger(quantity) && quantity >= 0 && quantity <= 2147483647 ? quantity : 0), 0);
        };
        form.addEventListener('change', refresh);
        form.addEventListener('input', refresh);
        form.addEventListener('click', (event) => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            if (button.dataset.action === 'remove-variant') button.closest('.merch-variant').remove();
            if (button.dataset.action === 'add-variant' || !list.children.length) {
                if (list.children.length >= 100) {
                    flash('Puoi inserire al massimo 100 varianti.');
                    return;
                }
                list.insertAdjacentHTML('beforeend', variantRow());
                list.lastElementChild.querySelector('select').focus();
            }
            refresh();
        });
        refresh();
    });
}
