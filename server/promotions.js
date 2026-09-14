const { getDb, getSetting } = require('./db');

const PROMO_SETTING = 'promo_tuesday_burgers';
const CATEGORY_NAME = 'hamburguesas';
const LABEL = 'Segunda hamburguesa al 50%';
const TICKET_LABEL = '2da hamburguesa al 50%';

function localWeekday(d = new Date()) {
  // 0 = domingo … 2 = martes (igual que Date#getDay en zona local)
  return d.getDay();
}

function isTuesday(d = new Date()) {
  return localWeekday(d) === 2;
}

function promoEnabled() {
  return getSetting(PROMO_SETTING, '1') === '1';
}

/**
 * Unidades de hamburguesa elegibles (expande quantity).
 * @param {Array} orderItems ítems de la comanda (con product_id, unit_price, quantity, status)
 */
function burgerUnits(orderItems) {
  const db = getDb();
  const catByProduct = new Map();
  const rows = db.prepare(`
    SELECT p.id AS product_id, LOWER(TRIM(c.name)) AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
  `).all();
  for (const r of rows) catByProduct.set(r.product_id, r.category_name || '');

  const units = [];
  for (const it of orderItems || []) {
    if (!it || it.status === 'cancelled') continue;
    const cat = catByProduct.get(Number(it.product_id)) || '';
    if (cat !== CATEGORY_NAME) continue;
    const qty = Math.max(0, Math.round(Number(it.quantity) || 0));
    const price = Math.round(Number(it.unit_price) || 0);
    for (let i = 0; i < qty; i++) units.push(price);
  }
  return units;
}

/**
 * Promo fija: martes, cada 2 hamburguesas la más barata al 50%.
 * @param {Array} orderItems
 * @param {Date} [now] fecha a evaluar (tests)
 */
function computeTuesdayBurgerPromo(orderItems, now = new Date()) {
  if (!promoEnabled()) {
    return { applied: false, discount: 0, pairs: 0, units: 0, label: LABEL, reason: 'off' };
  }
  if (!isTuesday(now)) {
    return { applied: false, discount: 0, pairs: 0, units: 0, label: LABEL, reason: 'weekday' };
  }

  const units = burgerUnits(orderItems).sort((a, b) => a - b);
  const pairs = Math.floor(units.length / 2);
  if (pairs < 1) {
    return {
      applied: false,
      discount: 0,
      pairs: 0,
      units: units.length,
      label: LABEL,
      reason: 'qty'
    };
  }

  let discount = 0;
  for (let i = 0; i < pairs; i++) {
    discount += Math.round(units[i] * 0.5);
  }
  discount = Math.round(discount);

  return {
    applied: discount > 0,
    discount,
    pairs,
    units: units.length,
    label: LABEL,
    ticket_label: TICKET_LABEL,
    reason: discount > 0 ? 'ok' : 'zero'
  };
}

module.exports = {
  PROMO_SETTING,
  LABEL,
  TICKET_LABEL,
  computeTuesdayBurgerPromo,
  isTuesday,
  promoEnabled
};
