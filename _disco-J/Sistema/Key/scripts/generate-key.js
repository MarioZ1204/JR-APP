#!/usr/bin/env node
/**
 * Genera producto.key (herramienta del proveedor, carpeta Key).
 * Uso: node scripts/generate-key.js "Nombre del local" 2026-12-31
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SECRET = process.env.JR_LICENSE_SECRET || 'jr-alquiler-cambie-este-secreto-2026';
const ROOT = path.join(__dirname, '..');

function sign(client, until) {
  return crypto.createHash('sha256')
    .update(`${client}|${until}|${SECRET}`)
    .digest('hex')
    .slice(0, 10);
}

function generateKey(client, until) {
  const c = String(client || '').trim();
  const u = String(until || '').trim();
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(u)) {
    throw new Error('Cliente y fecha (AAAA-MM-DD) son obligatorios');
  }
  const payload = Buffer.from(JSON.stringify({ c, u }), 'utf8').toString('base64url');
  return `JR1.${payload}.${sign(c, u)}`;
}

const client = process.argv[2];
const until = process.argv[3];
if (!client || !until) {
  console.error('Uso: node scripts/generate-key.js "Nombre del local" AAAA-MM-DD');
  process.exit(1);
}

try {
  const key = generateKey(client, until);
  const out = path.join(ROOT, 'producto.key');
  fs.writeFileSync(out, key + '\n', 'utf8');
  console.log('');
  console.log('Cliente :', client);
  console.log('Vence   :', until);
  console.log('Clave   :', key);
  console.log('');
  console.log('Guardada en:', out);
  console.log('');
  console.log('Copie producto.key a la carpeta "Sistema JR" del cliente');
  console.log('y ejecute instalar.bat (primera vez) o renovar.bat (renovacion).');
  console.log('');
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
