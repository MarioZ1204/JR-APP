#!/usr/bin/env node
/**
 * Prueba de humo integral del sistema (API + flujo operativo).
 * Uso: node scripts/smoke-test.js
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');

const ROOT = path.join(__dirname, '..');
const TEST_DB = path.join(ROOT, 'data', 'smoke-test-run', 'restaurante.db');

function log(icon, msg) {
  console.log(`${icon} ${msg}`);
}

function pass(name) {
  results.push({ name, ok: true });
  log('✓', name);
}

function fail(name, err) {
  results.push({ name, ok: false, err: String(err?.message || err) });
  log('✗', `${name}: ${err?.message || err}`);
}

const results = [];

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanupTestDb() {
  for (const ext of ['', '-wal', '-shm']) {
    const f = TEST_DB + ext;
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* */ }
  }
}

async function startServer() {
  process.env.JR_DATA_DIR = path.join(ROOT, 'data', 'smoke-test-run');
  process.env.JR_DB_FILE = 'restaurante.db';
  cleanupTestDb();

  // Limpiar módulos cacheados para usar BD de prueba
  for (const key of Object.keys(require.cache)) {
    if (key.includes(`${path.sep}server${path.sep}`)) delete require.cache[key];
  }

  const dbMod = require('../server/db');
  dbMod.init();

  const { installProductKey, generateKey } = require('../server/license');
  installProductKey(generateKey('Smoke Test', '2099-12-31'), { persistFile: false, rental: false });
  dbMod.getDb().prepare('UPDATE users SET must_change_password = 0').run();

  const { mountApi } = require('../server/api');
  const app = express();
  app.use(session({
    name: 'jr.sid',
    secret: 'smoke-test-secret',
    resave: false,
    saveUninitialized: false
  }));
  app.use(express.json());
  mountApi(app);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  async function req(method, urlPath, { body, cookie } = {}) {
    const res = await fetch(base + urlPath, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: body != null ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    const setCookie = res.headers.getSetCookie?.() || [];
    const cookieHeader = setCookie.length ? setCookie.map((c) => c.split(';')[0]).join('; ') : res.headers.get('set-cookie');
    return { status: res.status, data, cookie: cookieHeader };
  }

  return { server, base, req, cleanup: () => { server.close(); cleanupTestDb(); } };
}

async function login(req, username, password) {
  const r = await req('POST', '/api/login', { body: { username, password } });
  if (r.status !== 200) throw new Error(`Login ${username}: ${r.data.error || r.status}`);
  return r.cookie;
}

async function runTests(ctx) {
  const { req } = ctx;
  let adminCookie, meseroCookie, cocinaCookie, cajeroCookie;
  let tableId, productId, orderId, itemId, invoiceId, registerId;

  try {
    let r = await req('GET', '/api/health');
    if (r.status === 200 && r.data.ok) pass('GET /api/health');
    else fail('GET /api/health', r.data.error || r.status);

    r = await req('GET', '/api/info');
    if (r.status === 200 && r.data.business_name) pass('GET /api/info');
    else fail('GET /api/info', r.data.error || r.status);

    r = await req('GET', '/api/tables');
    if (r.status === 401) pass('GET /api/tables sin sesión → 401');
    else fail('GET /api/tables sin sesión', `esperaba 401, got ${r.status}`);

    adminCookie = await login(req, 'admin', 'admin123');
    pass('Login admin');

    meseroCookie = await login(req, 'mesero', 'mesero123');
    pass('Login mesero');

    cocinaCookie = await login(req, 'cocina', 'cocina123');
    pass('Login cocina');

    cajeroCookie = await login(req, 'cajero', 'cajero123');
    pass('Login cajero');

    r = await req('GET', '/api/me', { cookie: adminCookie });
    if (r.status === 200 && r.data.user?.role === 'admin') pass('GET /api/me (admin)');
    else fail('GET /api/me', r.data.error);

    r = await req('GET', '/api/dashboard', { cookie: adminCookie });
    if (r.status === 200 && r.data.today && Array.isArray(r.data.hourly)) pass('GET /api/dashboard');
    else fail('GET /api/dashboard', r.data.error);

    r = await req('GET', '/api/nav-counts', { cookie: adminCookie });
    if (r.status === 200 && r.data.kitchen_pending != null && r.data.waiting_payment != null) pass('GET /api/nav-counts');
    else fail('GET /api/nav-counts', r.data.error);

    r = await req('GET', '/api/tables', { cookie: meseroCookie });
    if (r.status === 200 && r.data.tables?.length >= 1) {
      tableId = r.data.tables[0].id;
      pass('GET /api/tables');
    } else fail('GET /api/tables', r.data.error);

    r = await req('GET', '/api/products', { cookie: meseroCookie });
    if (r.status === 200 && r.data.products?.length >= 1) {
      const active = r.data.products.find((p) => Number(p.active) !== 0);
      productId = active?.id;
      if (productId) pass('GET /api/products');
      else fail('GET /api/products', 'No hay productos activos');
    } else fail('GET /api/products', r.data.error);

    r = await req('GET', '/api/categories', { cookie: adminCookie });
    if (r.status === 200 && r.data.categories?.length >= 1) pass('GET /api/categories');
    else fail('GET /api/categories', r.data.error);

    r = await req('GET', '/api/ingredients', { cookie: adminCookie });
    if (r.status === 200 && r.data.ingredients?.length >= 1) pass('GET /api/ingredients');
    else fail('GET /api/ingredients', r.data.error);

    r = await req('POST', '/api/orders', { cookie: meseroCookie, body: { table_id: tableId } });
    if (r.status === 200 && r.data.order?.id) {
      orderId = r.data.order.id;
      pass('POST /api/orders (abrir comanda)');
    } else fail('POST /api/orders', r.data.error);

    r = await req('POST', `/api/orders/${orderId}/items`, {
      cookie: meseroCookie,
      body: { product_id: productId, quantity: 1, notes: 'Test smoke' }
    });
    if (r.status === 200 && r.data.order?.items?.length >= 1) {
      itemId = r.data.order.items.find((i) => i.status !== 'cancelled')?.id;
      pass('POST /api/orders/:id/items');
    } else fail('POST /api/orders/:id/items', r.data.error);

    r = await req('POST', `/api/orders/${orderId}/send`, { cookie: meseroCookie, body: {} });
    if (r.status === 200) pass('POST /api/orders/:id/send (cocina)');
    else fail('POST /api/orders/:id/send', r.data.error);

    r = await req('GET', '/api/orders?status=kitchen', { cookie: cocinaCookie });
    if (r.status === 200 && r.data.orders?.length >= 1) pass('GET /api/orders?status=kitchen');
    else fail('GET /api/orders?status=kitchen', r.data.error);

    r = await req('POST', `/api/orders/${orderId}/items/${itemId}/status`, {
      cookie: cocinaCookie,
      body: { status: 'preparing' }
    });
    if (r.status === 200) pass('POST item status → preparing');
    else fail('POST item status preparing', r.data.error);

    r = await req('POST', `/api/orders/${orderId}/items/${itemId}/status`, {
      cookie: cocinaCookie,
      body: { status: 'ready' }
    });
    if (r.status === 200) pass('POST item status → ready');
    else fail('POST item status ready', r.data.error);

    r = await req('POST', `/api/tables/${tableId}/wait-payment`, { cookie: meseroCookie, body: {} });
    if (r.status === 200) pass('POST /api/tables/:id/wait-payment');
    else fail('POST wait-payment', r.data.error);

    r = await req('POST', '/api/invoices', { cookie: cajeroCookie, body: { order_id: orderId, payments: [{ method: 'efectivo', amount: 50000 }] } });
    if (r.status === 400 && String(r.data.error || '').includes('caja')) {
      pass('POST /api/invoices sin caja → error esperado');
    } else fail('POST /api/invoices sin caja', `esperaba error caja, got ${r.status}`);

    r = await req('POST', '/api/cash/open', { cookie: cajeroCookie, body: { opening_amount: 100000 } });
    if (r.status === 200 && r.data.register?.id) {
      registerId = r.data.register.id;
      pass('POST /api/cash/open');
    } else fail('POST /api/cash/open', r.data.error);

    r = await req('GET', '/api/cash/current', { cookie: cajeroCookie });
    if (r.status === 200 && r.data.register) pass('GET /api/cash/current');
    else fail('GET /api/cash/current', r.data.error);

    r = await req('POST', '/api/invoices', {
      cookie: cajeroCookie,
      body: { order_id: orderId, payments: [{ method: 'efectivo', amount: 50000 }], discount: 0, tip: 1000 }
    });
    if (r.status === 200 && r.data.invoice?.id) {
      invoiceId = r.data.invoice.id;
      pass('POST /api/invoices (cobrar)');
    } else fail('POST /api/invoices', r.data.error);

    r = await req('GET', '/api/invoices', { cookie: cajeroCookie });
    if (r.status === 200 && r.data.invoices?.length >= 1) pass('GET /api/invoices');
    else fail('GET /api/invoices', r.data.error);

    r = await req('GET', `/api/invoices/${invoiceId}`, { cookie: cajeroCookie });
    if (r.status === 200 && r.data.invoice) pass('GET /api/invoices/:id');
    else fail('GET /api/invoices/:id', r.data.error);

    r = await req('POST', '/api/cash/expense', { cookie: cajeroCookie, body: { amount: 5000, description: 'Test egreso' } });
    if (r.status === 200) pass('POST /api/cash/expense');
    else fail('POST /api/cash/expense', r.data.error);

    r = await req('GET', '/api/reports/sales', { cookie: adminCookie });
    if (r.status === 200 && r.data.totals != null) pass('GET /api/reports/sales');
    else fail('GET /api/reports/sales', r.data.error);

    r = await req('GET', '/api/reports/products', { cookie: adminCookie });
    if (r.status === 200) pass('GET /api/reports/products');
    else fail('GET /api/reports/products', r.data.error);

    r = await req('GET', '/api/reports/waiters', { cookie: adminCookie });
    if (r.status === 200) pass('GET /api/reports/waiters');
    else fail('GET /api/reports/waiters', r.data.error);

    r = await req('GET', '/api/reports/audit', { cookie: adminCookie });
    if (r.status === 200) pass('GET /api/reports/audit');
    else fail('GET /api/reports/audit', r.data.error);

    r = await req('GET', '/api/users', { cookie: adminCookie });
    if (r.status === 200 && r.data.users?.length >= 4) pass('GET /api/users');
    else fail('GET /api/users', r.data.error);

    r = await req('GET', '/api/settings', { cookie: adminCookie });
    if (r.status === 200 && r.data.settings) pass('GET /api/settings');
    else fail('GET /api/settings', r.data.error);

    r = await req('PUT', '/api/settings', {
      cookie: adminCookie,
      body: { business_name: 'Smoke Test Restaurante', business_tagline: 'Prueba' }
    });
    if (r.status === 200) pass('PUT /api/settings');
    else fail('PUT /api/settings', r.data.error);

    r = await req('POST', '/api/backup', { cookie: adminCookie, body: {} });
    if (r.status === 200 && r.data.filename) pass('POST /api/backup');
    else fail('POST /api/backup', r.data.error);

    r = await req('GET', '/api/backups', { cookie: adminCookie });
    if (r.status === 200 && Array.isArray(r.data.backups)) pass('GET /api/backups');
    else fail('GET /api/backups', r.data.error);

    r = await req('POST', '/api/print/test', { cookie: adminCookie, body: {} });
    if (r.status === 200) pass('POST /api/print/test');
    else fail('POST /api/print/test', r.data.error);

    r = await req('GET', '/api/dashboard', { cookie: meseroCookie });
    if (r.status === 403) pass('Mesero no accede al panel → 403');
    else fail('Permiso panel mesero', `esperaba 403, got ${r.status}`);

    r = await req('POST', '/api/cash/close', {
      cookie: cajeroCookie,
      body: { counted_cash: 100000, notes: 'Cierre smoke test', force: true }
    });
    if (r.status === 200) pass('POST /api/cash/close');
    else fail('POST /api/cash/close', r.data.error);

    r = await req('GET', '/api/cash/history', { cookie: cajeroCookie });
    if (r.status === 200 && r.data.history?.length >= 1) pass('GET /api/cash/history');
    else fail('GET /api/cash/history', r.data.error);

    // Licencia (scripts)
    const { generateKey, parseKey, installProductKey } = require('../server/license');
    const key = generateKey('Smoke Cliente', '2027-12-31');
    if (parseKey(key)) pass('Generar y validar clave de producto');
    else fail('Clave de producto', 'parseKey falló');

    r = await req('POST', '/api/logout', { cookie: adminCookie, body: {} });
    if (r.status === 200) pass('POST /api/logout');
    else fail('POST /api/logout', r.data.error);

  } catch (e) {
    fail('Excepción inesperada', e);
  }
}

async function main() {
  console.log('');
  console.log('========================================');
  console.log('  JR — Prueba de humo (smoke test)');
  console.log('========================================');
  console.log('');

  let ctx;
  try {
    ctx = await startServer();
    await runTests(ctx);
  } catch (e) {
    fail('Arranque del servidor de prueba', e);
  } finally {
    if (ctx) ctx.cleanup();
  }

  const ok = results.filter((r) => r.ok).length;
  const bad = results.filter((r) => !r.ok);
  console.log('');
  console.log('----------------------------------------');
  console.log(`Resultado: ${ok}/${results.length} pruebas OK`);
  if (bad.length) {
    console.log('');
    console.log('Fallos:');
    for (const b of bad) console.log(`  • ${b.name}: ${b.err}`);
    process.exit(1);
  }
  console.log('Todo correcto.');
  console.log('');
  process.exit(0);
}

main();
