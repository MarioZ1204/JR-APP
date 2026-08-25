const { getDb, publicUser } = require('./db');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Entre de nuevo' });
  }
  const user = getDb().prepare('SELECT * FROM users WHERE id = ? AND active = 1').get(req.session.user.id);
  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({ error: 'Su sesión se cerró. Entre de nuevo' });
  }
  req.user = publicUser(user);
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Entre de nuevo' });
    if (req.user.role === 'admin' || roles.includes(req.user.role)) return next();
    return res.status(403).json({ error: 'Usted no puede hacer esto' });
  };
}

function logChange(orderItemId, userId, action, details) {
  getDb().prepare(
    'INSERT INTO item_changes (order_item_id, user_id, action, details) VALUES (?, ?, ?, ?)'
  ).run(orderItemId, userId, action, typeof details === 'string' ? details : JSON.stringify(details || {}));
}

function emit(req, event, payload) {
  if (req.io) req.io.emit(event, payload);
}

function openOrderForTable(tableId) {
  return getDb().prepare(`
    SELECT * FROM orders
    WHERE table_id = ? AND status NOT IN ('billed','cancelled')
    ORDER BY id DESC LIMIT 1
  `).get(tableId);
}

function presentStatus(status) {
  if (status === 'waiting_payment') return 'waiting_payment';
  return status;
}

function presentTable(t) {
  if (!t) return t;
  const joined = t.joined_to_id ?? t.joined_to_id ?? null;
  return {
    ...t,
    status: presentStatus(t.status),
    joined_to_id: joined,
    joined_to_id: joined,
    joined_to_name: t.joined_to_name ?? t.joined_to_name ?? null
  };
}

function presentItem(i) {
  const price = i.unit_price ?? i.unit_price;
  return {
    ...i,
    unit_price: price,
    unit_price: price,
    created_by: i.created_by ?? i.created_by,
    cancelled_by: i.cancelled_by ?? i.cancelled_by,
    cancelled_at: i.cancelled_at ?? i.cancelled_at,
    cancel_reason: i.cancel_reason ?? i.cancel_reason,
    removed_json: i.removed_json ?? i.removed_json
  };
}

function presentOrder(o) {
  if (!o) return o;
  const items = (o.items || []).map(presentItem);
  const subtotal = o.subtotal != null ? o.subtotal : items
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + i.quantity * (i.unit_price ?? i.unit_price ?? 0), 0);
  return {
    ...o,
    table_name: o.table_name || o.table_name,
    waiter_name: o.waiter_name || o.waiter_name,
    items,
    subtotal
  };
}

function refreshTableStatus(tableId) {
  const db = getDb();
  const table = db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(tableId);
  if (!table) return null;
  if (table.joined_to_id) {
    return presentTable(refreshTableStatus(table.joined_to_id));
  }

  const order = openOrderForTable(tableId);
  let status = table.status;
  if (!order) {
    status = table.status === 'reserved' ? 'reserved' : 'free';
  } else {
    const waiting = table.status === 'waiting_payment' || table.status === 'waiting_payment';
    status = waiting ? 'waiting_payment' : 'occupied';
  }
  db.prepare('UPDATE restaurant_tables SET status = ? WHERE id = ?').run(status, tableId);
  return presentTable(db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(tableId));
}

function primaryTableId(tableId) {
  const t = getDb().prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(tableId);
  if (!t) return tableId;
  return t.joined_to_id || t.id;
}

function orderWithItems(orderId) {
  const db = getDb();
  const order = db.prepare(`
    SELECT o.*, t.name AS table_name, u.name AS waiter_name
    FROM orders o
    JOIN restaurant_tables t ON t.id = o.table_id
    JOIN users u ON u.id = o.waiter_id
    WHERE o.id = ?
  `).get(orderId);
  if (!order) return null;
  const items = db.prepare(`
    SELECT oi.*,
      cu.name AS created_by_name,
      xu.name AS cancelled_by_name
    FROM order_items oi
    LEFT JOIN users cu ON cu.id = oi.created_by
    LEFT JOIN users xu ON xu.id = oi.cancelled_by
    WHERE oi.order_id = ?
    ORDER BY oi.id
  `).all(orderId);
  const subtotal = items
    .filter((i) => i.status !== 'cancelled')
    .reduce((s, i) => s + i.quantity * i.unit_price, 0);
  return presentOrder({ ...order, items, subtotal });
}

