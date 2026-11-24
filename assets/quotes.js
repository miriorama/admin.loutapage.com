import { client, quotePriceLists, result } from './data.js';
import { check, dateLabel, flash, grid, icon, input, it, quoteInfo, submit, textarea, today, total } from './ui.js';

const templateBucket = 'lou-quote-templates';
const templateName = 'preventivo-2027-condizioni.pdf';
const serviceVatRate = 22;
const amountAttributes = 'maxlength="11" inputmode="decimal" pattern="[0-9]+([,.][0-9]{1,2})?"';
const dateAttributes = 'required min="0001-01-01" max="9999-12-31"';
let libraryRequest;

function loadPdfLibrary() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    libraryRequest ??= new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
        script.integrity = 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI';
        script.crossOrigin = 'anonymous';
        script.addEventListener('load', () => resolve(window.PDFLib), { once: true });
        script.addEventListener('error', () => {
            script.remove();
            libraryRequest = undefined;
            reject(new Error('Impossibile caricare il generatore PDF. Riprova.'));
        }, { once: true });
        document.head.append(script);
    });
    return libraryRequest;
}

function amountInCents(value) {
    const match = /^(\d{1,8})(?:[,.](\d{1,2}))?$/.exec(value);
    if (!match) return NaN;
    return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

function quoteTotals(data) {
    const cachet = amountInCents(data.get('cachet'));
    const service = amountInCents(data.get('service') || '0');
    const subtotal = cachet + service;
    const vat = Math.round(service * serviceVatRate / 100);
    return { cachet, service, subtotal, vat, total: subtotal + vat };
}

const euros = (cents) => `${it(cents / 100, cents % 100 === 0 ? 0 : 2)} €`;

function wrapText(text, widthOf, maxWidth) {
    const lines = [];
    for (const paragraph of text.split(/\r?\n/)) {
        let line = '';
        for (const word of paragraph.trim().split(/\s+/)) {
            const next = line ? `${line} ${word}` : word;
            if (line && widthOf(next) > maxWidth) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        }
        lines.push(line);
    }
    return lines;
}

async function createQuotePdf(template, pdfLib, details, prices) {
    const { PDFDocument, StandardFonts, rgb } = pdfLib;
    const pdf = await PDFDocument.load(await template.arrayBuffer());
    const [page] = pdf.getPages();
    if (pdf.getPageCount() !== 1 || page.getWidth() !== 596 || page.getHeight() !== 842) {
        throw new Error('Il formato del modello PDF non è valido.');
    }
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

    // Coordinates are in PDF points measured from the lower-left corner of the 2027 template.
    function drawField({ label, value, x, y, width, maxLines }) {
        const size = 11;
        const measure = (text) => regular.widthOfTextAtSize(text, size);
        let lines;
        try {
            lines = wrapText(value, measure, width);
            if (lines.length <= maxLines && lines.every((line) => measure(line) <= width)) {
                lines.forEach((line, index) => page.drawText(line, { x, y: y - index * 14, font: regular, size }));
                return;
            }
        } catch {
            throw new Error(`Il campo «${label}» contiene caratteri che il PDF non supporta.`);
        }
        throw new Error(`Il campo «${label}» supera lo spazio disponibile nel PDF. Accorcialo per continuare.`);
    }

    function drawRight(text, right, y, font = regular) {
        const size = 10;
        page.drawText(text, { x: right - font.widthOfTextAtSize(text, size), y, font, size });
    }

    drawField({ label: 'Destinatario', value: details.recipient, x: 56.64, y: 627, width: 482, maxLines: 3 });
    drawField({ label: 'Oggetto', value: details.subject, x: 56.64, y: 567, width: 482, maxLines: 2 });
    drawField({ label: 'Luogo del concerto', value: details.place, x: 298.89, y: 507, width: 240, maxLines: 3 });
    drawField({ label: 'Data e ora del concerto', value: details.concertDateTime,
        x: 56.64, y: 507, width: 234, maxLines: 3 });
    page.drawText(dateLabel(details.issueDate), { x: 56.64, y: 127, font: regular, size: 10 });

    const includesService = prices.service > 0;
    const items = [['Cachet band', prices.cachet, '0 %']];
    if (includesService) items.push(['Service audio e luci', prices.service, `${serviceVatRate} %`]);

    const tableTop = 464.5;
    const headerBottom = tableTop - 25;
    const rowHeight = 24;
    const totalsTop = headerBottom - items.length * rowHeight;
    const tableBottom = totalsTop - 73;
    const left = 56.5;
    const right = 539.5;
    const borderColor = rgb(0, 0, 0);
    page.drawRectangle({
        x: left, y: tableBottom, width: right - left, height: tableTop - tableBottom, borderWidth: 1, borderColor,
    });
    for (const y of [headerBottom, totalsTop]) {
        page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 1, color: borderColor });
    }
    page.drawText('Descrizione', { x: 61.89, y: 448, font: italic, size: 10 });
    drawRight('Costo €', 493.15, 448, italic);
    drawRight('IVA', 534.4, 448, italic);

    items.forEach(([label, amount, vat], index) => {
        const y = headerBottom - 16.5 - index * rowHeight;
        page.drawText(label, { x: 61.89, y, font: regular, size: 10 });
        drawRight(euros(amount), 493.15, y);
        drawRight(vat, 534.4, y);
    });
    const totals = [['SUBTOTALE', prices.subtotal, regular], ['IVA', prices.vat, regular], ['TOTALE', prices.total, bold]];
    totals.forEach(([label, amount, font], index) => {
        const y = totalsTop - 17.5 - index * rowHeight;
        page.drawText(label, { x: 61.89, y, font, size: 10 });
        drawRight(euros(amount), 534.4, y, font);
    });

    const serviceRequirement = includesService
        ? 'Presa elettrica trifase 32A pentapolare 20Kw nei pressi del palco'
        : 'Il pieno rispetto della scheda tecnica';
    const requirements = [serviceRequirement];
    if (details.meal) requirements.push('Pasto per 8 persone');
    if (details.overnight) requirements.push('Pernottamento per 8 persone');
    requirements.push('Bibite (es. birra e acqua) durante tutta la giornata del concerto');

    const requirementsTop = tableBottom - 26.5;
    page.drawText('È inoltre richiesto:', { x: 56.64, y: requirementsTop, font: regular, size: 10 });
    requirements.forEach((label, index) => {
        const y = requirementsTop - 15 * (index + 1);
        page.drawText('-', { x: 74.64, y, font: regular, size: 10 });
        page.drawText(label, { x: 92.64, y, font: regular, size: 10 });
    });

    pdf.setTitle('Preventivo Lou Tapage');
    return pdf.save();
}

