'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');
const { dataRoot } = require('./releases.cjs');
function openCloudStore({ dataDir, mustExist = false, clock = Date.now }) {
  const root = dataRoot(dataDir), directory = path.join(root, 'cloud'), databasePath = path.join(directory, 'cottage.sqlite');
  if (mustExist && !fs.existsSync(databasePath)) throw new Error('账号数据库不存在，未创建空数据库。');
  fs.mkdirSync(root, { recursive: true, mode: 0o750 });
  try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
  if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) throw new Error('账号数据目录不能是符号链接。');
  fs.chmodSync(directory, 0o700);
  for (const suffix of ['', '-wal', '-shm']) {
    let info;
    try { info = fs.lstatSync(databasePath + suffix); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (info && (info.isSymbolicLink() || !info.isFile())) throw new Error('账号数据库不能是符号链接或特殊文件。');
  }
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (version !== 0 && version !== 1) throw new Error('账号数据库版本不兼容。');
    db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password_salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, epoch TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS saves (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, revision INTEGER NOT NULL CHECK(revision > 0), json TEXT NOT NULL, content_hash TEXT NOT NULL, updated_at INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS versions (account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, revision INTEGER NOT NULL, json TEXT NOT NULL, content_hash TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(account_id, revision)) STRICT;
      CREATE TABLE IF NOT EXISTS mutations (account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, mutation_id TEXT NOT NULL, content_hash TEXT NOT NULL, revision INTEGER NOT NULL, updated_at INTEGER NOT NULL, epoch TEXT NOT NULL, PRIMARY KEY(account_id, mutation_id)) STRICT;
      CREATE TABLE IF NOT EXISTS auth_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS publications (id TEXT PRIMARY KEY, account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE, title TEXT NOT NULL, display_name TEXT NOT NULL, snapshot_json TEXT NOT NULL, source_revision INTEGER NOT NULL CHECK(source_revision > 0), room_count INTEGER NOT NULL CHECK(room_count >= 0), updated_at INTEGER NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS publications_recent ON publications(updated_at DESC, id DESC);
      PRAGMA user_version=1;
    `);
    db.prepare('INSERT OR IGNORE INTO metadata(key,value) VALUES (?,?)').run('serverEpoch', crypto.randomUUID());
    fs.chmodSync(databasePath, 0o600);
    for (const suffix of ['-wal', '-shm']) if (fs.existsSync(databasePath + suffix)) fs.chmodSync(databasePath + suffix, 0o600);
  } catch (error) { db.close(); throw error; }
  let closed = false, backupTask = null;
  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const epoch = () => db.prepare('SELECT value FROM metadata WHERE key=?').get('serverEpoch').value;
  function rotateEpoch() {
    return transaction(() => {
      const value = crypto.randomUUID();
      db.prepare('UPDATE metadata SET value=? WHERE key=?').run(value, 'serverEpoch');
      // 恢复旧数据库不能让后来已经撤下的公开链接重新出现；恢复后需由主人重新发布。
      db.exec("DELETE FROM sessions; DELETE FROM mutations; DELETE FROM publications; DELETE FROM metadata WHERE key LIKE 'private:%';");
      return value;
    });
  }
  function backupDatabase({ keep = 7 } = {}) {
    if (closed) return Promise.reject(new Error('数据库已关闭。'));
    if (backupTask) return backupTask;
    if (!Number.isInteger(keep) || keep < 1 || keep > 100) return Promise.reject(new Error('备份保留份数无效。'));
    backupTask = (async () => {
      const target = path.join(directory, 'backups');
      try { fs.mkdirSync(target, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      if (!fs.lstatSync(target).isDirectory() || fs.lstatSync(target).isSymbolicLink()) throw new Error('备份目录不能是符号链接。');
      fs.chmodSync(target, 0o700);
      const name = 'backup-' + new Date(clock()).toISOString().replace(/[-:.TZ]/g, '') + '-' + crypto.randomBytes(4).toString('hex') + '.sqlite';
      const temporary = path.join(target, '.' + name + '.partial'), final = path.join(target, name);
      try {
        await backup(db, temporary);
        fs.chmodSync(temporary, 0o600); fs.renameSync(temporary, final);
        const names = fs.readdirSync(target).filter(file => /^backup-\d{17}-[a-f0-9]{8}\.sqlite$/.test(file)).sort().reverse();
        for (const file of names.slice(keep)) { const candidate = path.join(target, file); if (fs.lstatSync(candidate).isFile()) fs.unlinkSync(candidate); }
        return final;
      } finally { for (const suffix of ['', '-wal', '-shm']) fs.rmSync(temporary + suffix, { force: true }); }
    })().finally(() => { backupTask = null; });
    return backupTask;
  }
  async function close() { if (closed) return; if (backupTask) await backupTask.catch(() => {}); db.close(); closed = true; }
  return { db, databasePath, directory, transaction, epoch, rotateEpoch, backupDatabase, close, clock };
}
module.exports = { openCloudStore };
