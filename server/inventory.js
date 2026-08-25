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

function parseAdded(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    if (!Array.isArray(v)) return [];
    return v.map((x) => {
      if (x && typeof x === 'object') {
        return {
          id: Number(x.id),
          name: String(x.name || ''),
          quantity: Math.max(0.01, Number(x.quantity) || 1)
        };
      }
      return { id: Number(x), name: '', quantity: 1 };
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

function addedLines(addedRaw) {
  const list = parseAdded(addedRaw);
  if (!list.length) return [];
  const db = getDb();
  return list.map((a) => {
    const ing = db.prepare('SELECT id, name, unit, stock FROM ingredients WHERE id = ?').get(a.id);
    if (!ing) return null;
    return {
      ingredient_id: ing.id,
      name: a.name || ing.name,
      unit: ing.unit,
      stock: ing.stock,
      quantity: a.quantity
    };
  }).filter(Boolean);
}

function linesForItem(productId, quantity, removedRaw, addedRaw) {
  const base = recipeUsed(productId, removedRaw).map((line) => ({
    ...line,
    need: line.quantity * quantity
  }));
  const extras = addedLines(addedRaw).map((line) => ({
    ...line,
    need: line.quantity * quantity
  }));
  return [...base, ...extras];
}

function checkStock(productId, quantity, removedRaw, addedRaw) {
  const lines = linesForItem(productId, quantity, removedRaw, addedRaw);
  const shortages = [];
  const seen = new Map();
  for (const line of lines) {
    const prev = seen.get(line.ingredient_id) || { need: 0, stock: line.stock, name: line.name, unit: line.unit };
    prev.need += line.need;
    prev.stock = line.stock;
    prev.name = line.name;
    prev.unit = line.unit;
    seen.set(line.ingredient_id, prev);
  }
  for (const [ingredient_id, row] of seen) {
    if (row.stock + 1e-9 < row.need) {
      shortages.push({
        ingredient_id,
        name: row.name,
        unit: row.unit,
        needed: row.need,
        stock: row.stock
      });
    }
  }
  return { ok: shortages.length === 0, shortages, recipe: lines };
}

function checkItemsStock(items) {
  const needByIng = new Map();
  const names = new Map();
  const units = new Map();
  const stocks = new Map();

  for (const it of items) {
    const lines = linesForItem(it.product_id, it.quantity, it.removed_json, it.added_json);
    for (const line of lines) {
      names.set(line.ingredient_id, line.name);
      units.set(line.ingredient_id, line.unit);
      stocks.set(line.ingredient_id, line.stock);
      needByIng.set(line.ingredient_id, (needByIng.get(line.ingredient_id) || 0) + line.need);
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
    SELECT product_id, quantity, product_name, removed_json, added_json
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
  `).all(orderId);

  for (const it of items) {
    const lines = linesForItem(it.product_id, it.quantity, it.removed_json, it.added_json);
    const skipped = parseRemoved(it.removed_json).map((x) => x.name).filter(Boolean);
    const extras = parseAdded(it.added_json).map((x) => x.name).filter(Boolean);
    let tag = '';
    if (skipped.length) tag += ` (sin ${skipped.join(', ')})`;
    if (extras.length) tag += ` (extra ${extras.join(', ')})`;
    const seen = new Map();
    for (const line of lines) {
      seen.set(line.ingredient_id, (seen.get(line.ingredient_id) || 0) + line.need);
    }
    for (const [ingredientId, need] of seen) {
      moveStock({
        ingredientId,
        type: 'sale',
        quantity: -need,
        reason: `Venta: ${it.product_name} x${it.quantity}${tag}`,
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
    SELECT product_id, quantity, product_name, removed_json, added_json
    FROM order_items
    WHERE order_id = ? AND status != 'cancelled'
  `).all(orderId);

  for (const it of items) {
    const lines = linesForItem(it.product_id, it.quantity, it.removed_json, it.added_json);
    const seen = new Map();
    for (const line of lines) {
      seen.set(line.ingredient_id, (seen.get(line.ingredient_id) || 0) + line.need);
    }
    for (const [ingredientId, need] of seen) {
      moveStock({
        ingredientId,
        type: 'adjustment',
        quantity: need,
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
  parseAdded,
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
  restoreOrder: restoreOrder,
  lowStock,
  lowStock: lowStock
};
