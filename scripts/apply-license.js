#!/usr/bin/env node
/**
 * Aplica una clave de producto (uso del proveedor, no del restaurante).
 * Uso:
 *   node scripts/apply-license.js JR1....
 *   node scripts/apply-license.js --file producto.key
 */
const path = require('path');
const fs = require('fs');

const db = require('../server/db');
const { installProductKey, readKeyFromFile } = require('../server/license');

db.init();

const args = process.argv.slice(2);
let key = '';

if (args[0] === '--file' || args[0] === '-f') {
  const file = path.resolve(args[1] || path.join(__dirname, '..', 'producto.key'));
  if (!fs.existsSync(file)) {
    console.error('No existe el archivo:', file);
    process.exit(1);
  }
  key = readKeyFromFile(file);
} else if (args[0]) {
  key = args[0];
} else {
  const fallback = path.join(__dirname, '..', 'producto.key');
  if (fs.existsSync(fallback)) key = readKeyFromFile(fallback);
}

if (!key) {
  console.error('Uso: node scripts/apply-license.js JR1....');
  console.error('   o: node scripts/apply-license.js --file producto.key');
  process.exit(1);
}

try {
  const lic = installProductKey(key);
  console.log('');
  console.log('Clave aplicada.');
  console.log('Vence :', lic.until);
  console.log('Estado:', lic.status);
  console.log('');
  process.exit(0);
} catch (e) {
  console.error(e.message || e);
  process.exit(1);
}
