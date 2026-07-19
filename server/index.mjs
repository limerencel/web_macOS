import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { createDatabase } from './db.mjs';
import { createAppHandler } from './app.mjs';
import { hashPassword } from './security.mjs';

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)));

export function createConfig(overrides = {}) {
  const e2e = process.env.WEBOS_E2E === '1';
  const dataDir = overrides.dataDir ?? process.env.WEBOS_DATA_DIR ?? (e2e
    ? join(tmpdir(), `webos-e2e-${process.pid}`)
    : join(rootDir, 'data'));
  return {
    port: Number(overrides.port ?? process.env.PORT ?? 8787),
    host: overrides.host ?? process.env.HOST ?? '127.0.0.1',
    dataDir,
    distDir: overrides.distDir ?? join(rootDir, 'dist'),
    serveStatic: overrides.serveStatic ?? process.env.NODE_ENV === 'production',
    secureCookies: overrides.secureCookies ?? (process.env.WEBOS_SECURE_COOKIES === 'true' || process.env.NODE_ENV === 'production'),
    appOrigin: overrides.appOrigin ?? process.env.WEBOS_APP_ORIGIN ?? '',
    setupToken: overrides.setupToken ?? process.env.WEBOS_SETUP_TOKEN ?? randomUUID(),
    sessionTtlMs: Number(overrides.sessionTtlMs ?? process.env.WEBOS_SESSION_TTL_MS ?? 12 * 60 * 60_000),
    idleTimeoutMs: Number(overrides.idleTimeoutMs ?? process.env.WEBOS_IDLE_TIMEOUT_MS ?? 30 * 60_000),
    e2e,
  };
}

export async function startServer(overrides = {}) {
  const config = createConfig(overrides);
  mkdirSync(config.dataDir, { recursive: true });
  const db = createDatabase({ dataDir: config.dataDir, memory: overrides.memory === true });

  if (config.e2e && !db.getUser()) {
    db.createUser({
      username: 'codex',
      displayName: 'Codex Test User',
      avatarData: null,
      lockWallpaperData: null,
      passwordHash: hashPassword('WebOS-Test-Password-123'),
    });
  }

  const server = createServer(createAppHandler({ db, config }));
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  const origin = `http://${config.host}:${port}`;

  if (!db.getUser()) console.log(`[webos] First-run setup token: ${config.setupToken}`);
  console.log(`[webos] Server listening at ${origin}`);
  if (config.serveStatic && !existsSync(config.distDir)) {
    console.warn(`[webos] Static build not found at ${config.distDir}; run npm run build first.`);
  }

  return {
    server,
    db,
    config,
    origin,
    async close() {
      await new Promise((resolvePromise) => server.close(resolvePromise));
      db.close();
    },
  };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const running = await startServer();
  const shutdown = async () => {
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
