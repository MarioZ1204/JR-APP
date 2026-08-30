#!/usr/bin/env node
/**
 * Genera una clave de producto (solo en tu PC).
 * Uso: node scripts/license-key.js "Nombre del local" 2026-12-31
 * Escribe producto.key en la raíz del proyecto.
 */
const fs = require('fs');
const path = require('path');
const { generateKey } = require('../server/license');

const client = process.argv[2];
const until = process.argv[3];
if (!client || !until) {
  console.error('Uso: node scripts/license-key.js "Nombre del local" AAAA-MM-DD');
  process.exit(1);
}
try {
  const key = generateKey(client, until);
  const out = path.join(__dirname, '..', 'producto.key');
  fs.writeFileSync(out, key + '\n', 'utf8');
  console.log('');
  console.log('Cliente :', client);
  console.log('Vence   :', until);
  console.log('Clave   :', key);
  console.log('');
  console.log('Guardada en: producto.key');
  console.log('Copia esa carpeta al PC del restaurante y ejecuta instalar.bat');
  console.log('(El restaurante NO activa la clave desde la pantalla.)');
  console.log('');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
