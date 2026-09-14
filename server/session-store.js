const session = require('express-session');
const { getDb } = require('./db');

/**
 * Almacén de sesiones en SQLite (persiste al reiniciar el proceso).
 */
class SqliteSessionStore extends session.Store {
  constructor(options = {}) {
    super(options);
    this.ttlMs = options.ttlMs || 16 * 60 * 60 * 1000;
    this._ensureTable();
  }

  _ensureTable() {
    getDb().exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
    `);
  }

  _now() {
    return Date.now();
  }

  _purge() {
    try {
      getDb().prepare('DELETE FROM sessions WHERE expired_at <= ?').run(this._now());
    } catch {
      /* ignore */
    }
  }

  get(sid, cb) {
    try {
      this._purge();
      const row = getDb().prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expired_at <= this._now()) {
        if (row) getDb().prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
        return cb(null, null);
      }
      return cb(null, JSON.parse(row.sess));
    } catch (e) {
      return cb(e);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess?.cookie?.maxAge;
      const ttl = Number.isFinite(maxAge) && maxAge > 0 ? maxAge : this.ttlMs;
      const expiredAt = this._now() + ttl;
      getDb().prepare(`
        INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at
      `).run(sid, JSON.stringify(sess), expiredAt);
      return cb(null);
    } catch (e) {
      return cb(e);
    }
  }

  destroy(sid, cb) {
    try {
      getDb().prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      return cb(null);
    } catch (e) {
      return cb(e);
    }
  }

  touch(sid, sess, cb) {
    this.set(sid, sess, cb);
  }

  clear(cb) {
    try {
      getDb().prepare('DELETE FROM sessions').run();
      return cb(null);
    } catch (e) {
      return cb(e);
    }
  }
}

module.exports = { SqliteSessionStore };
