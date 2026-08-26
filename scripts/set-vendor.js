#!/usr/bin/env node
/**
 * Opcional: graba datos de soporte del proveedor (no visibles para editar en la app).
 * Uso: node scripts/set-vendor.js --name "Tu empresa" --phone "300..." --wa "300..." --email "a@b.com"
 */
const db = require('../server/db');

db.init();

function arg(name) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? String(process.argv[i + 1] || '').trim() : '';
}

const map = {
  vendor_name: arg('name'),
  vendor_phone: arg('phone'),
  vendor_whatsapp: arg('wa'),
  vendor_email: arg('email')
};

let n = 0;
for (const [k, v] of Object.entries(map)) {
  if (!v) continue;
  db.setSetting(k, v);
  n++;
}

if (!n) {
  console.error('Uso: node scripts/set-vendor.js --name "..." --phone "..." --wa "..." --email "..."');
  process.exit(1);
}
console.log('Contacto de soporte guardado (' + n + ' campo(s)).');
