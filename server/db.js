const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { seedCatalog } = require('./catalog');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.JR_DATA_DIR || path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, process.env.JR_DB_FILE || 'restaurante.db');

let db;

function getDb() {
  if (!db) throw new Error('Base de datos no inicializada');
  return db;
}

function wrap(raw) {
  return {
    exec: (sql) => raw.exec(sql),
    pragma: (sql) => raw.exec('PRAGMA ' + sql),
    prepare: (sql) => {
      const stmt = raw.prepare(sql);
      return {
        run: (...args) => {
          const r = stmt.run(...args);
          return {
            changes: Number(r.changes),
            lastInsertRowid: Number(r.lastInsertRowid),
            lastInsertRowid: Number(r.lastInsertRowid)
          };
        },
        get: (...args) => stmt.get(...args) || undefined,
        all: (...args) => stmt.all(...args)
      };
    }
  };
}

function init() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  try {
    const { applyPendingRestore } = require('./backup');
    applyPendingRestore();
  } catch (e) {
    console.error('No se pudo aplicar restauración pendiente:', e.message);
  }
  db = wrap(new DatabaseSync(DB_PATH));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  migrateSchema();
  seedIfEmpty();
  seedCatalog(getDb());
  markCoreRecipeLines();
  if (getSetting('business_name') === 'JR Restaurante' || getSetting('business_name') === 'JR Burger') {
    /* deja el nombre actual; el cliente lo cambia en Ajustes */
  }
  return db;
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','waiter','kitchen','cashier')),
      active INTEGER NOT NULL DEFAULT 1,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS restaurant_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      seats INTEGER NOT NULL DEFAULT 4,
      status TEXT NOT NULL DEFAULT 'free'
        CHECK(status IN ('free','occupied','waiting_payment','reserved')),
      joined_to_id INTEGER REFERENCES restaurant_tables(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      pos_x REAL,
      pos_y REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      station TEXT NOT NULL DEFAULT 'kitchen' CHECK(station IN ('kitchen','bar'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      station TEXT NOT NULL DEFAULT 'kitchen' CHECK(station IN ('kitchen','bar')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS ingredients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      unit_kind TEXT NOT NULL DEFAULT 'count',
      portion_note TEXT NOT NULL DEFAULT '',
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      removable INTEGER NOT NULL DEFAULT 1,
      UNIQUE(product_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES restaurant_tables(id),
      waiter_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open','sent','preparing','ready','delivered','billed','cancelled')),
      notes TEXT,
      takeaway INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      unit_price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK(status IN ('pending','preparing','ready','delivered','cancelled')),
      sent INTEGER NOT NULL DEFAULT 0,
      created_by INTEGER REFERENCES users(id),
      cancelled_by INTEGER REFERENCES users(id),
      cancelled_at TEXT,
      cancel_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      removed_json TEXT NOT NULL DEFAULT '[]',
      added_json TEXT NOT NULL DEFAULT '[]',
      stock_taken INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS item_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      table_id INTEGER NOT NULL,
      cashier_id INTEGER NOT NULL REFERENCES users(id),
      register_id INTEGER REFERENCES cash_registers(id),
      subtotal REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      tip REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      container_fee REAL NOT NULL DEFAULT 0,
      discount_label TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'paid' CHECK(status IN ('paid','cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      method TEXT NOT NULL CHECK(method IN ('efectivo','nequi','daviplata')),
      amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS cash_registers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opened_by INTEGER NOT NULL REFERENCES users(id),
      closed_by INTEGER REFERENCES users(id),
      opening_amount REAL NOT NULL,
      closing_counted REAL,
      expected_cash REAL,
      difference REAL,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
      notes TEXT,
      opened_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      register_id INTEGER NOT NULL REFERENCES cash_registers(id),
      type TEXT NOT NULL CHECK(type IN ('sale','expense','withdrawal','deposit')),
      method TEXT,
      amount REAL NOT NULL,
      description TEXT,
      user_id INTEGER REFERENCES users(id),
      invoice_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
      type TEXT NOT NULL CHECK(type IN ('purchase','sale','adjustment','waste')),
      quantity REAL NOT NULL,
      stock_after REAL NOT NULL,
      reason TEXT,
      user_id INTEGER REFERENCES users(id),
      reference_type TEXT,
      reference_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id, status);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_inv_mov_ing ON inventory_movements(ingredient_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
  `);
}

function tableCols(name) {
  return getDb().prepare(`PRAGMA table_info(${name})`).all().map((c) => c.name);
}

function migrateSchema() {
  const recipeCols = tableCols('recipes');
  if (!recipeCols.includes('removable')) {
    getDb().exec('ALTER TABLE recipes ADD COLUMN removable INTEGER NOT NULL DEFAULT 1');
  }
  const itemCols = tableCols('order_items');
  if (!itemCols.includes('removed_json')) {
    getDb().exec("ALTER TABLE order_items ADD COLUMN removed_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!itemCols.includes('added_json')) {
    getDb().exec("ALTER TABLE order_items ADD COLUMN added_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!itemCols.includes('stock_taken')) {
    getDb().exec('ALTER TABLE order_items ADD COLUMN stock_taken INTEGER NOT NULL DEFAULT 0');
  }
  const prodCols = tableCols('products');
  if (!prodCols.includes('sort_order')) {
    getDb().exec('ALTER TABLE products ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0');
  }
  if (!prodCols.includes('choices_json')) {
    getDb().exec("ALTER TABLE products ADD COLUMN choices_json TEXT NOT NULL DEFAULT '[]'");
  }
  const tableColsList = tableCols('restaurant_tables');
  if (!tableColsList.includes('pos_x')) {
    getDb().exec('ALTER TABLE restaurant_tables ADD COLUMN pos_x REAL');
  }
  if (!tableColsList.includes('pos_y')) {
    getDb().exec('ALTER TABLE restaurant_tables ADD COLUMN pos_y REAL');
  }
  const invCols = tableCols('invoices');
  if (!invCols.includes('discount')) {
    getDb().exec('ALTER TABLE invoices ADD COLUMN discount REAL NOT NULL DEFAULT 0');
  }
  if (!invCols.includes('tip')) {
    getDb().exec('ALTER TABLE invoices ADD COLUMN tip REAL NOT NULL DEFAULT 0');
  }
  if (!invCols.includes('container_fee')) {
    getDb().exec('ALTER TABLE invoices ADD COLUMN container_fee REAL NOT NULL DEFAULT 0');
    invCols.push('container_fee');
  }
  if (!invCols.includes('discount_label')) {
    getDb().exec("ALTER TABLE invoices ADD COLUMN discount_label TEXT NOT NULL DEFAULT ''");
    invCols.push('discount_label');
  }
  const orderCols = tableCols('orders');
  if (!orderCols.includes('takeaway')) {
    getDb().exec('ALTER TABLE orders ADD COLUMN takeaway INTEGER NOT NULL DEFAULT 0');
  }
  const userCols = tableCols('users');
  if (!userCols.includes('must_change_password')) {
    getDb().exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0');
  }
  const ingCols = tableCols('ingredients');
  if (!ingCols.includes('unit_kind')) {
    getDb().exec("ALTER TABLE ingredients ADD COLUMN unit_kind TEXT NOT NULL DEFAULT 'count'");
  }
  if (!ingCols.includes('portion_note')) {
    getDb().exec("ALTER TABLE ingredients ADD COLUMN portion_note TEXT NOT NULL DEFAULT ''");
  }
  if (ingCols.includes('unit') && !getDb().prepare("SELECT value FROM settings WHERE key = 'unit_kind_migrated'").get()) {
    const { inferUnitKind } = require('./unit-kinds');
    const rows = getDb().prepare('SELECT id, unit FROM ingredients').all();
    const upd = getDb().prepare('UPDATE ingredients SET unit_kind = ? WHERE id = ?');
    for (const row of rows) {
      upd.run(inferUnitKind(row.unit), row.id);
    }
    getDb().prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('unit_kind_migrated', '1')").run();
  }
  const missingPos = getDb().prepare('SELECT id FROM restaurant_tables WHERE pos_x IS NULL OR pos_y IS NULL ORDER BY sort_order, id').all();
  if (missingPos.length) {
    const cols = 4;
    missingPos.forEach((row, i) => {
      const col = i % cols;
      const rowN = Math.floor(i / cols);
      const pos_x = Math.min(88, Math.max(8, 14 + col * 24));
      const pos_y = Math.min(88, Math.max(8, 18 + (rowN % 5) * 16));
      getDb().prepare('UPDATE restaurant_tables SET pos_x = ?, pos_y = ? WHERE id = ?').run(pos_x, pos_y, row.id);
    });
  }
}

function markCoreRecipeLines() {
  const done = getDb().prepare("SELECT value FROM settings WHERE key = 'recipe_core_fixed'").get();
  if (done) return;
  getDb().prepare(`
    UPDATE recipes SET removable = 0
    WHERE ingredient_id IN (
      SELECT id FROM ingredients WHERE name IN (
        'Pan hamburguesa', 'Pan de hamburguesa', 'Pan perro',
        'Carne de hamburguesa', 'Carne molida',
        'Papa a la francesa', 'Papa', 'Mezcla brownie', 'Aceite'
      )
    )
  `).run();
  getDb().prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('recipe_core_fixed', '1')").run();
}

const DEFAULT_SETTINGS = {
  business_name: 'Mi Restaurante',
  business_tagline: '',
  business_nit: '',
  business_address: '',
  business_phone: '',
  tax_rate: '0',
  tax_included: '1',
  printer_width: '80',
  printer_name: '',
  printer_enabled: '0',
  block_on_no_stock: '1',
  promo_tuesday_burgers: '1',
  takeaway_fee_enabled: '1',
  takeaway_fee_amount: '500',
  ticket_footer: '¡Gracias por su visita!',
  session_secret: 'jr-local-' + Math.random().toString(36).slice(2),
  last_auto_backup: '',
  setup_completed: '0'
};

function seedIfEmpty() {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (userCount > 0) {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(key, value);
    }
    return;
  }

  const hash = (pwd) => bcrypt.hashSync(pwd, 10);
  const insertUser = db.prepare(
    'INSERT INTO users (name, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
  );

  insertUser.run('Administrador', 'admin', hash('admin123'), 'admin');
  insertUser.run('Mesero', 'mesero', hash('mesero123'), 'waiter');
  insertUser.run('Cocina', 'cocina', hash('cocina123'), 'kitchen');
  insertUser.run('Cajero', 'cajero', hash('cajero123'), 'cashier');

  const insertTable = db.prepare(
    'INSERT INTO restaurant_tables (name, seats, sort_order, pos_x, pos_y) VALUES (?, ?, ?, ?, ?)'
  );
  insertTable.run('Mesa 1', 4, 1, 25, 35);
  insertTable.run('Mesa 2', 4, 2, 55, 35);

  // El menú real (categorías y productos JR) lo carga seedCatalog().
  // Aquí no se siembran "Platos fuertes", "Acompañamientos" ni "Postres".

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }
}

function getSetting(key, fallback = '') {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function getAllSettings() {
  const rows = getDb().prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function now() {
  return getDb().prepare("SELECT datetime('now','localtime') AS t").get().t;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    active: user.active,
    must_change_password: Number(user.must_change_password) === 1
  };
}

module.exports = {
  init,
  init: init,
  getDb,
  getSetting,
  setSetting,
  getAllSettings,
  getSetting: getSetting,
  setSetting: setSetting,
  getAllSettings: getAllSettings,
  now,
  publicUser,
  DB_PATH,
  DATA_DIR
};
