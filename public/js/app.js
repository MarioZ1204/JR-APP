import { api, money, formatQty, ROLE, TABLE_STATUS, ITEM_STATUS, ORDER_STATUS, MOVE_TYPE, PAY, today, daysAgo, navFor, homeFor, allowedViews, UNIT_KIND_LABELS, UNITS_BY_KIND, inferUnitKind, unitKindLabel } from './api.js';
import { burgerPickerHtml, bindBurgerPicker, layerKind } from './burger-pick.js?v=64';
import { isIngredientAddable, productAllowsIngredientExtras, productAllowsCustomNotes } from './ingredient-rules.js?v=64';

const root = document.getElementById('app');
const modalRoot = document.getElementById('modal');
const toastRoot = document.getElementById('toast');

const state = {
  user: null,
  settings: {},
  alerts: [],
  view: 'login',
  params: {},
  tables: [],
  order: null,
  products: [],
  categories: [],
  ingredients: [],
  movements: [],
  kitchen: [],
  station: 'all',
  categoryId: null,
  cash: null,
  cashHistory: [],
  invoices: [],
  users: [],
  reports: {},
  reportTab: 'sales',
  from: daysAgo(7),
  to: today(),
  joinFrom: null,
  transferFrom: null,
  floorEdit: false,
  socket: null,
  socketWarned: false,
  live: false,
  infoName: 'Mi Restaurante',
  infoTagline: '',
  lanUrls: [],
  serverDates: null,
  moreNav: false,
  ticketOpen: false,
  loading: false,
  busy: null,
  billingTab: 'pending',
  posSearch: '',
  tablesView: localStorage.getItem('jr.tablesView') === 'list' ? 'list' : 'floor',
  kitchenSound: localStorage.getItem('jr.kitchenSound') !== '0',
  kitchenFullscreen: false,
  kitchenDark: localStorage.getItem('jr.kitchenDark') === '1',
  billDiscount: 0,
  billTip: 0,
  license: null,
  setup: null,
  dashboard: null,
  navCounts: {},
  tablesFilter: 'all',
  cartBump: false
};

function toast(msg, err = false) {
  toastRoot.hidden = false;
  const el = document.createElement('div');
  el.className = 'toast-item' + (err ? ' err' : '');
  el.textContent = msg;
  toastRoot.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => {
      el.remove();
      if (!toastRoot.children.length) toastRoot.hidden = true;
    }, 280);
  }, 3200);
}

function confirmDialog(message, { title = 'Confirmar', confirmText = 'Sí', cancelText = 'No', danger = false } = {}) {
  return new Promise((resolve) => {
    modal(`
      <h3 style="margin-top:0">${esc(title)}</h3>
      <p class="hint" style="white-space:pre-wrap;margin:0">${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost block" id="cd-cancel">${esc(cancelText)}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'} block" id="cd-ok">${esc(confirmText)}</button>
      </div>`);
    modalRoot.querySelector('#cd-cancel').onclick = () => { closeModal(); resolve(false); };
    modalRoot.querySelector('#cd-ok').onclick = () => { closeModal(); resolve(true); };
  });
}

function promptDialog(message, { title = '', placeholder = '', confirmText = 'Aceptar', required = false } = {}) {
  return new Promise((resolve) => {
    modal(`
      ${title ? `<h3 style="margin-top:0">${esc(title)}</h3>` : ''}
      ${message ? `<p class="hint">${esc(message)}</p>` : ''}
      <form id="prompt-form">
        <div class="field"><input name="value" placeholder="${esc(placeholder)}" autocomplete="off" ${required ? 'required' : ''} /></div>
        <div class="modal-actions row">
          <button type="button" class="btn ghost" id="pd-cancel">Cancelar</button>
          <button type="submit" class="btn primary">${esc(confirmText)}</button>
        </div>
      </form>`);
    modalRoot.querySelector('#pd-cancel').onclick = () => { closeModal(); resolve(null); };
    modalRoot.querySelector('#prompt-form').onsubmit = (ev) => {
      ev.preventDefault();
      const v = new FormData(ev.target).get('value');
      closeModal();
      resolve(String(v ?? ''));
    };
  });
}

async function withBusy(key, fn) {
  if (state.busy) return;
  state.busy = key;
  try { return await fn(); }
  finally { state.busy = null; }
}

function pageLoading() {
  return `<div class="page-loading" aria-live="polite"><div class="spinner-wrap"><div class="spinner"></div></div><p>Cargando…</p></div>`;
}

function deniedView() {
  return `
    <div class="card denied-card">
      <h2>Sin acceso</h2>
      <p>Su rol no puede abrir esta sección.</p>
      <button type="button" class="btn primary" data-act="nav" data-view="${homeFor(state.user.role)}">Ir al inicio</button>
    </div>`;
}

function closeModal() { modalRoot.hidden = true; modalRoot.innerHTML = ''; }

function modal(html) {
  modalRoot.hidden = false;
  modalRoot.innerHTML = `<div class="sheet"><button class="sheet-close" type="button" data-act="close-modal" aria-label="Cerrar">×</button>${html}</div>`;
  modalRoot.onclick = (e) => {
    if (e.target === modalRoot || e.target.closest('[data-act="close-modal"]')) {
      closeModal();
      return;
    }
    const actEl = e.target.closest('[data-act]');
    if (actEl && actEl.closest('#app') == null && actEl.tagName !== 'FORM') onClick(e);
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function removedText(it) {
  try {
    const list = JSON.parse(it.removed_json || '[]');
    if (!Array.isArray(list) || !list.length) return '';
    const names = list.map((x) => (x && x.name) || x).filter(Boolean);
    return names.length ? 'Sin ' + names.join(', ') : '';
  } catch {
    return '';
  }
}

function addedText(it) {
  try {
    const list = JSON.parse(it.added_json || '[]');
    if (!Array.isArray(list) || !list.length) return '';
    const names = list.map((x) => (x && x.name) || x).filter(Boolean);
    return names.length ? 'Extra ' + names.join(', ') : '';
  } catch {
    return '';
  }
}

function modsText(it) {
  return [removedText(it), addedText(it)].filter(Boolean).join(' · ');
}

function minutesAgo(iso) {
  if (!iso) return { minutes: 0, label: '' };
  const t = new Date(String(iso).replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) return { minutes: 0, label: '' };
  const m = Math.max(0, Math.round((Date.now() - t.getTime()) / 60000));
  let label = 'Ahora';
  if (m === 1) label = '1 min';
  else if (m > 1 && m < 60) label = `${m} min`;
  else if (m >= 60) label = Math.floor(m / 60) === 1 ? '1 h' : `${Math.floor(m / 60)} h`;
  if (m < 1) label = 'Ahora';
  return { minutes: m, label };
}

function parseHash() {
  const raw = (location.hash || '#/login').replace(/^#\/?/, '');
  const [view, ...rest] = raw.split('/');
  return { view: view || 'login', params: { id: rest[0] } };
}

function go(view, id) {
  location.hash = id ? `#/${view}/${id}` : `#/${view}`;
}

async function boot() {
  try {
    const info = await api('/api/info');
    state.infoName = info.business_name;
    state.infoTagline = info.business_tagline || '';
    state.lanUrls = info.lan_urls || [];
    state.license = info.license || null;
    state.serverDates = info.dates || null;
    if (state.serverDates?.today) {
      state.to = state.serverDates.today;
      state.from = state.serverDates.week_from || daysAgo(7);
    }
  } catch { /* login aún funciona */ }
  window.addEventListener('hashchange', () => loadView());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') ensureSocketLive();
  });
  window.addEventListener('focus', () => ensureSocketLive());
  document.addEventListener('fullscreenchange', () => {
    if (state.view === 'cocina') render();
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* PWA opcional */ });
  }
  try {
    const me = await api('/api/me');
    state.user = me.user;
    state.settings = me.settings;
    state.alerts = me.alerts || [];
    state.license = me.license || state.license;
    state.setup = me.setup || null;
    if (state.user.role === 'kitchen' && state.station === 'all') state.station = 'kitchen';
    connectSocket();
    if (me.user.must_change_password) {
      go(homeFor(state.user.role));
      render();
      showChangePasswordModal(true);
      return;
    }
    const parsed = parseHash();
    if (!parsed.view || parsed.view === 'login') go(homeFor(state.user.role));
    else loadView();
  } catch {
    go('login');
    render();
  }
}

function connectSocket() {
  const ioClient = window.io;
  if (!ioClient) return;
  if (state.socket) {
    state.socket.removeAllListeners();
    state.socket.disconnect();
  }
  state.socket = ioClient({
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 20000
  });
  state.socket.on('connect', () => {
    state.live = true;
    state.socketWarned = false;
    paintLive();
  });
  state.socket.on('disconnect', () => {
    state.live = false;
    paintLive();
  });
  state.socket.on('connect_error', (err) => {
    state.live = false;
    paintLive();
    const msg = String(err?.message || '');
    if (msg.includes('autenticado') || msg.includes('Authentication')) return;
    if (!state.socketWarned) {
      state.socketWarned = true;
      toast('Tiempo real desconectado. Recargue si no se actualiza solo.', true);
    }
  });
  const refresh = () => {
    if (!state.user) return;
    if (!modalRoot.hidden) return;
    if (state.view === 'facturar' && state.params.id) return;
    loadView(true);
  };
  state.socket.on('tables:changed', refresh);
  state.socket.on('orders:changed', refresh);
  state.socket.on('kitchen:changed', async () => {
    if (state.kitchenSound) playKitchenChime();
    await fetchNavCounts();
    if (state.view === 'cocina') loadView(true);
    else if (state.view === 'comanda' || state.view === 'mesas') loadView(true);
    else render();
    if (state.user?.role === 'kitchen') toast('Llegó un pedido nuevo');
  });
  state.socket.on('cash:changed', refresh);
  state.socket.on('inventory:changed', refresh);
  state.socket.on('menu:changed', refresh);
}

function ensureSocketLive() {
  if (!state.user || !state.socket) return;
  if (!state.live && !state.socket.connected) {
    try { state.socket.connect(); } catch { /* ignore */ }
  }
}

function paintLive() {
  const el = document.querySelector('.live-dot');
  if (el) el.style.background = state.live ? 'var(--ok)' : 'var(--danger)';
}

async function loadView(silent = false) {
  const { view, params } = parseHash();
  if (state.view !== view) {
    state.moreNav = false;
    if (view !== 'comanda') state.ticketOpen = false;
  }
  state.view = view;
  state.params = params;
  if (!state.user && view !== 'login') { go('login'); return; }
  if (state.user && view !== 'login' && !allowedViews(state.user.role).includes(view)) {
    toast('No tiene acceso a esa sección', true);
    go(homeFor(state.user.role));
    return;
  }
  if (!silent) {
    state.loading = true;
    if (state.user && view !== 'login') render();
  }
  try {
    if (view === 'login') { state.loading = false; render(); return; }
    if (state.user?.must_change_password) {
      state.loading = false;
      render();
      return;
    }
    const navP = fetchNavCounts();
    if (view === 'panel') {
      state.dashboard = await api('/api/dashboard');
      const me = await api('/api/me');
      state.alerts = me.alerts || [];
      state.settings = me.settings;
      state.license = me.license || state.license;
      state.setup = me.setup || null;
    } else if (view === 'mesas') {
      const [tables, me] = await Promise.all([api('/api/tables'), api('/api/me')]);
      state.tables = tables.tables;
      state.alerts = me.alerts || [];
      state.settings = me.settings;
      state.license = me.license || state.license;
      state.setup = me.setup || null;
    } else if (view === 'comanda') {
      const prevId = state.order?.id;
      const [orderWrap, productsWrap, cats, ings, tablesWrap] = await Promise.all([
        api('/api/orders/' + params.id),
        api('/api/products'),
        api('/api/categories'),
        api('/api/ingredients'),
        api('/api/tables')
      ]);
      state.order = orderWrap.order;
      state.products = productsWrap.products.filter((p) => p.active);
      state.categories = cats.categories;
      state.ingredients = ings.ingredients || [];
      state.tables = tablesWrap.tables;
      if (String(prevId) !== String(state.order?.id)) {
        state.categoryId = null;
        state.posSearch = '';
      }
    } else if (view === 'cocina') {
      state.kitchen = (await api('/api/orders?status=kitchen')).orders;
    } else if (view === 'facturar') {
      const [tables, cash, invWrap] = await Promise.all([
        api('/api/tables'),
        api('/api/cash/current'),
        api('/api/invoices').catch(() => ({ invoices: [] }))
      ]);
      state.tables = tables.tables;
      state.cash = cash;
      state.invoices = invWrap.invoices || [];
      if (params.id) {
        const prevBill = state.order?.id;
        state.order = (await api('/api/orders/' + params.id)).order;
        if (String(prevBill) !== String(state.order?.id)) {
          state.billDiscount = 0;
          state.billTip = 0;
        }
      } else state.order = null;
    } else if (view === 'caja') {
      const [cur, hist] = await Promise.all([api('/api/cash/current'), api('/api/cash/history')]);
      state.cash = cur;
      state.cashHistory = hist.history;
    } else if (view === 'inventario') {
      const [ing, mov] = await Promise.all([api('/api/ingredients'), api('/api/inventory/movements')]);
      state.ingredients = ing.ingredients;
      state.movements = mov.movements;
      state.alerts = mov.alerts || [];
    } else if (view === 'productos') {
      const [p, c, i] = await Promise.all([api('/api/products'), api('/api/categories'), api('/api/ingredients')]);
      state.products = p.products;
      state.categories = c.categories;
      state.ingredients = i.ingredients;
    } else if (view === 'usuarios') {
      state.users = (await api('/api/users')).users;
    } else if (view === 'reportes') {
      try {
        const info = await api('/api/info');
        if (info.dates) state.serverDates = info.dates;
      } catch { /* fechas locales de respaldo */ }
      await loadReports();
    } else if (view === 'config') {
      const [s, b, t, info] = await Promise.all([api('/api/settings'), api('/api/backups'), api('/api/tables'), api('/api/info')]);
      state.settings = s.settings;
      state.backups = b.backups;
      state.tables = t.tables;
      state.lanUrls = info.lan_urls || [];
    }
    await navP;
  } catch (e) {
    if (e.status === 401) { state.user = null; state.loading = false; go('login'); return; }
    if (e.status === 403) {
      if (e.data?.code === 'MUST_CHANGE') {
        showChangePasswordModal(true);
        return;
      }
      toast('No tiene permiso para ver esto', true);
      go(homeFor(state.user.role));
      return;
    }
    toast(e.message, true);
  } finally {
    state.loading = false;
    if (view !== 'login') render();
  }
}

async function loadReports() {
  const q = `?from=${state.from}&to=${state.to}`;
  const tab = state.reportTab;
  if (tab === 'sales') state.reports = await api('/api/reports/sales' + q);
  if (tab === 'products') state.reports = await api('/api/reports/products' + q);
  if (tab === 'ingredients') state.reports = await api('/api/reports/ingredients' + q);
  if (tab === 'waiters') state.reports = await api('/api/reports/waiters' + q);
  if (tab === 'audit') state.reports = await api('/api/reports/audit' + q);
}

function playKitchenChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!playKitchenChime._ctx) playKitchenChime._ctx = new Ctx();
    const ctx = playKitchenChime._ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [880, 1174].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.12, now + 0.02 + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28 + i * 0.12);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(now + i * 0.12);
      o.stop(now + 0.35 + i * 0.12);
    });
  } catch { /* sin audio no bloquea */ }
}

function exportCsv(filename, headers, rows) {
  const escCell = (v) => {
    const s = String(v ?? '');
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escCell).join(';')];
  for (const row of rows) lines.push(row.map(escCell).join(';'));
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function auditActionLabel(action) {
  const map = {
    add: 'Agregó',
    update: 'Cambió',
    cancel: 'Anuló',
    note: 'Nota'
  };
  return map[action] || action;
}

