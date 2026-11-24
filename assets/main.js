import { client, result, rpc } from './data.js';
import { bookingForm, concertForm, merchForm, MissingRecord, projectForm } from './forms.js';
import { absences, booking, concerts, merch, projects, summary } from './lists.js';
import { quotes } from './quotes.js';
import { flash, href, input, layout, submit } from './ui.js';

const root = document.querySelector('#app');
const routes = { concerts, summary, absences, projects, booking, merch, quotes };
const forms = {
    'concert-form': ['concerts', concertForm], 'project-form': ['projects', projectForm],
    'booking-form': ['booking', bookingForm], 'merch-form': ['merch', merchForm],
};
let session = null;
let navigationVersion = 0;

function login(message = '') {
    session = null;
    navigationVersion++;
    document.body.className = 'auth-page';
    document.title = 'Accesso area concerti';
    root.innerHTML = `<main class="auth-card">
        <div class="auth-card__intro"><p class="eyebrow">Lou Tapage</p><h1>Area riservata</h1></div>
        <div id="flash" aria-live="polite"></div>
        <form id="login-form" method="post" class="stack">
            ${input('Email', 'email', '', 'email', 'required autocomplete="username"')}
            ${input('Password', 'password', '', 'password', 'required autocomplete="current-password"')}
            <button type="submit" class="btn btn--primary">Accedi</button>
        </form>
    </main>`;
    flash(message);
    const form = root.querySelector('#login-form');
    const button = form.querySelector('button');
    button.disabled = !client;
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        void submit(async () => {
            const data = new FormData(form);
            const response = await client.auth.signInWithPassword({ email: data.get('email').trim(), password: data.get('password') });
            if (response.error) throw new Error('Accesso non riuscito. Verifica email e password.');
            await start();
        }, [button]);
    });
}

async function loadPage(action, params) {
    if (Object.hasOwn(forms, action)) {
        const id = params.has('id') ? Number(params.get('id')) : null;
        if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) throw new MissingRecord();
        return forms[action][1](id);
    }
    return (Object.hasOwn(routes, action) ? routes[action] : concerts)(params);
}

async function logout() {
    session = null;
    navigationVersion++;
    root.replaceChildren();
    history.replaceState(null, '', href('concerts'));
    try {
        await result(client.auth.signOut({ scope: 'local' }));
        login();
    } catch {
        login('Impossibile completare il logout. Riprova tra poco.');
    }
}

async function start() {
    if (!client) {
        login('Impossibile caricare il servizio di accesso. Ricarica la pagina.');
        return;
    }

    const version = ++navigationVersion;
    try {
        const { session: currentSession } = await result(client.auth.getSession());
        if (version !== navigationVersion) return;
        const action = new URLSearchParams(location.search).get('action');
        if (!currentSession) {
            if (action === 'logout') history.replaceState(null, '', href('concerts'));
            login();
            return;
        }
        if (action === 'logout') {
            await logout();
            return;
        }
        const isAdmin = await rpc('lou_is_admin');
        if (version !== navigationVersion) return;
        if (!isAdmin) {
            await result(client.auth.signOut({ scope: 'local' }));
            login('Questo account non è abilitato all’area riservata.');
            return;
        }
        session = currentSession;
    } catch {
        login('Servizio di accesso non disponibile. Riprova tra poco.');
        return;
    }
    await showPage(location.href);
}

async function showPage(destination, { push = false, message = '' } = {}) {
    if (!session) return;
    const url = new URL(destination, location.href);
    const action = url.searchParams.get('action');
    if (action === 'logout') {
        await logout();
        return;
    }

    const version = ++navigationVersion;
    let page;
    try {
        page = await loadPage(action, url.searchParams);
    } catch (error) {
        const back = Object.hasOwn(forms, action) ? forms[action][0] : 'concerts';
        const missing = error instanceof MissingRecord;
        page = { title: missing ? error.message : 'Impossibile caricare i dati', active: back, narrow: true,
            content: `<div class="form-actions"><a class="btn btn--ghost" href="${href(back)}">Torna all’elenco</a>
                ${missing ? '' : '<button class="btn btn--primary" type="button" id="retry">Riprova</button>'}</div>`,
            bind(container) { container.querySelector('#retry')?.addEventListener('click', () => showPage(url)); },
        };
    }
    if (version !== navigationVersion) return;
    if (push && url.href !== location.href) history.pushState(null, '', url);
    document.body.className = 'dashboard-page';
    document.title = `${page.title} · Lou Tapage`;
    root.innerHTML = layout(page, session.user.email);
    page.bind?.(root);
    if (push) {
        const title = root.querySelector('h1');
        title.tabIndex = -1;
        title.focus({ preventScroll: true });
        window.scrollTo(0, 0);
    }
    if (message) flash(message, true);
}

root.addEventListener('click', (event) => {
    if (!session || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    const destination = link ? link.getAttribute('href') : event.target.closest('[data-href]')?.dataset.href;
    if (!destination?.startsWith('?') || link?.target || link?.hasAttribute('download')) return;
    event.preventDefault();
    void showPage(destination, { push: true });
});

root.addEventListener('keydown', (event) => {
    const row = event.target.closest('[data-href]');
    if (!session || event.target !== row || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    void showPage(row.dataset.href, { push: true });
});

root.addEventListener('submit', (event) => {
    if (!session || !event.target.matches('.filters-bar')) return;
    event.preventDefault();
    const params = new URLSearchParams(new FormData(event.target));
    void showPage(`?${params}`, { push: true });
});

window.addEventListener('popstate', () => void showPage(location.href));
window.addEventListener('lou:navigate', ({ detail }) => void showPage(detail.destination, { push: true, message: detail.message }));
client?.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') login();
});
void start();
