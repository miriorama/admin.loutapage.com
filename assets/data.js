const url = 'https://tugdfxylorsusneeoczo.supabase.co';
const key = 'sb_publishable_ol3pd6BUbYNwImmraCRR1g_UJslf1L3';

export const client = window.supabase?.createClient(url, key);

export async function result(request) {
    const { data, error } = await request;
    if (error) throw error;
    return data;
}

export async function rows(table, configure = (query) => query, columns = '*') {
    const pageSize = 500;
    const records = [];
    for (let offset = 0; ; offset += pageSize) {
        const query = configure(client.from(table).select(columns)).order('id');
        const page = await result(query.range(offset, offset + pageSize - 1));
        records.push(...page);
        if (page.length < pageSize) return records;
    }
}

export function quotePriceLists() {
    return rows('quote_price_lists').catch(() => []);
}

export function adminSettings() {
    return result(client.from('lou_admin_settings').select('person_tags,fitz_latitude,fitz_longitude').single());
}

export function find(table, id) {
    return result(client.from(table).select().eq('id', id).maybeSingle());
}

export function rpc(name, args = {}) {
    return result(client.rpc(name, args));
}

export function inYear(query, column, year) {
    return query.gte(column, `${year}-01-01`).lt(column, `${year + 1}-01-01`);
}

export async function concertRows(year, status) {
    const concerts = await rows('concerts', (query) => {
        if (year) query = inYear(query, 'concert_date', year);
        if (status) query = query.eq('status', status);
        return query.order('concert_date');
    });
    const expenses = await rows('concert_expenses', (query) => {
        if (year) query = inYear(query, 'concerts.concert_date', year);
        if (status) query = query.eq('concerts.status', status);
        return query;
    }, 'id,concert_id,description,amount,concerts!inner(concert_date,status)');
    const byConcert = new Map();
    for (const expense of expenses) {
        if (!byConcert.has(expense.concert_id)) byConcert.set(expense.concert_id, []);
        byConcert.get(expense.concert_id).push(expense);
    }
    return concerts.map((concert) => withExpenses(concert, byConcert.get(concert.id) ?? []));
}

export function withExpenses(concert, expenses) {
    const soundEngineer = Number(concert.sound_engineer);
    if (soundEngineer > 0) expenses = [...expenses, { description: 'Fonico', amount: soundEngineer }];
    const totalCents = expenses.reduce((total, item) => total + Math.round(Number(item.amount) * 100), 0);
    return { ...concert, expenses, net: (Math.round(Number(concert.cachet) * 100) - totalCents) / 100 };
}

export async function absenceStates(date) {
    const records = await rows('absences', (query) => query.eq('absence_date', date));
    return Object.fromEntries(records.map((row) => [row.person_tag, row.absence_state]));
}

export async function saveBooking(id, details) {
    const bookings = client.from('booking_requests');
    const request = id === null ? bookings.insert(details) : bookings.update(details).eq('id', id);
    const record = await result(request.select('id').maybeSingle());
    if (!record) throw new Error('Richiesta non trovata.');
    return record.id;
}

export async function changeConcertArchive(id, operation) {
    const concerts = client.from('concerts');
    const request = operation === 'delete' ? concerts.delete() : concerts.update({ is_archived: operation === 'archive' });
    const record = await result(request.eq('id', id).select('id').maybeSingle());
    if (!record) throw new Error(operation === 'delete' ? 'Concerto non trovato o archiviato.' : 'Concerto non trovato.');
}

export async function saveAbsence(date, tag, state) {
    const absences = client.from('absences');
    if (state === 'available') {
        await result(absences.delete().eq('absence_date', date).eq('person_tag', tag));
    } else {
        await result(absences.upsert({ absence_date: date, person_tag: tag, absence_state: state }, {
            onConflict: 'absence_date,person_tag',
        }));
    }
}
