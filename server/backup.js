const fs = require('fs');
const path = require('path');
const { getDb, getSetting, setSetting, DB_PATH } = require('./db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');
const DATA_DIR = path.join(__dirname, '..', 'data');
const RESTORE_PENDING = path.join(DATA_DIR, 'restore-pending.txt');

function ensureDir() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function copyDb(dest) {
  const db = getDb();
  db.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(DB_PATH, dest);
}

function saveBackup(reason = 'manual') {
  ensureDir();
  const filename = `restaurante-${stamp()}-${reason}.db`;
  const dest = path.join(BACKUP_DIR, filename);
  copyDb(dest);
  getDb().prepare('INSERT INTO backup_log (filename) VALUES (?)').run(filename);
  return { filename, path: dest };
}

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function autoBackup() {
  const last = getSetting('last_auto_backup', '');
  const today = localToday();
  if (last === today) return null;
  const result = saveBackup('auto');
  setSetting('last_auto_backup', today);
  pruneOld(14);
  return result;
}

/** Programa restauración para el próximo arranque (seguro con SQLite abierto). */
function scheduleRestore(filename) {
  ensureDir();
  const safe = path.basename(String(filename || ''));
  if (!safe || !safe.endsWith('.db') || safe.includes('..')) {
    const err = new Error('Nombre de copia no válido');
    err.http = 400;
    throw err;
  }
  const src = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(src)) {
    const err = new Error('No se encontró esa copia');
    err.http = 404;
    throw err;
  }
  const safety = saveBackup('pre-restore');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(RESTORE_PENDING, safe, 'utf8');
  return { filename: safe, safety: safety.filename };
}

/** Aplica restauración pendiente antes de abrir la BD. */
function applyPendingRestore() {
  if (!fs.existsSync(RESTORE_PENDING)) return null;
  const safe = path.basename(fs.readFileSync(RESTORE_PENDING, 'utf8').trim());
  const src = path.join(BACKUP_DIR, safe);
  if (!safe.endsWith('.db') || !fs.existsSync(src)) {
    try { fs.unlinkSync(RESTORE_PENDING); } catch { /* ignore */ }
    return null;
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  for (const ext of ['', '-wal', '-shm']) {
    const p = DB_PATH + ext;
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
  }
  fs.copyFileSync(src, DB_PATH);
  try { fs.unlinkSync(RESTORE_PENDING); } catch { /* ignore */ }
  console.log('Respaldo restaurado:', safe);
  return safe;
}

function pruneOld(keep = 14) {
  ensureDir();
  const files = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  for (const extra of files.slice(keep)) {
    fs.unlinkSync(path.join(BACKUP_DIR, extra.f));
  }
}

function listBackups() {
  ensureDir();
  return fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.db'))
    .map((f) => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { filename: f, size: st.size, created_at: st.mtime.toISOString() };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

function manualBackup() {
  const { init } = require('./db');
  init();
  const r = saveBackup('manual');
  console.log('Respaldo creado:', r.path);
}

module.exports = {
  saveBackup,
  autoBackup,
  listBackups,
  manualBackup,
  scheduleRestore,
  applyPendingRestore,
  BACKUP_DIR
};
