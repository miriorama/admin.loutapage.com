import { adminSettings, concertRows, inYear, rows, saveAbsence } from './data.js';
import {
    count, dateLabel, e, euro, filters, fits, icon, input, it, link, merchTypes, row, select, sizes, statuses, submit,
    sum, table, today, values, weekday,
} from './ui.js';

const weekdays = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const calendarWeekdays = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
const yearOf = (date) => Number(date.slice(0, 4));
const defaultYear = (years) => years.includes(2027) ? 2027 : yearOf(today());
const statusEntries = Object.entries(statuses).map(([value, [label]]) => [value, label]);
const withAll = (entries) => [['', 'Tutti'], ...entries];

function hours(value) {
    return `${Number(value).toLocaleString('it-IT', { maximumFractionDigits: 2 })} h`;
}

export function fitzLevel(value) {
    if (value == null) return 0;
    if (value < 40) return 1;
    return value <= 100 ? 2 : 3;
}

export async function concerts(params) {
    const dates = await rows('concerts', undefined, 'id,concert_date');
    const now = today();
    const currentYear = yearOf(now);
    const years = [...new Set([currentYear, currentYear + 1, ...dates.map((item) => yearOf(item.concert_date))])].sort((a, b) => b - a);
    const requested = Number(params.get('year'));
    const year = years.includes(requested) ? requested : defaultYear(years);
    const status = Object.hasOwn(statuses, params.get('status')) ? params.get('status') : '';
    const items = await concertRows(year, status);

    const listing = items.map((item) => {
        const level = fitzLevel(item.fitz_index);
        const fitzLabel = level ? `${level} Fitz` : 'Indice Fitz non disponibile';
        const [statusLabel, abbreviation] = Object.hasOwn(statuses, item.status) ? statuses[item.status] : [item.status, item.status];
        return row('concert-form', item.id, [
            `<span class="concert-weekday">${weekdays[weekday(item.concert_date)]}</span>
             <span class="concert-date">${dateLabel(item.concert_date)}</span>
             <span role="img" title="${fitzLabel}" aria-label="${fitzLabel}">${'●'.repeat(level)}${'○'.repeat(3 - level)}</span>`,
            `<span class="concert-place">${e(item.place)}</span>${item.name ? `<span class="concert-name">${e(item.name)}</span>` : ''}`,
            `<span class="status status--${e(item.status)}" title="${e(statusLabel)}" aria-label="${e(statusLabel)}">${e(abbreviation)}</span>`,
            `<span title="Cachet">${it(item.cachet, 0, false)}</span><br><strong title="Pulito">${it(item.net, 0, false)}</strong>`,
        ], item.concert_date < now ? 'concert-row--past' : '');
    }).join('');

    return {
        title: 'Elenco concerti', active: 'concerts', actions: link('concert-form', 'Nuovo concerto', null, 'primary'),
        content: filters('concerts', select('Anno', 'year', values(years), year) + select('Stato', 'status', withAll(statusEntries), status))
            + table(['Data', 'Luogo', 'Stato', 'Cachet / Pulito'], listing, 'Nessun concerto salvato.')
            + count(`${items.length} righe`),
    };
}

export async function summary() {
    const grouped = new Map();
    for (const item of await concertRows(null, 'confermato')) {
        const year = yearOf(item.concert_date);
        if (!grouped.has(year)) grouped.set(year, []);
        grouped.get(year).push(item);
    }
    const summaries = [...grouped].sort(([a], [b]) => b - a).map(([year, items]) => {
        const net = sum(items, 'net');
        const paid = items.filter((item) => item.cachet > 0).length;
        return [year, items.length, sum(items, 'cachet'), net, paid ? net / paid : 0];
    });

    function comparison(current, previous, column) {
        const change = previous ? (current - previous) / Math.abs(previous) * 100 : 0;
        const delta = previous === undefined ? '-' : previous === 0 && current !== 0 ? 'n.d.' : `${it(change, 1)}%`;
        const css = change === 0 ? 'neutral' : change > 0 ? 'up' : 'down';
        return `<td><div class="summary-value"><span>${column === 0 ? current : it(current)}</span><span class="summary-delta summary-delta--${css}">${delta}</span></div></td>`;
    }

    return {
        title: 'Riepilogo', active: 'summary', narrow: true,
        content: table(['Anno', 'N. concerti', 'Totale cachet €', 'Totale pulito €', 'Media pulito €'],
            summaries.map(([year, ...fields], index) => `<tr><td>${year}</td>${fields.map((field, column) =>
                comparison(field, summaries[index + 1]?.[column + 1], column)).join('')}</tr>`).join(''), 'Nessun dato disponibile.'),
    };
}

export const absenceCycle = ['available', 'absent', 'tentative'];
const absenceLabels = { available: 'Disponibile', absent: 'Assente', tentative: 'Da confermare' };