function ico(name) {
  const paths = {
    panel: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/>',
    mesas: '<rect x="3" y="10" width="18" height="11" rx="1.5"/><path d="M5 10V7m14 3V7M12 10V4M8 21v-4m8 4v-4"/>',
    cocina: '<path d="M6 12h12v8H6z"/><path d="M9 12V8a3 3 0 016 0v4M8 20v2m8-2v2"/>',
    cobrar: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M8 14h3"/>',
    caja: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5h8v2M8 13h8"/>',
    insumos: '<path d="M4 7h16l-1.5 12H5.5L4 7z"/><path d="M9 7V5h6v2"/>',
    carta: '<path d="M5 4h10l4 4v12a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M14 4v5h5M8 13h8M8 17h6"/>',
    reportes: '<path d="M4 19V9m6 10V5m6 14v-7"/>',
    equipo: '<path d="M16 19v-1a3 3 0 00-3-3H7a3 3 0 00-3 3v1"/><circle cx="9" cy="7" r="3"/><path d="M19 19v-1a3 3 0 00-2-2.8M16 4.1a3 3 0 010 5.8"/>',
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M5 12H3m18 0h-2M6.2 6.2l1.4 1.4m9 9l1.4 1.4m0-11.8l-1.4 1.4m-9 9L6.2 17.8"/>',
    more: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>',
    mas: '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'
  };
  return `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}

const MOBILE_PRIMARY = new Set(['panel', 'mesas', 'cocina', 'facturar', 'caja']);
const OP_VIEWS = new Set(['mesas', 'comanda', 'cocina', 'facturar']);
const ADMIN_VIEWS = new Set(['inventario', 'productos', 'usuarios', 'reportes', 'config']);

async function fetchNavCounts() {
  if (!state.user) return;
  try {
    state.navCounts = await api('/api/nav-counts');
  } catch { /* opcional */ }
}

function navBadgeCount(viewId) {
  const c = state.navCounts || {};
  if (viewId === 'cocina') return Number(c.kitchen_pending) || 0;
  if (viewId === 'facturar') return Number(c.waiting_payment) || 0;
  if (viewId === 'mesas') return Number(c.open_orders) || 0;
  return 0;
}

function navBtn(i) {
  const n = navBadgeCount(i.id);
  const badge = n > 0
    ? `<span class="nav-badge${n > 9 ? ' wide' : ''}" aria-label="${n} pendientes">${n > 99 ? '99+' : n}</span>`
    : '';
  return `
    <button type="button" class="${state.view === i.id ? 'on' : ''}" data-act="nav" data-view="${i.id}">
      <span class="nav-ico-wrap">${ico(i.ico)}${badge}</span><span>${i.label}</span>
    </button>`;
}

function showMoreNav() {
  const extra = navFor(state.user.role).slice(4);
  modal(`
    <h3 style="margin-top:0">Más</h3>
    <div class="more-nav">
        ${extra.map((i) => `
        <button class="more-nav-btn ${state.view === i.id ? 'on' : ''}" data-act="nav" data-view="${i.id}">
          ${ico(i.ico)}<span>${i.label}</span>
        </button>`).join('')}
    </div>`);
}

function render() {
  const focusSnap = (() => {
    const el = document.activeElement;
    if (!el || !root.contains(el)) return null;
    return {
      id: el.id || '',
      selStart: el.selectionStart,
      selEnd: el.selectionEnd
    };
  })();

  document.body.classList.toggle('kds-dark', state.view === 'cocina' && state.kitchenDark);
  if (!state.user || state.view === 'login') {
    state.moreNav = false;
    document.body.classList.remove('kds-dark');
    root.innerHTML = loginView();
    bind();
    return;
  }
  const brand = esc(state.settings.business_name || state.infoName || 'Sistema');
  const tagline = esc(brandTagline(state.settings.business_tagline || state.infoTagline));
  const all = navFor(state.user.role);
  const sideLinks = all.map(navBtn).join('');
  const useMore = all.length > 5;
  const primary = useMore ? all.filter((i) => MOBILE_PRIMARY.has(i.id)) : all;
  const moreItems = useMore ? all.filter((i) => !MOBILE_PRIMARY.has(i.id)) : [];
  const moreActive = moreItems.some((i) => i.id === state.view);
  const bottomLinks = primary.map(navBtn).join('') + (useMore ? `
    <button type="button" class="${moreActive || state.moreNav ? 'on' : ''}" data-act="toggle-more" aria-expanded="${state.moreNav ? 'true' : 'false'}">
      ${ico('mas')}<span>Más</span>
    </button>` : '');
  const morePanel = state.moreNav && useMore ? `
    <div class="more-nav-backdrop" data-act="toggle-more" aria-hidden="true"></div>
    <div class="more-nav" role="dialog" aria-label="Más opciones">
      <div class="more-nav-title">Más opciones</div>
      <div class="more-nav-grid">${moreItems.map(navBtn).join('')}</div>
    </div>` : '';
  root.innerHTML = `
    <div class="app-shell${state.view === 'comanda' ? ' is-pos' : ''}${ADMIN_VIEWS.has(state.view) ? ' is-admin' : ''}">
      <nav class="sidenav">
        <div class="sidenav-brand">
          <div class="logo-plate">
            <img src="/logo.webp?v=64" alt="JR Burger" />
          </div>
          <b>${brand}</b>
          ${tagline ? `<span>${tagline}</span>` : ''}
        </div>
        <div class="sidenav-links">${sideLinks}</div>
        <div class="sidenav-foot">
          <div class="who"><span class="live-dot"></span> ${esc(state.user.name)} · ${ROLE[state.user.role]}</div>
          <button class="btn" data-act="logout">Salir</button>
        </div>
      </nav>
      <header class="topbar">
        <div class="brand">
          <div class="logo-plate sm"><img src="/logo.webp?v=64" alt="${brand}" /></div>
          <div class="brand-copy"><b>${brand}</b>${tagline ? `<small>${tagline}</small>` : ''}</div>
        </div>
        <div class="grow"></div>
        <span class="chip"><span class="live-dot"></span>${esc(state.user.name)}</span>
        <button class="icon-btn" data-act="logout" title="Salir">Salir</button>
      </header>
      <main class="page${state.loading || OP_VIEWS.has(state.view) ? '' : ' view-enter'}">${state.loading ? pageLoading() : `${licenseBanner()}${setupBanner()}${viewHtml()}`}</main>
      ${morePanel}
      <nav class="bottom-nav">${bottomLinks}</nav>
    </div>`;
  paintLive();
  bind();
  if (state.view === 'mesas' && state.tablesView === 'floor') bindFloorMap();
  bindDataPanels();

  if (focusSnap?.id) {
    const el = document.getElementById(focusSnap.id);
    if (el) {
      try {
        el.focus({ preventScroll: true });
        if (typeof el.setSelectionRange === 'function' && focusSnap.selStart != null) {
          el.setSelectionRange(focusSnap.selStart, focusSnap.selEnd);
        }
      } catch { /* ignore */ }
    }
  }
}

function lanAccessCard() {
  const urls = state.lanUrls || [];
  const alreadyLan = !/^(localhost|127\.0\.0\.1)$/i.test(location.hostname);
  if (alreadyLan) return '';
  if (!urls.length) {
    return `<p class="hint">El celular no entra con localhost. Conecte este PC al cable o WiFi del local y en el teléfono abra <b>http://IP:3000</b> (el <b>:3000</b> al final es obligatorio).</p>`;
  }
  return `
    <div class="lan-box">
      <div class="ticket-head">En el celular</div>
      <p class="hint">Misma red del local, no datos móviles. Escriba la dirección <b>completa</b>, con <b>:3000</b> al final:</p>
      ${urls.map((u) => `<p class="lan-url">${esc(u)}</p>`).join('')}
      <p class="hint">Si no carga, en el PC ejecute <b>permitir-red.bat</b> y acepte el permiso de Windows.</p>
    </div>`;
}

function brandTagline(raw) {
  const t = String(raw || '').trim();
  if (!t) return '';
  if (/^sistema de gesti[oó]n$/i.test(t)) return '';
  if (/^gesti[oó]n del local$/i.test(t)) return '';
  return t;
}

function loginView() {
  const brand = esc(state.infoName || 'Sistema');
  const tag = esc(brandTagline(state.infoTagline));
  const lic = state.license;
  const licBanner = lic?.expired
    ? `<div class="alert warn license-banner">El servicio venció${lic.until ? ` el ${esc(lic.until)}` : ''}. Contacte a su proveedor${lic.vendor_phone ? `: ${esc(lic.vendor_phone)}` : ''}.</div>`
    : (lic?.status === 'warning'
      ? `<div class="alert warn license-banner">El servicio vence en ${lic.days_left} día(s). Avise a su proveedor.</div>`
      : '');
  return `
  <div class="login">
    <div class="login-card card">
      <img class="login-logo" src="/logo.webp?v=64" alt="${brand}" />
      <h1>${brand}</h1>
      ${tag ? `<p class="lede">${tag}</p>` : ''}
      <p class="login-sub">Mesas, cocina, caja e informes en un solo lugar</p>
      ${licBanner}
      <form data-act="login">
        <div class="field"><label>Usuario</label><input name="username" autocomplete="username" placeholder="Ej. admin" required /></div>
        <div class="field"><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" placeholder="••••••••" required /></div>
        <p id="login-error" class="danger-text" hidden></p>
        <button class="btn primary block lg" type="submit">Entrar al sistema</button>
      </form>
      ${lanAccessCard()}
      <p class="login-foot">v${esc(lic?.app_version || '1.1.0')}</p>
    </div>
  </div>`;
}

function licenseBanner() {
  const lic = state.license;
  if (!lic || lic.status === 'dev') return '';
  if (lic.expired) {
    const contact = lic.vendor_phone
      ? `${esc(lic.vendor_name || 'Proveedor')}: ${esc(lic.vendor_phone)}`
      : 'Contacte a su proveedor.';
    return `<div class="alert warn license-banner">El servicio de este sistema no está activo. ${contact}</div>`;
  }
  if (lic.status === 'warning') {
    return `<div class="alert warn license-banner">Quedan ${lic.days_left} día(s) de servicio. Avise a su proveedor.</div>`;
  }
  return '';
}

function setupBanner() {
  if (state.user?.role !== 'admin' || !state.setup || state.setup.completed) return '';
  const bits = [];
  if (state.setup.needs_password) bits.push('cambiar la contraseña de admin');
  if (state.setup.needs_business) bits.push('poner el nombre del restaurante en Ajustes');
  if (!bits.length) return '';
  return `<div class="alert info setup-banner">Para dejar el sistema listo: ${bits.join('; ')}.</div>`;
}

function showChangePasswordModal(forced = false) {
  modal(`
    <h3 style="margin-top:0">${forced ? 'Cambie su contraseña' : 'Nueva contraseña'}</h3>
    <p class="hint">${forced ? 'Por seguridad debe crear una contraseña nueva antes de usar el sistema.' : 'Mínimo 6 caracteres.'}</p>
    <form data-act="change-password">
      <div class="field"><label>Contraseña actual</label><input name="current" type="password" required autocomplete="current-password" /></div>
      <div class="field"><label>Nueva contraseña</label><input name="password" type="password" required minlength="6" autocomplete="new-password" /></div>
      <div class="field"><label>Repita la nueva</label><input name="password2" type="password" required minlength="6" autocomplete="new-password" /></div>
      <button class="btn primary block" type="submit">Guardar contraseña</button>
      ${forced ? '' : '<button type="button" class="btn ghost block" data-act="close-modal" style="margin-top:8px">Cancelar</button>'}
    </form>`);
  if (forced) {
    modalRoot.onclick = (e) => {
      if (e.target === modalRoot) return;
      const actEl = e.target.closest('[data-act]');
      if (actEl && actEl.dataset.act === 'close-modal') return;
      if (actEl && actEl.tagName !== 'FORM') onClick(e);
    };
  }
}

function viewHtml() {
  switch (state.view) {
    case 'panel': return panelView();
    case 'mesas': return mesasView();
    case 'comanda': return orderView();
    case 'cocina': return kitchenView();
    case 'facturar': return billingView();
    case 'caja': return cashView();
    case 'inventario': return inventoryView();
    case 'productos': return productsView();
    case 'usuarios': return usersView();
    case 'reportes': return reportsView();
    case 'config': return configView();
    default: return '<p>Esta pantalla no existe</p>';
  }
}

function pageHead(title, lede, actions = '') {
  return `<div class="page-head">
    <div><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

function greetingLine() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function deltaBadge(pct) {
  const n = Number(pct) || 0;
  if (!n) return `<span class="delta flat">= ayer</span>`;
  const up = n > 0;
  return `<span class="delta ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(n)}% vs ayer</span>`;
}

function panelView() {
  const d = state.dashboard || {};
  const todayStats = d.today || {};
  const week = d.week || {};
  const tables = d.tables || {};
  const cash = d.cash || {};
  const name = esc(state.user?.name || 'Administrador');
  const brand = esc(state.settings.business_name || state.infoName || 'Restaurante');
  const methods = d.methods || [];
  const methodTotal = methods.reduce((s, m) => s + Number(m.total || 0), 0) || 1;
  const alerts = d.stock_alerts || [];
  const recent = d.recent_invoices || [];

  return `
  <div class="dash">
    ${pageHead(
      `${greetingLine()}, ${name}`,
      `${brand} · resumen de hoy ${esc(todayStats.date || today())}`,
      `<button type="button" class="btn ghost" data-act="nav" data-view="reportes">Ver informes</button>
       <button type="button" class="btn primary" data-act="nav" data-view="mesas">Ir a mesas</button>`
    )}

    <div class="dash-kpis">
      <article class="dash-kpi primary">
        <span class="dash-kpi-label">Ventas de hoy</span>
        <b class="dash-kpi-value">${money(todayStats.total)}</b>
        <div class="dash-kpi-meta">${todayStats.tickets || 0} cuentas · ticket prom. ${money(todayStats.avg_ticket)}</div>
        ${deltaBadge(todayStats.vs_yesterday_pct)}
      </article>
      <article class="dash-kpi">
        <span class="dash-kpi-label">Últimos 7 días</span>
        <b class="dash-kpi-value">${money(week.total)}</b>
        <div class="dash-kpi-meta">${week.tickets || 0} cuentas cobradas</div>
      </article>
      <article class="dash-kpi">
        <span class="dash-kpi-label">En salón ahora</span>
        <b class="dash-kpi-value">${money(d.open_sales)}</b>
        <div class="dash-kpi-meta">${d.salon?.open_orders || 0} cuentas abiertas · ${tables.waiting_payment || 0} por cobrar</div>
        ${tables.waiting_payment > 0
          ? `<button type="button" class="btn warn sm dash-kpi-btn" data-act="nav-filter" data-view="facturar" data-filter="pay">Cobrar ${tables.waiting_payment}</button>`
          : ''}
      </article>
      <article class="dash-kpi ${cash.open ? 'ok' : 'warn'}">
        <span class="dash-kpi-label">Caja</span>
        <b class="dash-kpi-value">${cash.open ? money(cash.summary?.sales) : 'Cerrada'}</b>
        <div class="dash-kpi-meta">${cash.open
          ? `Turno abierto · efectivo esp. ${money(cash.summary?.expected_cash)}`
          : 'Abra la caja para cobrar'}</div>
        <button type="button" class="btn ghost sm dash-kpi-btn" data-act="nav" data-view="caja">${cash.open ? 'Ver caja' : 'Abrir caja'}</button>
      </article>
    </div>

    <div class="dash-grid">
      <section class="dash-main">
        ${hourlyChartHtml(d.hourly)}
        ${salesChartHtml(d.daily)}
        <div class="card dash-pay">
          <div class="ticket-head">Pagos de hoy</div>
          ${methods.length ? methods.map((m) => {
            const pct = Math.max(4, Math.round((Number(m.total) || 0) / methodTotal * 100));
            return `<div class="dash-pay-row">
              <div class="between"><span>${PAY[m.method] || esc(m.method)}</span><b>${money(m.total)}</b></div>
              <div class="dash-pay-bar"><i style="width:${pct}%"></i></div>
            </div>`;
          }).join('') : '<p class="hint">Aún no hay cobros hoy.</p>'}
        </div>
        <div class="card">
          <div class="card-head-row">
            <div class="ticket-head flush">Últimas cuentas</div>
            <button type="button" class="btn ghost sm" data-act="nav" data-view="facturar">Cobrar</button>
          </div>
          ${recent.length ? `<table class="table dash-table"><thead><tr><th>#</th><th>Mesa</th><th>Hora</th><th>Total</th></tr></thead>
            <tbody>${recent.map((inv) => `
              <tr class="click-row" data-act="view-inv" data-id="${inv.id}" tabindex="0" role="button">
                <td>${esc(inv.number)}</td>
                <td>${esc(inv.table_name || '—')}</td>
                <td>${esc(String(inv.created_at || '').slice(11, 16))}</td>
                <td><b>${money(inv.total)}</b></td>
              </tr>`).join('')}</tbody></table>`
            : '<p class="hint">Sin cobros recientes.</p>'}
        </div>
      </section>

      <aside class="dash-side">
        <div class="card">
          <div class="ticket-head">Salón</div>
          <div class="dash-salon">
            <div><b>${tables.free || 0}</b><span>Libres</span></div>
            <div><b>${tables.occupied || 0}</b><span>Ocupadas</span></div>
            <div class="dash-salon-pay${tables.waiting_payment > 0 ? ' hot' : ''}" ${tables.waiting_payment > 0 ? 'data-act="nav-filter" data-view="facturar" data-filter="pay" role="button" tabindex="0"' : ''}>
              <b>${tables.waiting_payment || 0}</b><span>Por cobrar</span>
            </div>
            <div><b>${d.kitchen_pending || 0}</b><span>En cocina</span></div>
          </div>
          <div class="dash-actions">
            <button type="button" class="btn primary block" data-act="nav" data-view="mesas">Mesas</button>
            <button type="button" class="btn ghost block" data-act="nav" data-view="cocina">Cocina</button>
            <button type="button" class="btn ghost block" data-act="nav" data-view="facturar">Cobrar</button>
          </div>
        </div>
        ${productsChartHtml(d.top_products)}
        <div class="card ${alerts.length ? 'dash-alert' : ''}">
          <div class="between" style="margin-bottom:8px">
            <div class="ticket-head" style="margin:0">Inventario bajo</div>
            <button type="button" class="btn ghost sm" data-act="nav" data-view="inventario">Ver</button>
          </div>
          ${alerts.length
            ? `<ul class="dash-stock">${alerts.map((a) => `
                <li><span>${esc(a.name)}</span><b>${formatQty(a.stock)} ${esc(a.unit || '')}</b></li>`).join('')}</ul>`
            : '<p class="hint">Todo el stock está en rango.</p>'}
        </div>
      </aside>
    </div>
  </div>`;
}

function filterTables(list) {
  const f = state.tablesFilter;
  if (f === 'all') return list;
  if (f === 'occupied') return list.filter((t) => t.status === 'occupied' || t.joined_to_id);
  return list.filter((t) => !t.joined_to_id && t.status === f);
}

function legendChip(key, label, count, pipClass = key) {
  const on = state.tablesFilter === key ? ' on' : '';
  return `<button type="button" class="legend-chip${on}" data-act="tables-filter" data-filter="${key}">
    <i class="pip ${pipClass}"></i> ${label} (${count})
  </button>`;
}

/* Aviso de insumos por agotarse.
   Antes se imprimían los nombres de todos, y con 30 insumos bajos quedaba un
   párrafo ilegible que ocupaba media pantalla. Ahora manda la cifra y solo se
   nombran los tres más críticos. */
