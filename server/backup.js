const fs = require('fs');
const path = require('path');
const { getDb, getSetting, setSetting, DB_PATH } = require('./db');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

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

function autoBackup() {
  const last = getSetting('last_auto_backup', '');
  const today = new Date().toISOString().slice(0, 10);
  if (last === today) return null;
  const result = saveBackup('auto');
  setSetting('last_auto_backup', today);
  pruneOld(14);
  return result;
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
  saveBackup: saveBackup,
  autoBackup,
  listBackups,
  listBackups: listBackups,
  manualBackup,
  BACKUP_DIR
};