export function absenceButton(tag, date, saved, css = '') {
    const state = absenceCycle.includes(saved) ? saved : 'available';
    const label = e(date ? `${tag} - ${dateLabel(date)}` : tag);
    return `<button type="button" class="absence-check absence-check--${state} ${css}" data-tag="${e(tag)}"
        data-date="${date}" data-state="${state}" data-label="${label}"
        title="${label}" aria-label="${label}. ${absenceLabels[state]}"><span aria-hidden="true"></span><span class="sr-only">${e(tag)}</span></button>`;
}

export function setAbsence(button, saved) {
    const state = absenceCycle.includes(saved) ? saved : 'available';
    button.classList.replace(`absence-check--${button.dataset.state}`, `absence-check--${state}`);
    button.dataset.state = state;
    button.setAttribute('aria-label', `${button.dataset.label}. ${absenceLabels[state]}`);
}

export function nextAbsence(button) {
    return absenceCycle[(absenceCycle.indexOf(button.dataset.state) + 1) % absenceCycle.length];
}

export async function absences(params) {
    const now = today();
    const currentYear = yearOf(now);
    const years = [currentYear, currentYear + 1];
    const requested = Number(params.get('year'));
    const year = years.includes(requested) ? requested : defaultYear(years);
    const expanded = year === currentYear ? now.slice(0, 7) : `${year}-01`;
    const [{ person_tags: tags }, saved, concerts] = await Promise.all([
        adminSettings(),
        rows('absences', (query) => inYear(query, 'absence_date', year)),
        rows('concerts', (query) => inYear(query, 'concert_date', year)
            .not('status', 'in', '(non-disponibili,non-accettato,annullato)').order('concert_date'), 'id,concert_date,place,status'),
    ]);
    const states = new Map(saved.map((item) => [`${item.absence_date}/${item.person_tag}`, item.absence_state]));
    const byDate = new Map();
    for (const item of concerts) {
        if (!byDate.has(item.concert_date)) byDate.set(item.concert_date, []);
        byDate.get(item.concert_date).push(item);
    }
    const listing = months.map((month, index) => {
        const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
        const opened = monthKey === expanded;
        const dayCount = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();
        const days = Array.from({ length: dayCount }, (_, dateIndex) => {
            const day = dateIndex + 1;
            const date = `${monthKey}-${String(day).padStart(2, '0')}`;
            const dayConcerts = byDate.get(date) ?? [];
            const dow = weekday(date);
            const past = date < now ? 'absence-day-row--past' : '';
            const weekend = dow === 0 || dow === 6 ? 'absence-day-row--weekend' : '';
            const concert = dayConcerts.length ? `absence-day-row--concert absence-day-row--${e(dayConcerts[0].status)}` : '';
            return `<tr class="${past} ${weekend} ${concert}" data-month-day="${monthKey}" ${opened ? '' : 'hidden'}>
                <th scope="row"><span class="concert-date">${calendarWeekdays[dow]} ${day} ${month.toLowerCase()} ${year}</span>
                ${dayConcerts.map((item) => `<span class="absence-concert-place">${e(item.place)}</span>`).join('')}</th>
                ${tags.map((tag) => `<td>${absenceButton(tag, date, states.get(`${date}/${tag}`))}</td>`).join('')}
            </tr>`;
        }).join('');
        return `<tr class="absence-month-row"><th><button type="button" class="absence-month-toggle"
            aria-expanded="${opened}" data-month-toggle="${monthKey}">${icon('chevron-down')}<span>${month} ${year}</span></button>
            </th>${'<td aria-hidden="true"></td>'.repeat(tags.length)}</tr>${days}`;
    }).join('');

    return {
        title: `Assenze ${year}`, active: 'absences',
        content: filters('absences', select('Anno', 'year', values(years), year), '', false)
            + `<div class="table-wrap table-wrap--absences"><table class="absences-table">
                <thead><tr><th>Giorno</th>${tags.map((tag) => `<th>${e(tag)}</th>`).join('')}</tr></thead>
                <tbody>${listing}</tbody></table></div>`,
        bind(root) {
            root.querySelector('.absences-table').addEventListener('click', (event) => {
                const toggle = event.target.closest('[data-month-toggle]');
                if (toggle) {
                    const expanded = toggle.getAttribute('aria-expanded') === 'true';
                    toggle.setAttribute('aria-expanded', String(!expanded));
                    root.querySelectorAll(`[data-month-day="${toggle.dataset.monthToggle}"]`).forEach((row) => { row.hidden = expanded; });
                    return;
                }
                const control = event.target.closest('.absence-check');
                if (!control || control.disabled) return;
                const previous = control.dataset.state;
                const state = nextAbsence(control);
                setAbsence(control, state);
                void submit(async () => {
                    try {
                        await saveAbsence(control.dataset.date, control.dataset.tag, state);
                    } catch (error) {
                        setAbsence(control, previous);
                        throw error;
                    }
                }, [control]);
            });
        },
    };
}