function stockAlert({ conCantidad = false } = {}) {
  const bajos = state.alerts || [];
  if (!bajos.length) return '';

  const muestra = bajos.slice(0, 3);
  const nombres = muestra
    .map((a) => conCantidad
      ? `${esc(a.name)} <b>${formatQty(a.stock)} ${esc(a.unit)}</b>`
      : esc(a.name))
    .join(' · ');
  const resto = bajos.length - muestra.length;
  const irAInventario = state.user?.role === 'admin' && state.view !== 'inventario'
    ? `<button type="button" class="btn sm" data-act="nav" data-view="inventario">Ver inventario</button>`
    : '';

  return `
    <div class="alert warn stock-alert">
      <div class="stock-alert-copy">
        <b>${bajos.length} ${bajos.length === 1 ? 'insumo' : 'insumos'} por agotarse</b>
        <span>${nombres}${resto > 0 ? ` · y ${resto} más` : ''}</span>
      </div>
      ${irAInventario}
    </div>`;
}

function mesasView() {
  const picking = !!(state.joinFrom || state.transferFrom);
  if (picking) state.floorEdit = false;
  const mode = state.joinFrom ? 'Toque la otra mesa para juntarlas.' :
    state.transferFrom ? 'Toque la mesa a la que quiere pasar el pedido.' :
    state.floorEdit ? 'Arrastre las mesas a su sitio en el local.' :
    'Toque una mesa para tomar o ver el pedido.';
  const counts = {
    free: state.tables.filter((t) => t.status === 'free' && !t.joined_to_id).length,
    occupied: state.tables.filter((t) => t.status === 'occupied' || t.joined_to_id).length,
    waiting_payment: state.tables.filter((t) => t.status === 'waiting_payment').length,
    reserved: state.tables.filter((t) => t.status === 'reserved').length
  };
  const isList = state.tablesView === 'list';
  const editBtn = picking || isList
    ? ''
    : `<button type="button" class="btn ${state.floorEdit ? 'primary' : 'ghost'}" data-act="toggle-floor-edit">${state.floorEdit ? 'Listo' : 'Editar plano'}</button>`;
  const viewToggle = picking ? '' : `
    <button type="button" class="btn ${!isList ? 'primary' : 'ghost'}" data-act="tables-view" data-mode="floor">Plano</button>
    <button type="button" class="btn ${isList ? 'primary' : 'ghost'}" data-act="tables-view" data-mode="list">Lista</button>`;
  const placed = floorPositions(filterTables(state.tables));
  const sorted = filterTables([...state.tables]).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es', { numeric: true }));
  const filterBar = picking ? '' : `
    <div class="legend legend-filters">
      <button type="button" class="legend-chip${state.tablesFilter === 'all' ? ' on' : ''}" data-act="tables-filter" data-filter="all">Todas</button>
      ${legendChip('free', 'Libre', counts.free)}
      ${legendChip('occupied', 'Ocupada', counts.occupied, 'occupied')}
      ${legendChip('waiting_payment', 'Por cobrar', counts.waiting_payment, 'wait')}
      ${legendChip('reserved', 'Reservada', counts.reserved, 'reserved')}
    </div>`;
  return `
    ${pageHead('Mesas', mode, `${viewToggle}${editBtn}`)}
    ${stockAlert()}
    ${filterBar}
    ${sorted.length === 0 && state.tablesFilter !== 'all'
      ? `<div class="empty card">No hay mesas con ese filtro. <button type="button" class="btn ghost sm" data-act="tables-filter" data-filter="all">Ver todas</button></div>`
      : (isList
      ? `<div class="grid tables-grid">${sorted.map(tableCard).join('') || '<div class="empty card">No hay mesas</div>'}</div>`
      : `<div class="floor-map ${state.floorEdit ? 'is-editing' : ''} ${picking ? 'pick-mode' : ''}" id="floor-map">
      <div class="floor-label" aria-hidden="true">Salón</div>
      ${placed.map((t) => floorTable(t)).join('')}
    </div>`)}
    <div class="actions-fab">
      <button class="btn ghost" data-act="cancel-mode" ${picking ? '' : 'hidden'}>Cancelar</button>
    </div>`;
}

function floorPositions(tables) {
  const cols = 4;
  return (tables || []).map((t, i) => {
    let x = t.pos_x != null ? Number(t.pos_x) : NaN;
    let y = t.pos_y != null ? Number(t.pos_y) : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      x = 14 + col * 24;
      y = 18 + (row % 5) * 16;
    }
    return { ...t, _x: Math.min(92, Math.max(8, x)), _y: Math.min(92, Math.max(8, y)) };
  });
}

function floorTable(t) {
  const joined = t.joined_to_id;
  const status = joined ? 'occupied' : t.status;
  const label = joined ? `Junto ${esc(t.joined_to_name || '')}` : TABLE_STATUS[t.status];
  const amt = t.order ? money(t.order.subtotal) : '';
  const meta = t.order ? `${t.order.item_count}·` : `${t.seats}p`;
  const act = state.floorEdit ? '' : `data-act="table" data-id="${t.id}"`;
  const tag = state.floorEdit ? 'div' : 'button';
  const type = state.floorEdit ? '' : 'type="button"';
  return `
    <${tag} ${type} class="floor-table ${status} ${joined ? 'joined' : ''} ${t.order ? 'has-order' : ''}${status === 'waiting_payment' ? ' pay-attention' : ''}"
      data-table-id="${t.id}" ${act}
      style="left:${t._x}%;top:${t._y}%;"
      title="${esc(t.name)} · ${label}">
      <span class="floor-table-name">${esc(t.name)}</span>
      <span class="floor-table-meta">${meta}${amt ? ` ${amt}` : ''}</span>
      <span class="badge ${status}">${label}</span>
    </${tag}>`;
}

function tableCard(t) {
  const joined = t.joined_to_id;
  const status = joined ? 'occupied' : t.status;
  const label = joined ? `Junto con ${esc(t.joined_to_name)}` : TABLE_STATUS[t.status];
  const extra = t.order ? `${t.order.item_count} productos · ${money(t.order.subtotal)}` : `${t.seats} personas`;
  return `
    <button class="card table-card ${status} ${joined ? 'joined' : ''} ${t.order ? 'pulse' : ''}${status === 'waiting_payment' ? ' pay-attention' : ''}"
      data-act="table" data-id="${t.id}">
      <div>
        <div class="between"><div class="name">${esc(t.name)}</div><span class="badge ${status}">${label}</span></div>
        <div class="meta">${extra}${t.order ? `<br>${esc(t.order.waiter_name)}` : ''}</div>
      </div>
      <div class="amount">${t.order ? money(t.order.subtotal) : ''}</div>
    </button>`;
}

function foldSearch(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function catKey(name) {
  const n = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/hamburg/.test(n)) return 'hamburguesa';
  if (/perro|hot.?dog/.test(n)) return 'perro';
  if (/arepa/.test(n)) return 'arepa';
  if (/carne/.test(n)) return 'carne';
  if (/especial|toston|alitas|costill/.test(n)) return 'especial';
  if (/salchi|papa/.test(n)) return 'salchipapa';
  if (/mazorc/.test(n)) return 'mazorca';
  if (/adicion|extra|porcion/.test(n)) return 'adicional';
  if (/bebida|jugo|gaseosa|cerveza|agua/.test(n)) return 'bebida';
  return 'menu';
}

function catIcon(name) {
  const key = catKey(name);
  return `<img class="cat-ico cat-ico-${key}" src="/icons/cats/${key}.webp?v=64" alt="" width="64" height="64" decoding="async" draggable="false" />`;
}

function orderView() {
  const o = state.order;
  if (!o) return '<p>No se encontró el pedido</p>';
  const active = o.items.filter((i) => i.status !== 'cancelled');
  const q = foldSearch(state.posSearch);
  const browsing = !q && (state.categoryId == null || state.categoryId === '');
  const cat = browsing ? null : state.categories.find((c) => String(c.id) === String(state.categoryId));
  const products = q
    ? state.products.filter((p) => foldSearch(p.name).includes(q))
    : (browsing ? [] : state.products.filter((p) => String(p.category_id) === String(state.categoryId)));
  const unsent = active.filter((i) => !i.sent).length;
  const billed = ['billed', 'cancelled'].includes(o.status);
  const joinedTables = (state.tables || []).filter((t) => t.joined_to_id === o.table_id);
  const backAct = q ? 'data-act="pos-clear-search"' : (browsing ? 'data-act="nav" data-view="mesas"' : 'data-act="cat-home"');
  const title = q ? 'Buscar' : (browsing ? esc(o.table_name) : esc(cat?.name || 'Grupo'));
  const subtitle = q
    ? `${products.length} resultado${products.length === 1 ? '' : 's'}`
    : (browsing
      ? `#${o.id} · ${esc(o.waiter_name)} · elija un grupo`
      : `#${o.id} · ${products.length} producto${products.length === 1 ? '' : 's'}`);

  const productGrid = (list) => `<div class="pos-menu">
    ${list.map((p) => `
      <button type="button" class="pos-item" data-act="add-prod" data-id="${p.id}">
        <span class="pos-item-name">${esc(p.name)}</span>
        <span class="pos-item-price">${money(p.price)}</span>
      </button>
    `).join('') || `<div class="empty">${q ? 'No hay productos con ese nombre' : 'No hay productos en este grupo'}</div>`}
  </div>`;

  const body = q || !browsing
    ? productGrid(products)
    : `<div class="pos-groups">
        ${(state.categories || []).map((c) => {
          const count = state.products.filter((p) => String(p.category_id) === String(c.id)).length;
          return `
            <button type="button" class="pos-group pos-group-${catKey(c.name)}" data-act="cat" data-id="${c.id}">
              <span class="pos-group-ico" aria-hidden="true">${catIcon(c.name)}</span>
              <span class="pos-group-copy">
                <span class="pos-group-name">${esc(c.name)}</span>
                <span class="pos-group-meta">${count} producto${count === 1 ? '' : 's'}</span>
              </span>
              <span class="pos-group-go">›</span>
            </button>`;
        }).join('') || '<div class="empty">No hay grupos en el menú</div>'}
      </div>`;

  return `
    <div class="pos">
      <div class="pos-main">
        <header class="pos-bar">
          <div class="pos-bar-top">
            <button type="button" class="pos-back" ${backAct} aria-label="Volver">←</button>
            <div class="pos-bar-copy">
              <h1>${title}</h1>
              <p>${subtitle}</p>
            </div>
          </div>
          ${!billed ? `<input id="pos-search" type="search" enterkeyhint="search" inputmode="search" class="pos-search" placeholder="Buscar producto…" value="${esc(state.posSearch)}" autocomplete="off" autocapitalize="off" spellcheck="false" />` : ''}
        </header>
        ${body}
      </div>
      <aside class="pos-ticket${state.ticketOpen ? ' is-open' : ''}">
        <div class="pos-ticket-top">
          <h2>Pedido</h2>
          <button type="button" class="pos-ticket-close" data-act="toggle-ticket">Cerrar</button>
        </div>
        <div class="pos-ticket-lines">
          ${o.items.map((it) => `
            <div class="pos-line ${it.status === 'cancelled' ? 'cancelled' : ''}">
              <div class="pos-line-main">
                <div class="pos-line-name">${it.quantity}× ${esc(it.product_name)}</div>
                ${it.notes ? `<div class="pos-line-note">${esc(it.notes)}</div>` : ''}
                ${modsText(it) ? `<div class="pos-line-note">${esc(modsText(it))}</div>` : ''}
                <div class="pos-line-st">${ITEM_STATUS[it.status]}${it.sent ? ' · en cocina' : ' · sin enviar'}</div>
              </div>
              <div class="pos-line-amt">${money(it.quantity * it.unit_price)}</div>
              ${it.status !== 'cancelled' && !billed ? `
                <div class="pos-line-qty">
                  <button type="button" data-act="qty" data-id="${it.id}" data-d="-1">−</button>
                  <span>${it.quantity}</span>
                  <button type="button" data-act="qty" data-id="${it.id}" data-d="1">+</button>
                  ${orderItemAllowsCustomNotes(it) ? `<button type="button" class="ghost" data-act="note-item" data-id="${it.id}">Nota</button>` : ''}
                  <button type="button" class="ghost danger-text" data-act="cancel-item" data-id="${it.id}">Quitar</button>
                </div>` : ''}
            </div>`).join('') || '<div class="empty">Toque un producto para agregarlo</div>'}
        </div>
        <div class="pos-ticket-foot">
          <div class="pos-total"><span>Total</span><b>${money(o.subtotal)}</b></div>
          <button type="button" class="btn primary block lg${state.busy === 'send' ? ' is-busy' : ''}" data-act="send-order" ${!unsent || state.busy ? 'disabled' : ''}>${state.busy === 'send' ? 'Enviando…' : `Enviar a cocina (${unsent})`}</button>
          <button type="button" class="btn gold block" data-act="wait-pay">Pedir cuenta</button>
          <div class="pos-ticket-extra">
            <button type="button" class="btn ghost" data-act="join-mode">Juntar</button>
            <button type="button" class="btn ghost" data-act="transfer-mode">Pasar</button>
            ${joinedTables.length ? `<button type="button" class="btn ghost" data-act="split-tables">Separar (${joinedTables.length})</button>` : ''}
          </div>
          ${billed ? '' : `<button type="button" class="btn danger block" data-act="cancel-order">${active.length ? 'Cancelar cuenta' : 'Liberar mesa'}</button>`}
        </div>
      </aside>
    </div>
    ${state.ticketOpen ? '<div class="pos-backdrop" data-act="toggle-ticket"></div>' : ''}
    ${billed ? '' : `
    <div class="pos-dock${state.cartBump ? ' bump' : ''}">
      <button type="button" class="pos-dock-cart" data-act="toggle-ticket">
        <span>${active.length} prod.</span>
        <b>${money(o.subtotal)}</b>
      </button>
      <button type="button" class="btn primary${state.busy === 'send' ? ' is-busy' : ''}" data-act="send-order" ${!unsent || state.busy ? 'disabled' : ''}>${state.busy === 'send' ? 'Enviando…' : `Enviar${unsent ? ` (${unsent})` : ''}`}</button>
    </div>`}`;
}

function kitchenView() {
  const tabs = `
    <div class="tabs kds-tabs">
      <button type="button" data-act="kds-station" data-st="all" class="${state.station === 'all' ? 'on' : ''}">Todo</button>
      <button type="button" data-act="kds-station" data-st="kitchen" class="${state.station === 'kitchen' ? 'on' : ''}">Cocina</button>
      <button type="button" data-act="kds-station" data-st="bar" class="${state.station === 'bar' ? 'on' : ''}">Barra</button>
    </div>`;
  const filtered = state.kitchen.map((o) => ({
    ...o,
    items: o.items.filter((i) => {
      if (!i.sent || i.status === 'cancelled') return false;
      if (state.station === 'all') return true;
      return (i.station || 'kitchen') === state.station;
    })
  })).filter((o) => o.items.length);

  const actions = `
    <button type="button" class="btn ghost" data-act="toggle-kitchen-sound">${state.kitchenSound ? 'Sonido: sí' : 'Sonido: no'}</button>
    <button type="button" class="btn ghost" data-act="toggle-kitchen-dark">${state.kitchenDark ? 'Modo: oscuro' : 'Modo: claro'}</button>
    <button type="button" class="btn ghost" data-act="kitchen-fullscreen">${document.fullscreenElement ? 'Salir pantalla' : 'Pantalla completa'}</button>`;

  return `
    ${pageHead('Cocina', 'Pedidos en vivo por estación.', actions)}
    ${tabs}
    <div class="kds">
      ${filtered.map((o) => {
        const wait = minutesAgo(o.updated_at || o.created_at);
        return `
        <article class="card kds-card ${esc(o.status)} ${wait.minutes >= 10 ? 'late' : ''}">
          <div class="kds-top">
            <div>
              <h2>${esc(o.table_name)}</h2>
              <div class="small muted">#${o.id} · ${esc(o.waiter_name)}</div>
            </div>
            <div class="kds-meta">
              ${wait.label ? `<div class="kds-time">${wait.label}</div>` : ''}
              <span class="badge occupied">${esc(ORDER_STATUS[o.status] || o.status)}</span>
            </div>
          </div>
          ${o.items.map((it) => `
            <div class="kds-item ${it.status}">
              <div class="between">
                <b>${it.quantity}× ${esc(it.product_name)}</b>
                <span class="badge ${it.status}">${ITEM_STATUS[it.status]}</span>
              </div>
              ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ''}
              ${modsText(it) ? `<div class="notes">${esc(modsText(it))}</div>` : ''}
              <div class="kds-actions">
                <button class="btn" data-act="item-status" data-oid="${o.id}" data-id="${it.id}" data-st="preparing">Cocinando</button>
                <button class="btn sage" data-act="item-status" data-oid="${o.id}" data-id="${it.id}" data-st="ready">Listo</button>
                <button class="btn ghost" data-act="item-status" data-oid="${o.id}" data-id="${it.id}" data-st="delivered">Servido</button>
              </div>
            </div>`).join('')}
          <button class="btn primary block" data-act="order-status" data-id="${o.id}" data-st="ready">Marcar todo listo</button>
        </article>`;
      }).join('') || '<div class="empty card">No hay pedidos en cocina.</div>'}
    </div>`;
}

