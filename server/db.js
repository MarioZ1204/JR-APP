const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'restaurante.db');

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
  db = wrap(new DatabaseSync(DB_PATH));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema();
  seedIfEmpty();
  if (getSetting('business_name') === 'JR Restaurante') {
    setSetting('business_name', 'JR Burger');
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
      stock REAL NOT NULL DEFAULT 0,
      min_stock REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
      quantity REAL NOT NULL,
      UNIQUE(product_id, ingredient_id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES restaurant_tables(id),
      waiter_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open','sent','preparing','ready','delivered','billed','cancelled')),
      notes TEXT,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
      tax_rate REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
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

const DEFAULT_SETTINGS = {
  business_name: 'JR Burger',
  business_nit: '',
  business_address: 'Local 1',
  business_phone: '',
  tax_rate: '0',
  tax_included: '1',
  printer_width: '80',
  printer_name: '',
  printer_enabled: '0',
  block_on_no_stock: '0',
  ticket_footer: '¡Gracias por su visita!',
  session_secret: 'jr-local-' + Math.random().toString(36).slice(2),
  last_auto_backup: ''
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
    'INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)'
  );

  const adminId = insertUser.run('Administrador', 'admin', hash('admin123'), 'admin').lastInsertRowid;
  insertUser.run('Mesero', 'mesero', hash('mesero123'), 'waiter');
  insertUser.run('Cocina', 'cocina', hash('cocina123'), 'kitchen');
  insertUser.run('Cajero', 'cajero', hash('cajero123'), 'cashier');

  const insertTable = db.prepare(
    'INSERT INTO restaurant_tables (name, seats, sort_order) VALUES (?, ?, ?)'
  );
  insertTable.run('Mesa 1', 4, 1);
  insertTable.run('Mesa 2', 4, 2);

  const insertCat = db.prepare(
    'INSERT INTO categories (name, sort_order, station) VALUES (?, ?, ?)'
  );
  const catPlatos = insertCat.run('Platos fuertes', 1, 'kitchen').lastInsertRowid;
  const catAcomp = insertCat.run('Acompañamientos', 2, 'kitchen').lastInsertRowid;
  const catBebidas = insertCat.run('Bebidas', 3, 'bar').lastInsertRowid;
  const catPostres = insertCat.run('Postres', 4, 'kitchen').lastInsertRowid;

  const insertProd = db.prepare(
    'INSERT INTO products (category_id, name, price, station) VALUES (?, ?, ?, ?)'
  );
  const burger = insertProd.run(catPlatos, 'Hamburguesa clásica', 18000, 'kitchen').lastInsertRowid;
  const papas = insertProd.run(catAcomp, 'Papas fritas', 8000, 'kitchen').lastInsertRowid;
  insertProd.run(catBebidas, 'Gaseosa 350ml', 4000, 'bar');
  insertProd.run(catBebidas, 'Jugo natural', 6000, 'bar');
  insertProd.run(catBebidas, 'Café', 3000, 'bar');
  insertProd.run(catPostres, 'Brownie', 7000, 'kitchen');

  const insertIng = db.prepare(
    'INSERT INTO ingredients (name, unit, stock, min_stock) VALUES (?, ?, ?, ?)'
  );
  const pan = insertIng.run('Pan de hamburguesa', 'unidad', 40, 10).lastInsertRowid;
  const carne = insertIng.run('Carne molida', 'g', 5000, 800).lastInsertRowid;
  const lechuga = insertIng.run('Lechuga', 'hoja', 80, 20).lastInsertRowid;
  const tomate = insertIng.run('Tomate', 'rodaja', 60, 15).lastInsertRowid;
  const queso = insertIng.run('Queso', 'porción', 40, 10).lastInsertRowid;
  const papa = insertIng.run('Papa', 'g', 8000, 1500).lastInsertRowid;
  const aceite = insertIng.run('Aceite', 'ml', 2000, 400).lastInsertRowid;
  const chocolate = insertIng.run('Mezcla brownie', 'porción', 20, 5).lastInsertRowid;

  const insertRecipe = db.prepare(
    'INSERT INTO recipes (product_id, ingredient_id, quantity) VALUES (?, ?, ?)'
  );
  insertRecipe.run(burger, pan, 1);
  insertRecipe.run(burger, carne, 150);
  insertRecipe.run(burger, lechuga, 2);
  insertRecipe.run(burger, tomate, 2);
  insertRecipe.run(burger, queso, 1);
  insertRecipe.run(papas, papa, 200);
  insertRecipe.run(papas, aceite, 20);

  const brownie = db.prepare("SELECT id FROM products WHERE name = 'Brownie'").get();
  if (brownie) insertRecipe.run(brownie.id, chocolate, 1);

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
  }

  const move = db.prepare(`
    INSERT INTO inventory_movements
      (ingredient_id, type, quantity, stock_after, reason, user_id, reference_type)
    VALUES (?, 'purchase', ?, ?, 'Stock inicial', ?, 'seed')
  `);
  for (const ing of db.prepare('SELECT * FROM ingredients').all()) {
    move.run(ing.id, ing.stock, ing.stock, adminId);
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
    active: user.active
  };
}

module.exports = {
  init,
  getDb,
  getSetting,
  setSetting,
  getAllSettings,
  now,
  publicUser,
  DB_PATH,
  DATA_DIR
};
