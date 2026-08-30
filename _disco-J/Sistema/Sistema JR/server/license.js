const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSetting, setSetting, getAllSettings } = require('./db');

const APP_VERSION = '1.1.0';
const SECRET = process.env.JR_LICENSE_SECRET || 'jr-alquiler-cambie-este-secreto-2026';
const ROOT = path.join(__dirname, '..');
const KEY_PATH = path.join(ROOT, 'data', 'product.key');
/** Si existe, la licencia se exige (instalación en cliente). En tu PC de desarrollo no hace falta. */
const RENTAL_LOCK = path.join(ROOT, 'data', 'rental.lock');

function localDateStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function sign(client, until) {
  return crypto.createHash('sha256')
    .update(`${client}|${until}|${SECRET}`)
    .digest('hex')
    .slice(0, 10);
}

/** Genera una clave de producto: JR1.<payload>.<firma> */
function generateKey(client, until) {
  const c = String(client || '').trim();
  const u = String(until || '').trim();
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(u)) {
    throw new Error('Cliente y fecha (AAAA-MM-DD) son obligatorios');
  }
  const payload = Buffer.from(JSON.stringify({ c, u }), 'utf8').toString('base64url');
  return `JR1.${payload}.${sign(c, u)}`;
}

function parseKey(raw) {
  const key = String(raw || '').trim();
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'JR1') return null;
  try {
    const data = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!data.c || !data.u) return null;
    if (sign(data.c, data.u) !== parts[2]) return null;
    return { client: String(data.c), until: String(data.u) };
  } catch {
    return null;
  }
}

function daysBetween(fromYmd, toYmd) {
  const a = new Date(fromYmd + 'T12:00:00');
  const b = new Date(toYmd + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

function licenseStatus() {
  const s = getAllSettings();
  const until = String(s.license_until || '').trim();
  const client = String(s.license_client || '').trim();
  const today = localDateStr();
  let status = 'unlicensed';
  let daysLeft = null;
  let expired = false;

  if (until && /^\d{4}-\d{2}-\d{2}$/.test(until)) {
    daysLeft = daysBetween(today, until);
    if (daysLeft < 0) {
      status = 'expired';
      expired = true;
    } else if (daysLeft <= 7) {
      status = 'warning';
    } else {
      status = 'active';
    }
  } else if (fs.existsSync(RENTAL_LOCK) || process.env.JR_RENTAL === '1') {
    // Instalación de cliente: sin clave no opera.
    expired = true;
    status = 'unlicensed';
  } else {
    // PC de desarrollo / copia sin instalador: no bloquea.
    status = 'dev';
    expired = false;
  }

  return {
    status,
    expired,
    days_left: daysLeft,
    until: until || null,
    client: client || null,
    vendor_name: s.vendor_name || '',
    vendor_phone: s.vendor_phone || '',
    vendor_whatsapp: s.vendor_whatsapp || '',
    vendor_email: s.vendor_email || '',
    app_version: APP_VERSION
  };
}

function activateLicense(key) {
  const parsed = parseKey(key);
  if (!parsed) {
    const err = new Error('La clave de producto no es válida');
    err.http = 400;
    throw err;
  }
  setSetting('license_client', parsed.client);
  setSetting('license_until', parsed.until);
  setSetting('license_key', String(key).trim());
  return licenseStatus();
}

/** Guarda la clave en disco (oculta al usuario de la app) y la aplica a la BD. */
function enableRentalMode() {
  fs.mkdirSync(path.dirname(RENTAL_LOCK), { recursive: true });
  if (!fs.existsSync(RENTAL_LOCK)) {
    fs.writeFileSync(RENTAL_LOCK, '1\n', 'utf8');
  }
}

function installProductKey(key, { persistFile = true, rental = true } = {}) {
  const lic = activateLicense(key);
  if (persistFile) {
    fs.mkdirSync(path.dirname(KEY_PATH), { recursive: true });
    fs.writeFileSync(KEY_PATH, String(key).trim() + '\n', 'utf8');
  }
  if (rental) enableRentalMode();
  return lic;
}

function readKeyFromFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const line = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith('#'));
  return line || '';
}

/**
 * Al arrancar: si hay producto.key / data/product.key, sincroniza la licencia.
 * No hay activación desde la interfaz web.
 */
function syncLicenseFromDisk() {
  const candidates = [
    KEY_PATH,
    path.join(ROOT, 'producto.key'),
    path.join(ROOT, 'product.key')
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const key = readKeyFromFile(file);
      if (!key) continue;
      const lic = installProductKey(key, { persistFile: file !== KEY_PATH });
      return { ok: true, file, license: lic };
    } catch (e) {
      console.error('Clave de producto inválida en', file, '-', e.message);
      return { ok: false, file, error: e.message };
    }
  }
  return { ok: false, skipped: true };
}

function publicLicense() {
  const L = licenseStatus();
  return {
    status: L.status,
    expired: L.expired,
    days_left: L.days_left,
    until: L.until,
    // No exponer el nombre de cliente ni detalles internos al front salvo lo necesario
    vendor_name: L.vendor_name,
    vendor_phone: L.vendor_phone,
    vendor_whatsapp: L.vendor_whatsapp,
    vendor_email: L.vendor_email,
    app_version: L.app_version
  };
}

module.exports = {
  APP_VERSION,
  KEY_PATH,
  RENTAL_LOCK,
  generateKey,
  parseKey,
  activateLicense,
  installProductKey,
  enableRentalMode,
  syncLicenseFromDisk,
  readKeyFromFile,
  licenseStatus,
  publicLicense
};