function billingView() {
  const payable = state.tables
    .filter((t) => t.order && !t.joined_to_id)
    .sort((a, b) => {
      if (a.status === 'waiting_payment' && b.status !== 'waiting_payment') return -1;
      if (b.status === 'waiting_payment' && a.status !== 'waiting_payment') return 1;
      return 0;
    });
  const openCash = state.cash?.register;
  if (state.order) return billForm(state.order, openCash);

  const tabs = `
    <div class="tabs">
      <button type="button" data-act="bill-tab" data-tab="pending" class="${state.billingTab === 'pending' ? 'on' : ''}">Por cobrar</button>
      <button type="button" data-act="bill-tab" data-tab="history" class="${state.billingTab === 'history' ? 'on' : ''}">Historial</button>
    </div>`;

  if (state.billingTab === 'history') {
    const rows = (state.invoices || []).map((inv) => ({
      search: `#${inv.number} ${inv.table_name} ${inv.cashier_name} ${inv.total} ${inv.created_at}`,
      html: `<div class="card inv-row">
        <div class="grow">
          <b>Ticket #${inv.number}</b> · ${esc(inv.table_name)}
          <div class="small muted">${esc(inv.created_at)} · ${esc(inv.cashier_name)} · ${money(inv.total)}</div>
        </div>
        <span class="badge ${inv.status === 'cancelled' ? 'reserved' : 'free'}">${inv.status === 'cancelled' ? 'Anulado' : 'Cobrado'}</span>
        <div class="actions">
          ${inv.status === 'paid' ? `<button type="button" class="btn ghost" data-act="reprint-inv" data-id="${inv.id}">Reimprimir</button>` : ''}
          ${inv.status === 'paid' ? `<button type="button" class="btn danger" data-act="void-inv" data-id="${inv.id}">Anular</button>` : ''}
        </div>
      </div>`
    }));
    return `
      ${pageHead('Cobrar', 'Ventas ya registradas. Puede reimprimir o anular un ticket.')}
      ${tabs}
      ${!openCash ? '<div class="alert warn">Abra la caja para anular tickets.</div>' : ''}
      ${dataPanel({
        id: 'inv-history',
        mode: 'cards',
        searchPlaceholder: 'Buscar ticket, mesa o cajero…',
        pageSize: 12,
        rows,
        empty: 'Todavía no hay ventas registradas'
      })}`;
  }

  return `
    ${pageHead('Cobrar', 'Mesas que todavía no han pagado. Si pidieron la cuenta, se ven en amarillo.')}
    ${tabs}
    ${!openCash ? '<div class="alert warn">Primero abra la caja para poder cobrar.</div>' : ''}
    <div class="grid tables-grid">
      ${payable.map(tableCard).join('') || '<div class="empty card">Nada por cobrar ahora.</div>'}
    </div>`;
}

function billForm(o, openCash) {
  const active = o.items.filter((i) => i.status !== 'cancelled');
  const taxRate = Number(state.settings.tax_rate || 0);
  const included = state.settings.tax_included;
  const subtotal = o.subtotal;
  const discount = Math.min(Math.max(0, Math.round(Number(state.billDiscount) || 0)), Math.round(subtotal));
  const tip = Math.max(0, Math.round(Number(state.billTip) || 0));
  const base = Math.max(0, subtotal - discount);
  let tax = 0, total = base;
  if (taxRate > 0 && !included) { tax = Math.round(base * taxRate / 100); total = base + tax; }
  else if (taxRate > 0 && included) tax = Math.round(base - base / (1 + taxRate / 100));
  total = Math.round(total + tip);
  return `
    ${pageHead('Cobrar ' + esc(o.table_name), '', `<button class="btn ghost" data-act="nav" data-view="facturar">Volver</button>`)}
    ${!openCash ? '<div class="alert warn">Primero abra la caja.</div>' : ''}
    <div class="bill-grid">
      <div class="card">
        <div class="ticket-head">Lo que pidieron</div>
        ${active.map((i) => `<div class="ticket-line"><span>${i.quantity}× ${esc(i.product_name)}${modsText(i) ? `<div class="notes">${esc(modsText(i))}</div>` : ''}</span><span class="line-amt">${money(i.quantity * i.unit_price)}</span></div>`).join('')}
        <div class="between muted"><span>Suma</span><span>${money(subtotal)}</span></div>
        ${discount ? `<div class="between muted"><span>Descuento</span><span>-${money(discount)}</span></div>` : ''}
        ${taxRate ? `<div class="between muted"><span>IVA ${taxRate}%${included ? ' (incluido)' : ''}</span><span>${money(tax)}</span></div>` : ''}
        ${tip ? `<div class="between muted"><span>Propina</span><span>${money(tip)}</span></div>` : ''}
        <div class="ticket-total"><span>Total</span><b>${money(total)}</b></div>
      </div>
      <form class="card" data-act="invoice" data-total="${total}" data-oid="${o.id}">
        <div class="ticket-head">Cómo pagan</div>
        <div class="field"><label>Descuento ($)</label>
          <input type="number" min="0" step="1" name="discount" data-act="bill-adj" data-field="discount" value="${discount}" /></div>
        <div class="field"><label>Propina ($)</label>
          <input type="number" min="0" step="1" name="tip" data-act="bill-adj" data-field="tip" value="${tip}" /></div>
        <p class="small muted">Puede mezclar efectivo, Nequi y Daviplata. Junto debe alcanzar para el total. Si en efectivo dan de más, el vuelto no entra a la caja como venta.</p>
        <div class="pay-tiles">
          ${Object.entries(PAY).map(([k, lab]) => `
            <label class="pay-tile pay-${k}">
              <span>${lab}</span>
              <input type="number" min="0" step="1" name="${k}" value="${k === 'efectivo' ? Math.round(total) : 0}" />
            </label>`).join('')}
        </div>
        <button type="submit" class="btn primary block lg${state.busy === 'invoice' ? ' is-busy' : ''}" ${!openCash || state.busy ? 'disabled' : ''}>${state.busy === 'invoice' ? 'Cobrando…' : 'Cobrar e imprimir recibo'}</button>
      </form>
    </div>`;
}

function cashDiffLabel(n) {
  if (n == null || n === '') return '—';
  const v = Number(n);
  if (Math.round(v) === 0) return 'Cuadró';
  if (v > 0) return 'Sobra ' + money(v);
  return 'Falta ' + money(-v);
}

function salonResetCard(salon) {
  const open = Number(salon?.open_orders || 0);
  const occ = Number(salon?.occupied_tables || 0);
  return `
    <div class="card" style="margin-top:14px">
      <div class="ticket-head">Reiniciar salón</div>
      <p class="hint">Cancela las cuentas que no se cobraron y deja las mesas libres. Las ventas ya cobradas y los reportes no se tocan.</p>
      <p class="small muted">${open || occ ? `Ahora: ${open} cuenta(s) abierta(s), ${occ} mesa(s) ocupada(s).` : 'No hay cuentas abiertas.'}</p>
      <button class="btn danger" data-act="reset-salon">Reiniciar cuentas y mesas</button>
    </div>`;
}

function cashView() {
  const r = state.cash?.register;
  const s = state.cash?.summary;
  const salon = state.cash?.salon;
  if (!r) {
    return `
      ${pageHead('Caja', 'Apertura y cierre del turno. Sin caja abierta no se puede cobrar.', `<button type="button" class="btn ghost" data-act="bill-history">Ver ventas</button>`)}
      <form class="card form-narrow" data-act="open-cash">
        <div class="ticket-head">Apertura de caja</div>
        <p class="hint">Cuente el efectivo del cajón (base) y anótelo. Ese valor es el punto de partida del arqueo.</p>
        <div class="field"><label>Base (efectivo al abrir)</label><input name="opening_amount" type="number" min="0" step="1" required /></div>
        <button type="submit" class="btn primary block lg${state.busy === 'cash-open' ? ' is-busy' : ''}" ${state.busy ? 'disabled' : ''}>${state.busy === 'cash-open' ? 'Abriendo…' : 'Abrir caja'}</button>
      </form>
      ${salonResetCard(salon)}
      ${cashHistory()}`;
  }
  const moves = s?.moves || [];
  return `
    ${pageHead('Caja', `Turno abierto por ${esc(r.opened_by_name)} · ${esc(r.opened_at)}`, `
      <button class="btn ghost" type="button" data-act="bill-history">Ver ventas</button>
      <button class="btn ghost" type="button" data-act="print-cash" data-id="${r.id}">Ticket de apertura</button>`)}
    ${salon?.open_orders || salon?.occupied_tables
      ? `<div class="alert warn">Hay ${salon.open_orders || 0} cuenta(s) y ${salon.occupied_tables || 0} mesa(s) ocupada(s). Cóbrelas o reinicie el salón antes de cerrar.</div>` : ''}
    <div class="grid stats">
      <div class="stat"><span>Base al abrir</span><b>${money(r.opening_amount)}</b></div>
      <div class="stat"><span>Ventas del turno</span><b>${money(s.sales)}</b></div>
      <div class="stat accent"><span>Efectivo que debería haber</span><b>${money(s.expected_cash)}</b></div>
      <div class="stat"><span>Nequi</span><b>${money(s.byMethod.nequi)}</b></div>
      <div class="stat"><span>Daviplata</span><b>${money(s.byMethod.daviplata)}</b></div>
      <div class="stat"><span>Gastos</span><b>${money(s.expenses)}</b></div>
    </div>
    <div class="bill-grid" style="margin-top:18px">
      <form class="card" data-act="expense">
        <div class="ticket-head">Anotar un gasto</div>
        <p class="hint">Sale del efectivo del cajón (pan, gas, vuelto a un proveedor…).</p>
        <div class="field"><label>Valor</label><input name="amount" type="number" min="1" required /></div>
        <div class="field"><label>¿En qué se gastó?</label><input name="description" placeholder="Pan, gas, etc." /></div>
        <button type="submit" class="btn ghost${state.busy === 'expense' ? ' is-busy' : ''}" ${state.busy ? 'disabled' : ''}>${state.busy === 'expense' ? 'Guardando…' : 'Guardar gasto'}</button>
      </form>
      <form class="card" data-act="close-cash">
        <div class="ticket-head">Cierre de caja</div>
        <p class="hint">Cuente el efectivo. El sistema compara con la base + ventas en efectivo − gastos.</p>
        <div class="field"><label>¿Cuánto efectivo hay ahora?</label><input name="counted_cash" type="number" min="0" required /></div>
        <div class="field"><label>Nota (si quiere)</label><input name="notes" /></div>
        <button type="submit" class="btn danger block${state.busy === 'cash-close' ? ' is-busy' : ''}" ${state.busy ? 'disabled' : ''}>${state.busy === 'cash-close' ? 'Cerrando…' : 'Cerrar caja'}</button>
      </form>
    </div>
    <h3 class="section-title">Movimientos de este turno</h3>
    ${dataPanel({
      id: 'cash-moves',
      searchPlaceholder: 'Buscar movimiento…',
      pageSize: 10,
      head: '<tr><th>Tipo</th><th>Medio</th><th>Valor</th><th>Nota</th></tr>',
      rows: moves.map((m) => ({
        search: `${m.type} ${m.method || ''} ${m.description || ''} ${m.amount}`,
        html: `<tr>
          <td>${MOVE_TYPE[m.type] || m.type}</td>
          <td>${PAY[m.method] || m.method || '—'}</td>
          <td>${money(m.amount)}</td>
          <td>${esc(m.description || '')}</td>
        </tr>`
      })),
      empty: 'Todavía no hay movimientos'
    })}
    ${salonResetCard(salon)}
    ${cashHistory()}`;
}

function cashHistory() {
  const rows = (state.cashHistory || []).map((h) => ({
    search: `${h.opened_at} ${h.closed_at || ''} ${h.opened_by_name || ''}`,
    html: `<tr>
      <td>${esc(h.opened_at)}<div class="small muted">${esc(h.opened_by_name)}</div></td>
      <td>${esc(h.closed_at || 'Abierta')}</td>
      <td>${money(h.opening_amount)}</td>
      <td>${h.closing_counted != null ? money(h.closing_counted) : '—'}</td>
      <td>${cashDiffLabel(h.difference)}</td>
      <td><button class="btn ghost" type="button" data-act="print-cash" data-id="${h.id}">Ticket</button></td>
    </tr>`
  }));
  return `
    <h3 class="section-title">Cierres anteriores</h3>
    ${dataPanel({
      id: 'cash-history',
      searchPlaceholder: 'Buscar por fecha o cajero…',
      pageSize: 8,
      head: '<tr><th>Se abrió</th><th>Se cerró</th><th>Al abrir</th><th>Al contar</th><th>Diferencia</th><th></th></tr>',
      rows,
      empty: 'Sin cierres'
    })}`;
}

function inventoryView() {
  const cards = state.ingredients.map((i) => {
    const low = Number(i.stock) <= Number(i.min_stock);
    const kind = unitKindLabel(i.unit_kind || inferUnitKind(i.unit));
    const note = i.unit_kind === 'portion' && i.portion_note
      ? `<div class="small muted">${esc(i.portion_note)}</div>` : '';
    return {
      search: `${i.name} ${i.unit} ${kind}`,
      html: `<div class="card stock-card ${low ? 'low' : ''}" data-card>
          <div class="between"><b>${esc(i.name)}</b><span class="badge ${low ? 'occupied' : 'free'}">${low ? 'Poco' : 'Bien'}</span></div>
          <div class="stock-kind">${esc(kind)} · ${esc(i.unit)}</div>
          <div class="stock-num">${formatQty(i.stock)} <small>${esc(i.unit)}</small></div>
          <div class="small muted">Avisar cuando queden ${formatQty(i.min_stock)} ${esc(i.unit)}</div>
          ${note}
          <div class="row stock-actions">
            <button class="btn" data-act="move-ing" data-id="${i.id}" data-type="purchase">Entrada</button>
            <button class="btn ghost" data-act="move-ing" data-id="${i.id}" data-type="waste">Se desechó</button>
            <button class="btn ghost" data-act="move-ing" data-id="${i.id}" data-type="adjustment">Corregir</button>
            <button class="btn ghost" data-act="edit-ing" data-id="${i.id}">Editar</button>
            <button class="btn danger" data-act="del-ing" data-id="${i.id}">Borrar</button>
          </div>
        </div>`
    };
  });
  const moves = (state.movements || []).map((m) => ({
    search: `${m.created_at} ${m.ingredient_name} ${m.type} ${m.reason || ''} ${m.user_name || ''}`,
    html: `<tr>
      <td>${esc(m.created_at)}</td>
      <td>${esc(m.ingredient_name)}</td>
      <td>${esc(MOVE_TYPE[m.type] || m.type)}</td>
      <td>${formatQty(m.quantity)}</td>
      <td>${formatQty(m.stock_after)}</td>
      <td>${esc(m.reason || '')} <span class="small muted">${esc(m.user_name || '')}</span></td>
    </tr>`
  }));
  return `
    ${pageHead('Inventario', 'Defina cómo se controla cada insumo (piezas, peso, volumen o porción). Al vender, se descuenta solo.', `<button class="btn primary" data-act="new-ing">Agregar ingrediente</button>`)}
    ${stockAlert({ conCantidad: true })}
    ${dataPanel({
      id: 'inv-cards',
      mode: 'cards',
      searchPlaceholder: 'Buscar ingrediente…',
      pageSize: 12,
      rows: cards,
      empty: 'No hay ingredientes'
    })}
    <h3 class="section-title">Qué se ha movido</h3>
    ${dataPanel({
      id: 'inv-moves',
      searchPlaceholder: 'Buscar movimiento…',
      pageSize: 10,
      head: '<tr><th>Fecha</th><th>Ingrediente</th><th>Qué pasó</th><th>Cantidad</th><th>Quedó</th><th>Nota</th></tr>',
      rows: moves,
      empty: 'Sin movimientos'
    })}`;
}

function productOnSale(p) {
  return Number(p.active ?? p.active) !== 0;
}

function productsView() {
  const visible = state.products.filter(productOnSale);
  const hidden = state.products.filter((p) => !productOnSale(p));
  const cards = (list) => list.map((p) => {
    const on = productOnSale(p);
    const cat = p.category_name || p.category_name || 'Sin grupo';
    const recipe = (p.recipe || []).map((r) => {
      const iname = r.ingredient_name || r.ingredient_name;
      return `${r.quantity} ${esc(r.unit)} de ${esc(iname)}${Number(r.removable) === 0 ? '' : ' (se puede quitar)'}`;
    }).join(' · ') || 'Sin ingredientes anotados';
    return `
        <div class="card catalog-card ${on ? '' : 'is-hidden'}">
          <span class="prod-cat">${esc(cat)} · ${p.station === 'bar' ? 'Barra' : 'Cocina'}</span>
          <div class="between"><b>${esc(p.name)}</b><span class="price">${money(p.price)}</span></div>
          <div class="recipe-line">${recipe}</div>
          <div class="between" style="margin-top:12px">
            <span class="badge ${on ? 'free' : 'reserved'}">${on ? 'Se vende' : 'Oculto'}</span>
            <span class="row">
              <button class="btn" data-act="edit-prod" data-id="${p.id}">Editar</button>
              <button class="btn danger" data-act="del-prod" data-id="${p.id}">Borrar</button>
            </span>
          </div>
        </div>`;
  }).join('');
  const toRows = (list) => list.map((p) => {
    const cat = p.category_name || 'Sin grupo';
    return {
      search: `${p.name} ${cat} ${p.station || ''}`,
      html: cards([p])
    };
  });
  return `
    ${pageHead('Menú', 'Lo que se vende. En cada producto se anota qué ingredientes usa.', `
      <button class="btn primary" data-act="new-prod">Agregar producto</button>
      <button class="btn ghost" data-act="new-cat">Agregar grupo</button>`)}
    <div class="cat-admin">
      ${(state.categories || []).map((c) => `
        <span class="cat-pill">
          ${esc(c.name)}
          <button type="button" class="linkish" data-act="edit-cat" data-id="${c.id}" title="Editar grupo">Editar</button>
          <button type="button" class="linkish danger-text" data-act="del-cat" data-id="${c.id}" title="Borrar grupo">Borrar</button>
        </span>`).join('') || '<span class="muted small">Todavía no hay grupos</span>'}
    </div>
    ${dataPanel({
      id: 'prod-visible',
      mode: 'cards',
      searchPlaceholder: 'Buscar producto o grupo…',
      pageSize: 12,
      rows: toRows(visible),
      empty: 'No hay productos a la venta'
    })}
    ${hidden.length ? `<h3 class="section-title">Ocultos (${hidden.length})</h3>${dataPanel({
      id: 'prod-hidden',
      mode: 'cards',
      searchPlaceholder: 'Buscar oculto…',
      pageSize: 8,
      rows: toRows(hidden),
      empty: 'Sin ocultos'
    })}` : ''}`;
}

