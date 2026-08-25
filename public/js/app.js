import { api, money, ROLE, TABLE_STATUS, ITEM_STATUS, ORDER_STATUS, MOVE_TYPE, PAY, today, daysAgo, navFor, homeFor } from './api.js';
import { burgerPickerHtml, bindBurgerPicker, layerKind } from './burger-pick.js';

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
  categoryId: 'all',
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
  socket: null,
  live: false,
  infoName: 'JR Burger',
  lanUrls: [],
  moreNav: false
};

function toast(msg, err = false) {
  toastRoot.hidden = false;
  toastRoot.className = 'toast-root' + (err ? ' err' : '');
  toastRoot.textContent = msg;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toastRoot.hidden = true; }, 3200);
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
    state.lanUrls = info.lan_urls || [];
  } catch { /* login aún funciona */ }
  window.addEventListener('hashchange', () => loadView());
  try {
    const me = await api('/api/me');
    state.user = me.user;
    state.settings = me.settings;
    state.alerts = me.alerts || [];
    connectSocket();
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
  if (state.socket) state.socket.disconnect();
  state.socket = ioClient({ transports: ['websocket', 'polling'] });
  state.socket.on('connect', () => { state.live = true; paintLive(); });
  state.socket.on('disconnect', () => { state.live = false; paintLive(); });
  const refresh = () => {
    if (!state.user) return;
    if (!modalRoot.hidden) return;
    if (state.view === 'facturar' && state.params.id) return;
    loadView(true);
  };
  state.socket.on('tables:changed', refresh);
  state.socket.on('orders:changed', refresh);
  state.socket.on('kitchen:changed', () => {
    if (state.view === 'cocina') loadView(true);
    else if (state.user?.role === 'kitchen') toast('Llegó un pedido nuevo');
  });
  state.socket.on('cash:changed', refresh);
  state.socket.on('inventory:changed', refresh);
  state.socket.on('menu:changed', refresh);
}

function paintLive() {
  const el = document.querySelector('.live-dot');
  if (el) el.style.background = state.live ? 'var(--ok)' : 'var(--danger)';
}

async function loadView(silent = false) {
  const { view, params } = parseHash();
  if (state.view !== view) state.moreNav = false;
  state.view = view;
  state.params = params;
  if (!state.user && view !== 'login') { go('login'); return; }
  try {
    if (view === 'login') { render(); return; }
    if (view === 'mesas') {
      const [tables, me] = await Promise.all([api('/api/tables'), api('/api/me')]);
      state.tables = tables.tables;
      state.alerts = me.alerts || [];
      state.settings = me.settings;
    } else if (view === 'comanda') {
      const [orderWrap, productsWrap, cats] = await Promise.all([
        api('/api/orders/' + params.id),
        api('/api/products'),
        api('/api/categories')
      ]);
      state.order = orderWrap.order;
      state.products = productsWrap.products.filter((p) => p.active);
      state.categories = cats.categories;
    } else if (view === 'cocina') {
      state.kitchen = (await api('/api/orders?status=kitchen')).orders;
    } else if (view === 'facturar') {
      const [tables, cash] = await Promise.all([api('/api/tables'), api('/api/cash/current')]);
      state.tables = tables.tables;
      state.cash = cash;
      if (params.id) state.order = (await api('/api/orders/' + params.id)).order;
      else state.order = null;
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
      await loadReports();
    } else if (view === 'config') {
      const [s, b, t, info] = await Promise.all([api('/api/settings'), api('/api/backups'), api('/api/tables'), api('/api/info')]);
      state.settings = s.settings;
      state.backups = b.backups;
      state.tables = t.tables;
      state.lanUrls = info.lan_urls || [];
    }
    if (!silent) render();
    else render();
  } catch (e) {
    if (e.status === 401) { state.user = null; go('login'); return; }
    toast(e.message, true);
    render();
  }
}

async function loadReports() {
  const q = `?from=${state.from}&to=${state.to}`;
  const tab = state.reportTab;
  if (tab === 'sales') state.reports = await api('/api/reports/sales' + q);
  if (tab === 'products') state.reports = await api('/api/reports/products' + q);
  if (tab === 'ingredients') state.reports = await api('/api/reports/ingredients' + q);
  if (tab === 'waiters') state.reports = await api('/api/reports/waiters' + q);
}

