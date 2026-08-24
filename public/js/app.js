import { api, money, ROLE, TABLE_STATUS, ITEM_STATUS, ORDER_STATUS, MOVE_TYPE, PAY, today, daysAgo, navFor, homeFor } from './api.js';

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
  infoName: 'JR Burger'
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
    if (e.target === modalRoot || e.target.closest('[data-act="close-modal"]')) closeModal();
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
      const [s, b, t] = await Promise.all([api('/api/settings'), api('/api/backups'), api('/api/tables')]);
      state.settings = s.settings;
      state.backups = b.backups;
      state.tables = t.tables;
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
    ajustes: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2m0 14v2M5 12H3m18 0h-2M6.2 6.2l1.4 1.4m9 9l1.4 1.4m0-11.8l-1.4 1.4m-9 9L6.2 17.8"/>'
  };
  return `<svg class="nav-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ''}</svg>`;
}

function render() {
  if (!state.user || state.view === 'login') {
    root.innerHTML = loginView();
    bind();
    return;
  }
  const brand = esc(state.settings.business_name || 'JR Burger');
  const links = navFor(state.user.role).map((i) => `
    <button class="${state.view === i.id ? 'on' : ''}" data-act="nav" data-view="${i.id}">
      ${ico(i.ico)}<span>${i.label}</span>
    </button>`).join('');
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
        <div class="sidenav-links">${links}</div>
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
      <nav class="bottom-nav">${links}</nav>
    </div>`;
  paintLive();
  bind();
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
      <p class="hint" style="margin-top:14px">Desde el celular, entre al WiFi del restaurante y abra la misma dirección que sale en el computador.</p>
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
  return `<div class="page-head">
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
    ${pageHead(esc(o.table_name), `Pedido #${o.id} · ${esc(o.waiter_name)}`, `<button class="btn ghost" data-act="nav" data-view="mesas">Volver a mesas</button>`)}
    <div class="order-layout">
      <div>
        <div class="tabs">
          ${cats.map((c) => `<button class="${String(state.categoryId) === String(c.id) ? 'on' : ''}" data-act="cat" data-id="${c.id}">${esc(c.name)}</button>`).join('')}
        </div>
        <div class="grid menu-grid">
          ${products.map((p) => `
            <button class="card prod" data-act="add-prod" data-id="${p.id}">
              <span class="prod-cat">${esc(p.category_name || '')}</span>
              <div class="name">${esc(p.name)}</div>
              <div class="price">${money(p.price)}</div>
            </button>`).join('')}
        </div>
      </div>
      <div class="card ticket">
        <div class="ticket-head">Pedido</div>
        ${o.items.map((it) => `
          <div class="ticket-line ${it.status === 'cancelled' ? 'cancelled' : ''}">
            <div>
              <div class="name">${it.quantity}× ${esc(it.product_name)}</div>
              ${it.notes ? `<div class="notes">${esc(it.notes)}</div>` : ''}
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
        <div class="actions-fab">
          <button class="btn primary block lg" data-act="send-order" ${unsent ? '' : 'disabled'}>Enviar a cocina (${unsent})</button>
          <button class="btn gold block" data-act="wait-pay">Pedir cuenta</button>
          <div class="row">
            <button class="btn ghost" data-act="join-mode">Juntar mesas</button>
            <button class="btn ghost" data-act="transfer-mode">Pasar a otra mesa</button>
          </div>
        </div>
      </div>
    </div>`;
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
        ${active.map((i) => `<div class="ticket-line"><span>${i.quantity}× ${esc(i.product_name)}</span><span class="line-amt">${money(i.quantity * i.unit_price)}</span></div>`).join('')}
        <div class="between muted"><span>Suma</span><span>${money(subtotal)}</span></div>
        ${taxRate ? `<div class="between muted"><span>IVA ${taxRate}%${included ? ' (incluido)' : ''}</span><span>${money(tax)}</span></div>` : ''}
        <div class="ticket-total"><span>Total</span><b>${money(total)}</b></div>
      </div>
      <form class="card" data-act="invoice" data-total="${total}" data-oid="${o.id}">
        <div class="ticket-head">Cómo pagan</div>
        <p class="small muted">Puede mezclar efectivo, Nequi y Daviplata. Junto debe alcanzar para el total.</p>
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

function cashView() {
  const r = state.cash?.register;
  const s = state.cash?.summary;
  if (!r) {
    return `
      ${pageHead('Caja', 'La caja está cerrada. Ábrala para empezar a cobrar.')}
      <form class="card form-narrow" data-act="open-cash">
        <div class="ticket-head">Abrir caja</div>
        <div class="field"><label>¿Con cuánto efectivo empieza?</label><input name="opening_amount" type="number" min="0" step="1" required /></div>
        <button class="btn primary block lg">Abrir caja</button>
      </form>
      ${cashHistory()}`;
  }
  return `
    ${pageHead('Caja', `Abierta por ${esc(r.opened_by_name)} · ${esc(r.opened_at)}`)}
    <div class="grid stats">
      <div class="stat"><span>Al abrir</span><b>${money(r.opening_amount)}</b></div>
      <div class="stat"><span>Ventas</span><b>${money(s.sales)}</b></div>
      <div class="stat accent"><span>Debería haber en caja</span><b>${money(s.expected_cash)}</b></div>
      <div class="stat"><span>Nequi</span><b>${money(s.byMethod.nequi)}</b></div>
      <div class="stat"><span>Daviplata</span><b>${money(s.byMethod.daviplata)}</b></div>
      <div class="stat"><span>Gastos</span><b>${money(s.expenses)}</b></div>
    </div>
    <div class="bill-grid" style="margin-top:18px">
      <form class="card" data-act="expense">
        <div class="ticket-head">Anotar un gasto</div>
        <div class="field"><label>Valor</label><input name="amount" type="number" min="1" required /></div>
        <div class="field"><label>¿En qué se gastó?</label><input name="description" placeholder="Pan, gas, etc." /></div>
        <button class="btn ghost">Guardar gasto</button>
      </form>
      <form class="card" data-act="close-cash">
        <div class="ticket-head">Cerrar caja</div>
        <div class="field"><label>¿Cuánto efectivo hay ahora?</label><input name="counted_cash" type="number" min="0" required /></div>
        <div class="field"><label>Nota (si quiere)</label><input name="notes" /></div>
        <button class="btn danger block">Cerrar caja</button>
      </form>
    </div>
    ${cashHistory()}`;
}

function cashHistory() {
  return `
    <h3 class="section-title">Cierres anteriores</h3>
    <div class="table-wrap card">
      <table class="data">
        <thead><tr><th>Se abrió</th><th>Se cerró</th><th>Al abrir</th><th>Al contar</th><th>Diferencia</th></tr></thead>
        <tbody>
          ${(state.cashHistory || []).map((h) => `
            <tr>
              <td>${esc(h.opened_at)}<div class="small muted">${esc(h.opened_by_name)}</div></td>
              <td>${esc(h.closed_at || 'Abierta')}</td>
              <td>${money(h.opening_amount)}</td>
              <td>${h.closing_counted != null ? money(h.closing_counted) : '—'}</td>
              <td>${h.difference != null ? money(h.difference) : '—'}</td>
            </tr>`).join('') || '<tr><td colspan="5">Sin cierres</td></tr>'}
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

function productsView() {
  return `
    ${pageHead('Menú', 'Lo que se vende. En cada producto se anota qué ingredientes usa.', `
      <button class="btn primary" data-act="new-prod">Agregar producto</button>
      <button class="btn ghost" data-act="new-cat">Agregar grupo</button>`)}
    <div class="grid catalog">
      ${state.products.map((p) => `
        <div class="card catalog-card">
          <span class="prod-cat">${esc(p.category_name || 'Sin grupo')} · ${p.station === 'bar' ? 'Barra' : 'Cocina'}</span>
          <div class="between"><b>${esc(p.name)}</b><span class="price">${money(p.price)}</span></div>
          <div class="recipe-line">${(p.recipe || []).map((r) => `${r.quantity} ${esc(r.unit)} ${esc(r.ingredient_name)}`).join(' · ') || 'Sin ingredientes anotados'}</div>
          <div class="between" style="margin-top:12px">
            <span class="badge ${p.active ? 'free' : 'reserved'}">${p.active ? 'Se vende' : 'No se vende'}</span>
            <button class="btn" data-act="edit-prod" data-id="${p.id}">Editar</button>
          </div>
        </div>`).join('')}
    </div>`;
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
    if (act === 'nav') go(el.dataset.view);
    if (act === 'logout') { await api('/api/logout', { method: 'POST' }); state.user = null; go('login'); }
    if (act === 'cat') { state.categoryId = el.dataset.id; render(); }
    if (act === 'table') await onTable(Number(el.dataset.id));
    if (act === 'add-prod') await addProduct(Number(el.dataset.id));
    if (act === 'qty') await changeQty(Number(el.dataset.id), Number(el.dataset.d));
    if (act === 'note-item') await noteItem(Number(el.dataset.id));
    if (act === 'cancel-item') await cancelItem(Number(el.dataset.id));
    if (act === 'send-order') await sendOrder();
    if (act === 'wait-pay') await waitPay();
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
    if (act === 'new-cat') catForm();
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
      if (r.alerts?.length) toast('Se está acabando: ' + r.alerts.map((a) => a.name).join(', '));
      openTicket(r.print);
      go('facturar');
      return;
    }
    if (act === 'open-cash') { await api('/api/cash/open', { method: 'POST', body: { opening_amount: Number(obj.opening_amount) } }); toast('Caja abierta'); }
    if (act === 'expense') { await api('/api/cash/expense', { method: 'POST', body: { amount: Number(obj.amount), description: obj.description } }); toast('Gasto anotado'); }
    if (act === 'close-cash') {
      const r = await api('/api/cash/close', { method: 'POST', body: { counted_cash: Number(obj.counted_cash), notes: obj.notes } });
      toast('Caja cerrada. Diferencia: ' + money(r.register.difference));
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
      await api('/api/categories', { method: 'POST', body: { name: obj.name, station: obj.station } });
      closeModal(); toast('Grupo creado');
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
  try {
    const r = await api(`/api/orders/${state.order.id}/items`, { method: 'POST', body: { product_id: id, quantity: 1 } });
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
  state.order = r.order; render();
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

function prodForm(p) {
  const recipe = (p?.recipe || []).map((r, idx) => recipeRow(r, idx)).join('') || recipeRow({}, 0);
  modal(`
    <h3 style="margin-top:0">${p ? 'Editar producto' : 'Agregar producto'}</h3>
    <form data-act="save-prod" id="prod-form">
      ${p ? `<input type="hidden" name="id" value="${p.id}" />` : ''}
      <div class="field"><label>Nombre</label><input name="name" required value="${esc(p?.name || '')}" /></div>
      <div class="field"><label>Precio</label><input name="price" type="number" min="0" required value="${p?.price ?? ''}" /></div>
      <div class="field"><label>Grupo</label>
        <select name="category_id">${state.categories.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      </div>
      <div class="field"><label>¿Dónde se prepara?</label>
        <select name="station"><option value="kitchen" ${p?.station !== 'bar' ? 'selected' : ''}>Cocina</option>
        <option value="bar" ${p?.station === 'bar' ? 'selected' : ''}>Barra</option></select></div>
      <div class="field"><label>¿Se vende?</label>
        <select name="active"><option value="1" ${p?.active !== 0 ? 'selected' : ''}>Sí</option>
        <option value="0" ${p?.active === 0 ? 'selected' : ''}>No, está escondido</option></select></div>
      <h4>Qué lleva</h4>
      <div id="recipe-rows">${recipe}</div>
      <button type="button" class="btn ghost" id="add-rec">Agregar ingrediente</button>
      <button class="btn primary block" style="margin-top:12px">Guardar</button>
    </form>`);
  modalRoot.querySelector('#add-rec').onclick = () => {
    modalRoot.querySelector('#recipe-rows').insertAdjacentHTML('beforeend', recipeRow({}, Date.now()));
  };
}

function recipeRow(r, idx) {
  return `<div class="row" style="margin-bottom:8px">
    <select name="ing_${idx}">${state.ingredients.map((i) => `<option value="${i.id}" ${r.ingredient_id === i.id ? 'selected' : ''}>${esc(i.name)} (${esc(i.unit)})</option>`).join('')}</select>
    <input name="qty_${idx}" type="number" step="0.01" min="0" placeholder="Cuánto" value="${r.quantity ?? ''}" style="width:110px" />
  </div>`;
}

async function saveProd(form) {
  const fd = new FormData(form);
  const recipe = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith('ing_')) continue;
    const idx = k.slice(4);
    const qty = Number(fd.get('qty_' + idx) || 0);
    if (qty > 0) recipe.push({ ingredient_id: Number(v), quantity: qty });
  }
  const body = {
    name: fd.get('name'), price: Number(fd.get('price')), category_id: Number(fd.get('category_id')),
    station: fd.get('station'), active: fd.get('active') === '1' ? 1 : 0, recipe
  };
  const id = fd.get('id');
  if (id) await api('/api/products/' + id, { method: 'PATCH', body });
  else await api('/api/products', { method: 'POST', body });
  closeModal(); toast('Producto guardado');
}

function catForm() {
  modal(`<h3 style="margin-top:0">Nuevo grupo</h3>
    <form data-act="save-cat">
      <div class="field"><label>Nombre</label><input name="name" required /></div>
      <div class="field"><label>¿Dónde se prepara?</label><select name="station"><option value="kitchen">Cocina</option><option value="bar">Barra</option></select></div>
      <button class="btn primary block">Crear</button>
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
