import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createOpaqueToken, hashPassword, hashToken, safeEqualText, verifyPassword } from './security.mjs';

const JSON_LIMIT = 6 * 1024 * 1024;
const ICON_LIMIT = 512 * 1024;
const SESSION_COOKIE_PROD = '__Host-webos_session';
const SESSION_COOKIE_DEV = 'webos_session';
const ALLOWED_ICON_TYPES = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);

function sendJson(res, status, body, extraHeaders = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(data);
}

function sendEmpty(res, status, extraHeaders = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...extraHeaders });
  res.end();
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > JSON_LIMIT) throw Object.assign(new Error('Request body is too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((item) => item.trim()).filter(Boolean).map((item) => {
      const index = item.indexOf('=');
      const key = index >= 0 ? item.slice(0, index) : item;
      const value = index >= 0 ? item.slice(index + 1) : '';
      return [key, decodeURIComponent(value)];
    }),
  );
}

function sessionCookie(config, token, maxAge) {
  const name = config.secureCookies ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV;
  const secure = config.secureCookies ? '; Secure' : '';
  const age = typeof maxAge === 'number' ? `; Max-Age=${maxAge}` : '';
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure}${age}`;
}

function clearSessionCookies(config) {
  return [
    sessionCookie({ ...config, secureCookies: false }, '', 0),
    sessionCookie({ ...config, secureCookies: true }, '', 0),
  ];
}

function publicProfile(user) {
  if (!user) return null;
  return {
    username: user.username,
    displayName: user.displayName,
    avatarData: user.avatarData,
    lockWallpaperData: user.lockWallpaperData,
  };
}

function validateText(value, name, { min = 0, max = 200 } = {}) {
  if (typeof value !== 'string') throw Object.assign(new Error(`${name} is required`), { status: 400 });
  const result = value.trim();
  if (result.length < min || result.length > max) {
    throw Object.assign(new Error(`${name} must be between ${min} and ${max} characters`), { status: 400 });
  }
  return result;
}

function validateImageData(value, { optional = true, limit = ICON_LIMIT } = {}) {
  if ((value === null || value === undefined || value === '') && optional) return null;
  if (typeof value !== 'string') throw Object.assign(new Error('Invalid image'), { status: 400 });
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw Object.assign(new Error('Use a PNG, JPEG, WebP, or GIF image'), { status: 400 });
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > limit) throw Object.assign(new Error(`Image must be ${Math.round(limit / 1024)} KB or smaller`), { status: 400 });
  return { mime: match[1], bytes, dataUrl: value };
}

function validateApp(input, partial = false) {
  const out = {};
  if (!partial || input.name !== undefined) out.name = validateText(input.name, 'Name', { min: 1, max: 80 });
  if (!partial || input.url !== undefined) {
    const raw = validateText(input.url, 'URL', { min: 4, max: 2_000 });
    let parsed;
    try {
      parsed = new URL(raw);
    } catch {
      throw Object.assign(new Error('Enter a valid URL'), { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw Object.assign(new Error('URL must use HTTP or HTTPS'), { status: 400 });
    }
    out.url = parsed.toString();
  }
  if (!partial || input.description !== undefined) {
    out.description = validateText(input.description ?? '', 'Description', { max: 300 });
  }
  if (!partial || input.category !== undefined) {
    out.category = validateText(input.category ?? 'Other', 'Category', { min: 1, max: 50 });
  }
  if (!partial || input.launchMode !== undefined) {
    if (!['external', 'embed', 'same-tab'].includes(input.launchMode)) {
      throw Object.assign(new Error('Invalid launch mode'), { status: 400 });
    }
    out.launchMode = input.launchMode;
  }
  if (!partial || input.icon !== undefined) {
    if (!input.icon || !['preset', 'upload', 'letter'].includes(input.icon.type)) {
      throw Object.assign(new Error('Invalid icon'), { status: 400 });
    }
    out.icon = {
      type: input.icon.type,
      value: validateText(input.icon.value, 'Icon value', { min: 1, max: 500 }),
    };
  }
  if (!partial || input.pinnedToDock !== undefined) out.pinnedToDock = Boolean(input.pinnedToDock);
  return out;
}

function fileMime(pathname) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
  };
  return types[extname(pathname).toLowerCase()] ?? 'application/octet-stream';
}

function streamFile(res, pathname, cacheControl = 'public, max-age=3600') {
  const stat = statSync(pathname);
  res.writeHead(200, {
    'Content-Type': fileMime(pathname),
    'Content-Length': stat.size,
    'Cache-Control': cacheControl,
  });
  createReadStream(pathname).pipe(res);
}

export function createAppHandler({ db, config }) {
  const attempts = new Map();
  const iconDir = join(config.dataDir, 'icons');
  mkdirSync(iconDir, { recursive: true });

  function getSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[SESSION_COOKIE_PROD] ?? cookies[SESSION_COOKIE_DEV];
    if (!raw) return null;
    const session = db.getSession(hashToken(raw));
    if (!session) return null;
    const now = Date.now();
    const expiresAt = Date.parse(session.expires_at);
    const lastActiveAt = Date.parse(session.last_active_at);
    if (expiresAt <= now || now - lastActiveAt > config.idleTimeoutMs) {
      db.deleteSessionByHash(hashToken(raw));
      return null;
    }
    if (now - lastActiveAt > 60_000) {
      db.touchSession(session.id, new Date(now).toISOString(), new Date(now + config.sessionTtlMs).toISOString());
    }
    return { ...session, rawToken: raw };
  }

  function requireSession(req, res, { csrf = false } = {}) {
    const session = getSession(req);
    if (!session) {
      sendJson(res, 401, { error: 'Authentication required' }, { 'Set-Cookie': clearSessionCookies(config) });
      return null;
    }
    if (csrf && req.headers['x-csrf-token'] !== session.csrf_token) {
      sendJson(res, 403, { error: 'Invalid CSRF token' });
      return null;
    }
    return session;
  }

  function issueSession(user) {
    const rawToken = createOpaqueToken();
    const csrfToken = createOpaqueToken(24);
    const expiresAt = new Date(Date.now() + config.sessionTtlMs).toISOString();
    db.createSession({ userId: user.id, tokenHash: hashToken(rawToken), csrfToken, expiresAt });
    return { rawToken, csrfToken, expiresAt };
  }

  function originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    if (config.appOrigin) return origin === config.appOrigin;
    const protocol = req.headers['x-forwarded-proto'] ?? (config.secureCookies ? 'https' : 'http');
    return origin === `${protocol}://${req.headers.host}`;
  }

  function checkAttempts(req, res) {
    const key = req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const record = attempts.get(key);
    if (!record || now - record.startedAt > 15 * 60_000) {
      attempts.set(key, { count: 0, startedAt: now });
      return true;
    }
    if (record.count < 5) return true;
    const retryAfter = Math.ceil((record.startedAt + 15 * 60_000 - now) / 1_000);
    sendJson(res, 429, { error: 'Too many attempts. Try again later.' }, { 'Retry-After': retryAfter });
    return false;
  }

  function recordFailure(req) {
    const key = req.socket.remoteAddress ?? 'unknown';
    const current = attempts.get(key) ?? { count: 0, startedAt: Date.now() };
    attempts.set(key, { ...current, count: current.count + 1 });
  }

  function clearFailures(req) {
    attempts.delete(req.socket.remoteAddress ?? 'unknown');
  }

  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src http: https:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );

    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const pathname = decodeURIComponent(url.pathname);
      const method = req.method ?? 'GET';

      if (['POST', 'PATCH', 'DELETE'].includes(method) && !originAllowed(req)) {
        return sendJson(res, 403, { error: 'Origin rejected' });
      }

      if (pathname === '/api/auth/session' && method === 'GET') {
        db.deleteExpiredSessions(new Date().toISOString());
        const user = db.getUser();
        const session = getSession(req);
        return sendJson(res, 200, session ? {
          authenticated: true,
          setupRequired: false,
          profile: {
            username: session.username,
            displayName: session.display_name,
            avatarData: session.avatar_data,
            lockWallpaperData: session.lock_wallpaper_data,
          },
          csrfToken: session.csrf_token,
          expiresAt: session.expires_at,
        } : {
          authenticated: false,
          setupRequired: !user,
          profile: publicProfile(user),
        });
      }

      if (pathname === '/api/auth/setup' && method === 'POST') {
        if (db.getUser()) return sendJson(res, 409, { error: 'Setup is already complete' });
        if (!checkAttempts(req, res)) return;
        const body = await readJson(req);
        if (!safeEqualText(body.setupToken ?? '', config.setupToken)) {
          recordFailure(req);
          return sendJson(res, 401, { error: 'Invalid setup token' });
        }
        const username = validateText(body.username, 'Username', { min: 2, max: 40 });
        if (!/^[a-zA-Z0-9._-]+$/.test(username)) return sendJson(res, 400, { error: 'Username contains unsupported characters' });
        const displayName = validateText(body.displayName, 'Display name', { min: 1, max: 60 });
        const password = validateText(body.password, 'Password', { min: 12, max: 128 });
        const image = validateImageData(body.avatarData);
        const user = db.createUser({
          username,
          displayName,
          avatarData: image?.dataUrl ?? null,
          lockWallpaperData: validateImageData(body.lockWallpaperData, { limit: 2 * 1024 * 1024 })?.dataUrl ?? null,
          passwordHash: hashPassword(password),
        });
        clearFailures(req);
        const session = issueSession(user);
        return sendJson(res, 201, {
          authenticated: true,
          profile: publicProfile(user),
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
        }, { 'Set-Cookie': sessionCookie(config, session.rawToken) });
      }

      if (pathname === '/api/auth/login' && method === 'POST') {
        if (!checkAttempts(req, res)) return;
        const body = await readJson(req);
        const user = db.getUser();
        if (!user || typeof body.password !== 'string' || body.password.length > 128 || !verifyPassword(body.password, user.passwordHash)) {
          recordFailure(req);
          return sendJson(res, 401, { error: 'Incorrect password' });
        }
        clearFailures(req);
        const session = issueSession(user);
        return sendJson(res, 200, {
          authenticated: true,
          profile: publicProfile(user),
          csrfToken: session.csrfToken,
          expiresAt: session.expiresAt,
        }, { 'Set-Cookie': sessionCookie(config, session.rawToken) });
      }

      if ((pathname === '/api/auth/logout' || pathname === '/api/auth/lock') && method === 'POST') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        db.deleteSessionByHash(hashToken(session.rawToken));
        return sendEmpty(res, 204, { 'Set-Cookie': clearSessionCookies(config) });
      }

      if (pathname === '/api/auth/change-password' && method === 'POST') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const body = await readJson(req);
        const user = db.getUser();
        if (!user || !verifyPassword(body.currentPassword ?? '', user.passwordHash)) {
          return sendJson(res, 400, { error: 'Current password is incorrect' });
        }
        const password = validateText(body.newPassword, 'New password', { min: 12, max: 128 });
        db.updateUser({ passwordHash: hashPassword(password) });
        db.deleteSessionsForUser(user.id);
        return sendEmpty(res, 204, { 'Set-Cookie': clearSessionCookies(config) });
      }

      if (pathname === '/api/profile' && method === 'GET') {
        const session = requireSession(req, res);
        if (!session) return;
        return sendJson(res, 200, { profile: publicProfile(db.getUser()) });
      }

      if (pathname === '/api/profile' && method === 'PATCH') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const body = await readJson(req);
        const displayName = body.displayName === undefined
          ? undefined
          : validateText(body.displayName, 'Display name', { min: 1, max: 60 });
        const avatarData = body.avatarData === undefined ? undefined : validateImageData(body.avatarData)?.dataUrl ?? null;
        const lockWallpaperData = body.lockWallpaperData === undefined
          ? undefined
          : validateImageData(body.lockWallpaperData, { limit: 2 * 1024 * 1024 })?.dataUrl ?? null;
        const user = db.updateUser({ displayName, avatarData, lockWallpaperData });
        return sendJson(res, 200, { profile: publicProfile(user) });
      }

      if (pathname === '/api/apps' && method === 'GET') {
        const session = requireSession(req, res);
        if (!session) return;
        return sendJson(res, 200, { apps: db.listApps() });
      }

      if (pathname === '/api/apps' && method === 'POST') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        return sendJson(res, 201, { app: db.createApp(validateApp(await readJson(req))) });
      }

      const appMatch = /^\/api\/apps\/([0-9a-f-]+)$/.exec(pathname);
      if (appMatch && method === 'PATCH') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const previous = db.getApp(appMatch[1]);
        const app = db.updateApp(appMatch[1], validateApp(await readJson(req), true));
        if (app && previous?.icon.type === 'upload' && previous.icon.value !== app.icon.value && previous.icon.value.startsWith('/api/icons/')) {
          const target = join(iconDir, previous.icon.value.slice('/api/icons/'.length));
          if (existsSync(target)) rmSync(target);
        }
        return app ? sendJson(res, 200, { app }) : sendJson(res, 404, { error: 'App not found' });
      }

      if (appMatch && method === 'DELETE') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const app = db.deleteApp(appMatch[1]);
        if (!app) return sendJson(res, 404, { error: 'App not found' });
        if (app.icon.type === 'upload' && app.icon.value.startsWith('/api/icons/')) {
          const target = join(iconDir, app.icon.value.slice('/api/icons/'.length));
          if (existsSync(target)) rmSync(target);
        }
        return sendEmpty(res, 204);
      }

      if (pathname === '/api/apps/reorder' && method === 'POST') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const body = await readJson(req);
        if (!Array.isArray(body.ids) || body.ids.some((id) => typeof id !== 'string')) {
          return sendJson(res, 400, { error: 'Invalid app order' });
        }
        const known = new Set(db.listApps().map((app) => app.id));
        if (body.ids.length !== known.size || new Set(body.ids).size !== known.size || body.ids.some((id) => !known.has(id))) {
          return sendJson(res, 400, { error: 'App order must contain every app exactly once' });
        }
        return sendJson(res, 200, { apps: db.reorderApps(body.ids) });
      }

      if (pathname === '/api/settings' && method === 'GET') {
        const session = requireSession(req, res);
        if (!session) return;
        return sendJson(res, 200, { settings: db.getSettings() });
      }

      if (pathname === '/api/settings' && method === 'PATCH') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const body = await readJson(req);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res, 400, { error: 'Invalid settings' });
        return sendJson(res, 200, { settings: db.updateSettings(body) });
      }

      if (pathname === '/api/icons' && method === 'POST') {
        const session = requireSession(req, res, { csrf: true });
        if (!session) return;
        const image = validateImageData((await readJson(req)).dataUrl, { optional: false });
        const filename = `${randomUUID()}.${ALLOWED_ICON_TYPES.get(image.mime)}`;
        writeFileSync(join(iconDir, filename), image.bytes, { flag: 'wx' });
        return sendJson(res, 201, { url: `/api/icons/${filename}` });
      }

      const iconMatch = /^\/api\/icons\/([0-9a-f-]+\.(?:png|jpg|webp|gif))$/.exec(pathname);
      if (iconMatch && method === 'GET') {
        const session = requireSession(req, res);
        if (!session) return;
        const target = join(iconDir, iconMatch[1]);
        if (!existsSync(target)) return sendJson(res, 404, { error: 'Icon not found' });
        return streamFile(res, target, 'private, no-store');
      }

      if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Route not found' });

      if (method === 'GET' && config.serveStatic && existsSync(config.distDir)) {
        const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/, '');
        const target = resolve(config.distDir, relative);
        const root = resolve(config.distDir) + sep;
        const candidate = target.startsWith(root) && existsSync(target) && statSync(target).isFile()
          ? target
          : join(config.distDir, 'index.html');
        if (existsSync(candidate)) return streamFile(res, candidate, candidate.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable');
      }

      return sendJson(res, 404, { error: 'Not found' });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error(error);
      return sendJson(res, status, { error: status >= 500 ? 'Internal server error' : error.message });
    }
  };
}