function usersView() {
  const rows = (state.users || []).map((u) => ({
    search: `${u.name} ${u.username} ${ROLE[u.role] || u.role}`,
    html: `<div class="card user-card">
          <div class="avatar">${esc((u.name || '?').slice(0, 1))}</div>
          <div>
            <b>${esc(u.name)}</b>
            <div class="small muted">@${esc(u.username)} · ${ROLE[u.role]}</div>
            <span class="badge ${u.active ? 'free' : 'reserved'}">${u.active ? 'Puede entrar' : 'Bloqueado'}</span>
          </div>
          <button class="btn" data-act="edit-user" data-id="${u.id}">Editar</button>
        </div>`
  }));
  return `
    ${pageHead('Personal', 'Cada persona entra con su usuario. El cargo puede ser Jefe, Mesero, Cocina o Cajero.', `<button class="btn primary" data-act="new-user">Agregar persona</button>`)}
    ${dataPanel({
      id: 'users-list',
      mode: 'cards',
      searchPlaceholder: 'Buscar persona…',
      pageSize: 12,
      rows,
      empty: 'Sin personal'
    })}`;
}

function salesChartHtml(daily) {
  const rows = (daily || []).slice(-14);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((d) => Number(d.total) || 0), 1);
  return `
    <div class="chart-card card">
      <div class="ticket-head">Ventas por día</div>
      <div class="chart-bars" role="img" aria-label="Gráfico de ventas diarias">
        ${rows.map((d) => {
          const pct = Math.max(4, Math.round((Number(d.total) || 0) / max * 100));
          const day = String(d.day || '').slice(5);
          return `<div class="chart-col" title="${esc(d.day)}: ${money(d.total)}">
            <div class="chart-bar" style="height:${pct}%"></div>
            <span class="chart-label">${esc(day)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function hourlyChartHtml(hourly) {
  const byHour = new Map((hourly || []).map((h) => [Number(h.hour), h]));
  const nowH = new Date().getHours();
  const totals = Array.from({ length: 24 }, (_, h) => Number(byHour.get(h)?.total) || 0);
  const max = Math.max(...totals, 1);
  const hasAny = totals.some((t) => t > 0);
  if (!hasAny) {
    return `<div class="chart-card card"><div class="ticket-head">Ventas por hora (hoy)</div><p class="hint">Aún no hay cobros hoy.</p></div>`;
  }
  return `
    <div class="chart-card card">
      <div class="ticket-head">Ventas por hora (hoy)</div>
      <div class="chart-bars hourly" role="img" aria-label="Ventas por hora de hoy">
        ${totals.map((total, h) => {
          const pct = total > 0 ? Math.max(6, Math.round(total / max * 100)) : 3;
          const label = `${String(h).padStart(2, '0')}:00`;
          return `<div class="chart-col${h === nowH ? ' now' : ''}${total === 0 ? ' empty' : ''}" title="${label}: ${money(total)}">
            <div class="chart-bar" style="height:${pct}%"></div>
            <span class="chart-label">${h % 4 === 0 ? h : ''}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function productsChartHtml(products) {
  const rows = (products || []).slice(0, 5);
  if (!rows.length) return '';
  const max = Math.max(...rows.map((p) => Number(p.qty) || 0), 1);
  return `
    <div class="chart-card card">
      <div class="ticket-head">Top 5 productos</div>
      <div class="chart-hbar" role="img" aria-label="Top productos">
        ${rows.map((p, i) => {
          const pct = Math.max(8, Math.round((Number(p.qty) || 0) / max * 100));
          return `<div class="chart-hrow">
            <span class="chart-hrank">${i + 1}</span>
            <div class="chart-htrack">
              <div class="chart-hfill" style="width:${pct}%"></div>
              <span class="chart-hname">${esc(p.product_name || p.name)}</span>
            </div>
            <span class="chart-hval">${formatQty(p.qty)}</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function reportDatePreset(preset) {
  const sd = state.serverDates;
  const t = sd?.today || today();
  const y = sd?.yesterday || daysAgo(1);
  const w = sd?.week_from || daysAgo(7);
  const m = sd?.month_from || daysAgo(30);
  if (preset === 'today') return { from: t, to: t };
  if (preset === 'yesterday') return { from: y, to: y };
  if (preset === 'week') return { from: w, to: t };
  if (preset === 'month') return { from: m, to: t };
  return null;
}

function reportsView() {
  const tabs = [
    ['sales', 'Ventas'], ['products', 'Lo más pedido'], ['ingredients', 'Ingredientes'],
    ['waiters', 'Meseros'], ['audit', 'Auditoría']
  ];
  let body = '';
  const r = state.reports || {};
  if (state.reportTab === 'sales') {
    body = `
      <div class="grid stats">
        <div class="stat"><span>Cuentas</span><b>${r.totals?.tickets || 0}</b></div>
        <div class="stat"><span>Total</span><b>${money(r.totals?.total)}</b></div>
      </div>
      ${salesChartHtml(r.daily)}
      ${dataPanel({
        id: 'rep-sales',
        searchPlaceholder: 'Buscar día…',
        pageSize: 12,
        head: '<tr><th>Día</th><th>Cuentas</th><th>Total</th></tr>',
        rows: (r.daily || []).map((d) => ({
          search: String(d.day),
          html: `<tr><td>${esc(d.day)}</td><td>${d.tickets}</td><td>${money(d.total)}</td></tr>`
        })),
        empty: 'Sin ventas en el rango'
      })}
      <h3 class="section-title">Cómo pagaron</h3>
      ${(r.methods || []).map((m) => `<div class="between card" style="margin-bottom:8px"><span>${PAY[m.method] || m.method}</span><b>${money(m.total)}</b></div>`).join('') || '<p class="hint">Sin pagos en el rango</p>'}`;
  } else if (state.reportTab === 'products') {
    body = `
      ${productsChartHtml(r.products)}
      ${dataPanel({
      id: 'rep-products',
      searchPlaceholder: 'Buscar producto…',
      pageSize: 12,
      head: '<tr><th>Producto</th><th>Cuántos</th><th>Total</th></tr>',
      rows: (r.products || []).map((p) => ({
        search: p.product_name || p.name || '',
        html: `<tr><td>${esc(p.product_name || p.name)}</td><td>${formatQty(p.qty)}</td><td>${money(p.total)}</td></tr>`
      })),
      empty: 'Sin datos'
    })}`;
  } else if (state.reportTab === 'ingredients') {
    body = dataPanel({
      id: 'rep-ings',
      searchPlaceholder: 'Buscar ingrediente…',
      pageSize: 12,
      head: '<tr><th>Ingrediente</th><th>Se usó</th></tr>',
      rows: (r.ingredients || []).map((i) => ({
        search: i.name,
        html: `<tr><td>${esc(i.name)}</td><td>${i.consumed} ${esc(i.unit)}</td></tr>`
      })),
      empty: 'Sin datos'
    });
  } else if (state.reportTab === 'audit') {
    body = dataPanel({
      id: 'rep-audit',
      searchPlaceholder: 'Buscar persona, producto o mesa…',
      pageSize: 15,
      head: '<tr><th>Cuándo</th><th>Quién</th><th>Acción</th><th>Producto</th><th>Mesa</th><th>Detalle</th></tr>',
      rows: (r.audit || []).map((a) => {
        let detail = '';
        try {
          const d = typeof a.details === 'string' ? JSON.parse(a.details || '{}') : (a.details || {});
          detail = d.reason || d.notes || (d.quantity != null ? `Cant. ${d.quantity}` : JSON.stringify(d));
          if (detail === '{}') detail = '';
        } catch { detail = String(a.details || ''); }
        return {
          search: `${a.user_name} ${a.product_name} ${a.table_name} ${a.action} ${detail}`,
          html: `<tr>
            <td>${esc(a.created_at)}</td>
            <td>${esc(a.user_name)}</td>
            <td>${esc(auditActionLabel(a.action))}</td>
            <td>${a.quantity || ''}× ${esc(a.product_name)}</td>
            <td>${esc(a.table_name)} · #${a.order_id}</td>
            <td>${esc(detail)}</td>
          </tr>`
        };
      }),
      empty: 'Sin cambios registrados en el rango'
    });
  } else {
    body = dataPanel({
      id: 'rep-waiters',
      searchPlaceholder: 'Buscar mesero…',
      pageSize: 12,
      head: '<tr><th>Mesero</th><th>Cuentas</th><th>Total</th></tr>',
      rows: (r.waiters || []).map((w) => ({
        search: w.name,
        html: `<tr><td>${esc(w.name)}</td><td>${w.tickets}</td><td>${money(w.total)}</td></tr>`
      })),
      empty: 'Sin datos'
    });
  }
  return `
    ${pageHead('Informes', 'Ventas, productos, ingredientes, meseros y auditoría de cambios.', `<button type="button" class="btn ghost" data-act="export-csv">Exportar CSV</button>`)}
    <div class="toolbar card">
      <div class="row" style="flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <button type="button" class="btn ghost" data-act="date-preset" data-preset="today">Hoy</button>
        <button type="button" class="btn ghost" data-act="date-preset" data-preset="yesterday">Ayer</button>
        <button type="button" class="btn ghost" data-act="date-preset" data-preset="week">7 días</button>
        <button type="button" class="btn ghost" data-act="date-preset" data-preset="month">30 días</button>
      </div>
      <div class="field"><label>Desde</label><input type="date" data-act="from" value="${state.from}" /></div>
      <div class="field"><label>Hasta</label><input type="date" data-act="to" value="${state.to}" /></div>
    </div>
    <div class="tabs">${tabs.map(([id, lab]) => `<button class="${state.reportTab === id ? 'on' : ''}" data-act="rep-tab" data-id="${id}">${lab}</button>`).join('')}</div>
    ${body}`;
}

function configView() {
  const s = state.settings;
  return `
    ${pageHead('Ajustes', 'Datos del restaurante, impresora y copias.')}
    <div class="settings-grid">
    <form class="card" data-act="save-settings">
      <div class="ticket-head">Datos del negocio</div>
      <div class="field"><label>Nombre del restaurante</label><input name="business_name" value="${esc(s.business_name || '')}" required /></div>
      <div class="field"><label>Eslogan / subtítulo</label><input name="business_tagline" value="${esc(s.business_tagline || '')}" placeholder="Ej. Comidas rápidas" /></div>
      <div class="field"><label>NIT</label><input name="business_nit" value="${esc(s.business_nit || '')}" /></div>
      <div class="field"><label>Dirección</label><input name="business_address" value="${esc(s.business_address || '')}" /></div>
      <div class="field"><label>Teléfono</label><input name="business_phone" value="${esc(s.business_phone || '')}" /></div>
      <div class="field"><label>IVA (%)</label><input name="tax_rate" type="number" min="0" step="0.1" value="${s.tax_rate || 0}" /></div>
      <div class="field"><label>¿El precio ya trae IVA?</label>
        <select name="tax_included"><option value="1" ${s.tax_included ? 'selected' : ''}>Sí, ya está incluido</option>
        <option value="0" ${s.tax_included ? '' : 'selected'}>No, se suma al cobrar</option></select></div>
      <div class="field"><label>Ancho del recibo</label>
        <select name="printer_width">
          <option value="80" ${Number(s.printer_width) !== 58 ? 'selected' : ''}>80 mm</option>
          <option value="58" ${Number(s.printer_width) === 58 ? 'selected' : ''}>58 mm</option>
        </select>
        <p class="hint">Si el ticket se corta o sale incompleto, pruebe 58 mm (SAT38TUSE suele ser 58 mm).</p></div>
      <div class="field"><label>¿Cómo se imprime?</label>
        <select name="printer_enabled"><option value="0" ${s.printer_enabled ? '' : 'selected'}>Desde el computador (elige la impresora)</option>
        <option value="1" ${s.printer_enabled ? 'selected' : ''}>Directo a la impresora del restaurante</option></select></div>
      <div class="field"><label>Nombre de la impresora (como sale en Windows)</label>
        <input name="printer_name" value="${esc(s.printer_name || '')}" placeholder="SAT38TUSE" />
        <p class="hint">Configuración → Impresoras: use el nombre exacto (ej. SAT38TUSE). No hace falta compartirla.</p></div>
      <div class="field"><label>Si se acaba un ingrediente</label>
        <select name="block_on_no_stock">
          <option value="0" ${s.block_on_no_stock ? '' : 'selected'}>Avisar y dejar vender</option>
          <option value="1" ${s.block_on_no_stock ? 'selected' : ''}>No dejar vender</option>
        </select></div>
      <div class="field"><label>Texto al final del recibo</label><input name="ticket_footer" value="${esc(s.ticket_footer || '')}" /></div>
      <button class="btn primary">Guardar</button>
    </form>
    <div>
    <div class="card">
      <div class="ticket-head">Cuenta</div>
      <p class="hint">Cambie su contraseña de acceso.</p>
      <button type="button" class="btn ghost" data-act="change-pass-self">Cambiar mi contraseña</button>
    </div>
    <div class="card" style="margin-top:14px">
      <div class="ticket-head">Impresora y copias</div>
      <div class="row">
        <button class="btn ghost" data-act="print-test">Probar recibo</button>
        <button class="btn sage" data-act="backup">Guardar copia</button>
      </div>
      <p class="hint" style="margin-top:12px">Las copias quedan en la carpeta backups. Al encender el sistema se guarda una sola.</p>
      <ul class="backup-list">${(state.backups || []).map((b) => `
        <li class="backup-item">
          <span>${esc(b.filename)}</span>
          <button type="button" class="btn ghost" data-act="restore-backup" data-file="${esc(b.filename)}">Restaurar</button>
        </li>`).join('') || '<li>Todavía no hay copias</li>'}
      </ul>
      <p class="small muted">Restaurar pide reiniciar el sistema (cerrar la ventana e iniciar.bat). Antes se guarda una copia de seguridad.</p>
    </div>
    ${/^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? `
    <div class="card" style="margin-top:14px">
      <div class="ticket-head">Acceso desde el celular</div>
      ${lanAccessCard()}
    </div>` : ''}
    <div class="card" style="margin-top:14px">
      <div class="ticket-head">Instalar en tablet / celular</div>
      <p class="hint">En Chrome o Edge: menú → <b>Instalar aplicación</b> o <b>Agregar a la pantalla de inicio</b>. Así cocina y caja se abren a pantalla completa sin barra del navegador.</p>
      <p class="small muted">La app necesita el PC servidor encendido; sin red local no cobra ni toma pedidos.</p>
    </div>
    ${salonResetCard({ open_orders: (state.tables || []).filter((t) => t.order).length, occupied_tables: (state.tables || []).filter((t) => t.order || t.status === 'occupied' || t.status === 'waiting_payment').length })}
    <div class="card" style="margin-top:14px">
      <div class="between"><div class="ticket-head" style="margin:0">Mesas</div>
        <button class="btn" data-act="new-table">Agregar mesa</button></div>
      ${(state.tables || []).map((t) => `
        <div class="table-row">
          <span>${esc(t.name)} · ${t.seats} sillas</span>
          <span class="row">
            <button class="btn" data-act="edit-table" data-id="${t.id}">Editar</button>
            <button class="btn danger" data-act="del-table" data-id="${t.id}">Quitar</button>
          </span>
        </div>`).join('')}
    </div>
    </div>
    </div>`;
}

function bind() {
  root.onclick = onClick;
  root.onsubmit = onSubmit;
  root.onchange = onChange;
  root.oninput = onInput;
  modalRoot.onsubmit = onSubmit;
}

async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM' || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const act = el.dataset.act;
  try {
    if (act === 'nav') { closeModal(); state.moreNav = false; go(el.dataset.view); }
    if (act === 'nav-filter') {
      closeModal();
      state.moreNav = false;
      if (el.dataset.filter === 'pay') state.billingTab = 'pending';
      if (el.dataset.view === 'mesas' && el.dataset.filter) state.tablesFilter = el.dataset.filter;
      go(el.dataset.view);
      return;
    }
    if (act === 'tables-filter') {
      state.tablesFilter = el.dataset.filter || 'all';
      render();
      return;
    }
    if (act === 'view-inv') {
      const data = await api(`/api/invoices/${el.dataset.id}`);
      const inv = data.invoice;
      const pays = (inv.payments || []).map((p) => `${PAY[p.method] || p.method}: ${money(p.amount)}`).join(' · ') || '—';
      modal(`
        <h3 class="modal-title">Cuenta #${esc(inv.number)}</h3>
        <p class="hint">${esc(inv.table_name || '—')} · ${esc(inv.cashier_name || '')}</p>
        <p class="hint">${esc(String(inv.created_at || ''))}</p>
        <div class="ticket-total between"><span>Total cobrado</span><b>${money(inv.total)}</b></div>
        <p class="hint">Pagó: ${esc(pays)}</p>
        <div class="modal-actions row">
          <button type="button" class="btn ghost" id="inv-close">Cerrar</button>
          <button type="button" class="btn primary" data-act="reprint-inv" data-id="${inv.id}">Reimprimir</button>
        </div>`);
      modalRoot.querySelector('#inv-close')?.addEventListener('click', closeModal);
      return;
    }
    if (act === 'toggle-more') { state.moreNav = !state.moreNav; render(); return; }
    if (act === 'kds-station') { state.station = el.dataset.st; await loadView(true); return; }
    if (act === 'tables-view') {
      state.tablesView = el.dataset.mode === 'list' ? 'list' : 'floor';
      localStorage.setItem('jr.tablesView', state.tablesView);
      state.floorEdit = false;
      render();
      return;
    }
    if (act === 'toggle-kitchen-sound') {
      state.kitchenSound = !state.kitchenSound;
      localStorage.setItem('jr.kitchenSound', state.kitchenSound ? '1' : '0');
      toast(state.kitchenSound ? 'Sonido de cocina activado' : 'Sonido de cocina apagado');
      render();
      return;
    }
    if (act === 'toggle-kitchen-dark') {
      state.kitchenDark = !state.kitchenDark;
      localStorage.setItem('jr.kitchenDark', state.kitchenDark ? '1' : '0');
      toast(state.kitchenDark ? 'Cocina en modo oscuro' : 'Cocina en modo claro');
      render();
      return;
    }
    if (act === 'kitchen-fullscreen') {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        toast('No se pudo cambiar a pantalla completa', true);
      }
      render();
      return;
    }
    if (act === 'date-preset') {
      const range = reportDatePreset(el.dataset.preset);
      if (range) {
        state.from = range.from;
        state.to = range.to;
      }
      await loadReports();
      render();
      return;
    }
    if (act === 'export-csv') {
      exportCurrentReport();
      return;
    }
    if (act === 'restore-backup') {
      const file = el.dataset.file;
      if (!await confirmDialog(
        `Se restaurará la copia:\n${file}\n\nAntes se guarda una copia de seguridad.\nLuego debe cerrar la ventana del servidor y abrir iniciar.bat otra vez.`,
        { title: 'Restaurar copia', danger: true, confirmText: 'Continuar' }
      )) return;
      const typed = await promptDialog('Escriba RESTAURAR para confirmar:', { title: 'Confirmación', required: true });
      if (typed == null) return;
      if (String(typed).trim().toUpperCase() !== 'RESTAURAR') {
        toast('No se restauró. Debía escribir RESTAURAR.', true);
        return;
      }
      const r = await api('/api/backups/restore', { method: 'POST', body: { filename: file, confirm: 'RESTAURAR' } });
      toast(r.message || 'Reinicie el servidor para aplicar');
      return;
    }
    if (act === 'toggle-ticket') {
      state.ticketOpen = !state.ticketOpen;
      render();
      return;
    }
    if (act === 'logout') { await api('/api/logout', { method: 'POST' }); state.user = null; state.moreNav = false; go('login'); }
    if (act === 'cat') { state.categoryId = el.dataset.id; state.posSearch = ''; render(); return; }
    if (act === 'cat-home') { state.categoryId = null; state.posSearch = ''; render(); return; }
    if (act === 'pos-clear-search') { state.posSearch = ''; render(); return; }
    if (act === 'bill-tab') { state.billingTab = el.dataset.tab; await loadView(true); return; }
    if (act === 'bill-history') { state.billingTab = 'history'; go('facturar'); return; }
    if (act === 'split-tables') { await splitTableMenu(); return; }
    if (act === 'split-table') {
      await api(`/api/tables/${el.dataset.id}/split`, { method: 'POST' });
      closeModal();
      toast('Mesa separada');
      await loadView();
      return;
    }
    if (act === 'reprint-inv') {
      const r = await api(`/api/invoices/${el.dataset.id}/print`, { method: 'POST' });
      openTicket(r.print);
      return;
    }
    if (act === 'void-inv') {
      const reason = await promptDialog('¿Por qué se anula este ticket?', { title: 'Anular venta', placeholder: 'Ej. error en el cobro' });
      if (reason == null) return;
      const r = await api(`/api/invoices/${el.dataset.id}/cancel`, { method: 'POST', body: { reason } });
      toast(r.message || 'Ticket anulado');
      await loadView();
      return;
    }
    if (act === 'table') await onTable(Number(el.dataset.id));
    if (act === 'add-prod') await addProduct(Number(el.dataset.id));
    if (act === 'qty') await changeQty(Number(el.dataset.id), Number(el.dataset.d));
    if (act === 'note-item') await noteItem(Number(el.dataset.id));
    if (act === 'cancel-item') await cancelItem(Number(el.dataset.id));
    if (act === 'send-order') await sendOrder();
    if (act === 'wait-pay') await waitPay();
    if (act === 'cancel-order') await cancelOrder();
    if (act === 'reset-salon') await resetSalon();
    if (act === 'del-ing') await deleteIngredient(Number(el.dataset.id));
    if (act === 'toggle-floor-edit') {
      state.floorEdit = !state.floorEdit;
      state.joinFrom = state.transferFrom = null;
      render();
      return;
    }
    if (act === 'join-mode') { state.joinFrom = state.order.table_id; state.floorEdit = false; go('mesas'); toast('Toque la mesa que quiere juntar'); }
    if (act === 'transfer-mode') { state.transferFrom = state.order.table_id; state.floorEdit = false; go('mesas'); toast('Toque la mesa a la que pasa el pedido'); }
    if (act === 'cancel-mode') { state.joinFrom = state.transferFrom = null; render(); }
    if (act === 'item-status') {
      await api(`/api/orders/${el.dataset.oid}/items/${el.dataset.id}/status`, { method: 'POST', body: { status: el.dataset.st } });
      await loadView();
    }
    if (act === 'order-status') {
      await api(`/api/orders/${el.dataset.id}/status-all`, { method: 'POST', body: { status: el.dataset.st } });
      await loadView();
    }
    if (act === 'new-ing') ingForm();
    if (act === 'edit-ing') ingForm(state.ingredients.find((i) => i.id === Number(el.dataset.id)));
    if (act === 'move-ing') moveForm(Number(el.dataset.id), el.dataset.type);
    if (act === 'new-prod') prodForm();
    if (act === 'edit-prod') prodForm(state.products.find((p) => p.id === Number(el.dataset.id)));
    if (act === 'del-prod') await deleteProduct(Number(el.dataset.id));
    if (act === 'new-cat') catForm();
    if (act === 'edit-cat') catForm(state.categories.find((c) => c.id === Number(el.dataset.id)));
    if (act === 'del-cat') {
      if (!await confirmDialog('¿Borrar este grupo? Los productos quedan sin grupo.', { title: 'Borrar grupo', danger: true })) return;
      const r = await api('/api/categories/' + el.dataset.id, { method: 'DELETE' });
      toast(r.message || 'Grupo borrado');
      await loadView();
    }
    if (act === 'new-user') userForm();
    if (act === 'edit-user') userForm(state.users.find((u) => u.id === Number(el.dataset.id)));
    if (act === 'rep-tab') { state.reportTab = el.dataset.id; await loadReports(); render(); }
    if (act === 'new-table') tableForm();
    if (act === 'edit-table') tableForm(state.tables.find((t) => t.id === Number(el.dataset.id)));
    if (act === 'del-table') {
      if (!await confirmDialog('¿Quitar esta mesa?', { title: 'Quitar mesa', danger: true })) return;
      await api('/api/tables/' + el.dataset.id, { method: 'DELETE' });
      await loadView();
    }
    if (act === 'change-pass-self') { showChangePasswordModal(false); return; }
    if (act === 'backup') { await api('/api/backup', { method: 'POST' }); toast('Copia guardada'); await loadView(); }
    if (act === 'print-test') {
      const r = await api('/api/print/test', { method: 'POST' });
      openTicket(r.print);
    }
    if (act === 'print-cash') {
      const r = await api('/api/cash/' + el.dataset.id + '/print', { method: 'POST' });
      openTicket(r.print);
    }
    if (act === 'close-modal') closeModal();
  } catch (err) {
    toast(err.message, true);
    if (err.data?.shortages) toast('Falta: ' + err.data.shortages.map((s) => s.name).join(', '), true);
  }
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const act = form.dataset.act;
  const fd = new FormData(form);
  const obj = Object.fromEntries(fd.entries());
  try {
    if (act === 'login') {
      const errEl = form.querySelector('#login-error');
      if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
      const r = await api('/api/login', { method: 'POST', body: obj });
      state.user = r.user;
      state.license = r.license || state.license;
      const me = await api('/api/me');
      state.settings = me.settings;
      state.alerts = me.alerts || [];
      state.license = me.license || state.license;
      state.setup = me.setup || null;
      try { connectSocket(); } catch { /* el acceso no depende del socket */ }
      go(homeFor(r.user.role));
      if (r.user.must_change_password || r.must_change_password) {
        render();
        showChangePasswordModal(true);
        return;
      }
      await loadView();
      return;
    }
    if (act === 'change-password') {
      if (String(obj.password) !== String(obj.password2)) {
        toast('Las contraseñas nuevas no coinciden', true);
        return;
      }
      const r = await api('/api/password', {
        method: 'POST',
        body: { current: obj.current, password: obj.password }
      });
      state.user = r.user;
      closeModal();
      // restaurar click del modal
      modalRoot.onclick = (e) => {
        if (e.target === modalRoot || e.target.closest('[data-act="close-modal"]')) {
          closeModal();
          return;
        }
        const actEl = e.target.closest('[data-act]');
        if (actEl && actEl.closest('#app') == null && actEl.tagName !== 'FORM') onClick(e);
      };
      toast(r.message || 'Contraseña actualizada');
      await loadView();
      return;
    }
    if (act === 'invoice') {
      await withBusy('invoice', async () => {
        const total = Number(form.dataset.total);
        const discount = Math.max(0, Math.round(Number(obj.discount) || 0));
        const tip = Math.max(0, Math.round(Number(obj.tip) || 0));
        const payments = ['efectivo', 'nequi', 'daviplata']
          .map((m) => ({ method: m, amount: Number(obj[m] || 0) }))
          .filter((p) => p.amount > 0);
        const sum = payments.reduce((s, p) => s + p.amount, 0);
        if (Math.round(sum) < Math.round(total)) { toast('El pago no cubre el total', true); return; }
        render();
        const r = await api('/api/invoices', {
          method: 'POST',
          body: { order_id: Number(form.dataset.oid), payments, discount, tip }
        });
        state.billDiscount = 0;
        state.billTip = 0;
        toast('Cuenta #' + r.invoice.number + ' cobrada');
        if (r.change > 0) toast('Vuelto: ' + money(r.change));
        if (r.alerts?.length) {
          const nombres = r.alerts.slice(0, 2).map((a) => a.name).join(', ');
          const resto = r.alerts.length - Math.min(2, r.alerts.length);
          toast(`Por agotarse: ${nombres}${resto > 0 ? ` y ${resto} más` : ''}`);
        }
        openTicket(r.print);
        go('facturar');
      });
      return;
    }
    if (act === 'open-cash') {
      await withBusy('cash-open', async () => {
        render();
        const r = await api('/api/cash/open', { method: 'POST', body: { opening_amount: Number(obj.opening_amount) } });
        toast('Caja abierta');
        openTicket(r.print);
        await loadView();
      });
      return;
    }
    if (act === 'expense') {
      await withBusy('expense', async () => {
        render();
        const r = await api('/api/cash/expense', { method: 'POST', body: { amount: Number(obj.amount), description: obj.description } });
        toast('Gasto anotado');
        openTicket(r.print);
        await loadView();
      });
      return;
    }
    if (act === 'close-cash') {
      await withBusy('cash-close', async () => {
        const body = { counted_cash: Number(obj.counted_cash), notes: obj.notes };
        render();
        let r;
        try {
          r = await api('/api/cash/close', { method: 'POST', body });
        } catch (err) {
          if (err.status === 409) {
            if (!await confirmDialog(
              (err.message || 'Hay cuentas abiertas') + '\n\n¿Cerrar la caja igual? Las mesas no se reinician.',
              { title: 'Cerrar caja', danger: true, confirmText: 'Cerrar igual' }
            )) return;
            r = await api('/api/cash/close', { method: 'POST', body: { ...body, force: true } });
          } else throw err;
        }
        toast('Caja cerrada. ' + cashDiffLabel(r.register.difference));
        openTicket(r.print);
        await loadView();
      });
      return;
    }
    if (act === 'save-settings') {
      obj.tax_included = obj.tax_included === '1';
      obj.printer_enabled = obj.printer_enabled === '1';
      obj.block_on_no_stock = obj.block_on_no_stock === '1';
      await api('/api/settings', { method: 'PUT', body: obj });
      toast('Guardado');
    }
    if (act === 'save-ing') {
      const body = {
        name: obj.name,
        unit: obj.unit,
        unit_kind: obj.unit_kind,
        portion_note: obj.portion_note || '',
        min_stock: Number(obj.min_stock || 0),
        stock: Number(obj.stock || 0)
      };
      if (obj.id) await api('/api/ingredients/' + obj.id, { method: 'PATCH', body });
      else await api('/api/ingredients', { method: 'POST', body });
      closeModal(); toast('Ingrediente guardado');
    }
    if (act === 'save-move') {
      await api(`/api/ingredients/${obj.id}/move`, { method: 'POST', body: { type: obj.type, quantity: Number(obj.quantity), reason: obj.reason } });
      closeModal();
      toast(obj.type === 'waste' ? 'Desecho registrado' : (obj.type === 'purchase' ? 'Entrada registrada' : 'Cantidad actualizada'));
    }
    if (act === 'save-prod') await saveProd(form);
    if (act === 'save-cat') {
      const body = { name: obj.name, station: obj.station };
      if (obj.id) await api('/api/categories/' + obj.id, { method: 'PATCH', body });
      else await api('/api/categories', { method: 'POST', body });
      closeModal(); toast(obj.id ? 'Grupo guardado' : 'Grupo creado');
    }
    if (act === 'save-user') {
      const body = { name: obj.name, username: obj.username, role: obj.role, password: obj.password, active: obj.active === '1' };
      if (obj.id) await api('/api/users/' + obj.id, { method: 'PATCH', body });
      else await api('/api/users', { method: 'POST', body });
      closeModal(); toast('Persona guardada');
    }
    if (act === 'save-table') {
      const body = { name: obj.name, seats: Number(obj.seats || 4) };
      if (obj.id) await api('/api/tables/' + obj.id, { method: 'PATCH', body });
      else await api('/api/tables', { method: 'POST', body });
      closeModal(); toast('Mesa guardada');
    }
    await loadView();
  } catch (err) {
    toast(err.message, true);
    if (err.data?.shortages) toast('Falta: ' + err.data.shortages.map((s) => s.name).join(', '), true);
    if (act === 'login') {
      const errEl = form.querySelector('#login-error');
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || 'No se pudo entrar. Use http://localhost:3000 (no XAMPP).';
      }
    }
  }
}

