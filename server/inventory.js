const { getDb } = require('./db');

function recipeForProduct(productId) {
  return getDb().prepare(`
    SELECT r.quantity, i.id AS ingredient_id, i.name, i.unit, i.stock, i.min_stock
    FROM recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ?
  `).all(productId);
}

function checkStock(productId, quantity) {
  const recipe = recipeForProduct(productId);
  const shortages = [];
  for (const line of recipe) {
    const need = line.quantity * quantity;
    if (line.stock + 1e-9 < need) {
      shortages.push({
        ingredient_id: line.ingredient_id,
        name: line.name,
        unit: line.unit,
        needed: need,
        stock: line.stock
      });
    }
  }
  return { ok: shortages.length === 0, shortages, recipe };
}

function checkItemsStock(items) {
  const needByIng = new Map();
  const names = new Map();
  const units = new Map();
  const stocks = new Map();

  for (const it of items) {
    const recipe = recipeForProduct(it.product_id);
    for (const line of recipe) {
      names.set(line.ingredient_id, line.name);
      units.set(line.ingredient_id, line.unit);
      stocks.set(line.ingredient_id, line.stock);
      needByIng.set(line.ingredient_id, (needByIng.get(line.ingredient_id) || 0) + line.quantity * it.quantity);
    }
  }

  const shortages = [];
  for (const [id, need] of needByIng) {
    const stock = stocks.get(id) || 0;
    if (stock + 1e-9 < need) {
      shortages.push({
        ingredient_id: id,
        name: names.get(id),
        unit: units.get(id),
        needed: need,
        stock
      });
    }
  }
  return { ok: shortages.length === 0, shortages };
}

function moveStock({ ingredientId, type, quantity, reason, userId, referenceType, referenceId }) {
  const db = getDb();
  const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredientId);
  if (!ing) throw new Error('Ingrediente no encontrado');
  const next = ing.stock + quantity;
  db.prepare('UPDATE ingredients SET stock = ? WHERE id = ?').run(next, ingredientId);
  db.prepare(`
    INSERT INTO inventory_movements
      (ingredient_id, type, quantity, stock_after, reason, user_id, reference_type, reference_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ingredientId, type, quantity, next, reason || '', userId || null, referenceType || null, referenceId || null);
  return { ...ing, stock: next };
}

function consumeOrder(orderId, userId) {
  const db = getDb();
  const items = db.prepare(`
    SELECT product_id, quantity, product_name
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
  `).all(orderId);

  for (const it of items) {
    const recipe = recipeForProduct(it.product_id);
    for (const line of recipe) {
      moveStock({
        ingredientId: line.ingredient_id,
        type: 'sale',
        quantity: -(line.quantity * it.quantity),
        reason: `Venta: ${it.product_name} x${it.quantity}`,
        userId,
        referenceType: 'order',
        referenceId: orderId
      });
    }
  }
}

function restoreOrder(orderId, userId) {
  const db = getDb();
  const items = db.prepare(`
    SELECT product_id, quantity, product_name
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
  `).all(orderId);

  for (const it of items) {
    const recipe = recipeForProduct(it.product_id);
    for (const line of recipe) {
      moveStock({
        ingredientId: line.ingredient_id,
        type: 'adjustment',
        quantity: line.quantity * it.quantity,
        reason: `Anulación venta: ${it.product_name} x${it.quantity}`,
        userId,
        referenceType: 'order',
        referenceId: orderId
      });
    }
  }
}

function lowStock() {
  return getDb().prepare(`
    SELECT * FROM ingredients
    WHERE stock <= min_stock
    ORDER BY (stock / NULLIF(min_stock, 0)) ASC, name
  `).all();
}

module.exports = {
  recipeForProduct,
  checkStock,
  checkItemsStock,
  moveStock,
  consumeOrder,
  restoreOrder,
  lowStock
};