const searchText = (text) => String(text).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export async function booking(params) {
    const { person_tags: tags } = await adminSettings();
    const eventName = params.get('event_name')?.trim() ?? '';
    const tag = tags.includes(params.get('contact_person')) ? params.get('contact_person') : '';
    const requested = ['0', '1'].includes(params.get('request_2027')) ? params.get('request_2027') : '';
    const records = await rows('booking_requests', (query) => {
        if (tag) query = query.eq('contact_person', tag);
        if (requested) query = query.eq('request_2027', requested === '1');
        return query.order('created_at', { ascending: false }).order('id', { ascending: false });
    });
    const items = records.filter((item) => searchText(item.event_name).includes(searchText(eventName)));
    return {
        title: 'Booking', active: 'booking', footerNarrow: true, actions: link('booking-form', 'Nuova richiesta', null, 'primary'),
        content: filters('booking', input('Nome', 'event_name', eventName, 'search', 'placeholder="Cerca evento"')
            + select('Contatto di', 'contact_person', withAll(values(tags)), tag)
            + select('2027', 'request_2027', [['', 'Tutte'], ['1', 'Sì'], ['0', 'No']], requested), 'filters-bar--booking')
            + table(['Nome', 'Contatto', '2027'], items.map((item) => row('booking-form', item.id, [
                e(item.event_name) + (item.place ? `<br><strong>${e(item.place)}</strong>` : ''), e(item.contact_person),
                `<input type="checkbox" aria-label="Richiesta 2027" ${item.request_2027 ? 'checked' : ''} disabled>`,
            ])).join(''), 'Nessuna richiesta trovata.') + count(`${items.length} richieste`),
    };
}

export async function projects() {
    const [items, expenses] = await Promise.all([
        rows('projects', (query) => query.order('name')),
        rows('project_expenses', undefined, 'id,project_id,unit,amount'),
    ]);
    const totals = new Map();
    for (const expense of expenses) {
        if (!totals.has(expense.project_id)) totals.set(expense.project_id, { h: 0, eur: 0 });
        totals.get(expense.project_id)[expense.unit] += Math.round(Number(expense.amount) * 100);
    }
    return {
        title: 'Progetti', active: 'projects', narrow: true, actions: link('project-form', 'Nuovo progetto', null, 'primary'),
        content: table(['Nome', 'Totale h', 'Totale €'], items.map((item) => {
            const total = totals.get(item.id) ?? { h: 0, eur: 0 };
            return row('project-form', item.id, [e(item.name), hours(total.h / 100), euro(total.eur / 100)]);
        }).join(''), 'Nessun progetto salvato.') + count(`${items.length} righe`),
    };
}

const typeOrder = ['felpa', 'tshirt', 'canotta', 'shopper', 'cd', 'vinile'];
const quantityClass = (quantity) => quantity < 5 ? 'merch-quantity--low' : quantity < 10 ? 'merch-quantity--warning' : '';
const sizeOrder = [...sizes, ''];

export function sortVariants(a, b) {
    return a.fit.localeCompare(b.fit) || sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size) || a.id - b.id;
}

export async function merch(params) {
    const name = params.get('name')?.trim() ?? '';
    const type = Object.hasOwn(merchTypes, params.get('type')) ? params.get('type') : '';
    const [articles, variants] = await Promise.all([
        rows('merch_articles', (query) => type ? query.eq('type', type) : query),
        rows('merch_variants'),
    ]);
    const byArticle = new Map();
    for (const variant of variants) {
        if (!byArticle.has(variant.merch_id)) byArticle.set(variant.merch_id, []);
        byArticle.get(variant.merch_id).push(variant);
    }
    const items = articles.filter((item) => byArticle.has(item.id) && searchText(item.name).includes(searchText(name)))
        .sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type) || a.name.localeCompare(b.name, 'it') || a.id - b.id);
    let totalQuantity = 0;
    const listing = items.map((item) => {
        const variants = byArticle.get(item.id).sort(sortVariants);
        const quantity = variants.reduce((total, variant) => total + Number(variant.quantity), 0);
        totalQuantity += quantity;
        const groups = [...Object.entries(fits), ['', '']].map(([fit, label]) => {
            const group = variants.filter((variant) => variant.fit === fit);
            if (!group.length) return '';
            const entries = group.map((variant) => `<div>${variant.size ? `${e(variant.size)}:` : ''}
                <strong class="${quantityClass(variant.quantity)}">${Number(variant.quantity)}</strong></div>`).join('');
            return `<div class="merch-fit">${label ? `<strong>${label}</strong>` : ''}${entries}</div>`;
        }).join('');
        return row('merch-form', item.id, [
            `${e(item.name)}<br><strong>${e(merchTypes[item.type] ?? item.type)}</strong>`,
            `<div class="merch-fits">${groups}</div>`, `<span class="${quantityClass(quantity)}">${quantity}</span>`,
        ]);
    }).join('');
    return {
        title: 'Merch', active: 'merch', footerNarrow: true, actions: link('merch-form', 'Nuovo merch', null, 'primary'),
        content: filters('merch', input('Nome', 'name', name, 'search', 'placeholder="Cerca articolo"')
            + select('Tipologia', 'type', [['', 'Tutte'], ...Object.entries(merchTypes)], type), 'filters-bar--merch')
            + table(['Nome', 'Quantità', 'Tot'], listing, 'Nessun articolo trovato.')
            + count(`${items.length} articoli · ${totalQuantity} pezzi`),
    };
}
