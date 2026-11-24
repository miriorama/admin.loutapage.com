export const statuses = {
    richiesta: ['Richiesta', 'R'],
    preventivo: ['Preventivo', 'P'],
    confermato: ['Confermato', 'C'],
    'non-disponibili': ['Non disponibili', 'ND'],
    'non-accettato': ['Non accettato', 'NA'],
    annullato: ['Annullato', 'A'],
};
export const merchTypes = { canotta: 'Canotta', cd: 'CD', felpa: 'Felpa', shopper: 'Shopper', tshirt: 'T-shirt', vinile: 'Vinile' };
export const sizes = ['XXL', 'XL', 'L', 'M', 'S', 'XS', 'XXS'];
export const fits = { unisex: 'Unisex', donna: 'Donna' };

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const e = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
export function quoteInfo(priceLists) {
    if (!priceLists.length) return '<p role="status">Listini non disponibili.</p>';
    return `<div class="quote-info">${priceLists.map(({ title, lines }) => `<div class="quote-info__column">
        <p class="quote-info__title">${e(title)}</p>
        ${lines.map((line) => `<p>${e(line)}</p>`).join('')}
    </div>`).join('')}</div>`;
}

export const href = (action, parameters = {}) => e(`?${new URLSearchParams({ action, ...parameters })}`);
export const icon = (name) => `<i class="bi bi-${name}" aria-hidden="true"></i>`;
export const button = (label, graphic, css = 'ghost', attributes = '') =>
    `<button class="btn btn--${css}"${graphic ? ` aria-label="${e(label)}" title="${e(label)}"` : ''} ${attributes}>${graphic ? icon(graphic) : e(label)}</button>`;
export const link = (action, label, graphic, css = 'ghost') =>
    `<a href="${href(action)}" class="btn btn--${css}"${graphic ? ` aria-label="${e(label)}" title="${e(label)}"` : ''}>${graphic ? icon(graphic) : e(label)}</a>`;
export const options = (entries, selected) => entries.map(([value, label]) =>
    `<option value="${e(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${e(label)}</option>`).join('');
export const values = (items) => items.map((value) => [value, value]);

export const input = (label, name, value, type = 'text', attributes = '') =>
    `<label class="field"><span>${e(label)}</span><input type="${type}" name="${name}" value="${e(value)}" ${attributes}></label>`;
export const select = (label, name, entries, selected, attributes = '') =>
    `<label class="field"><span>${e(label)}</span><select name="${name}" ${attributes}>${options(entries, selected)}</select></label>`;
export const textarea = (label, name, value, rows, attributes = '') =>
    `<label class="field"><span>${e(label)}</span><textarea name="${name}" rows="${rows}"${attributes ? ` ${attributes}` : ''}>${e(value)}</textarea></label>`;
export const check = (label, name, checked) =>
    `<label class="tag-check"><input class="sr-only" type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span>${e(label)}</span></label>`;
export const grid = (columns, ...fields) => `<div class="grid grid--${columns}">${fields.join('')}</div>`;
export const total = (label, value, id = '') =>
    `<div class="summary-label"><span class="summary-label__name">${e(label)}</span><strong class="summary-label__value" id="${id}">${e(value)}</strong></div>`;
export const count = (label) => `<div class="summary-label summary-label--center"><strong class="summary-label__value">${e(label)}</strong></div>`;
export const formActions = (action, reset = true) => `<div class="filters-bar__actions">
    ${reset ? link(action, 'Reset filtri', 'x-lg', 'danger') : ''}${button('Filtra', 'funnel', 'ghost', 'type="submit"')}
</div>`;
export const filters = (action, fields, css = '', reset = true) => `<form method="get" class="filters-bar ${css}">
    <input type="hidden" name="action" value="${action}">${fields}${formActions(action, reset)}
</form>`;
export const table = (heads, body, empty) => `<div class="table-wrap"><table>
    <thead><tr>${heads.map((head) => `<th>${e(head)}</th>`).join('')}</tr></thead>
    <tbody>${body || `<tr><td colspan="${heads.length}" class="empty-state">${e(empty)}</td></tr>`}</tbody>
</table></div>`;
export const row = (action, id, cells, css = '') =>
    `<tr class="concert-row ${css}" data-href="${href(action, { id })}" tabindex="0" role="link">${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;

export const it = (number, digits = 0, grouping = true) => Number(number).toLocaleString('it-IT', {
    minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping,
});
export const euro = (value) => `${it(value)} €`;
export const dateLabel = (date) => date.split('-').reverse().join('/');
export const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
export const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const sum = (records, field) => records.reduce((total, record) => total + Math.round(Number(record[field]) * 100), 0) / 100;

const navigation = [
    ['concerts', 'Elenco concerti', 'list-ul'], ['summary', 'Riepilogo', 'bar-chart-line'],
    ['absences', 'Assenze', 'calendar-x'], ['projects', 'Progetti', 'lightbulb'],
    ['booking', 'Booking', 'inbox'], ['merch', 'Merch', 'bag'], ['quotes', 'Preventivi', 'file-earmark-pdf'],
];

export function layout({ title, active, content, actions = '', narrow = false, footerNarrow = narrow }, email) {
    const width = narrow ? ' page-shell--narrow' : '';
    const nav = `<div class="topbar__meta">${navigation.map(([action, label, graphic]) =>
        link(action, label, graphic, action === active ? 'active' : 'ghost')).join('')}</div>`;
    return `<header class="topbar">
        <div><p class="eyebrow">Lou Tapage</p><h1>${e(title)}</h1></div>
        ${actions ? `<div class="topbar__menus"><div class="topbar__actions">${actions}</div>${nav}</div>` : nav}
    </header>
    <main class="page-shell${width}"><section class="panel"><div id="flash" aria-live="polite"></div>${content}</section></main>
    <footer class="page-footer${footerNarrow ? ' page-footer--narrow' : ''}">
        <span>${e(email)}</span><a href="${href('logout')}" class="page-footer__logout">Logout</a>
    </footer>`;
}

export function flash(message, success = false) {
    const target = document.querySelector('#flash');
    if (target) target.innerHTML = message ? `<div class="flash flash--${success ? 'success' : 'error'}">${e(message)}</div>` : '';
}

export function redirect(action, parameters, message) {
    const destination = `?${new URLSearchParams({ action, ...parameters })}`;
    window.dispatchEvent(new CustomEvent('lou:navigate', { detail: { destination, message } }));
}

export async function submit(task, controls) {
    const enabled = [...controls].filter((control) => !control.disabled);
    enabled.forEach((control) => { control.disabled = true; });
    flash('');
    try {
        await task();
    } catch (error) {
        flash(error.message || 'Operazione non riuscita. Riprova.');
    } finally {
        enabled.forEach((control) => { control.disabled = false; });
    }
}