async function onInput(e) {
  if (e.target.id === 'pos-search') {
    state.posSearch = e.target.value;
    if (state.view === 'comanda') {
      if (state._posSearchFrame) cancelAnimationFrame(state._posSearchFrame);
      state._posSearchFrame = requestAnimationFrame(() => {
        state._posSearchFrame = 0;
        render();
      });
    }
  }
}

async function onChange(e) {
  if (e.target.dataset.act === 'from') { state.from = e.target.value; await loadReports(); render(); }
  if (e.target.dataset.act === 'to') { state.to = e.target.value; await loadReports(); render(); }
  if (e.target.dataset.act === 'bill-adj') {
    const field = e.target.dataset.field;
    const val = Math.max(0, Math.round(Number(e.target.value) || 0));
    if (field === 'discount') state.billDiscount = val;
    if (field === 'tip') state.billTip = val;
    if (state.view === 'facturar' && state.order) render();
  }
}

function exportCurrentReport() {
  const r = state.reports || {};
  const stamp = `${state.from}_${state.to}`;
  if (state.reportTab === 'sales') {
    exportCsv(`ventas_${stamp}.csv`, ['Día', 'Cuentas', 'Total'],
      (r.daily || []).map((d) => [d.day, d.tickets, Math.round(d.total || 0)]));
  } else if (state.reportTab === 'products') {
    exportCsv(`productos_${stamp}.csv`, ['Producto', 'Cantidad', 'Total'],
      (r.products || []).map((p) => [p.product_name || p.name, p.qty, Math.round(p.total || 0)]));
  } else if (state.reportTab === 'ingredients') {
    exportCsv(`ingredientes_${stamp}.csv`, ['Ingrediente', 'Consumido', 'Unidad'],
      (r.ingredients || []).map((i) => [i.name, i.consumed, i.unit]));
  } else if (state.reportTab === 'waiters') {
    exportCsv(`meseros_${stamp}.csv`, ['Mesero', 'Cuentas', 'Total'],
      (r.waiters || []).map((w) => [w.name, w.tickets, Math.round(w.total || 0)]));
  } else if (state.reportTab === 'audit') {
    exportCsv(`auditoria_${stamp}.csv`, ['Fecha', 'Usuario', 'Acción', 'Producto', 'Cantidad', 'Mesa', 'Pedido', 'Detalle'],
      (r.audit || []).map((a) => {
        let detail = '';
        try {
          const d = typeof a.details === 'string' ? JSON.parse(a.details || '{}') : (a.details || {});
          detail = d.reason || d.notes || '';
        } catch { detail = String(a.details || ''); }
        return [a.created_at, a.user_name, auditActionLabel(a.action), a.product_name, a.quantity, a.table_name, a.order_id, detail];
      }));
  } else {
    toast('No hay datos para exportar', true);
    return;
  }
  toast('CSV descargado');
}

async function onTable(id) {
  if (state.floorEdit) return;
  const t = state.tables.find((x) => x.id === id);
  if (state.joinFrom) {
    await api(`/api/tables/${state.joinFrom}/join`, { method: 'POST', body: { other_id: id } });
    state.joinFrom = null; toast('Mesas unidas'); go('mesas'); return;
  }
  if (state.transferFrom) {
    await api(`/api/tables/${state.transferFrom}/transfer`, { method: 'POST', body: { to_table_id: id } });
    state.transferFrom = null; toast('Pedido pasado de mesa'); go('mesas'); return;
  }
  if (state.view === 'facturar') {
    const target = t.joined_to_id || t.id;
    const order = t.order || state.tables.find((x) => x.id === target)?.order;
    if (order) go('facturar', order.id);
    return;
  }
  if (t.joined_to_id) {
    const choice = await joinedTableActions(t);
    if (choice === 'split') {
      await api(`/api/tables/${id}/split`, { method: 'POST' });
      toast('Mesa separada');
      await loadView();
      return;
    }
    if (choice === 'order') {
      const primary = state.tables.find((x) => x.id === t.joined_to_id);
      const order = primary?.order;
      if (order) go('comanda', order.id);
      else {
        const r = await api('/api/orders', { method: 'POST', body: { table_id: t.joined_to_id } });
        go('comanda', r.order.id);
      }
      return;
    }
    return;
  }
  if (t.status === 'reserved') {
    if (await confirmDialog('¿Quitar la reserva y tomar el pedido?', { title: t.name, confirmText: 'Tomar pedido' })) {
      await api(`/api/tables/${id}/reserve`, { method: 'POST' });
    } else return;
  }
  if (!t.order && t.status === 'free') {
    const choice = await tableActions(t);
    if (choice === 'reserve') { await api(`/api/tables/${id}/reserve`, { method: 'POST' }); await loadView(); return; }
    if (choice !== 'open') return;
  }
  const targetId = t.joined_to_id || t.id;
  const r = await api('/api/orders', { method: 'POST', body: { table_id: targetId } });
  go('comanda', r.order.id);
}