function syncOrderStatus(orderId) {
  const db = getDb();
  const items = db.prepare(
    `SELECT status, sent FROM order_items WHERE order_id = ? AND status != 'cancelled'`
  ).all(orderId);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || order.status === 'billed' || order.status === 'cancelled') return order;

  let status = order.status;
  if (!items.length) status = 'open';
  else if (items.every((i) => i.status === 'delivered')) status = 'delivered';
  else if (items.every((i) => i.status === 'ready' || i.status === 'delivered')) status = 'ready';
  else if (items.some((i) => i.status === 'preparing' || i.status === 'ready' || i.status === 'delivered')) status = 'preparing';
  else if (items.some((i) => i.sent)) status = 'sent';
  else status = 'open';

  db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now','localtime') WHERE id = ?")
    .run(status, orderId);
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

function currentRegister() {
  return getDb().prepare(`
    SELECT r.*, u.name AS opened_by_name
    FROM cash_registers r
    JOIN users u ON u.id = r.opened_by
    WHERE r.status = 'open'
    ORDER BY r.id DESC LIMIT 1
  `).get();
}

function salonSnapshot() {
  const db = getDb();
  const open_orders = db.prepare(`
    SELECT COUNT(*) AS n FROM orders WHERE status NOT IN ('billed','cancelled')
  `).get().n;
  const occupied_tables = db.prepare(`
    SELECT COUNT(*) AS n FROM restaurant_tables
    WHERE status IN ('occupied','waiting_payment') OR joined_to_id IS NOT NULL
  `).get().n;
  return { open_orders, occupied_tables };
}

function freeTableAndJoins(tableId) {
  const db = getDb();
  const id = primaryTableId(tableId);
  db.prepare(`
    UPDATE restaurant_tables SET status = 'free', joined_to_id = NULL
    WHERE id = ? OR joined_to_id = ?
  `).run(id, id);
}

function cancelOpenOrder(orderId, userId, reason) {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order || ['billed', 'cancelled'].includes(order.status)) return null;
  const why = String(reason || 'Cuenta cancelada');
  const items = db.prepare(
    "SELECT id FROM order_items WHERE order_id = ? AND status != 'cancelled'"
  ).all(orderId);
  const upd = db.prepare(`
    UPDATE order_items
    SET status = 'cancelled', cancelled_by = ?, cancelled_at = datetime('now','localtime'), cancel_reason = ?
    WHERE id = ?
  `);
  for (const it of items) {
    upd.run(userId, why, it.id);
    logChange(it.id, userId, 'cancel', { reason: why, order: true });
  }
  db.prepare("UPDATE orders SET status = 'cancelled', updated_at = datetime('now','localtime') WHERE id = ?")
    .run(orderId);
  freeTableAndJoins(order.table_id);
  return orderWithItems(orderId);
}

function tableList() {
  const db = getDb();
  const tables = db.prepare(`
    SELECT t.*, p.name AS joined_to_name
    FROM restaurant_tables t
    LEFT JOIN restaurant_tables p ON p.id = t.joined_to_id
    ORDER BY t.sort_order, t.id
  `).all();

  return tables.map((t) => {
    const targetId = t.joined_to_id || t.id;
    const order = openOrderForTable(targetId);
    let summary = null;
    if (order) {
      const full = orderWithItems(order.id);
      summary = {
        id: full.id,
        status: full.status,
        waiter_name: full.waiter_name,
        subtotal: full.subtotal,
        item_count: full.items.filter((i) => i.status !== 'cancelled').length
      };
    }
    return presentTable({ ...t, order: summary });
  });
}

module.exports = {
  requireAuth,
  requireRole,
  logChange,
  emit,
  openOrderForTable,
  openOrderForTable: openOrderForTable,
  refreshTableStatus,
  refreshTableStatus: refreshTableStatus,
  primaryTableId,
  orderWithItems,
  orderWithItems: orderWithItems,
  syncOrderStatus,
  currentRegister,
  currentRegister: currentRegister,
  tableList,
  tableList: tableList,
  presentTable,
  presentOrder,
  salonSnapshot,
  freeTableAndJoins,
  cancelOpenOrder
};