async function loadTemplate() {
    try {
        return await result(client.storage.from(templateBucket).download(templateName, {}, { cache: 'no-store' }));
    } catch {
        throw new Error('Impossibile caricare il modello del preventivo. Verifica l’accesso e riprova.');
    }
}

function downloadPdf(bytes, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function quotes() {
    const priceLists = await quotePriceLists();
    return {
        title: 'Preventivi', active: 'quotes', narrow: true,
        content: `<form method="post" id="quote-form" class="stack">
            <div class="subpanel stack">
                <h2>Dati del preventivo</h2>
                ${input('Data preventivo', 'issue_date', today(), 'date', dateAttributes)}
                ${textarea('Destinatario', 'recipient', '', 3, 'required maxlength="255"')}
                ${input('Oggetto', 'subject', 'Preventivo concerto gruppo musicale Lou Tapage', 'text', 'required maxlength="255"')}
                ${grid(2, input('Data e ora del concerto', 'concert_date_time', '', 'text',
                    'required maxlength="255" placeholder="01/01/2027 ore 21:00"'),
                    input('Luogo del concerto', 'place', '', 'text', 'required maxlength="255"'))}
                <div class="field"><span>Inclusi</span><div class="checkbox-grid">
                    ${check('Pasto', 'meal', true)}
                    ${check('Pernottamento', 'overnight', false)}
                </div></div>
            </div>
            <div class="subpanel stack">
                <h2>Importi</h2>
                ${grid(2, input('Cachet band (€)', 'cachet', '', 'text', `required ${amountAttributes}`),
                    input('Service audio e luci (€), facoltativo', 'service', '', 'text', amountAttributes))}
                <div aria-live="polite">
                    ${grid(3, total('Subtotale', '', 'quote-subtotal'), total('IVA', '', 'quote-vat'),
                        total('Totale', '', 'quote-total'))}
                </div>
                ${quoteInfo(priceLists)}
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn--primary">${icon('download')} Scarica PDF</button>
            </div>
        </form>`,
        bind(root) {
            const form = root.querySelector('#quote-form');
            const button = form.querySelector('button');
            const totals = ['subtotal', 'vat', 'total'].map((key) => [key, form.querySelector(`#quote-${key}`)]);
            const refresh = () => {
                const prices = quoteTotals(new FormData(form));
                for (const [key, target] of totals) {
                    const value = Number.isFinite(prices[key]) ? euros(prices[key]) : '–';
                    if (target.textContent !== value) target.textContent = value;
                }
            };
            form.addEventListener('input', refresh);
            form.addEventListener('change', refresh);
            refresh();

            form.addEventListener('submit', (event) => {
                event.preventDefault();
                if (button.disabled) return;
                const data = new FormData(form);
                void submit(async () => {
                    const details = {
                        recipient: data.get('recipient').trim(), subject: data.get('subject').trim(),
                        place: data.get('place').trim(), concertDateTime: data.get('concert_date_time').trim(),
                        issueDate: data.get('issue_date'), meal: data.has('meal'), overnight: data.has('overnight'),
                    };
                    if (!details.recipient || !details.subject || !details.place || !details.concertDateTime) {
                        throw new Error('Compila i campi obbligatori del preventivo.');
                    }
                    const prices = quoteTotals(data);
                    if (!Number.isFinite(prices.total)) {
                        throw new Error('Inserisci importi da 0 a 99.999.999,99 €, con al massimo due decimali.');
                    }
                    try {
                        const [template, pdfLib] = await Promise.all([loadTemplate(), loadPdfLibrary()]);
                        const bytes = await createQuotePdf(template, pdfLib, details, prices);
                        if (form.isConnected) downloadPdf(bytes, `preventivo-lou-tapage-${details.issueDate}.pdf`);
                    } catch (error) {
                        if (form.isConnected) {
                            flash(error.message);
                            root.querySelector('#flash').scrollIntoView({ block: 'nearest' });
                        }
                    }
                }, [button]);
            });
        },
    };
}