function joinedTableActions(t) {
  return new Promise((resolve) => {
    modal(`
      <h3 style="margin-top:0">${esc(t.name)}</h3>
      <p class="hint">Está junta con ${esc(t.joined_to_name || 'otra mesa')}.</p>
      <button class="btn primary block lg" id="m-order">Ver pedido</button>
      <button class="btn ghost block" id="m-split" style="margin-top:8px">Separar mesa</button>
      <button class="btn ghost block" id="m-x" style="margin-top:8px">Cancelar</button>`);
    modalRoot.querySelector('#m-order').onclick = () => { closeModal(); resolve('order'); };
    modalRoot.querySelector('#m-split').onclick = () => { closeModal(); resolve('split'); };
    modalRoot.querySelector('#m-x').onclick = () => { closeModal(); resolve(null); };
  });
}

async function splitTableMenu() {
  const joined = (state.tables || []).filter((t) => t.joined_to_id === state.order?.table_id);
  if (!joined.length) { toast('No hay mesas juntas', true); return; }
  modal(`
    <h3 style="margin-top:0">Separar mesas</h3>
    <p class="hint">La mesa queda libre. El pedido sigue en ${esc(state.order?.table_name || 'la mesa principal')}.</p>
    ${joined.map((t) => `
      <button type="button" class="btn ghost block" data-act="split-table" data-id="${t.id}" style="margin-top:8px">
        Separar ${esc(t.name)}
      </button>`).join('')}
    <button type="button" class="btn ghost block" data-act="close-modal" style="margin-top:8px">Cancelar</button>`);
}

function tableActions(t) {
  return new Promise((resolve) => {
    modal(`
      <h3 style="margin-top:0">${esc(t.name)}</h3>
      <button class="btn primary block lg" id="m-open">Tomar pedido</button>
      <button class="btn gold block" id="m-res" style="margin-top:8px">Reservar</button>
      <button class="btn ghost block" id="m-x" style="margin-top:8px">Cancelar</button>`);
    modalRoot.querySelector('#m-open').onclick = () => { closeModal(); resolve('open'); };
    modalRoot.querySelector('#m-res').onclick = () => { closeModal(); resolve('reserve'); };
    modalRoot.querySelector('#m-x').onclick = () => { closeModal(); resolve(null); };
  });
}

async function addProduct(id) {
  const p = state.products.find((x) => x.id === Number(id));
  const choosable = (p?.recipe || []).filter((r) => Number(r.removable) !== 0 && !/salsa|aderezo/i.test(r.ingredient_name));
  const groups = parseChoices(p);
  const allowExtras = productAllowsIngredientExtras(p);
  const inRecipe = new Set((p?.recipe || []).map((r) => Number(r.ingredient_id)));
  const canAdd = allowExtras && (state.ingredients || []).some(
    (i) => !inRecipe.has(Number(i.id)) && isIngredientAddable(i)
  );
  if (!choosable.length && !groups.length && !canAdd) return addProductNow(id, [], [], '');
  pickProduct(p, choosable, groups, canAdd);
}

function productById(id) {
  return state.products.find((p) => Number(p.id) === Number(id));
}

function orderItemAllowsCustomNotes(it) {
  const p = productById(it?.product_id);
  return p ? productAllowsCustomNotes(p) : false;
}

function parseChoices(p) {
  try {
    const v = JSON.parse(p?.choices_json || '[]');
    return Array.isArray(v) ? v.filter((g) => g && Array.isArray(g.options) && g.options.length) : [];
  } catch {
    return [];
  }
}

function pickProduct(p, lines, groups, canAdd = false) {
  const allowNotes = productAllowsCustomNotes(p);
  const allowPicker = productAllowsIngredientExtras(p);
  const choiceHtml = groups.map((g, gi) => `
    <fieldset class="choice-box">
      <legend>${esc(g.label || 'Elija')}</legend>
      <div class="choice-opts">
        ${g.options.map((opt, oi) => `
          <label class="choice-opt">
            <input type="radio" name="opt_${gi}" value="${esc(opt)}" ${oi === 0 ? 'checked' : ''} />
            ${esc(opt)}
          </label>`).join('')}
      </div>
    </fieldset>`).join('');
  const showPicker = allowPicker && (lines.length > 0 || canAdd);
  modal(`
    <h3 style="margin-top:0">${esc(p.name)}</h3>
    <form id="ing-pick">
      ${choiceHtml}
      ${showPicker ? burgerPickerHtml(p, lines, esc, state.ingredients || []) : (groups.length ? '<p class="hint">Elija la opción y agregue al pedido.</p>' : '')}
      ${allowNotes ? `<div class="field"><label>Observación (si quiere)</label>
        <input name="obs" placeholder="Ej. sin salsas, término medio…" autocomplete="off" />
      </div>` : ''}
      <button class="btn primary block" type="submit">Agregar al pedido</button>
    </form>`);
  const sheet = modalRoot.querySelector('.sheet');
  if (sheet && showPicker) sheet.classList.add('sheet-burger');
  const form = modalRoot.querySelector('#ing-pick');
  if (showPicker) bindBurgerPicker(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const choiceNotes = groups.map((g, gi) => {
      const picked = ev.target.querySelector(`input[name="opt_${gi}"]:checked`);
      return picked ? `${g.label}: ${picked.value}` : '';
    }).filter(Boolean);
    const obs = allowNotes ? String(new FormData(ev.target).get('obs') || '').trim() : '';
    const notes = [...choiceNotes, obs].filter(Boolean).join(' · ');
    const kept = new Set([...ev.target.querySelectorAll('input[name="ing"]:checked')].map((el) => Number(el.value)));
    const removed = lines.filter((r) => !kept.has(r.ingredient_id)).map((r) => ({
      id: r.ingredient_id,
      name: r.ingredient_name
    }));
    const added = [...ev.target.querySelectorAll('input[name="add"]:checked')].map((el) => {
      const id = Number(el.value);
      const ing = (state.ingredients || []).find((x) => Number(x.id) === id);
      return { id, name: ing?.name || el.value, quantity: 1 };
    });
    closeModal();
    await addProductNow(p.id, removed, added, notes);
  };
}

async function addProductNow(id, removed, added = [], notes = '') {
  try {
    const r = await api(`/api/orders/${state.order.id}/items`, {
      method: 'POST',
      body: { product_id: id, quantity: 1, removed, added, notes }
    });
    state.order = r.order;
    state.cartBump = true;
    if (r.shortages?.length) toast('Ojo, queda poco: ' + r.shortages.map((s) => s.name).join(', '), true);
    render();
    setTimeout(() => { state.cartBump = false; }, 420);
  } catch (e) {
    toast(e.message, true);
    if (e.data?.shortages) toast('No alcanza: ' + e.data.shortages.map((s) => `${s.name} (hay ${s.stock}, se necesitan ${s.needed})`).join(', '), true);
  }
}

async function changeQty(itemId, d) {
  const it = state.order.items.find((i) => i.id === itemId);
  const qty = it.quantity + d;
  if (qty < 1) return cancelItem(itemId);
  const r = await api(`/api/orders/${state.order.id}/items/${itemId}`, { method: 'PATCH', body: { quantity: qty } });
  state.order = r.order; render();
}

async function noteItem(itemId) {
  const it = state.order.items.find((i) => i.id === itemId);
  if (!orderItemAllowsCustomNotes(it)) {
    toast('Este producto no admite observaciones', true);
    return;
  }
  modal(`
    <h3 style="margin-top:0">Nota · ${esc(it.product_name)}</h3>
    <form data-act="save-note">
      <div class="field"><label>Ej. sin cebolla</label><input name="notes" value="${esc(it.notes || '')}" /></div>
      <button class="btn primary block">Guardar</button>
    </form>`);
  modalRoot.querySelector('form').onsubmit = async (ev) => {
    ev.preventDefault();
    const notes = new FormData(ev.target).get('notes');
    const r = await api(`/api/orders/${state.order.id}/items/${itemId}`, { method: 'PATCH', body: { notes } });
    state.order = r.order; closeModal(); render();
  };
}

async function cancelItem(itemId) {
  const reason = await promptDialog('¿Por qué lo quita?', { title: 'Quitar producto', placeholder: 'Opcional' });
  if (reason == null) return;
  const r = await api(`/api/orders/${state.order.id}/items/${itemId}/cancel`, { method: 'POST', body: { reason } });
  if (r.order?.status === 'cancelled') {
    toast('La mesa quedó libre');
    go('mesas');
    return;
  }
  state.order = r.order; render();
}

async function cancelOrder() {
  const empty = !(state.order?.items || []).some((i) => i.status !== 'cancelled');
  const ok = await confirmDialog(
    empty
      ? '¿Liberar esta mesa? No hay productos en la cuenta.'
      : '¿Cancelar esta cuenta y dejar la mesa libre? No se cobra nada.',
    { title: empty ? 'Liberar mesa' : 'Cancelar cuenta', danger: true }
  );
  if (!ok) return;
  const reason = empty ? 'Mesa liberada' : await promptDialog('¿Por qué se cancela?', { title: 'Motivo', placeholder: 'Opcional' });
  if (reason == null) return;
  const r = await api(`/api/orders/${state.order.id}/cancel`, { method: 'POST', body: { reason } });
  toast(r.message || 'Cuenta cancelada');
  go('mesas');
}

async function resetSalon() {
  if (!await confirmDialog(
    'Esto cancela las cuentas que no se han cobrado y deja las mesas libres.\nLas ventas ya cobradas no se tocan.',
    { title: 'Reiniciar salón', danger: true, confirmText: 'Reiniciar' }
  )) return;
  const r = await api('/api/salon/reset', { method: 'POST', body: { reason: 'Reinicio de salón' } });
  toast(r.message || 'Salón reiniciado');
  await loadView();
}

async function sendOrder() {
  await withBusy('send', async () => {
    render();
    const r = await api(`/api/orders/${state.order.id}/send`, { method: 'POST' });
    state.order = r.order;
    toast('Enviado a cocina');
    if (r.print) openTicket(r.print);
    if (r.shortages?.length) toast('Ojo, queda poco: ' + r.shortages.map((s) => s.name).join(', '), true);
    render();
  });
}

async function waitPay() {
  await api(`/api/tables/${state.order.table_id}/wait-payment`, { method: 'POST' });
  toast('Mesa lista para cobrar');
  go('mesas');
}

function openTicket(print) {
  if (!print) return;
  if (print.error) toast(print.message || print.error, true);
  else if (print.message) toast(print.message);
  if (print.ok && print.mode === 'usb') return;
  if (!print.html) return;
  const w = window.open('', 'ticket', 'width=420,height=720');
  if (!w) { toast('Deje abrir la ventana para imprimir el ticket', true); return; }
  w.document.write(print.html);
  w.document.close();
  const doPrint = () => {
    try {
      w.focus();
      w.print();
    } catch { /* impresora ausente no bloquea */ }
  };
  const waitReady = () => {
    const imgs = [...w.document.images];
    if (!imgs.length) {
      setTimeout(doPrint, 200);
      return;
    }
    let pending = imgs.length;
    const done = () => {
      pending -= 1;
      if (pending <= 0) setTimeout(doPrint, 200);
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.onload = done;
        img.onerror = done;
      }
    });
  };
  if (w.document.readyState === 'complete') waitReady();
  else w.addEventListener('load', waitReady);
}

function refreshIngUnitOptions(kind, currentUnit) {
  const list = modalRoot.querySelector('#ing-unit-list');
  const input = modalRoot.querySelector('#ing-unit');
  const noteWrap = modalRoot.querySelector('#portion-note-wrap');
  if (!list || !input) return;
  const units = UNITS_BY_KIND[kind] || UNITS_BY_KIND.count;
  list.innerHTML = units.map((u) => `<option value="${esc(u)}"></option>`).join('');
  if (currentUnit) input.value = currentUnit;
  else if (!units.includes(input.value)) input.value = units[0] || '';
  if (noteWrap) noteWrap.hidden = kind !== 'portion';
}