function ico(name) {
  const paths = {
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

const MOBILE_PRIMARY = new Set(['mesas', 'cocina', 'facturar', 'caja']);

function navBtn(i) {
  return `
    <button type="button" class="${state.view === i.id ? 'on' : ''}" data-act="nav" data-view="${i.id}">
      ${ico(i.ico)}<span>${i.label}</span>
    </button>`;
}
      ${ico(i.ico)}<span>${i.label}</span>
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
  if (!state.user || state.view === 'login') {
    state.moreNav = false;
    root.innerHTML = loginView();
    bind();
    return;
  }
  const brand = esc(state.settings.business_name || 'JR Burger');
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
    <div class="app-shell">
      <nav class="sidenav">
        <div class="sidenav-brand">
          <div class="logo-plate">
            <img src="/logo.png" alt="JR Burger" />
          </div>
          <b>${brand}</b>
          <span>Comidas rápidas</span>
        </div>
        <div class="sidenav-links">${sideLinks}</div>
        <div class="sidenav-foot">
          <div class="who"><span class="live-dot"></span> ${esc(state.user.name)} · ${ROLE[state.user.role]}</div>
          <button class="btn" data-act="logout">Salir</button>
        </div>
      </nav>
      <header class="topbar">
        <div class="brand">
          <div class="logo-plate sm"><img src="/logo.png" alt="JR Burger" /></div>
          <div class="brand-copy"><b>${brand}</b><small>Comidas rápidas</small></div>
        </div>
        <div class="grow"></div>
        <span class="chip"><span class="live-dot"></span>${esc(state.user.name)}</span>
        <button class="icon-btn" data-act="logout" title="Salir">Salir</button>
      </header>
      <main class="page">${viewHtml()}</main>
      ${morePanel}
      <nav class="bottom-nav">${bottomLinks}</nav>
    </div>`;
  paintLive();
  bind();
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

function loginView() {
  return `
  <div class="login">
    <div class="login-card card">
      <img class="login-logo" src="/logo.png" alt="JR Burger" />
      <h1>JR Burger</h1>
      <p class="lede">Comidas rápidas</p>
      <form data-act="login">
        <div class="field"><label>Usuario</label><input name="username" autocomplete="username" required value="admin" /></div>
        <div class="field"><label>Contraseña</label><input name="password" type="password" autocomplete="current-password" required /></div>
        <p id="login-error" class="danger-text" hidden></p>
        <button class="btn primary block lg" type="submit">Entrar</button>
      </form>
      ${lanAccessCard()}
    </div>
  </div>`;
}

function viewHtml() {
  switch (state.view) {
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
  return `<div class="page-head${state.view === 'comanda' ? ' order-head' : ''}">
    <div><h1>${title}</h1>${lede ? `<p class="lede">${lede}</p>` : ''}</div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

function mesasView() {
  const mode = state.joinFrom ? 'Toque la otra mesa para juntarlas.' :
    state.transferFrom ? 'Toque la mesa a la que quiere pasar el pedido.' : 'Toque una mesa para tomar o ver el pedido.';
  const counts = {
    free: state.tables.filter((t) => t.status === 'free' && !t.joined_to_id).length,
    occupied: state.tables.filter((t) => t.status === 'occupied' || t.joined_to_id).length,
    waiting_payment: state.tables.filter((t) => t.status === 'waiting_payment').length,
    reserved: state.tables.filter((t) => t.status === 'reserved').length
  };
  return `
    ${pageHead('Mesas', mode)}
    ${(state.alerts || []).length ? `<div class="alert">Se está acabando: ${state.alerts.map((a) => esc(a.name)).join(', ')}</div>` : ''}
    <div class="legend">
      <span><i class="pip free"></i> Libre (${counts.free})</span>
      <span><i class="pip occupied"></i> Ocupada (${counts.occupied})</span>
      <span><i class="pip wait"></i> Por cobrar (${counts.waiting_payment})</span>
      <span><i class="pip reserved"></i> Reservada (${counts.reserved})</span>
    </div>
    <div class="grid tables-grid ${state.joinFrom || state.transferFrom ? 'pick-mode' : ''}">
      ${state.tables.map(tableCard).join('')}
    </div>
    <div class="actions-fab">
      <button class="btn ghost" data-act="cancel-mode" ${state.joinFrom || state.transferFrom ? '' : 'hidden'}>Cancelar</button>
    </div>`;
}

function tableCard(t) {
  const joined = t.joined_to_id;
  const status = joined ? 'occupied' : t.status;
  const label = joined ? `Junto con ${esc(t.joined_to_name)}` : TABLE_STATUS[t.status];
  const extra = t.order ? `${t.order.item_count} productos · ${money(t.order.subtotal)}` : `${t.seats} personas`;
  return `
    <button class="card table-card ${status} ${joined ? 'joined' : ''} ${t.order ? 'pulse' : ''}"
      data-act="table" data-id="${t.id}">
      <div>
        <div class="between"><div class="name">${esc(t.name)}</div><span class="badge ${status}">${label}</span></div>
        <div class="meta">${extra}${t.order ? `<br>${esc(t.order.waiter_name)}` : ''}</div>
      </div>
      <div class="amount">${t.order ? money(t.order.subtotal) : ''}</div>
    </button>`;
}

function orderView() {
  const o = state.order;
  if (!o) return '<p>No se encontró el pedido</p>';
  const active = o.items.filter((i) => i.status !== 'cancelled');
  const cats = [{ id: 'all', name: 'Todo' }, ...state.categories];
  const products = state.products.filter((p) => state.categoryId === 'all' || String(p.category_id) === String(state.categoryId));
  const unsent = active.filter((i) => !i.sent).length;
  return `
    ${pageHead(esc(o.table_name), `Pedido #${o.id} · ${esc(o.waiter_name)}`, `<button class="btn ghost" data-act="nav" data-view="mesas">Mesas</button>`)}
    <div class="order-layout">
      <div class="order-menu">
        <div class="tabs">
          ${cats.map((c) => `<button class="${String(state.categoryId) === String(c.id) ? 'on' : ''}" data-act="cat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}
        </div>
        <div class="grid menu-grid">
          ${products.map((p) => `
            <button class="card prod" data-act="add-prod" data-id="${p.id}">
              <span class="prod-cat">${esc(p.category_name || '')}</span>
              <div class="name">${esc(p.name)}</div>
              <div class="price">${money(p.price)}</div>
            </button>`).join('') || '<div class="empty">No hay productos en este grupo</div>'}
        </div>
      </div>
      <div class="card ticket">
        <div class="ticket-head">Pedido</div>
        ${o.items.map((it) => `
          <div class="ticket-line ${it.status === 'cancelled' ? 'cancelled' : ''}">
            <div>
              <div class="name">${it.quantity}× ${esc(it.product_name)}</div>
              ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ''}
              ${removedText(it) ? `<div class="notes">${esc(removedText(it))}</div>` : ''}
              <div class="small muted">${ITEM_STATUS[it.status]}${it.sent ? ' · ya fue a cocina' : ' · aún no se envía'}</div>
            </div>
            <div>
              <div class="line-amt">${money(it.quantity * it.unit_price)}</div>
              ${it.status !== 'cancelled' && !['billed'].includes(o.status) ? `
                <div class="qty" style="margin-top:6px">
                  <button data-act="qty" data-id="${it.id}" data-d="-1">−</button>
                  <button data-act="qty" data-id="${it.id}" data-d="1">+</button>
                  <button data-act="note-item" data-id="${it.id}" title="Nota">✎</button>
                  <button data-act="cancel-item" data-id="${it.id}" title="Quitar">✕</button>
                </div>` : ''}
            </div>
          </div>`).join('') || '<div class="empty">Toque productos para armar el pedido</div>'}
        <div class="ticket-total"><span>Total</span><b>${money(o.subtotal)}</b></div>
        <div class="actions-fab ticket-actions">
          <button class="btn primary block lg" data-act="send-order" ${unsent ? '' : 'disabled'}>Enviar a cocina (${unsent})</button>
          <button class="btn gold block" data-act="wait-pay">Pedir cuenta</button>
          <div class="row">
            <button class="btn ghost" data-act="join-mode">Juntar mesas</button>
            <button class="btn ghost" data-act="transfer-mode">Pasar a otra mesa</button>
          </div>
          ${['billed', 'cancelled'].includes(o.status) ? '' : `
            <button class="btn danger block" data-act="cancel-order">${active.length ? 'Cancelar cuenta' : 'Liberar mesa'}</button>`}
        </div>
      </div>
    </div>
    ${['billed', 'cancelled'].includes(o.status) ? '' : `
    <div class="order-dock">
      <div class="order-dock-sum">
        <span class="small muted">${active.length} prod.</span>
        <b>${money(o.subtotal)}</b>
      </div>
      <button class="btn gold" data-act="wait-pay">Cuenta</button>
      <button class="btn primary" data-act="send-order" ${unsent ? '' : 'disabled'}>Enviar${unsent ? ` (${unsent})` : ''}</button>
    </div>`}`;
}

function kitchenView() {
  const orders = state.kitchen.filter((o) => {
    const items = o.items.filter((i) => i.sent && i.status !== 'cancelled');
    if (!items.length) return false;
    if (state.station === 'all') return true;
    return items.some((i) => {
      const p = null;
      return true;
    });
  });
  const filtered = state.kitchen.map((o) => ({
    ...o,
    items: o.items.filter((i) => i.sent && i.status !== 'cancelled')
  })).filter((o) => o.items.length);

  return `
    ${pageHead('Cocina', 'Aquí salen los pedidos en cuanto el mesero los envía.')}
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
              ${removedText(it) ? `<div class="notes">${esc(removedText(it))}</div>` : ''}
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
  const payable = state.tables.filter((t) => t.order && !t.joined_to_id);
  const openCash = state.cash?.register;
  if (state.order) return billForm(state.order, openCash);
  return `
    ${pageHead('Cobrar', 'Mesas que todavía no han pagado. Si pidieron la cuenta, se ven en amarillo.')}
    ${!openCash ? '<div class="alert">Primero abra la caja para poder cobrar.</div>' : ''}
    <div class="grid tables-grid">
      ${payable.map(tableCard).join('') || '<div class="empty card">Nada por cobrar ahora.</div>'}
    </div>`;
}

function billForm(o, openCash) {
  const active = o.items.filter((i) => i.status !== 'cancelled');
  const taxRate = Number(state.settings.tax_rate || 0);
  const included = state.settings.tax_included;
  const subtotal = o.subtotal;
  let tax = 0, total = subtotal;
  if (taxRate > 0 && !included) { tax = Math.round(subtotal * taxRate / 100); total = subtotal + tax; }
  else if (taxRate > 0 && included) tax = Math.round(subtotal - subtotal / (1 + taxRate / 100));
  return `
    ${pageHead('Cobrar ' + esc(o.table_name), '', `<button class="btn ghost" data-act="nav" data-view="facturar">Volver</button>`)}
    ${!openCash ? '<div class="alert">Primero abra la caja.</div>' : ''}
    <div class="bill-grid">
      <div class="card">
        <div class="ticket-head">Lo que pidieron</div>
        ${active.map((i) => `<div class="ticket-line"><span>${i.quantity}× ${esc(i.product_name)}${removedText(i) ? `<div class="notes">${esc(removedText(i))}</div>` : ''}</span><span class="line-amt">${money(i.quantity * i.unit_price)}</span></div>`).join('')}
        <div class="between muted"><span>Suma</span><span>${money(subtotal)}</span></div>
        ${taxRate ? `<div class="between muted"><span>IVA ${taxRate}%${included ? ' (incluido)' : ''}</span><span>${money(tax)}</span></div>` : ''}
        <div class="ticket-total"><span>Total</span><b>${money(total)}</b></div>
      </div>
      <form class="card" data-act="invoice" data-total="${total}" data-oid="${o.id}">
        <div class="ticket-head">Cómo pagan</div>
        <p class="small muted">Puede mezclar efectivo, Nequi y Daviplata. Junto debe alcanzar para el total. Si en efectivo dan de más, el vuelto no entra a la caja como venta.</p>
        <div class="pay-tiles">
          ${Object.entries(PAY).map(([k, lab]) => `
            <label class="pay-tile pay-${k}">
              <span>${lab}</span>
              <input type="number" min="0" step="1" name="${k}" value="${k === 'efectivo' ? Math.round(total) : 0}" />
            </label>`).join('')}
        </div>
        <button class="btn primary block lg" ${openCash ? '' : 'disabled'}>Cobrar e imprimir recibo</button>
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
      ${pageHead('Caja', 'Apertura y cierre del turno. Sin caja abierta no se puede cobrar.')}
      <form class="card form-narrow" data-act="open-cash">
        <div class="ticket-head">Apertura de caja</div>
        <p class="hint">Cuente el efectivo del cajón (base) y anótelo. Ese valor es el punto de partida del arqueo.</p>
        <div class="field"><label>Base (efectivo al abrir)</label><input name="opening_amount" type="number" min="0" step="1" required /></div>
        <button class="btn primary block lg">Abrir caja</button>
      </form>
      ${salonResetCard(salon)}
      ${cashHistory()}`;
  }
  const moves = s?.moves || [];
  return `
    ${pageHead('Caja', `Turno abierto por ${esc(r.opened_by_name)} · ${esc(r.opened_at)}`, `<button class="btn ghost" type="button" data-act="print-cash" data-id="${r.id}">Ticket de apertura</button>`)}
    ${salon?.open_orders || salon?.occupied_tables
      ? `<div class="alert">Hay ${salon.open_orders || 0} cuenta(s) y ${salon.occupied_tables || 0} mesa(s) ocupada(s). Cóbrelas o reinicie el salón antes de cerrar.</div>` : ''}
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
        <button class="btn ghost">Guardar gasto</button>
      </form>
      <form class="card" data-act="close-cash">
        <div class="ticket-head">Cierre de caja</div>
        <p class="hint">Cuente el efectivo. El sistema compara con la base + ventas en efectivo − gastos.</p>
        <div class="field"><label>¿Cuánto efectivo hay ahora?</label><input name="counted_cash" type="number" min="0" required /></div>
        <div class="field"><label>Nota (si quiere)</label><input name="notes" /></div>
        <button class="btn danger block">Cerrar caja</button>
      </form>
    </div>
    <h3 class="section-title">Movimientos de este turno</h3>
    <div class="table-wrap card">
      <table class="data">
        <thead><tr><th>Tipo</th><th>Medio</th><th>Valor</th><th>Nota</th></tr></thead>
        <tbody>
          ${moves.map((m) => `
            <tr>
              <td>${MOVE_TYPE[m.type] || m.type}</td>
              <td>${PAY[m.method] || m.method || '—'}</td>
              <td>${money(m.amount)}</td>
              <td>${esc(m.description || '')}</td>
            </tr>`).join('') || '<tr><td colspan="4">Todavía no hay movimientos</td></tr>'}
        </tbody>
      </table>
    </div>
    ${salonResetCard(salon)}
    ${cashHistory()}`;
}

function cashHistory() {
  return `
    <h3 class="section-title">Cierres anteriores</h3>
    <div class="table-wrap card">
      <table class="data">
        <thead><tr><th>Se abrió</th><th>Se cerró</th><th>Al abrir</th><th>Al contar</th><th>Diferencia</th><th></th></tr></thead>
        <tbody>
          ${(state.cashHistory || []).map((h) => `
            <tr>
              <td>${esc(h.opened_at)}<div class="small muted">${esc(h.opened_by_name)}</div></td>
              <td>${esc(h.closed_at || 'Abierta')}</td>
              <td>${money(h.opening_amount)}</td>
              <td>${h.closing_counted != null ? money(h.closing_counted) : '—'}</td>
              <td>${cashDiffLabel(h.difference)}</td>
              <td><button class="btn ghost" type="button" data-act="print-cash" data-id="${h.id}">Ticket</button></td>
            </tr>`).join('') || '<tr><td colspan="6">Sin cierres</td></tr>'}
        </tbody>
      </table>
    </div>`;
}

function inventoryView() {
  return `
    ${pageHead('Inventario', 'Aquí se ve qué hay en cocina. Al vender, se descuenta solo.', `<button class="btn primary" data-act="new-ing">Agregar ingrediente</button>`)}
    ${(state.alerts || []).length ? `<div class="alert">Se está acabando: ${state.alerts.map((a) => `${esc(a.name)} (${a.stock} ${esc(a.unit)})`).join(' · ')}</div>` : ''}
    <div class="grid catalog">
      ${state.ingredients.map((i) => {
        const low = Number(i.stock) <= Number(i.min_stock);
        return `<div class="card stock-card ${low ? 'low' : ''}">
          <div class="between"><b>${esc(i.name)}</b>          <span class="badge ${low ? 'occupied' : 'free'}">${low ? 'Poco' : 'Bien'}</span></div>
          <div class="stock-num">${i.stock} <small>${esc(i.unit)}</small></div>
          <div class="small muted">Avisar cuando queden ${i.min_stock}</div>
          <div class="row" style="margin-top:12px">
            <button class="btn" data-act="move-ing" data-id="${i.id}" data-type="purchase">Reponer</button>
            <button class="btn ghost" data-act="move-ing" data-id="${i.id}" data-type="adjustment">Corregir</button>
            <button class="btn ghost" data-act="edit-ing" data-id="${i.id}">Editar</button>
          </div>
        </div>`;
      }).join('')}
    </div>
    <h3 class="section-title">Qué se ha movido</h3>
    <div class="table-wrap card">
      <table class="data">
        <thead><tr><th>Fecha</th><th>Ingrediente</th><th>Qué pasó</th><th>Cantidad</th><th>Quedó</th><th>Nota</th></tr></thead>
        <tbody>
          ${state.movements.slice(0, 80).map((m) => `
            <tr>
              <td>${esc(m.created_at)}</td>
              <td>${esc(m.ingredient_name)}</td>
              <td>${esc(MOVE_TYPE[m.type] || m.type)}</td>
              <td>${m.quantity}</td>
              <td>${m.stock_after}</td>
              <td>${esc(m.reason || '')} <span class="small muted">${esc(m.user_name || '')}</span></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
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
      return `${r.quantity} ${esc(r.unit)} ${esc(iname)}${Number(r.removable) === 0 ? '' : ' (se puede quitar)'}`;
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
    <div class="grid catalog">${cards(visible)}</div>
    ${hidden.length ? `<h3 class="section-title">Ocultos (${hidden.length})</h3><div class="grid catalog">${cards(hidden)}</div>` : ''}`;
}

function usersView() {
  return `
    ${pageHead('Personal', 'Cada persona entra con su usuario. El cargo puede ser Jefe, Mesero, Cocina o Cajero.', `<button class="btn primary" data-act="new-user">Agregar persona</button>`)}
    <div class="grid catalog">
      ${state.users.map((u) => `
        <div class="card user-card">
          <div class="avatar">${esc((u.name || '?').slice(0, 1))}</div>
          <div>
            <b>${esc(u.name)}</b>
            <div class="small muted">@${esc(u.username)} · ${ROLE[u.role]}</div>
            <span class="badge ${u.active ? 'free' : 'reserved'}">${u.active ? 'Puede entrar' : 'Bloqueado'}</span>
          </div>
          <button class="btn" data-act="edit-user" data-id="${u.id}">Editar</button>
        </div>`).join('')}
    </div>`;
}

function reportsView() {
  const tabs = [
    ['sales', 'Ventas'], ['products', 'Lo más pedido'], ['ingredients', 'Ingredientes'], ['waiters', 'Meseros']
  ];
  let body = '';
  const r = state.reports || {};
  if (state.reportTab === 'sales') {
    body = `
      <div class="grid stats">
        <div class="stat"><span>Cuentas</span><b>${r.totals?.tickets || 0}</b></div>
        <div class="stat"><span>Total</span><b>${money(r.totals?.total)}</b></div>
      </div>
      <div class="table-wrap card" style="margin-top:12px">
        <table class="data"><thead><tr><th>Día</th><th>Cuentas</th><th>Total</th></tr></thead>
        <tbody>${(r.daily || []).map((d) => `<tr><td>${esc(d.day)}</td><td>${d.tickets}</td><td>${money(d.total)}</td></tr>`).join('')}</tbody></table>
      </div>
      <h3>Cómo pagaron</h3>
      ${(r.methods || []).map((m) => `<div class="between card" style="margin-bottom:8px"><span>${PAY[m.method] || m.method}</span><b>${money(m.total)}</b></div>`).join('')}`;
  } else if (state.reportTab === 'products') {
    body = `<div class="table-wrap card"><table class="data"><thead><tr><th>Producto</th><th>Cuántos</th><th>Total</th></tr></thead>
      <tbody>${(r.products || []).map((p) => `<tr><td>${esc(p.product_name)}</td><td>${p.qty}</td><td>${money(p.total)}</td></tr>`).join('')}</tbody></table></div>`;
  } else if (state.reportTab === 'ingredients') {
    body = `<div class="table-wrap card"><table class="data"><thead><tr><th>Ingrediente</th><th>Se usó</th></tr></thead>
      <tbody>${(r.ingredients || []).map((i) => `<tr><td>${esc(i.name)}</td><td>${i.consumed} ${esc(i.unit)}</td></tr>`).join('')}</tbody></table></div>`;
  } else {
    body = `<div class="table-wrap card"><table class="data"><thead><tr><th>Mesero</th><th>Cuentas</th><th>Total</th></tr></thead>
      <tbody>${(r.waiters || []).map((w) => `<tr><td>${esc(w.name)}</td><td>${w.tickets}</td><td>${money(w.total)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  return `
    ${pageHead('Informes', 'Vea las ventas, lo más pedido, los ingredientes y el trabajo de cada mesero.')}
    <div class="toolbar card">
      <div class="field"><label>Desde</label><input type="date" data-act="from" value="${state.from}" /></div>
      <div class="field"><label>Hasta</label><input type="date" data-act="to" value="${state.to}" /></div>
    </div>
    <div class="tabs">${tabs.map(([id, lab]) => `<button class="${state.reportTab === id ? 'on' : ''}" data-act="rep-tab" data-id="${id}">${lab}</button>`).join('')}</div>
    ${body}`;
}

function configView() {
  const s = state.settings;
  return `
    ${pageHead('Ajustes', 'Nombre del restaurante, impresora, mesas y copias de los datos.')}
    <div class="settings-grid">
    <form class="card" data-act="save-settings">
      <div class="field"><label>Nombre del restaurante</label><input name="business_name" value="${esc(s.business_name || '')}" /></div>
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
        </select></div>
      <div class="field"><label>¿Cómo se imprime?</label>
        <select name="printer_enabled"><option value="0" ${s.printer_enabled ? '' : 'selected'}>Desde el computador (elige la impresora)</option>
        <option value="1" ${s.printer_enabled ? 'selected' : ''}>Directo a la impresora del restaurante</option></select></div>
      <div class="field"><label>Nombre de la impresora (como sale en Windows)</label>
        <input name="printer_name" value="${esc(s.printer_name || '')}" placeholder="POS-80" /></div>
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
      <div class="ticket-head">Impresora y copias</div>
      <div class="row">
        <button class="btn ghost" data-act="print-test">Probar recibo</button>
        <button class="btn sage" data-act="backup">Guardar copia</button>
      </div>
      <p class="hint" style="margin-top:12px">Las copias quedan en la carpeta backups. Al encender el sistema se guarda una sola.</p>
      <ul class="backup-list">${(state.backups || []).map((b) => `<li>${esc(b.filename)}</li>`).join('') || '<li>Todavía no hay copias</li>'}</ul>
    </div>
    ${/^(localhost|127\.0\.0\.1)$/i.test(location.hostname) ? `
    <div class="card" style="margin-top:14px">
      <div class="ticket-head">Acceso desde el celular</div>
      ${lanAccessCard()}
    </div>` : ''}
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
  modalRoot.onsubmit = onSubmit;
}

async function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'FORM' || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const act = el.dataset.act;
  try {
    if (act === 'nav') { closeModal(); state.moreNav = false; go(el.dataset.view); }
    if (act === 'toggle-more') { state.moreNav = !state.moreNav; render(); return; }
    if (act === 'nav-more') showMoreNav();
    if (act === 'logout') { await api('/api/logout', { method: 'POST' }); state.user = null; state.moreNav = false; go('login'); }
    if (act === 'cat') { state.categoryId = el.dataset.id; render(); }
    if (act === 'table') await onTable(Number(el.dataset.id));
    if (act === 'add-prod') await addProduct(Number(el.dataset.id));
    if (act === 'qty') await changeQty(Number(el.dataset.id), Number(el.dataset.d));
    if (act === 'note-item') await noteItem(Number(el.dataset.id));
    if (act === 'cancel-item') await cancelItem(Number(el.dataset.id));
    if (act === 'send-order') await sendOrder();
    if (act === 'wait-pay') await waitPay();
    if (act === 'cancel-order') await cancelOrder();
    if (act === 'reset-salon') await resetSalon();
    if (act === 'join-mode') { state.joinFrom = state.order.table_id; go('mesas'); toast('Toque la mesa que quiere juntar'); }
    if (act === 'transfer-mode') { state.transferFrom = state.order.table_id; go('mesas'); toast('Toque la mesa a la que pasa el pedido'); }
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
      if (!confirm('¿Borrar este grupo? Los productos quedan sin grupo.')) return;
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
      if (!confirm('¿Quitar esta mesa?')) return;
      await api('/api/tables/' + el.dataset.id, { method: 'DELETE' });
      await loadView();
    }
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
      const me = await api('/api/me');
      state.settings = me.settings;
      state.alerts = me.alerts || [];
      try { connectSocket(); } catch { /* el acceso no depende del socket */ }
      go(homeFor(r.user.role));
      await loadView();
      return;
    }
    if (act === 'invoice') {
      const total = Number(form.dataset.total);
      const payments = ['efectivo', 'nequi', 'daviplata']
        .map((m) => ({ method: m, amount: Number(obj[m] || 0) }))
        .filter((p) => p.amount > 0);
      const sum = payments.reduce((s, p) => s + p.amount, 0);
      if (Math.round(sum) < Math.round(total)) { toast('El pago no cubre el total', true); return; }
      const r = await api('/api/invoices', { method: 'POST', body: { order_id: Number(form.dataset.oid), payments } });
      toast('Cuenta #' + r.invoice.number + ' cobrada');
      if (r.change > 0) toast('Vuelto: ' + money(r.change));
      if (r.alerts?.length) toast('Se está acabando: ' + r.alerts.map((a) => a.name).join(', '));
      openTicket(r.print);
      go('facturar');
      return;
    }
    if (act === 'open-cash') {
      const r = await api('/api/cash/open', { method: 'POST', body: { opening_amount: Number(obj.opening_amount) } });
      toast('Caja abierta');
      openTicket(r.print);
    }
    if (act === 'expense') {
      const r = await api('/api/cash/expense', { method: 'POST', body: { amount: Number(obj.amount), description: obj.description } });
      toast('Gasto anotado');
      openTicket(r.print);
    }
    if (act === 'close-cash') {
      const body = { counted_cash: Number(obj.counted_cash), notes: obj.notes };
      let r;
      try {
        r = await api('/api/cash/close', { method: 'POST', body });
      } catch (err) {
        if (err.status === 409) {
          if (!confirm((err.message || 'Hay cuentas abiertas') + '\n\n¿Cerrar la caja igual? Las mesas no se reinician.')) return;
          r = await api('/api/cash/close', { method: 'POST', body: { ...body, force: true } });
        } else throw err;
      }
      toast('Caja cerrada. ' + cashDiffLabel(r.register.difference));
      openTicket(r.print);
    }
    if (act === 'save-settings') {
      obj.tax_included = obj.tax_included === '1';
      obj.printer_enabled = obj.printer_enabled === '1';
      obj.block_on_no_stock = obj.block_on_no_stock === '1';
      await api('/api/settings', { method: 'PUT', body: obj });
      toast('Guardado');
    }
    if (act === 'save-ing') {
      const body = { name: obj.name, unit: obj.unit, min_stock: Number(obj.min_stock || 0), stock: Number(obj.stock || 0) };
      if (obj.id) await api('/api/ingredients/' + obj.id, { method: 'PATCH', body });
      else await api('/api/ingredients', { method: 'POST', body });
      closeModal(); toast('Ingrediente guardado');
    }
    if (act === 'save-move') {
      await api(`/api/ingredients/${obj.id}/move`, { method: 'POST', body: { type: obj.type, quantity: Number(obj.quantity), reason: obj.reason } });
      closeModal(); toast('Cantidad actualizada');
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
    if (act === 'login') {
      const errEl = form.querySelector('#login-error');
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = err.message || 'No se pudo entrar. Use http://localhost:3000 (no XAMPP).';
      }
    }
  }
}

async function onChange(e) {
  if (e.target.dataset.act === 'from') { state.from = e.target.value; await loadReports(); render(); }
  if (e.target.dataset.act === 'to') { state.to = e.target.value; await loadReports(); render(); }
}

async function onTable(id) {
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
  if (t.status === 'reserved') {
    if (confirm('¿Quitar la reserva y tomar el pedido?')) {
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
  if (!choosable.length && !groups.length) return addProductNow(id, [], '');
  pickProduct(p, choosable, groups);
}

function parseChoices(p) {
  try {
    const v = JSON.parse(p?.choices_json || '[]');
    return Array.isArray(v) ? v.filter((g) => g && Array.isArray(g.options) && g.options.length) : [];
  } catch {
    return [];
  }
}

function pickProduct(p, lines, groups) {
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
  modal(`
    <h3 style="margin-top:0">${esc(p.name)}</h3>
    <form id="ing-pick">
      ${choiceHtml}
      ${lines.length ? burgerPickerHtml(p, lines, esc) : (groups.length ? '<p class="hint">Elija la opción y agregue al pedido.</p>' : '')}
      <div class="field"><label>Observación (si quiere)</label>
        <input name="obs" placeholder="Ej. sin salsas, término medio…" autocomplete="off" />
      </div>
      <button class="btn primary block" type="submit">Agregar al pedido</button>
    </form>`);
  const sheet = modalRoot.querySelector('.sheet');
  if (sheet) sheet.classList.add('sheet-burger');
  const form = modalRoot.querySelector('#ing-pick');
  if (lines.length) bindBurgerPicker(form);
  form.onsubmit = async (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const choiceNotes = groups.map((g, gi) => {
      const picked = ev.target.querySelector(`input[name="opt_${gi}"]:checked`);
      return picked ? `${g.label}: ${picked.value}` : '';
    }).filter(Boolean);
    const obs = String(new FormData(ev.target).get('obs') || '').trim();
    const notes = [...choiceNotes, obs].filter(Boolean).join(' · ');
    const kept = new Set([...ev.target.querySelectorAll('input[name="ing"]:checked')].map((el) => Number(el.value)));
    const removed = lines.filter((r) => !kept.has(r.ingredient_id)).map((r) => ({
      id: r.ingredient_id,
      name: r.ingredient_name
    }));
    closeModal();
    await addProductNow(p.id, removed, notes);
  };
}

async function addProductNow(id, removed, notes = '') {
  try {
    const r = await api(`/api/orders/${state.order.id}/items`, {
      method: 'POST',
      body: { product_id: id, quantity: 1, removed, notes }
    });
    state.order = r.order;
    if (r.shortages?.length) toast('Ojo, queda poco: ' + r.shortages.map((s) => s.name).join(', '), true);
    render();
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
  const reason = prompt('¿Por qué lo quita? (si quiere, puede dejarlo vacío)') ?? '';
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
  const ok = confirm(empty
    ? '¿Liberar esta mesa? No hay productos en la cuenta.'
    : '¿Cancelar esta cuenta y dejar la mesa libre? No se cobra nada.');
  if (!ok) return;
  const reason = empty ? 'Mesa liberada' : (prompt('¿Por qué se cancela? (si quiere, puede dejarlo vacío)') ?? '');
  const r = await api(`/api/orders/${state.order.id}/cancel`, { method: 'POST', body: { reason } });
  toast(r.message || 'Cuenta cancelada');
  go('mesas');
}

async function resetSalon() {
  if (!confirm('Esto cancela las cuentas que no se han cobrado y deja las mesas libres.\nLas ventas ya cobradas no se tocan.\n¿Seguir?')) return;
  const r = await api('/api/salon/reset', { method: 'POST', body: { reason: 'Reinicio de salón' } });
  toast(r.message || 'Salón reiniciado');
  await loadView();
}

async function sendOrder() {
  const r = await api(`/api/orders/${state.order.id}/send`, { method: 'POST' });
  state.order = r.order;
  toast('Enviado a cocina');
  if (r.print) openTicket(r.print);
  if (r.shortages?.length) toast('Ojo, queda poco: ' + r.shortages.map((s) => s.name).join(', '), true);
  render();
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
  const w = window.open('', 'ticket', 'width=420,height=640');
  if (!w) { toast('Deje abrir la ventana para imprimir el ticket', true); return; }
  w.document.write(print.html);
  w.document.close();
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* impresora ausente no bloquea */ } }, 250);
}

function ingForm(i) {
  modal(`
    <h3 style="margin-top:0">${i ? 'Editar ingrediente' : 'Agregar ingrediente'}</h3>
    <form data-act="save-ing">
      ${i ? `<input type="hidden" name="id" value="${i.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(i?.name || '')}" /></div>
      <div class="field"><label>Cómo se mide (gramos, ml, unidades...)</label><input name="unit" required value="${esc(i?.unit || '')}" /></div>
      ${i ? '' : `<div class="field"><label>Cuánto hay ahora</label><input name="stock" type="number" step="0.01" value="0" /></div>`}
      <div class="field"><label>Avisar cuando queden menos de</label><input name="min_stock" type="number" step="0.01" value="${i?.min_stock ?? 0}" /></div>
      <button class="btn primary block">Guardar</button>
    </form>`);
}

function moveForm(id, type) {
  const i = state.ingredients.find((x) => x.id === id);
  modal(`
    <h3 style="margin-top:0">${type === 'purchase' ? 'Reponer' : 'Corregir cantidad'} · ${esc(i.name)}</h3>
    <form data-act="save-move">
      <input type="hidden" name="id" value="${id}" />
      <input type="hidden" name="type" value="${type}" />
      <div class="field"><label>${type === 'adjustment' ? 'Cantidad (ponga negativo si hay que bajar)' : 'Cuánto entra'}</label>
        <input name="quantity" type="number" step="0.01" required /></div>
      <div class="field"><label>Nota (si quiere)</label><input name="reason" /></div>
      <button class="btn primary block">Registrar</button>
    </form>`);
}

const CORE_KINDS = new Set(['bun', 'patty', 'sausage', 'chorizo', 'fries', 'arepa', 'patacon']);

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
      pill.title = k === 'extra' ? 'Este nombre aún no tiene dibujo; saldrá como capa genérica' : 'Se anima en el pedido';
    }
    const chk = row?.querySelector('input[type="checkbox"]');
    if (chk && !chk.dataset.touched) chk.checked = !isCoreIng(name);
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
  return `<div class="recipe-row">
    <div class="ing-name">
      <select name="ing_${idx}" data-prev="${chosen?.id || ''}">${opts}</select>
      <span class="kind-pill ${kind}" title="${kind === 'extra' ? 'Este nombre aún no tiene dibujo; saldrá como capa genérica' : 'Se anima en el pedido'}"></span>
    </div>
    <input name="qty_${idx}" type="number" step="0.01" min="0" placeholder="Cuánto" value="${r.quantity ?? ''}" />
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
  if (!recipe.length && !confirm('Este producto va a quedar sin ingredientes. ¿Guardar así?')) return;
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
  if (!confirm('¿Borrar este producto? Si ya se vendió, se oculta del menú para no perder las cuentas.')) return;
  const r = await api('/api/products/' + id, { method: 'DELETE' });
  toast(r.message || (r.hidden ? 'Producto oculto' : 'Producto borrado'));
  closeModal();
  await loadView();
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

boot();
