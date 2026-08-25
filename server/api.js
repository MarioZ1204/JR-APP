const bcrypt = require('bcryptjs');
const { getDb, getSetting, setSetting, getAllSettings, publicUser } = require('./db');
const {
  requireAuth, requireRole, logChange, emit, openOrderForTable,
  refreshTableStatus, primaryTableId, orderWithItems, syncOrderStatus,
  currentRegister, tableList, salonSnapshot, cancelOpenOrder, freeTableAndJoins
} = require('./helpers');
const inventory = require('./inventory');
const { saveBackup, listBackups } = require('./backup');
const { printInvoice, printTest, printKitchenOrder, printCashOpen, printCashExpense, printCashClose } = require('./print');
const { lanUrls } = require('./lan');

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function withTx(fn) {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

function mountApi(app) {
  const db = () => getDb();

  app.get('/api/info', (_req, res) => {
    res.json({
      business_name: getSetting('business_name', 'JR Burger'),
      lan_urls: lanUrls(Number(process.env.PORT || 3000))
    });
  });

  app.post('/api/login', (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = db().prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    req.session.user = publicUser(user);
    req.session.save((err) => {
      if (err) return res.status(500).json({ error: 'No se pudo entrar. Intente otra vez' });
      res.json({ user: publicUser(user) });
    });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({
      user: req.user,
      settings: publicSettings(),
      alerts: inventory.lowStock()
    });
  });

  function publicSettings() {
    const s = getAllSettings();
    return {
      business_name: s.business_name,
      business_nit: s.business_nit,
      business_address: s.business_address,
      business_phone: s.business_phone,
      tax_rate: Number(s.tax_rate || 0),
      tax_included: s.tax_included === '1',
      printer_width: Number(s.printer_width || 80),
      printer_name: s.printer_name || '',
      printer_enabled: s.printer_enabled === '1',
      block_on_no_stock: s.block_on_no_stock === '1',
      ticket_footer: s.ticket_footer || ''
    };
  }

  // —— Mesas ——
  app.get('/api/tables', requireAuth, (req, res) => {
    res.json({ tables: tableList() });
  });

  app.post('/api/tables', requireAuth, requireRole(), (req, res) => {
    const name = String(req.body.name || '').trim();
    const seats = Number(req.body.seats || 4);
    if (!name) return res.status(400).json({ error: 'Falta el nombre' });
    const max = db().prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM restaurant_tables').get().n;
    const info = db().prepare(
      'INSERT INTO restaurant_tables (name, seats, sort_order) VALUES (?, ?, ?)'
    ).run(name, seats, max + 1);
    emit(req, 'tables:changed', {});
    res.json({ table: db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(info.lastInsertRowid) });
  });

  app.patch('/api/tables/:id', requireAuth, requireRole(), (req, res) => {
    const t = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Mesa no encontrada' });
    const name = req.body.name != null ? String(req.body.name).trim() : t.name;
    const seats = req.body.seats != null ? Number(req.body.seats) : t.seats;
    db().prepare('UPDATE restaurant_tables SET name = ?, seats = ? WHERE id = ?').run(name, seats, t.id);
    emit(req, 'tables:changed', {});
    res.json({ table: db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(t.id) });
  });

  app.delete('/api/tables/:id', requireAuth, requireRole(), (req, res) => {
    const t = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (openOrderForTable(t.id) || t.joined_to_id) {
      return res.status(400).json({ error: 'No se puede quitar una mesa ocupada o juntada' });
    }
    const n = db().prepare('SELECT COUNT(*) AS n FROM restaurant_tables').get().n;
    if (n <= 1) return fail(res, 400, 'Tiene que quedar por lo menos una mesa');
    const used = db().prepare('SELECT COUNT(*) AS n FROM orders WHERE table_id = ?').get(t.id).n;
    if (used) {
      return fail(res, 400, 'Esa mesa ya tuvo pedidos. No se puede borrar; cámbiele el nombre si ya no se usa.');
    }
    try {
      db().prepare('DELETE FROM restaurant_tables WHERE id = ?').run(t.id);
    } catch {
      return fail(res, 400, 'No se pudo borrar la mesa. Puede que tenga pedidos guardados.');
    }
    emit(req, 'tables:changed', {});
    res.json({ ok: true });
  });

  app.post('/api/tables/:id/reserve', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const t = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.params.id);
    if (!t) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (t.status === 'occupied' || t.status === 'waiting_payment' || t.joined_to_id) {
      return res.status(400).json({ error: 'La mesa no está libre' });
    }
    const next = t.status === 'reserved' ? 'free' : 'reserved';
    db().prepare('UPDATE restaurant_tables SET status = ? WHERE id = ?').run(next, t.id);
    emit(req, 'tables:changed', {});
    res.json({ table: db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(t.id) });
  });

  app.post('/api/tables/:id/wait-payment', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const id = primaryTableId(Number(req.params.id));
    const t = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(id);
    const order = openOrderForTable(id);
    if (!t || !order) return fail(res, 400, 'Esta mesa no tiene pedido');
    const n = db().prepare(
      "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND status != 'cancelled'"
    ).get(order.id).n;
    if (!n) return fail(res, 400, 'La cuenta está vacía. Cancele la cuenta o agregue productos.');
    db().prepare("UPDATE restaurant_tables SET status = 'waiting_payment' WHERE id = ?").run(id);
    emit(req, 'tables:changed', {});
    res.json({ ok: true });
  });

  app.post('/api/tables/:id/join', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const primary = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.params.id);
    const other = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.body.other_id);
    if (!primary || !other) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (primary.id === other.id) return res.status(400).json({ error: 'Toque otra mesa' });
    if (primary.joined_to_id || other.joined_to_id) {
      return res.status(400).json({ error: 'Una de las mesas ya está juntada' });
    }
    const orderP = openOrderForTable(primary.id);
    const orderO = openOrderForTable(other.id);
    if (orderP && orderO) {
      db().prepare('UPDATE order_items SET order_id = ? WHERE order_id = ?').run(orderP.id, orderO.id);
      db().prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now','localtime') WHERE id = ?")
        .run(orderO.id);
      syncOrderStatus(orderP.id);
    } else if (!orderP && orderO) {
      db().prepare('UPDATE orders SET table_id = ? WHERE id = ?').run(primary.id, orderO.id);
    }
    db().prepare('UPDATE restaurant_tables SET joined_to_id = ?, status = ? WHERE id = ?')
      .run(primary.id, 'occupied', other.id);
    refreshTableStatus(primary.id);
    emit(req, 'tables:changed', {});
    emit(req, 'orders:changed', {});
    res.json({ ok: true });
  });

  app.post('/api/tables/:id/split', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const t = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.params.id);
    if (!t || !t.joined_to_id) return res.status(400).json({ error: 'Esta mesa no está juntada' });
    db().prepare('UPDATE restaurant_tables SET joined_to_id = NULL, status = ? WHERE id = ?').run('free', t.id);
    refreshTableStatus(t.joined_to_id);
    emit(req, 'tables:changed', {});
    res.json({ ok: true });
  });

  app.post('/api/tables/:id/transfer', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const fromId = primaryTableId(Number(req.params.id));
    const to = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(req.body.to_table_id);
    if (!to) return res.status(404).json({ error: 'No se encontró esa mesa' });
    if (to.joined_to_id || to.status === 'occupied' || to.status === 'waiting_payment') {
      return res.status(400).json({ error: 'Esa mesa no está libre' });
    }
    const order = openOrderForTable(fromId);
    if (!order) return res.status(400).json({ error: 'No hay pedido para pasar' });
    db().prepare('UPDATE orders SET table_id = ? WHERE id = ?').run(to.id, order.id);
    db().prepare("UPDATE restaurant_tables SET status = 'free' WHERE id = ? OR joined_to_id = ?").run(fromId, fromId);
    db().prepare('UPDATE restaurant_tables SET joined_to_id = NULL WHERE joined_to_id = ?').run(fromId);
    refreshTableStatus(to.id);
    emit(req, 'tables:changed', {});
    emit(req, 'orders:changed', {});
    res.json({ ok: true, order_id: order.id });
  });

  app.post('/api/salon/reset', requireAuth, requireRole('cashier'), (req, res) => {
    const before = salonSnapshot();
    const open = db().prepare(
      "SELECT id FROM orders WHERE status NOT IN ('billed','cancelled')"
    ).all();
    const reason = String(req.body.reason || 'Reinicio de salón');
    for (const o of open) cancelOpenOrder(o.id, req.user.id, reason);
    db().prepare('UPDATE restaurant_tables SET joined_to_id = NULL WHERE joined_to_id IS NOT NULL').run();
    db().prepare(`
      UPDATE restaurant_tables SET status = 'free'
      WHERE status IN ('occupied','waiting_payment')
    `).run();
    emit(req, 'tables:changed', {});
    emit(req, 'orders:changed', {});
    emit(req, 'kitchen:changed', {});
    res.json({
      ok: true,
      cancelled: open.length,
      before,
      salon: salonSnapshot(),
      message: open.length
        ? `Se cancelaron ${open.length} cuenta(s) sin cobrar. Las mesas quedaron libres. Las ventas ya cobradas no se tocaron.`
        : 'No había cuentas abiertas. Las mesas ocupadas se liberaron.'
    });
  });

  // —— Comandas ——
  app.get('/api/orders', requireAuth, (req, res) => {
    const status = req.query.status;
    let sql = `
      SELECT o.*, t.name AS table_name, u.name AS waiter_name
      FROM orders o
      JOIN restaurant_tables t ON t.id = o.table_id
      JOIN users u ON u.id = o.waiter_id
    `;
    const params = [];
    if (status === 'kitchen') {
      sql += ` WHERE o.status IN ('sent','preparing','ready') `;
    } else if (status === 'open') {
      sql += ` WHERE o.status NOT IN ('billed','cancelled') `;
    }
    sql += ' ORDER BY o.id DESC LIMIT 200';
    const orders = db().prepare(sql).all(...params).map((o) => orderWithItems(o.id));
    res.json({ orders });
  });

  app.get('/api/orders/:id', requireAuth, (req, res) => {
    const order = orderWithItems(req.params.id);
    if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json({ order });
  });

  app.post('/api/orders', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const tableId = primaryTableId(Number(req.body.table_id));
    const table = db().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(tableId);
    if (!table) return res.status(404).json({ error: 'Mesa no encontrada' });
    let order = openOrderForTable(tableId);
    if (!order) {
      const info = db().prepare(
        'INSERT INTO orders (table_id, waiter_id, status) VALUES (?, ?, ?)'
      ).run(tableId, req.user.id, 'open');
      order = db().prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
    }
    db().prepare("UPDATE restaurant_tables SET status = 'occupied' WHERE id = ?").run(tableId);
    emit(req, 'tables:changed', {});
    res.json({ order: orderWithItems(order.id) });
  });

  app.post('/api/orders/:id/items', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const order = db().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!order || ['billed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Este pedido ya está cerrado' });
    }
    const product = db().prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.body.product_id);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const notes = String(req.body.notes || '').trim();
    const recipe = inventory.recipeForProduct(product.id);
    const allowed = new Set(recipe.filter((l) => Number(l.removable) !== 0).map((l) => l.ingredient_id));
    const removed = (Array.isArray(req.body.removed) ? req.body.removed : [])
      .map((x) => {
        const id = Number(x.id != null ? x.id : x);
        const line = recipe.find((l) => l.ingredient_id === id);
        if (!line || !allowed.has(id)) return null;
        return { id, name: line.name };
      })
      .filter(Boolean);
    const removedJson = JSON.stringify(removed);
    const stock = inventory.checkStock(product.id, quantity, removedJson);
    const block = getSetting('block_on_no_stock', '0') === '1';
    if (!stock.ok && block) {
      return res.status(409).json({ error: 'No alcanza el ingrediente', shortages: stock.shortages });
    }
    const info = db().prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, notes, created_by, removed_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(order.id, product.id, product.name, product.price, quantity, notes, req.user.id, removedJson);
    logChange(info.lastInsertRowid, req.user.id, 'add', { quantity, notes });
    syncOrderStatus(order.id);
    refreshTableStatus(order.table_id);
    emit(req, 'orders:changed', { order_id: order.id });
    emit(req, 'tables:changed', {});
    res.json({ order: orderWithItems(order.id), shortages: stock.ok ? [] : stock.shortages });
  });

  app.patch('/api/orders/:id/items/:itemId', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const item = db().prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
      .get(req.params.itemId, req.params.id);
    const order = db().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!item || !order || ['billed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Ya no se puede cambiar' });
    }
    if (item.status === 'cancelled') return res.status(400).json({ error: 'Ese producto ya se quitó' });
    const quantity = req.body.quantity != null ? Math.max(1, Number(req.body.quantity)) : item.quantity;
    const notes = req.body.notes != null ? String(req.body.notes).trim() : item.notes;
    if (quantity !== item.quantity) {
      const stock = inventory.checkStock(item.product_id, quantity, item.removed_json);
      const block = getSetting('block_on_no_stock', '0') === '1';
      if (!stock.ok && block) {
        return res.status(409).json({ error: 'No alcanza el ingrediente', shortages: stock.shortages });
      }
    }
    db().prepare('UPDATE order_items SET quantity = ?, notes = ? WHERE id = ?').run(quantity, notes, item.id);
    logChange(item.id, req.user.id, 'edit', { from: item, quantity, notes });
    emit(req, 'orders:changed', { order_id: order.id });
    res.json({ order: orderWithItems(order.id) });
  });

  app.post('/api/orders/:id/items/:itemId/cancel', requireAuth, requireRole('waiter', 'cashier', 'kitchen'), (req, res) => {
    const item = db().prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
      .get(req.params.itemId, req.params.id);
    const order = db().prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
    if (!item || !order || ['billed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'No se puede quitar' });
    }
    db().prepare(`
      UPDATE order_items
      SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now','localtime'), cancel_reason = ?
      WHERE id = ?
    `).run(req.user.id, String(req.body.reason || ''), item.id);
    logChange(item.id, req.user.id, 'cancel', { reason: req.body.reason || '' });
    syncOrderStatus(order.id);
    const remaining = db().prepare(
      "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND status != 'cancelled'"
    ).get(order.id).n;
    if (!remaining) {
      cancelOpenOrder(order.id, req.user.id, req.body.reason || 'Sin productos');
    } else {
      refreshTableStatus(order.table_id);
    }
    emit(req, 'orders:changed', { order_id: order.id });
    emit(req, 'kitchen:changed', {});
    emit(req, 'tables:changed', {});
    res.json({ order: orderWithItems(order.id) });
  });

  app.post('/api/orders/:id/cancel', requireAuth, requireRole('waiter', 'cashier'), (req, res) => {
    const closed = cancelOpenOrder(Number(req.params.id), req.user.id, req.body.reason || 'Cuenta cancelada');
    if (!closed) return fail(res, 400, 'Esa cuenta ya está cerrada o cobrada');
    emit(req, 'orders:changed', { order_id: closed.id });
    emit(req, 'kitchen:changed', {});
    emit(req, 'tables:changed', {});
    res.json({ ok: true, order: closed, message: 'Cuenta cancelada. La mesa quedó libre.' });
  });

  app.post('/api/orders/:id/send', requireAuth, requireRole('waiter', 'cashier'), async (req, res) => {
    const order = db().prepare(`
      SELECT o.*, t.name AS table_name, u.name AS waiter_name
      FROM orders o
      JOIN restaurant_tables t ON t.id = o.table_id
      JOIN users u ON u.id = o.waiter_id
      WHERE o.id = ?
    `).get(req.params.id);
    if (!order || ['billed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Este pedido ya está cerrado' });
    }
    const pending = db().prepare(`
      SELECT oi.*, COALESCE(p.station, 'kitchen') AS station
      FROM order_items oi
      LEFT JOIN products p ON p.id = oi.product_id
      WHERE oi.order_id = ? AND oi.sent = 0 AND oi.status != 'cancelled'
    `).all(order.id);
    if (!pending.length) return res.status(400).json({ error: 'No hay productos nuevos para enviar' });

    const stock = inventory.checkItemsStock(pending);
    const block = getSetting('block_on_no_stock', '0') === '1';
    if (!stock.ok && block) {
      return res.status(409).json({ error: 'No alcanza el ingrediente para enviar', shortages: stock.shortages });
    }

    const alreadySent = db().prepare(
      `SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND sent = 1 AND status != 'cancelled'`
    ).get(order.id);
    const extraRound = Number(alreadySent?.n || 0) > 0;

    db().prepare(`UPDATE order_items SET sent = 1 WHERE order_id = ? AND sent = 0 AND status != 'cancelled'`)
      .run(order.id);
    syncOrderStatus(order.id);
    emit(req, 'orders:changed', { order_id: order.id });
    emit(req, 'kitchen:changed', { order_id: order.id });
    emit(req, 'tables:changed', {});

    let print = null;
    try {
      print = await printKitchenOrder({ order, items: pending, extraRound });
    } catch (e) {
      print = { ok: false, mode: 'browser', html: null, message: 'El pedido ya fue a cocina. No se pudo imprimir.' };
    }
    res.json({ order: orderWithItems(order.id), shortages: stock.ok ? [] : stock.shortages, print });
  });

  app.post('/api/orders/:id/items/:itemId/status', requireAuth, requireRole('kitchen', 'waiter'), (req, res) => {
    const allowed = ['pending', 'preparing', 'ready', 'delivered'];
    const status = req.body.status;
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Ese estado no sirve' });
    const item = db().prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?')
      .get(req.params.itemId, req.params.id);
    if (!item || item.status === 'cancelled') return res.status(400).json({ error: 'Ese producto no sirve' });
    db().prepare('UPDATE order_items SET status = ? WHERE id = ?').run(status, item.id);
    logChange(item.id, req.user.id, 'status', { status });
    syncOrderStatus(item.order_id);
    emit(req, 'orders:changed', { order_id: item.order_id });
    emit(req, 'kitchen:changed', {});
    emit(req, 'tables:changed', {});
    res.json({ order: orderWithItems(item.order_id) });
  });

  app.post('/api/orders/:id/status-all', requireAuth, requireRole('kitchen', 'waiter'), (req, res) => {
    const status = req.body.status;
    if (!['preparing', 'ready', 'delivered'].includes(status)) {
      return res.status(400).json({ error: 'Ese estado no sirve' });
    }
    db().prepare(`
      UPDATE order_items SET status = ?
      WHERE order_id = ? AND sent = 1 AND status NOT IN ('cancelled','delivered')
    `).run(status, req.params.id);
    syncOrderStatus(req.params.id);
    emit(req, 'orders:changed', { order_id: Number(req.params.id) });
    emit(req, 'kitchen:changed', {});
    res.json({ order: orderWithItems(req.params.id) });
  });

  // —— Productos e insumos ——
  app.get('/api/categories', requireAuth, (req, res) => {
    res.json({ categories: db().prepare('SELECT * FROM categories ORDER BY sort_order, id').all() });
  });

  app.post('/api/categories', requireAuth, requireRole(), (req, res) => {
    const name = String(req.body.name || '').trim();
    if (!name) return fail(res, 400, 'Falta el nombre');
    const dup = db().prepare('SELECT id FROM categories WHERE lower(name) = lower(?)').get(name);
    if (dup) return fail(res, 400, 'Ya hay un grupo con ese nombre');
    const station = req.body.station === 'bar' ? 'bar' : 'kitchen';
    const max = db().prepare('SELECT COALESCE(MAX(sort_order),0) AS n FROM categories').get().n;
    const info = db().prepare('INSERT INTO categories (name, sort_order, station) VALUES (?, ?, ?)')
      .run(name, max + 1, station);
    emit(req, 'menu:changed', {});
    res.json({ category: db().prepare('SELECT * FROM categories WHERE id = ?').get(info.lastInsertRowid) });
  });

  app.patch('/api/categories/:id', requireAuth, requireRole(), (req, res) => {
    const c = db().prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!c) return fail(res, 404, 'Grupo no encontrado');
    const name = String(req.body.name != null ? req.body.name : c.name).trim();
    if (!name) return fail(res, 400, 'Falta el nombre');
    const dup = db().prepare('SELECT id FROM categories WHERE lower(name) = lower(?) AND id != ?').get(name, c.id);
    if (dup) return fail(res, 400, 'Ya hay un grupo con ese nombre');
    db().prepare('UPDATE categories SET name = ?, station = ? WHERE id = ?')
      .run(name, req.body.station === 'bar' ? 'bar' : (req.body.station === 'kitchen' ? 'kitchen' : c.station), c.id);
    emit(req, 'menu:changed', {});
    res.json({ category: db().prepare('SELECT * FROM categories WHERE id = ?').get(c.id) });
  });

  app.delete('/api/categories/:id', requireAuth, requireRole(), (req, res) => {
    const c = db().prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
    if (!c) return fail(res, 404, 'Grupo no encontrado');
    db().prepare('UPDATE products SET category_id = NULL WHERE category_id = ?').run(c.id);
    db().prepare('DELETE FROM categories WHERE id = ?').run(c.id);
    emit(req, 'menu:changed', {});
    res.json({ ok: true, message: 'Grupo borrado. Los productos quedaron sin grupo.' });
  });

  app.get('/api/products', requireAuth, (req, res) => {
    const products = db().prepare(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY c.sort_order, p.sort_order, p.name
    `).all();
    const recipes = db().prepare(`
      SELECT r.*, i.name AS ingredient_name, i.unit, i.stock
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
    `).all();
    const byProd = {};
    for (const r of recipes) {
      const line = {
        ...r,
        ingredient_name: r.ingredient_name,
        ingredient_name: r.ingredient_name
      };
      (byProd[r.product_id] ||= []).push(line);
    }
    res.json({
      products: products.map((p) => ({
        ...p,
        category_name: p.category_name,
        category_name: p.category_name,
        active: p.active,
        recipe: byProd[p.id] || []
      }))
    });
  });

  app.post('/api/products', requireAuth, requireRole(), (req, res) => {
    const name = String(req.body.name || '').trim();
    const price = Number(req.body.price);
    if (!name || !(price >= 0)) return fail(res, 400, 'Faltan el nombre o el precio');
    const dup = db().prepare('SELECT id FROM products WHERE lower(name) = lower(?)').get(name);
    if (dup) return fail(res, 400, 'Ya hay un producto con ese nombre');
    try {
      const id = withTx(() => {
        const info = db().prepare(
          'INSERT INTO products (category_id, name, price, station, active, choices_json) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(
          req.body.category_id || null, name, price,
          req.body.station === 'bar' ? 'bar' : 'kitchen',
          req.body.active === 0 ? 0 : 1,
          typeof req.body.choices_json === 'string' ? req.body.choices_json : JSON.stringify(req.body.choices || [])
        );
        saveRecipe(info.lastInsertRowid, req.body.recipe || []);
        return info.lastInsertRowid;
      });
      emit(req, 'menu:changed', {});
      res.json({ product: productFull(id) });
    } catch (e) {
      return recipeFail(res, e);
    }
  });

  app.patch('/api/products/:id', requireAuth, requireRole(), (req, res) => {
    const p = db().prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) return fail(res, 404, 'Producto no encontrado');
    const name = req.body.name != null ? String(req.body.name).trim() : p.name;
    if (name) {
      const dup = db().prepare('SELECT id FROM products WHERE lower(name) = lower(?) AND id != ?').get(name, p.id);
      if (dup) return fail(res, 400, 'Ya hay un producto con ese nombre');
    }
    try {
      withTx(() => {
        db().prepare(
          'UPDATE products SET category_id = ?, name = ?, price = ?, station = ?, active = ?, choices_json = ? WHERE id = ?'
        ).run(
          req.body.category_id != null ? req.body.category_id : p.category_id,
          name,
          req.body.price != null ? Number(req.body.price) : p.price,
          req.body.station === 'bar' || req.body.station === 'kitchen' ? req.body.station : p.station,
          req.body.active != null ? (req.body.active ? 1 : 0) : p.active,
          req.body.choices_json != null || req.body.choices != null
            ? (typeof req.body.choices_json === 'string' ? req.body.choices_json : JSON.stringify(req.body.choices || []))
            : (p.choices_json || '[]'),
          p.id
        );
        if (Array.isArray(req.body.recipe)) saveRecipe(p.id, req.body.recipe);
      });
      emit(req, 'menu:changed', {});
      res.json({ product: productFull(p.id) });
    } catch (e) {
      return recipeFail(res, e);
    }
  });

  app.delete('/api/products/:id', requireAuth, requireRole(), (req, res) => {
    const p = db().prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!p) return fail(res, 404, 'Producto no encontrado');
    const sold = db().prepare('SELECT COUNT(*) AS n FROM order_items WHERE product_id = ?').get(p.id).n;
    if (sold > 0) {
      db().prepare('UPDATE products SET active = 0 WHERE id = ?').run(p.id);
      emit(req, 'menu:changed', {});
      return res.json({
        ok: true,
        hidden: true,
        message: 'Ese producto ya se vendió. Lo ocultamos del menú para no perder las cuentas.'
      });
    }
    try {
      db().prepare('DELETE FROM products WHERE id = ?').run(p.id);
    } catch {
      db().prepare('UPDATE products SET active = 0 WHERE id = ?').run(p.id);
      emit(req, 'menu:changed', {});
      return res.json({
        ok: true,
        hidden: true,
        message: 'No se pudo borrar del todo. Lo ocultamos del menú para no perder las cuentas.'
      });
    }
    emit(req, 'menu:changed', {});
    res.json({ ok: true, deleted: true, message: 'Producto borrado' });
  });

  function saveRecipe(productId, recipe) {
    const seen = new Set();
    const lines = [];
    for (const line of recipe || []) {
      const iid = Number(line.ingredient_id);
      const qty = Number(line.quantity);
      if (!iid || !(qty > 0)) continue;
      if (seen.has(iid)) {
        const err = new Error('El mismo ingrediente está dos veces. Deje una sola línea.');
        err.http = 400;
        throw err;
      }
      seen.add(iid);
      const ing = db().prepare('SELECT id FROM ingredients WHERE id = ?').get(iid);
      if (!ing) {
        const err = new Error('Hay un ingrediente que ya no existe. Vuelva a armar la receta.');
        err.http = 400;
        throw err;
      }
      lines.push({ iid, qty, rem: line.removable === 0 ? 0 : 1 });
    }
    db().prepare('DELETE FROM recipes WHERE product_id = ?').run(productId);
    const ins = db().prepare(
      'INSERT INTO recipes (product_id, ingredient_id, quantity, removable) VALUES (?, ?, ?, ?)'
    );
    for (const row of lines) ins.run(productId, row.iid, row.qty, row.rem);
  }

  function recipeFail(res, e) {
    if (e && e.http) return fail(res, e.http, e.message);
    const msg = String(e && e.message || '');
    if (/UNIQUE/i.test(msg)) return fail(res, 400, 'El mismo ingrediente está dos veces. Deje una sola línea.');
    console.error(e);
    return fail(res, 500, 'No se pudo guardar el producto. Intente de nuevo.');
  }

  function productFull(id) {
    const p = db().prepare('SELECT * FROM products WHERE id = ?').get(id);
    const recipe = db().prepare(`
      SELECT r.*, i.name AS ingredient_name, i.unit
      FROM recipes r JOIN ingredients i ON i.id = r.ingredient_id
      WHERE r.product_id = ?
    `).all(id);
    return { ...p, recipe };
  }

  app.get('/api/ingredients', requireAuth, (req, res) => {
    res.json({
      ingredients: db().prepare('SELECT * FROM ingredients ORDER BY name').all()
        .map((i) => ({ ...i, min_stock: i.min_stock, min_stock: i.min_stock }))
    });
  });

  app.post('/api/ingredients', requireAuth, requireRole(), (req, res) => {
    const name = String(req.body.name || '').trim();
    const unit = String(req.body.unit || '').trim();
    if (!name || !unit) return fail(res, 400, 'Falta el nombre o cómo se mide');
    const dup = db().prepare('SELECT id FROM ingredients WHERE lower(name) = lower(?)').get(name);
    if (dup) return fail(res, 400, 'Ya hay un ingrediente con ese nombre');
    const info = db().prepare(
      'INSERT INTO ingredients (name, unit, stock, min_stock) VALUES (?, ?, ?, ?)'
    ).run(name, unit, 0, Number(req.body.min_stock || 0));
    const qty = Number(req.body.stock || 0);
    if (qty) {
      inventory.moveStock({
        ingredientId: info.lastInsertRowid, type: 'purchase', quantity: qty,
        reason: 'Alta de insumo', userId: req.user.id, referenceType: 'ingredient', referenceId: info.lastInsertRowid
      });
    }
    emit(req, 'inventory:changed', {});
    res.json({ ingredient: db().prepare('SELECT * FROM ingredients WHERE id = ?').get(info.lastInsertRowid) });
  });

  app.patch('/api/ingredients/:id', requireAuth, requireRole(), (req, res) => {
    const i = db().prepare('SELECT * FROM ingredients WHERE id = ?').get(req.params.id);
    if (!i) return fail(res, 404, 'Ingrediente no encontrado');
    const name = req.body.name != null ? String(req.body.name).trim() : i.name;
    if (!name) return fail(res, 400, 'Falta el nombre');
    const dup = db().prepare('SELECT id FROM ingredients WHERE lower(name) = lower(?) AND id != ?').get(name, i.id);
    if (dup) return fail(res, 400, 'Ya hay un ingrediente con ese nombre');
    db().prepare('UPDATE ingredients SET name = ?, unit = ?, min_stock = ? WHERE id = ?')
      .run(name,
        req.body.unit != null ? String(req.body.unit).trim() : i.unit,
        req.body.min_stock != null ? Number(req.body.min_stock) : i.min_stock,
        i.id);
    emit(req, 'inventory:changed', {});
    res.json({ ingredient: db().prepare('SELECT * FROM ingredients WHERE id = ?').get(i.id) });
  });

  app.post('/api/ingredients/:id/move', requireAuth, requireRole(), (req, res) => {
    const type = req.body.type;
    if (!['purchase', 'adjustment', 'waste'].includes(type)) {
      return fail(res, 400, 'Ese tipo no sirve');
    }
    let qty = Number(req.body.quantity);
    if (Number.isNaN(qty) || qty === 0) return fail(res, 400, 'Esa cantidad no sirve');
    if (type === 'purchase' && !(qty > 0)) return fail(res, 400, 'La compra tiene que ser mayor que cero');
    if (type === 'waste') {
      if (!(qty > 0)) return fail(res, 400, 'Diga cuánto hay que bajar');
      qty = -qty;
    }
    try {
      const ing = inventory.moveStock({
        ingredientId: Number(req.params.id),
        type,
        quantity: qty,
        reason: String(req.body.reason || ''),
        userId: req.user.id,
        referenceType: 'manual',
        referenceId: Number(req.params.id)
      });
      emit(req, 'inventory:changed', {});
      res.json({ ingredient: ing, alerts: inventory.lowStock() });
    } catch (e) {
      return fail(res, e.http || 400, e.message || 'No se pudo actualizar el stock');
    }
  });

  app.get('/api/inventory/movements', requireAuth, requireRole('cashier'), (req, res) => {
    const rows = db().prepare(`
      SELECT m.*, i.name AS ingredient_name, i.unit, u.name AS user_name
      FROM inventory_movements m
      JOIN ingredients i ON i.id = m.ingredient_id
      LEFT JOIN users u ON u.id = m.user_id
      ORDER BY m.id DESC LIMIT 400
    `).all();
    res.json({ movements: rows, alerts: inventory.lowStock() });
  });

  // —— Facturación ——
  app.post('/api/invoices', requireAuth, requireRole('cashier'), (req, res) => {
    const register = currentRegister();
    if (!register) return res.status(400).json({ error: 'Abra la caja antes de cobrar' });
    const order = orderWithItems(req.body.order_id);
    if (!order || ['billed', 'cancelled'].includes(order.status)) {
      return res.status(400).json({ error: 'Este pedido no se puede cobrar' });
    }
    const active = order.items.filter((i) => i.status !== 'cancelled');
    if (!active.length) return res.status(400).json({ error: 'El pedido no tiene productos' });

    const payments = Array.isArray(req.body.payments) ? req.body.payments : [];
    const methods = new Set(['efectivo', 'nequi', 'daviplata']);
    let paySum = 0;
    for (const p of payments) {
      if (!methods.has(p.method) || !(Number(p.amount) > 0)) {
        return res.status(400).json({ error: 'Esa forma de pago no sirve' });
      }
      paySum += Number(p.amount);
    }

    const taxRate = Number(getSetting('tax_rate', '0'));
    const included = getSetting('tax_included', '1') === '1';
    const subtotal = active.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    let tax = 0;
    let total = subtotal;
    if (taxRate > 0 && !included) {
      tax = Math.round(subtotal * taxRate / 100);
      total = subtotal + tax;
    } else if (taxRate > 0 && included) {
      tax = Math.round(subtotal - subtotal / (1 + taxRate / 100));
    }

    if (Math.round(paySum) < Math.round(total)) {
      return fail(res, 400, `El pago (${Math.round(paySum)}) no cubre el total (${Math.round(total)})`);
    }

    const given = Math.round(paySum);
    const change = Math.max(0, given - Math.round(total));
    const applied = payments.map((p) => ({ method: p.method, amount: Number(p.amount) }));
    let leftover = change;
    for (const method of ['efectivo', 'nequi', 'daviplata']) {
      if (leftover <= 0) break;
      const p = applied.find((x) => x.method === method);
      if (!p) continue;
      const cut = Math.min(p.amount, leftover);
      p.amount -= cut;
      leftover -= cut;
    }

    try {
      const invoiceId = withTx(() => {
        const nextNum = (db().prepare('SELECT COALESCE(MAX(number),0) AS n FROM invoices').get().n) + 1;
        const info = db().prepare(`
          INSERT INTO invoices (number, order_id, table_id, cashier_id, register_id, subtotal, tax_rate, tax, total)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(nextNum, order.id, order.table_id, req.user.id, register.id, subtotal, taxRate, tax, total);

        const insPay = db().prepare('INSERT INTO payments (invoice_id, method, amount) VALUES (?, ?, ?)');
        const insMove = db().prepare(`
          INSERT INTO cash_movements (register_id, type, method, amount, description, user_id, invoice_id)
          VALUES (?, 'sale', ?, ?, ?, ?, ?)
        `);
        for (const p of applied) {
          if (!(Number(p.amount) > 0)) continue;
          insPay.run(info.lastInsertRowid, p.method, p.amount);
          insMove.run(register.id, p.method, p.amount, `Venta ticket #${nextNum}`, req.user.id, info.lastInsertRowid);
        }

        db().prepare("UPDATE orders SET status = 'billed', updated_at = datetime('now','localtime') WHERE id = ?").run(order.id);
        inventory.consumeOrder(order.id, req.user.id);
        freeTableAndJoins(order.table_id);
        return info.lastInsertRowid;
      });

      emit(req, 'tables:changed', {});
      emit(req, 'orders:changed', {});
      emit(req, 'kitchen:changed', {});
      emit(req, 'cash:changed', {});
      emit(req, 'inventory:changed', {});

      printInvoice(invoiceId, { change }).then((print) => {
        res.json({
          invoice: invoiceFull(invoiceId),
          print,
          change,
          alerts: inventory.lowStock()
        });
      }).catch((e) => {
        res.json({
          invoice: invoiceFull(invoiceId),
          print: { ok: false, error: e.message, mode: 'browser' },
          change,
          alerts: inventory.lowStock()
        });
      });
    } catch (e) {
      console.error(e);
      return fail(res, e.http || 500, e.message || 'No se pudo cobrar. Intente de nuevo.');
    }
  });

  app.get('/api/invoices', requireAuth, requireRole('cashier'), (req, res) => {
    const rows = db().prepare(`
      SELECT i.*, t.name AS table_name, u.name AS cashier_name
      FROM invoices i
      JOIN restaurant_tables t ON t.id = i.table_id
      JOIN users u ON u.id = i.cashier_id
      ORDER BY i.id DESC LIMIT 200
    `).all();
    res.json({ invoices: rows });
  });

  app.get('/api/invoices/:id', requireAuth, requireRole('cashier'), (req, res) => {
    const inv = invoiceFull(req.params.id);
    if (!inv) return res.status(404).json({ error: 'Cuenta no encontrada' });
    res.json({ invoice: inv });
  });

  app.post('/api/invoices/:id/print', requireAuth, requireRole('cashier'), async (req, res) => {
    try {
      const print = await printInvoice(req.params.id);
      res.json({ print });
    } catch (e) {
      res.status(500).json({ error: e.message, print: { ok: false, mode: 'browser' } });
    }
  });

  app.post('/api/print/test', requireAuth, requireRole(), async (req, res) => {
    try {
      res.json({ print: await printTest() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  function invoiceFull(id) {
    const inv = db().prepare(`
      SELECT i.*, t.name AS table_name, u.name AS cashier_name
      FROM invoices i
      JOIN restaurant_tables t ON t.id = i.table_id
      JOIN users u ON u.id = i.cashier_id
      WHERE i.id = ?
    `).get(id);
    if (!inv) return null;
    inv.payments = db().prepare('SELECT * FROM payments WHERE invoice_id = ?').all(id);
    inv.order = orderWithItems(inv.order_id);
    return inv;
  }

  // —— Caja ——
  app.get('/api/cash/current', requireAuth, requireRole('cashier'), (req, res) => {
    const register = currentRegister();
    const salon = salonSnapshot();
    if (!register) return res.json({ register: null, summary: null, salon });
    res.json({ register, summary: cashSummary(register.id), salon });
  });

  app.post('/api/cash/open', requireAuth, requireRole('cashier'), async (req, res) => {
    if (currentRegister()) return fail(res, 400, 'Ya hay una caja abierta');
    const amount = Number(req.body.opening_amount);
    if (!(amount >= 0)) return fail(res, 400, 'Ese valor de apertura no sirve');
    const info = db().prepare(
      'INSERT INTO cash_registers (opened_by, opening_amount) VALUES (?, ?)'
    ).run(req.user.id, amount);
    emit(req, 'cash:changed', {});
    const register = db().prepare('SELECT * FROM cash_registers WHERE id = ?').get(info.lastInsertRowid);
    const print = await printCashOpen(register.id).catch((e) => ({
      ok: false, html: null, error: e.message,
      message: 'La caja ya quedó abierta. Puede imprimir el ticket desde el computador.'
    }));
    res.json({ register, print });
  });

  app.post('/api/cash/expense', requireAuth, requireRole('cashier'), async (req, res) => {
    const register = currentRegister();
    if (!register) return fail(res, 400, 'No hay caja abierta');
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return fail(res, 400, 'Ese valor no sirve');
    const summary = cashSummary(register.id);
    if (amount > summary.expected_cash + 1e-9) {
      return fail(res, 400, `No hay tanto efectivo. Debería haber ${Math.round(summary.expected_cash)}`);
    }
    const description = String(req.body.description || 'Egreso');
    db().prepare(`
      INSERT INTO cash_movements (register_id, type, method, amount, description, user_id)
      VALUES (?, 'expense', 'efectivo', ?, ?, ?)
    `).run(register.id, amount, description, req.user.id);
    emit(req, 'cash:changed', {});
    const next = cashSummary(register.id);
    const print = await printCashExpense({
      userName: req.user.name,
      amount,
      description,
      expected: next.expected_cash
    }).catch((e) => ({
      ok: false, html: null, error: e.message,
      message: 'El gasto ya quedó. Puede imprimir el ticket desde el computador.'
    }));
    res.json({ summary: next, print });
  });

  app.post('/api/cash/close', requireAuth, requireRole('cashier'), async (req, res) => {
    const register = currentRegister();
    if (!register) return fail(res, 400, 'No hay caja abierta');
    const counted = Number(req.body.counted_cash);
    if (!(counted >= 0)) return fail(res, 400, 'Ese valor contado no sirve');
    const salon = salonSnapshot();
    if ((salon.open_orders > 0 || salon.occupied_tables > 0) && !req.body.force) {
      return res.status(409).json({
        error: `Todavía hay ${salon.open_orders} cuenta(s) y ${salon.occupied_tables} mesa(s) ocupada(s). Ciérrelas o reinicie el salón antes de cerrar caja.`,
        salon
      });
    }
    const summary = cashSummary(register.id);
    const expected = summary.expected_cash;
    const difference = counted - expected;
    db().prepare(`
      UPDATE cash_registers
      SET status = 'closed', closed_by = ?, closing_counted = ?, expected_cash = ?, difference = ?,
          notes = ?, closed_at = datetime('now','localtime')
      WHERE id = ?
    `).run(req.user.id, counted, expected, difference, String(req.body.notes || ''), register.id);
    emit(req, 'cash:changed', {});
    const closed = db().prepare(`
      SELECT r.*, ou.name AS opened_by_name, cu.name AS closed_by_name
      FROM cash_registers r
      JOIN users ou ON ou.id = r.opened_by
      LEFT JOIN users cu ON cu.id = r.closed_by
      WHERE r.id = ?
    `).get(register.id);
    const print = await printCashClose(closed.id).catch((e) => ({
      ok: false, html: null, error: e.message,
      message: 'La caja ya quedó cerrada. Puede imprimir el ticket desde el computador.'
    }));
    res.json({ register: closed, summary, salon, print });
  });

  app.get('/api/cash/history', requireAuth, requireRole('cashier'), (req, res) => {
    const rows = db().prepare(`
      SELECT r.*, ou.name AS opened_by_name, cu.name AS closed_by_name
      FROM cash_registers r
      JOIN users ou ON ou.id = r.opened_by
      LEFT JOIN users cu ON cu.id = r.closed_by
      ORDER BY r.id DESC LIMIT 100
    `).all();
    res.json({ history: rows });
  });

  app.post('/api/cash/:id/print', requireAuth, requireRole('cashier'), async (req, res) => {
    const register = db().prepare('SELECT * FROM cash_registers WHERE id = ?').get(req.params.id);
    if (!register) return fail(res, 404, 'Caja no encontrada');
    try {
      const print = register.status === 'closed'
        ? await printCashClose(register.id, { reprint: true })
        : await printCashOpen(register.id, { reprint: true });
      res.json({ print });
    } catch (e) {
      fail(res, 500, e.message || 'No se pudo armar el ticket');
    }
  });

  app.get('/api/cash/:id', requireAuth, requireRole('cashier'), (req, res) => {
    const register = db().prepare(`
      SELECT r.*, ou.name AS opened_by_name, cu.name AS closed_by_name
      FROM cash_registers r
      JOIN users ou ON ou.id = r.opened_by
      LEFT JOIN users cu ON cu.id = r.closed_by
      WHERE r.id = ?
    `).get(req.params.id);
    if (!register) return res.status(404).json({ error: 'Caja no encontrada' });
    res.json({ register, summary: cashSummary(register.id) });
  });

  function cashSummary(registerId) {
    const register = db().prepare('SELECT * FROM cash_registers WHERE id = ?').get(registerId);
    const moves = db().prepare('SELECT * FROM cash_movements WHERE register_id = ? ORDER BY id').all(registerId);
    const byMethod = { efectivo: 0, nequi: 0, daviplata: 0 };
    let sales = 0;
    let expenses = 0;
    for (const m of moves) {
      if (m.type === 'sale') {
        sales += m.amount;
        if (byMethod[m.method] != null) byMethod[m.method] += m.amount;
      } else if (m.type === 'expense' || m.type === 'withdrawal') {
        expenses += m.amount;
      }
    }
    const expected_cash = register.opening_amount + byMethod.efectivo - expenses;
    return { moves, sales, expenses, byMethod, expected_cash, opening_amount: register.opening_amount };
  }

  // —— Usuarios ——
  app.get('/api/users', requireAuth, requireRole(), (req, res) => {
    const users = db().prepare('SELECT id, name, username, role, active, created_at FROM users ORDER BY id').all();
    res.json({ users });
  });

  app.post('/api/users', requireAuth, requireRole(), (req, res) => {
    const name = String(req.body.name || '').trim();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const role = req.body.role;
    if (!name || !username || password.length < 4) {
      return res.status(400).json({ error: 'Faltan nombre, usuario y contraseña (mínimo 4 letras)' });
    }
    if (!['admin', 'waiter', 'kitchen', 'cashier'].includes(role)) {
      return res.status(400).json({ error: 'Ese cargo no sirve' });
    }
    try {
      const info = db().prepare(
        'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)'
      ).run(name, username, bcrypt.hashSync(password, 10), role);
      res.json({ user: db().prepare('SELECT id, name, username, role, active FROM users WHERE id = ?').get(info.lastInsertRowid) });
    } catch (e) {
      res.status(400).json({ error: 'Ese usuario ya existe' });
    }
  });

  app.patch('/api/users/:id', requireAuth, requireRole(), (req, res) => {
    const u = db().prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!u) return res.status(404).json({ error: 'Persona no encontrada' });
    const name = req.body.name != null ? String(req.body.name).trim() : u.name;
    const role = ['admin', 'waiter', 'kitchen', 'cashier'].includes(req.body.role) ? req.body.role : u.role;
    const active = req.body.active != null ? (req.body.active ? 1 : 0) : u.active;
    if (u.role === 'admin' && role !== 'admin') {
      const n = db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1 AND id != ?").get(u.id).n;
      if (n < 1) return res.status(400).json({ error: 'Tiene que quedar por lo menos un jefe' });
    }
    db().prepare('UPDATE users SET name = ?, role = ?, active = ? WHERE id = ?').run(name, role, active, u.id);
    if (req.body.password) {
      if (String(req.body.password).length < 4) return res.status(400).json({ error: 'La contraseña es muy corta' });
      db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(req.body.password, 10), u.id);
    }
    res.json({ user: db().prepare('SELECT id, name, username, role, active FROM users WHERE id = ?').get(u.id) });
  });

  // —— Reportes ——
  app.get('/api/reports/sales', requireAuth, requireRole(), (req, res) => {
    const { from, to } = range(req.query);
    const daily = db().prepare(`
      SELECT substr(created_at,1,10) AS day, COUNT(*) AS tickets, SUM(total) AS total
      FROM invoices WHERE status = 'paid' AND created_at >= ? AND created_at <= ?
      GROUP BY day ORDER BY day
    `).all(from, to);
    const methods = db().prepare(`
      SELECT p.method, SUM(p.amount) AS total
      FROM payments p JOIN invoices i ON i.id = p.invoice_id
      WHERE i.status = 'paid' AND i.created_at >= ? AND i.created_at <= ?
      GROUP BY p.method
    `).all(from, to);
    const totals = db().prepare(`
      SELECT COUNT(*) AS tickets, COALESCE(SUM(total),0) AS total, COALESCE(SUM(tax),0) AS tax
      FROM invoices WHERE status = 'paid' AND created_at >= ? AND created_at <= ?
    `).get(from, to);
    res.json({ from, to, daily, methods, totals });
  });

  app.get('/api/reports/products', requireAuth, requireRole(), (req, res) => {
    const { from, to } = range(req.query);
    const rows = db().prepare(`
      SELECT oi.product_name, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.unit_price) AS total
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN invoices i ON i.order_id = o.id
      WHERE i.status = 'paid' AND oi.status != 'cancelled' AND i.created_at >= ? AND i.created_at <= ?
      GROUP BY oi.product_name
      ORDER BY qty DESC
    `).all(from, to);
    res.json({ from, to, products: rows });
  });

  app.get('/api/reports/ingredients', requireAuth, requireRole(), (req, res) => {
    const { from, to } = range(req.query);
    const rows = db().prepare(`
      SELECT i.name, i.unit, SUM(-m.quantity) AS consumed
      FROM inventory_movements m
      JOIN ingredients i ON i.id = m.ingredient_id
      WHERE m.type = 'sale' AND m.created_at >= ? AND m.created_at <= ?
      GROUP BY i.id
      ORDER BY consumed DESC
    `).all(from, to);
    res.json({ from, to, ingredients: rows });
  });

  app.get('/api/reports/waiters', requireAuth, requireRole(), (req, res) => {
    const { from, to } = range(req.query);
    const rows = db().prepare(`
      SELECT u.name, COUNT(i.id) AS tickets, SUM(i.total) AS total
      FROM invoices i
      JOIN orders o ON o.id = i.order_id
      JOIN users u ON u.id = o.waiter_id
      WHERE i.status = 'paid' AND i.created_at >= ? AND i.created_at <= ?
      GROUP BY u.id
      ORDER BY total DESC
    `).all(from, to);
    res.json({ from, to, waiters: rows });
  });

  function range(q) {
    const to = q.to ? q.to + ' 23:59:59' : db().prepare("SELECT datetime('now','localtime') AS t").get().t;
    const from = q.from ? q.from + ' 00:00:00' : db().prepare("SELECT datetime('now','localtime','-30 day') AS t").get().t;
    return { from, to };
  }

  // —— Config y backup ——
  app.get('/api/settings', requireAuth, requireRole(), (req, res) => {
    res.json({ settings: publicSettings() });
  });

  app.put('/api/settings', requireAuth, requireRole(), (req, res) => {
    const allowed = [
      'business_name', 'business_nit', 'business_address', 'business_phone',
      'tax_rate', 'tax_included', 'printer_width', 'printer_name', 'printer_enabled',
      'block_on_no_stock', 'ticket_footer'
    ];
    for (const key of allowed) {
      if (req.body[key] == null) continue;
      let val = req.body[key];
      if (typeof val === 'boolean') val = val ? '1' : '0';
      setSetting(key, val);
    }
    res.json({ settings: publicSettings() });
  });

  app.post('/api/backup', requireAuth, requireRole(), (req, res) => {
    const r = saveBackup('manual');
    res.json({ ok: true, filename: r.filename });
  });

  app.get('/api/backups', requireAuth, requireRole(), (req, res) => {
    res.json({ backups: listBackups() });
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
}

module.exports = { mountApi };
