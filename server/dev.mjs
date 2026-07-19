import { createServer as createViteServer } from 'vite';
import { startServer } from './index.mjs';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const host = option('--host', '127.0.0.1');
const port = Number(option('--port', '5173'));
const api = await startServer({
  port: 8787,
  host: '127.0.0.1',
  serveStatic: false,
  appOrigin: `http://${host}:${port}`,
});
const vite = await createViteServer({
  server: { host, port, proxy: { '/api': api.origin } },
});
await vite.listen();
vite.printUrls();

const shutdown = async () => {
  await vite.close();
  await api.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', () => process.exit(0));