function ingForm(i) {
  const kind = i?.unit_kind || inferUnitKind(i?.unit || 'unidad');
  const kindOpts = Object.entries(UNIT_KIND_LABELS).map(([k, label]) =>
    `<option value="${k}" ${kind === k ? 'selected' : ''}>${label}</option>`
  ).join('');
  modal(`
    <h3 style="margin-top:0">${i ? 'Editar ingrediente' : 'Agregar ingrediente'}</h3>
    <form data-act="save-ing">
      ${i ? `<input type="hidden" name="id" value="${i.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(i?.name || '')}" /></div>
      <div class="field">
        <label>Cómo se controla en cocina</label>
        <select name="unit_kind" id="ing-unit-kind" required>${kindOpts}</select>
      </div>
      <div class="field">
        <label>Unidad concreta</label>
        <input name="unit" id="ing-unit" list="ing-unit-list" required value="${esc(i?.unit || '')}" autocomplete="off" />
        <datalist id="ing-unit-list"></datalist>
        <p class="hint">Use la misma unidad en las recetas del menú (ej. rodajas, gramos, ml).</p>
      </div>
      <div class="field" id="portion-note-wrap"${kind === 'portion' ? '' : ' hidden'}>
        <label>Qué es una porción (opcional)</label>
        <input name="portion_note" placeholder="Ej. 1 porción = 2 cucharadas de ripio" value="${esc(i?.portion_note || '')}" />
      </div>
      ${i ? '' : `<div class="field"><label>Cuánto hay ahora</label><input name="stock" type="number" step="0.01" value="0" /></div>`}
      <div class="field"><label>Avisar cuando queden menos de</label><input name="min_stock" type="number" step="0.01" value="${i?.min_stock ?? 0}" /></div>
      <button class="btn primary block">Guardar</button>
    </form>`);
  const kindEl = modalRoot.querySelector('#ing-unit-kind');
  if (kindEl) {
    kindEl.onchange = () => refreshIngUnitOptions(kindEl.value, '');
    refreshIngUnitOptions(kind, i?.unit || '');
  }
}

function moveForm(id, type) {
  const i = state.ingredients.find((x) => x.id === id);
  const unit = esc(i?.unit || '');
  const titles = { purchase: 'Entrada de mercancía', adjustment: 'Corregir cantidad', waste: 'Se desechó' };
  const qtyLabel = type === 'adjustment'
    ? `Cantidad en ${unit} (negativo si hay que bajar)`
    : (type === 'waste' ? `Cuánto se desechó (${unit})` : `Cuánto entra (${unit})`);
  modal(`
    <h3 style="margin-top:0">${titles[type] || 'Movimiento'} · ${esc(i.name)}</h3>
    <p class="hint">${esc(unitKindLabel(i.unit_kind || inferUnitKind(i.unit)))} · stock actual: <b>${i.stock} ${unit}</b></p>
    <form data-act="save-move">
      <input type="hidden" name="id" value="${id}" />
      <input type="hidden" name="type" value="${type}" />
      <div class="field"><label>${qtyLabel}</label>
        <input name="quantity" type="number" step="0.01" min="${type === 'waste' ? '0.01' : ''}" required /></div>
      <div class="field"><label>Nota (si quiere)</label><input name="reason" placeholder="${type === 'waste' ? 'Ej. venció, se dañó, se cayó…' : 'Ej. compra del mercado, proveedor…'}" /></div>
      <button class="btn primary block">Registrar</button>
    </form>`);
}

const CORE_KINDS = new Set(['bun', 'hotdog-bun', 'patty', 'sausage', 'chorizo', 'fries', 'arepa', 'patacon']);

function isCoreIng(name) {
  return CORE_KINDS.has(layerKind(name));
}

function usedRecipeIngIds(except) {
  return new Set(
    [...modalRoot.querySelectorAll('select[name^="ing_"]')]
      .filter((s) => s !== except)
      .map((s) => Number(s.value))
      .filter(Boolean)
  );
}

function refreshRecipeSelects() {
  const used = usedRecipeIngIds();
  modalRoot.querySelectorAll('select[name^="ing_"]').forEach((sel) => {
    const cur = Number(sel.value);
    sel.querySelectorAll('option').forEach((opt) => {
      const id = Number(opt.value);
      opt.disabled = Boolean(id) && used.has(id) && id !== cur;
    });
    sel.dataset.prev = sel.value;
  });
}

function renderIngSuggest() {
  const box = modalRoot.querySelector('#ing-suggest');
  if (!box) return;
  const q = (modalRoot.querySelector('#ing-search')?.value || '').trim().toLowerCase();
  if (q.length < 1) { box.innerHTML = ''; return; }
  const used = usedRecipeIngIds();
  const hits = state.ingredients.filter((i) => !used.has(i.id) && i.name.toLowerCase().includes(q)).slice(0, 8);
  box.innerHTML = hits.map((i) => `<button type="button" class="chip suggest-ing" data-add-ing="${i.id}">${esc(i.name)}</button>`).join('')
    || '<span class="muted small">No hay coincidencias libres</span>';
}

function addRecipeRow(preferId) {
  const used = usedRecipeIngIds();
  const q = (modalRoot.querySelector('#ing-search')?.value || '').trim().toLowerCase();
  const pool = state.ingredients.filter((i) => !used.has(i.id));
  let match = preferId ? pool.find((i) => i.id === Number(preferId)) : null;
  if (!match && q) match = pool.find((i) => i.name.toLowerCase().includes(q));
  if (!match) match = pool[0];
  if (!match) {
    toast(q ? 'No hay otro ingrediente con ese nombre' : 'Ya están todos los ingredientes', true);
    return;
  }
  modalRoot.querySelector('#recipe-rows').insertAdjacentHTML('beforeend', recipeRow({ ingredient_id: match.id }, Date.now()));
  refreshRecipeSelects();
  renderIngSuggest();
}

function bindRecipeEditor() {
  const addBtn = modalRoot.querySelector('#add-rec');
  if (addBtn) addBtn.onclick = () => addRecipeRow();
  const search = modalRoot.querySelector('#ing-search');
  if (search) search.oninput = renderIngSuggest;
  const suggest = modalRoot.querySelector('#ing-suggest');
  if (suggest) {
    suggest.onclick = (ev) => {
      const btn = ev.target.closest('[data-add-ing]');
      if (!btn) return;
      addRecipeRow(Number(btn.dataset.addIng));
    };
  }
  const rows = modalRoot.querySelector('#recipe-rows');
  if (!rows) return;
  rows.onclick = (ev) => {
    const btn = ev.target.closest('[data-act="del-rec"]');
    if (!btn) return;
    const all = modalRoot.querySelectorAll('.recipe-row');
    if (all.length < 2) {
      const qty = btn.closest('.recipe-row').querySelector('input[type="number"]');
      if (qty) qty.value = '';
      return;
    }
    btn.closest('.recipe-row').remove();
    refreshRecipeSelects();
    renderIngSuggest();
  };
  rows.onchange = (ev) => {
    if (ev.target.matches('input[type="checkbox"]')) ev.target.dataset.touched = '1';
    const sel = ev.target.closest('select[name^="ing_"]');
    if (!sel) return;
    if (usedRecipeIngIds(sel).has(Number(sel.value))) {
      sel.value = sel.dataset.prev || sel.value;
      toast('Ese ingrediente ya está en la receta', true);
      return;
    }
    sel.dataset.prev = sel.value;
    const name = sel.selectedOptions[0]?.textContent || '';
    const row = sel.closest('.recipe-row');
    const pill = row?.querySelector('.kind-pill');
    if (pill) {
      const k = layerKind(name);
      pill.className = 'kind-pill ' + k;
      pill.title = k === 'extra' ? 'Este nombre aún no tiene icono' : 'Icono del ingrediente';
    }
    const chk = row?.querySelector('input[type="checkbox"]');
    if (chk && !chk.dataset.touched) chk.checked = !isCoreIng(name);
    const ing = state.ingredients.find((i) => i.id === Number(sel.value));
    const unitSpan = row?.querySelector('.recipe-unit');
    if (unitSpan && ing) unitSpan.textContent = `${ing.unit} / producto`;
    refreshRecipeSelects();
  };
  refreshRecipeSelects();
}

function prodForm(p) {
  const on = p ? productOnSale(p) : true;
  const groups = parseChoices(p);
  const g = groups[0];
  const recipe = (p?.recipe || []).map((r, idx) => recipeRow(r, idx)).join('') || recipeRow({}, 0);
  modal(`
    <h3 style="margin-top:0">${p ? 'Editar producto' : 'Agregar producto'}</h3>
    <form data-act="save-prod" id="prod-form">
      ${p ? `<input type="hidden" name="id" value="${p.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(p?.name || '')}" /></div>
      <div class="field"><label>Precio</label><input name="price" type="number" min="0" required value="${p?.price ?? ''}" /></div>
      <div class="field"><label>Grupo</label>
        <select name="category_id">${state.categories.map((c) => `<option value="${c.id}" ${(p?.category_id || p?.category_id) === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>¿Dónde se prepara?</label>
        <select name="station"><option value="kitchen" ${p?.station !== 'bar' ? 'selected' : ''}>Cocina</option>
        <option value="bar" ${p?.station === 'bar' ? 'selected' : ''}>Barra</option></select></div>
      <div class="field"><label>¿Se vende?</label>
        <select name="active"><option value="1" ${on ? 'selected' : ''}>Sí</option>
        <option value="0" ${on ? '' : 'selected'}>No, está escondido</option></select></div>
      <h4>Opciones al pedir</h4>
      <p class="hint">Si hay sabores o marcas, anote la pregunta y las opciones separadas por coma.</p>
      <div class="field"><label>Pregunta</label>
        <input name="choice_label" value="${esc(g?.label || '')}" placeholder="Ej. Marca y sabor" /></div>
      <div class="field"><label>Opciones (separadas por coma)</label>
        <textarea name="choice_options" rows="2" placeholder="Coca-Cola, Sprite, Quatro">${esc((g?.options || []).join(', '))}</textarea></div>
      <h4>Qué lleva</h4>
      <p class="hint">${state.ingredients.length
        ? 'Busque el ingrediente y agréguelo. Pan, carne, salchicha, papas, arepa y patacón no se pueden quitar en el pedido, salvo que usted marque la casilla.'
        : 'Primero agregue ingredientes en Inventario; después vuelva y anote aquí qué lleva el producto.'}</p>
      <div class="field"><label>Buscar ingrediente</label>
        <input id="ing-search" type="search" placeholder="tomate, queso, papas…" autocomplete="off" ${state.ingredients.length ? '' : 'disabled'} /></div>
      <div id="ing-suggest" class="ing-suggest"></div>
      <div id="recipe-rows">${recipe}</div>
      <button type="button" class="btn ghost" id="add-rec" ${state.ingredients.length ? '' : 'disabled'}>Agregar ingrediente</button>
      <button class="btn primary block" style="margin-top:12px">Guardar</button>
      ${p ? `<button type="button" class="btn danger block" id="del-prod-btn" style="margin-top:8px">Borrar producto</button>` : ''}
    </form>`);
  bindRecipeEditor();
  const delBtn = modalRoot.querySelector('#del-prod-btn');
  if (delBtn) {
    delBtn.onclick = async () => {
      try { await deleteProduct(p.id); } catch (err) { toast(err.message, true); }
    };
  }
}

function recipeRow(r, idx) {
  const chosen = state.ingredients.find((i) => i.id === (r.ingredient_id || r.ingredient_id)) || state.ingredients[0];
  const kind = layerKind(chosen?.name || '');
  const rem = r && (r.ingredient_id || r.ingredient_id)
    ? Number(r.removable) !== 0
    : !isCoreIng(chosen?.name || '');
  const opts = state.ingredients.length
    ? state.ingredients.map((i) => `<option value="${i.id}" ${chosen?.id === i.id ? 'selected' : ''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('')
    : '<option value="">Sin ingredientes en inventario</option>';
  const unitLabel = chosen?.unit || '';
  return `<div class="recipe-row">
    <div class="ing-name">
      <select name="ing_${idx}" data-prev="${chosen?.id || ''}">${opts}</select>
      <span class="kind-pill ${kind}" title="${kind === 'extra' ? 'Este nombre aún no tiene icono' : 'Icono del ingrediente'}"></span>
    </div>
    <div class="recipe-qty">
      <input name="qty_${idx}" type="number" step="0.01" min="0" placeholder="Cant." value="${r.quantity ?? ''}" />
      <span class="recipe-unit">${esc(unitLabel)} / producto</span>
    </div>
    <button type="button" class="btn ghost" data-act="del-rec" title="Quitar esta línea">✕</button>
    <label class="chk"><input type="checkbox" name="rem_${idx}" ${rem ? 'checked' : ''} /> Se puede quitar</label>
  </div>`;
}

async function saveProd(form) {
  const fd = new FormData(form);
  const recipe = [];
  const seen = new Set();
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('ing_')) continue;
    const idx = k.slice(4);
    const qty = Number(fd.get('qty_' + idx) || 0);
    const iid = Number(v);
    if (!(qty > 0) || !iid) continue;
    if (seen.has(iid)) {
      toast('El mismo ingrediente está dos veces. Deje una sola línea.', true);
      return;
    }
    seen.add(iid);
    recipe.push({
      ingredient_id: iid,
      quantity: qty,
      removable: fd.get('rem_' + idx) ? 1 : 0
    });
  }
  if (!recipe.length && !await confirmDialog('Este producto va a quedar sin ingredientes. ¿Guardar así?', { title: 'Sin receta' })) return;
  const label = String(fd.get('choice_label') || '').trim();
  const options = String(fd.get('choice_options') || '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const choices = options.length ? [{ id: 'opcion', label: label || 'Elija', required: true, options }] : [];
  const body = {
    name: fd.get('name'), price: Number(fd.get('price')), category_id: Number(fd.get('category_id')),
    station: fd.get('station'), active: fd.get('active') === '1' ? 1 : 0, recipe, choices
  };
  const id = fd.get('id');
  if (id) await api('/api/products/' + id, { method: 'PATCH', body });
  else await api('/api/products', { method: 'POST', body });
  closeModal(); toast('Producto guardado');
}

async function deleteProduct(id) {
  if (!await confirmDialog('¿Borrar este producto? Si ya se vendió, se oculta del menú para no perder las cuentas.', { title: 'Borrar producto', danger: true })) return;
  const r = await api('/api/products/' + id, { method: 'DELETE' });
  toast(r.message || (r.hidden ? 'Producto oculto' : 'Producto borrado'));
  closeModal();
  await loadView();
}

async function deleteIngredient(id) {
  const ing = state.ingredients.find((x) => x.id === id);
  if (!await confirmDialog(
    `¿Borrar el ingrediente${ing ? ` “${ing.name}”` : ''}?\nSi está en alguna receta, primero hay que quitarlo del producto.`,
    { title: 'Borrar ingrediente', danger: true }
  )) return;
  try {
    const r = await api('/api/ingredients/' + id, { method: 'DELETE' });
    toast(r.message || 'Ingrediente borrado');
    await loadView();
  } catch (e) {
    toast(e.message || 'No se pudo borrar', true);
  }
}

function catForm(c) {
  modal(`<h3 style="margin-top:0">${c ? 'Editar grupo' : 'Nuevo grupo'}</h3>
    <form data-act="save-cat">
      ${c ? `<input type="hidden" name="id" value="${c.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(c?.name || '')}" /></div>
      <div class="field"><label>¿Dónde se prepara?</label>
        <select name="station">
          <option value="kitchen" ${c?.station !== 'bar' ? 'selected' : ''}>Cocina</option>
          <option value="bar" ${c?.station === 'bar' ? 'selected' : ''}>Barra</option>
        </select>
      </div>
      <button class="btn primary block">${c ? 'Guardar' : 'Crear'}</button>
    </form>`);
}

function userForm(u) {
  modal(`<h3 style="margin-top:0">${u ? 'Editar persona' : 'Agregar persona'}</h3>
    <form data-act="save-user">
      ${u ? `<input type="hidden" name="id" value="${u.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(u?.name || '')}" /></div>
      <div class="field"><label>Usuario para entrar</label><input name="username" ${u ? 'readonly' : 'required'} value="${esc(u?.username || '')}" /></div>
      <div class="field"><label>Cargo</label>
        <select name="role">${Object.entries(ROLE).map(([k, l]) => `<option value="${k}" ${u?.role === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="field"><label>Contraseña ${u ? '(déjela vacía si no la cambia)' : ''}</label><input name="password" type="password" ${u ? '' : 'required'} /></div>
      ${u ? `<div class="field"><label>¿Puede entrar?</label><select name="active"><option value="1" ${u.active ? 'selected' : ''}>Sí</option><option value="0" ${u.active ? '' : 'selected'}>No</option></select></div>` : ''}
      <button class="btn primary block">Guardar</button>
    </form>`);
}

function tableForm(t) {
  modal(`<h3 style="margin-top:0">${t ? 'Editar mesa' : 'Nueva mesa'}</h3>
    <form data-act="save-table">
      ${t ? `<input type="hidden" name="id" value="${t.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(t?.name || '')}" placeholder="Mesa 3" /></div>
      <div class="field"><label>Cuántas sillas</label><input name="seats" type="number" min="1" value="${t?.seats ?? 4}" /></div>
      <button class="btn primary block">Guardar</button>
    </form>`);
}

function bindFloorMap() {
  const map = root.querySelector('#floor-map');
  if (!map || !state.floorEdit) return;

  let drag = null;

  const onPointerDown = (ev) => {
    const el = ev.target.closest('.floor-table');
    if (!el || !map.contains(el)) return;
    ev.preventDefault();
    const id = Number(el.dataset.tableId);
    const rect = map.getBoundingClientRect();
    drag = {
      el,
      id,
      rect,
      moved: false,
      startX: ev.clientX,
      startY: ev.clientY
    };
    el.classList.add('dragging');
    el.setPointerCapture?.(ev.pointerId);
  };

  const onPointerMove = (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    const x = ((ev.clientX - drag.rect.left) / drag.rect.width) * 100;
    const y = ((ev.clientY - drag.rect.top) / drag.rect.height) * 100;
    const cx = Math.min(92, Math.max(8, x));
    const cy = Math.min(92, Math.max(8, y));
    drag.el.style.left = cx + '%';
    drag.el.style.top = cy + '%';
    drag.pos = { pos_x: cx, pos_y: cy };
  };

  const onPointerUp = async (ev) => {
    if (!drag) return;
    const { el, id, pos, moved } = drag;
    el.classList.remove('dragging');
    el.releasePointerCapture?.(ev.pointerId);
    drag = null;
    if (!moved || !pos) return;
    try {
      const r = await api(`/api/tables/${id}/position`, { method: 'PATCH', body: pos });
      const t = state.tables.find((x) => x.id === id);
      if (t && r.table) {
        t.pos_x = r.table.pos_x;
        t.pos_y = r.table.pos_y;
      }
    } catch (err) {
      toast(err.message, true);
      await loadView();
    }
  };

  map.addEventListener('pointerdown', onPointerDown);
  map.addEventListener('pointermove', onPointerMove);
  map.addEventListener('pointerup', onPointerUp);
  map.addEventListener('pointercancel', onPointerUp);
}

function dataPanel({ id, head = '', rows = [], pageSize = 10, searchPlaceholder = 'Buscar…', empty = 'Sin datos', mode = 'table' }) {
  const payload = encodeURIComponent(JSON.stringify({
    pageSize,
    mode,
    empty,
    head,
    rows
  }));
  return `
    <div class="data-panel card" data-panel="${esc(id)}" data-payload="${payload}">
      <div class="data-toolbar">
        <input type="search" class="data-search" placeholder="${esc(searchPlaceholder)}" autocomplete="off" />
        <span class="data-meta"></span>
      </div>
      ${mode === 'cards'
    ? `<div class="grid catalog data-cards"></div>`
    : `<div class="table-wrap tight"><table class="data"><thead>${head}</thead><tbody class="data-body"></tbody></table></div>`}
      <div class="data-pager">
        <button type="button" class="btn ghost" data-dir="-1">Anterior</button>
        <span class="data-page"></span>
        <button type="button" class="btn ghost" data-dir="1">Siguiente</button>
      </div>
    </div>`;
}

function bindDataPanels() {
  root.querySelectorAll('.data-panel[data-payload]').forEach((panel) => {
    let cfg;
    try { cfg = JSON.parse(decodeURIComponent(panel.dataset.payload)); } catch { return; }
    const panelId = panel.dataset.panel || '';
    if (!state.dataSearch) state.dataSearch = {};
    const statePanel = {
      q: state.dataSearch[panelId] || '',
      page: 0,
      ...cfg
    };
    const search = panel.querySelector('.data-search');
    const meta = panel.querySelector('.data-meta');
    const pageLabel = panel.querySelector('.data-page');
    const body = panel.querySelector('.data-body');
    const cards = panel.querySelector('.data-cards');
    const prev = panel.querySelector('[data-dir="-1"]');
    const next = panel.querySelector('[data-dir="1"]');
    if (search) {
      search.value = statePanel.q;
      search.setAttribute('enterkeyhint', 'search');
      search.setAttribute('inputmode', 'search');
      search.setAttribute('autocapitalize', 'off');
      search.setAttribute('spellcheck', 'false');
    }

    function fold(s) {
      return foldSearch(s);
    }

    function paint() {
      const q = fold(statePanel.q);
      const filtered = (statePanel.rows || []).filter((r) => !q || fold(r.search).includes(q));
      const pages = Math.max(1, Math.ceil(filtered.length / statePanel.pageSize));
      if (statePanel.page >= pages) statePanel.page = pages - 1;
      if (statePanel.page < 0) statePanel.page = 0;
      const start = statePanel.page * statePanel.pageSize;
      const slice = filtered.slice(start, start + statePanel.pageSize);
      if (statePanel.mode === 'cards') {
        cards.innerHTML = slice.map((r) => r.html).join('') || `<div class="empty card">${esc(statePanel.empty)}</div>`;
      } else {
        const cols = (statePanel.head.match(/<th/gi) || []).length || 1;
        body.innerHTML = slice.map((r) => r.html).join('') || `<tr><td colspan="${cols}">${esc(statePanel.empty)}</td></tr>`;
      }
      meta.textContent = filtered.length
        ? `${filtered.length} resultado${filtered.length === 1 ? '' : 's'}`
        : '0 resultados';
      pageLabel.textContent = `Pág. ${statePanel.page + 1} / ${pages}`;
      prev.disabled = statePanel.page <= 0;
      next.disabled = statePanel.page >= pages - 1;
    }

    search.oninput = () => {
      statePanel.q = search.value;
      state.dataSearch[panelId] = search.value;
      statePanel.page = 0;
      paint();
    };
    prev.onclick = () => { statePanel.page -= 1; paint(); };
    next.onclick = () => { statePanel.page += 1; paint(); };
    paint();
  });
}

boot();
