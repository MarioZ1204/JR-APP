#!/usr/bin/env node
/**
 * Deja el sistema limpio para un local (solo desde consola / instalador).
 * Conserva menú y mesas. Borra ventas, caja, movimientos y usuarios no-admin.
 *
 * Uso: node scripts/factory-reset.js --confirm INSTALAR
 */
const bcrypt = require('bcryptjs');
const db = require('../server/db');
const { saveBackup } = require('../server/backup');

const args = process.argv.slice(2);
const confirmIdx = args.indexOf('--confirm');
const confirm = confirmIdx >= 0 ? String(args[confirmIdx + 1] || '').trim().toUpperCase() : '';

if (confirm !== 'INSTALAR') {
  console.error('Uso: node scripts/factory-reset.js --confirm INSTALAR');
  process.exit(1);
}

db.init();
const database = db.getDb();

let backupName = null;
try {
  backupName = saveBackup('pre-install-reset').filename;
} catch (e) {
  console.error('Aviso: no se pudo crear copia previa:', e.message);
}

database.exec('BEGIN');
try {
  database.prepare('DELETE FROM payments').run();
  database.prepare('DELETE FROM cash_movements').run();
  database.prepare('DELETE FROM invoices').run();
  database.prepare('DELETE FROM item_changes').run();
  database.prepare('DELETE FROM order_items').run();
  database.prepare('DELETE FROM orders').run();
  database.prepare('DELETE FROM cash_registers').run();
  database.prepare('DELETE FROM inventory_movements').run();
  database.prepare("DELETE FROM users WHERE role != 'admin'").run();

  let admins = database.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all();
  if (!admins.length) {
    const hash = bcrypt.hashSync('admin123', 10);
    database.prepare(
      'INSERT INTO users (name, username, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
    ).run('Administrador', 'admin', hash, 'admin');
  } else {
    database.prepare('UPDATE users SET must_change_password = 1 WHERE role = ?').run('admin');
  }

  database.prepare(`
    UPDATE restaurant_tables
    SET status = 'free', joined_to_id = NULL
  `).run();
  database.prepare('UPDATE ingredients SET stock = 0').run();
  database.exec('COMMIT');
} catch (e) {
  database.exec('ROLLBACK');
  console.error(e.message || e);
  process.exit(1);
}

console.log('');
console.log('Instalación limpia lista.');
if (backupName) console.log('Copia previa:', backupName);
console.log('Quedó el menú y solo admin (debe cambiar contraseña al entrar).');
console.log('');
