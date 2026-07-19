import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarData: row.avatar_data,
    lockWallpaperData: row.lock_wallpaper_data,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapApp(row) {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description,
    category: row.category,
    icon: { type: row.icon_type, value: row.icon_value },
    launchMode: row.launch_mode,
    pinnedToDock: Boolean(row.pinned_to_dock),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDatabase({ dataDir, memory = false }) {
  const filename = memory ? ':memory:' : join(dataDir, 'webos.db');
  if (!memory) mkdirSync(dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename, { timeout: 5_000 });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      avatar_data TEXT,
      lock_wallpaper_data TEXT,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      last_active_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS apps (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Other',
      icon_type TEXT NOT NULL,
      icon_value TEXT NOT NULL,
      launch_mode TEXT NOT NULL,
      pinned_to_dock INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS sessions_token_hash_idx ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS apps_sort_idx ON apps(sort_order, created_at);
  `);
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('lock_wallpaper_data')) {
    db.exec('ALTER TABLE users ADD COLUMN lock_wallpaper_data TEXT');
  }

  const api = {
    raw: db,
    close() {
      db.close();
    },
    getUser() {
      return mapUser(db.prepare('SELECT * FROM users LIMIT 1').get());
    },
    createUser({ username, displayName, avatarData, lockWallpaperData, passwordHash }) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO users (id, username, display_name, avatar_data, lock_wallpaper_data, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, username, displayName, avatarData ?? null, lockWallpaperData ?? null, passwordHash, now, now);
      return api.getUser();
    },
    updateUser({ displayName, avatarData, lockWallpaperData, passwordHash }) {
      const user = api.getUser();
      if (!user) return null;
      db.prepare(`
        UPDATE users SET display_name = ?, avatar_data = ?, lock_wallpaper_data = ?, password_hash = ?, updated_at = ? WHERE id = ?
      `).run(
        displayName ?? user.displayName,
        avatarData === undefined ? user.avatarData : avatarData,
        lockWallpaperData === undefined ? user.lockWallpaperData : lockWallpaperData,
        passwordHash ?? user.passwordHash,
        new Date().toISOString(),
        user.id,
      );
      return api.getUser();
    },
    createSession({ userId, tokenHash, csrfToken, expiresAt }) {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO sessions (id, user_id, token_hash, csrf_token, expires_at, last_active_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, userId, tokenHash, csrfToken, expiresAt, now, now);
      return { id, csrfToken, expiresAt };
    },
    getSession(tokenHash) {
      return db.prepare(`
        SELECT s.*, u.username, u.display_name, u.avatar_data, u.lock_wallpaper_data
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ?
      `).get(tokenHash) ?? null;
    },
    touchSession(id, lastActiveAt, expiresAt) {
      db.prepare('UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE id = ?')
        .run(lastActiveAt, expiresAt, id);
    },
    deleteSessionByHash(tokenHash) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    },
    deleteSessionsForUser(userId) {
      db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    },
    deleteExpiredSessions(now) {
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    },
    listApps() {
      return db.prepare('SELECT * FROM apps ORDER BY sort_order ASC, created_at ASC').all().map(mapApp);
    },
    getApp(id) {
      const row = db.prepare('SELECT * FROM apps WHERE id = ?').get(id);
      return row ? mapApp(row) : null;
    },
    createApp(input) {
      const id = randomUUID();
      const now = new Date().toISOString();
      const max = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS value FROM apps').get();
      const sortOrder = Number(max.value) + 1;
      db.prepare(`
        INSERT INTO apps (
          id, name, url, description, category, icon_type, icon_value,
          launch_mode, pinned_to_dock, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, input.name, input.url, input.description, input.category,
        input.icon.type, input.icon.value, input.launchMode,
        input.pinnedToDock ? 1 : 0, sortOrder, now, now,
      );
      return api.getApp(id);
    },
    updateApp(id, input) {
      const current = api.getApp(id);
      if (!current) return null;
      const next = { ...current, ...input, icon: input.icon ?? current.icon };
      db.prepare(`
        UPDATE apps SET name = ?, url = ?, description = ?, category = ?, icon_type = ?,
          icon_value = ?, launch_mode = ?, pinned_to_dock = ?, updated_at = ? WHERE id = ?
      `).run(
        next.name, next.url, next.description, next.category, next.icon.type,
        next.icon.value, next.launchMode, next.pinnedToDock ? 1 : 0,
        new Date().toISOString(), id,
      );
      return api.getApp(id);
    },
    deleteApp(id) {
      const current = api.getApp(id);
      if (current) db.prepare('DELETE FROM apps WHERE id = ?').run(id);
      return current;
    },
    reorderApps(ids) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const stmt = db.prepare('UPDATE apps SET sort_order = ?, updated_at = ? WHERE id = ?');
        const now = new Date().toISOString();
        ids.forEach((id, index) => stmt.run(index, now, id));
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      return api.listApps();
    },
    getSettings() {
      const row = db.prepare("SELECT value FROM settings WHERE key = 'dashboard'").get();
      if (!row) return {};
      try {
        return JSON.parse(row.value);
      } catch {
        return {};
      }
    },
    updateSettings(patch) {
      const next = { ...api.getSettings(), ...patch };
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO settings (key, value, updated_at) VALUES ('dashboard', ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(JSON.stringify(next), now);
      return next;
    },
  };
  return api;
}
