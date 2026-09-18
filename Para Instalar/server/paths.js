const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_ROOT = path.join(__dirname, '..');

function isProtectedInstall(root = APP_ROOT) {
  const n = String(root || '').replace(/\//g, '\\').toLowerCase();
  return (
    n.includes('\\program files\\') ||
    n.includes('\\program files (x86)\\') ||
    n.includes('\\windows\\')
  );
}

function canWrite(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.jr-write-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function appDataBase() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'JR-Burger');
}

function resolveDataDirs() {
  if (process.env.JR_DATA_DIR) {
    const data = path.resolve(process.env.JR_DATA_DIR);
    const backups = process.env.JR_BACKUP_DIR
      ? path.resolve(process.env.JR_BACKUP_DIR)
      : path.join(path.dirname(data), 'backups');
    return {
      DATA_DIR: data,
      BACKUP_DIR: backups,
      APP_ROOT,
      usingAppData: true
    };
  }

  const localData = path.join(APP_ROOT, 'data');
  const localBackup = path.join(APP_ROOT, 'backups');

  if (isProtectedInstall(APP_ROOT) || !canWrite(localData)) {
    const base = appDataBase();
    return {
      DATA_DIR: path.join(base, 'data'),
      BACKUP_DIR: path.join(base, 'backups'),
      APP_ROOT,
      usingAppData: true
    };
  }

  return {
    DATA_DIR: localData,
    BACKUP_DIR: localBackup,
    APP_ROOT,
    usingAppData: false
  };
}

const resolved = resolveDataDirs();

module.exports = {
  APP_ROOT: resolved.APP_ROOT,
  DATA_DIR: resolved.DATA_DIR,
  BACKUP_DIR: resolved.BACKUP_DIR,
  usingAppData: resolved.usingAppData,
  isProtectedInstall,
  appDataBase
};
