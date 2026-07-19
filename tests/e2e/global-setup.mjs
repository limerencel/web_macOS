import { build } from 'vite';
import { startServer } from '../../server/index.mjs';

export default async function globalSetup() {
  process.env.WEBOS_E2E = '1';
  await build({ logLevel: 'warn' });
  const running = await startServer({
    host: '127.0.0.1',
    port: 5173,
    serveStatic: true,
    secureCookies: false,
    appOrigin: 'http://127.0.0.1:5173',
  });
  return async () => {
    await running.close();
  };
}
