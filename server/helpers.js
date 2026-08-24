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

function refreshTableStatus(tableId) {
  const db = getDb();
  const table = db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(tableId);
  if (!table) return null;
  if (table.joined_to_id) {
    return refreshTableStatus(table.joined_to_id);
  }

  const order = openOrderForTable(tableId);
  let status = table.status;
  if (!order) {
    status = table.status === 'reserved' ? 'reserved' : 'free';
  } else {
    const waiting = table.status === 'waiting_payment';
    status = waiting ? 'waiting_payment' : 'occupied';
  }
  db.prepare('UPDATE restaurant_tables SET status = ? WHERE id = ?').run(status, tableId);
  return db.prepare('SELECT * FROM restaurant_tables WHERE id = ?').get(tableId);
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
  return { ...order, items, subtotal };
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
    return { ...t, order: summary };
  });
}

module.exports = {
  requireAuth,
  requireRole,
  logChange,
  emit,
  openOrderForTable,
  refreshTableStatus,
  primaryTableId,
  orderWithItems,
  syncOrderStatus,
  currentRegister,
  tableList
};
