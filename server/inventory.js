const { getDb } = require('./db');

function parseRemoved(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v.map((x) => {
      if (x && typeof x === 'object') return { id: Number(x.id), name: String(x.name || '') };
      return { id: Number(x), name: '' };
    }).filter((x) => x.id);
  } catch {
    return [];
  }
}

function removedIdSet(raw) {
  return new Set(parseRemoved(raw).map((x) => x.id));
}

function recipeForProduct(productId) {
  return getDb().prepare(`
    SELECT r.quantity, r.removable, i.id AS ingredient_id, i.name, i.unit, i.stock
    FROM recipes r
    JOIN ingredients i ON i.id = r.ingredient_id
    WHERE r.product_id = ?
  `).all(productId);
}

function recipeUsed(productId, removedRaw) {
  const skip = removedIdSet(removedRaw);
  return recipeForProduct(productId).filter((line) => !skip.has(line.ingredient_id));
}

function checkStock(productId, quantity, removedRaw) {
  const recipe = recipeUsed(productId, removedRaw);
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
  const ok = shortages.length === 0;
  return { ok, shortages, recipe };
}

function checkItemsStock(items) {
  const needByIng = new Map();
  const names = new Map();
  const units = new Map();
  const stocks = new Map();

  for (const it of items) {
    const recipe = recipeUsed(it.product_id, it.removed_json);
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
  const ok = shortages.length === 0;
  return { ok, shortages };
}

function moveStock({ ingredientId, type, quantity, reason, userId, referenceType, referenceId, allowNegative = false }) {
  const db = getDb();
  const ing = db.prepare('SELECT * FROM ingredients WHERE id = ?').get(ingredientId);
  if (!ing) {
    const err = new Error('Ingrediente no encontrado');
    err.http = 404;
    throw err;
  }
  const next = ing.stock + quantity;
  if (!allowNegative && next < -1e-9) {
    const err = new Error(`No hay suficiente ${ing.name}. Quedan ${ing.stock} ${ing.unit}.`);
    err.http = 400;
    throw err;
  }
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
    SELECT product_id, quantity, product_name, removed_json
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
  `).all(orderId);

  for (const it of items) {
    const recipe = recipeUsed(it.product_id, it.removed_json);
    const skipped = parseRemoved(it.removed_json).map((x) => x.name).filter(Boolean);
    const extra = skipped.length ? ` (sin ${skipped.join(', ')})` : '';
    for (const line of recipe) {
      moveStock({
        ingredientId: line.ingredient_id,
        type: 'sale',
        quantity: -(line.quantity * it.quantity),
        reason: `Venta: ${it.product_name} x${it.quantity}${extra}`,
        userId,
        referenceType: 'order',
        referenceId: orderId,
        allowNegative: true
      });
    }
  }
}

function restoreOrder(orderId, userId) {
  const db = getDb();
  const items = db.prepare(`
    SELECT product_id, quantity, product_name, removed_json
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
  `).all(orderId);

  for (const it of items) {
    const recipe = recipeUsed(it.product_id, it.removed_json);
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
  parseRemoved,
  recipeForProduct,
  recipeForProduct: recipeForProduct,
  recipeUsed,
  checkStock,
  checkStock: checkStock,
  checkItemsStock,
  checkItemsStock: checkItemsStock,
  moveStock,
  consumeOrder,
  consumeOrder: consumeOrder,
  restoreOrder,
  lowStock
};
