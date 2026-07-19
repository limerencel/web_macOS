import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../server/index.mjs';

const dataDir = mkdtempSync(join(tmpdir(), 'webos-api-test-'));
let running;
let cookie = '';
let csrf = '';

async function request(path, { method = 'GET', body, authenticated = true } = {}) {
  const headers = { Origin: running.origin };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (authenticated && cookie) headers.Cookie = cookie;
  if (authenticated && csrf && ['POST', 'PATCH', 'DELETE'].includes(method)) headers['X-CSRF-Token'] = csrf;
  const response = await fetch(`${running.origin}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';', 1)[0];
  const payload = response.status === 204 ? null : await response.json();
  return { response, payload };
}

before(async () => {
  running = await startServer({
    host: '127.0.0.1',
    port: 0,
    memory: true,
    dataDir,
    setupToken: 'test-setup-token',
    serveStatic: false,
    secureCookies: false,
  });
});

after(async () => {
  await running.close();
  rmSync(dataDir, { recursive: true, force: true });
});

test('initializes the single owner and creates a protected session', async () => {
  const initial = await request('/api/auth/session', { authenticated: false });
  assert.equal(initial.response.status, 200);
  assert.equal(initial.payload.setupRequired, true);

  const setup = await request('/api/auth/setup', {
    method: 'POST',
    authenticated: false,
    body: {
      setupToken: 'test-setup-token',
      username: 'owner',
      displayName: 'WebOS Owner',
      password: 'correct horse battery staple',
      avatarData: null,
    },
  });
  assert.equal(setup.response.status, 201);
  assert.equal(setup.payload.authenticated, true);
  assert.equal(setup.payload.profile.username, 'owner');
  csrf = setup.payload.csrfToken;

  const session = await request('/api/auth/session');
  assert.equal(session.payload.authenticated, true);
  assert.equal(session.payload.profile.displayName, 'WebOS Owner');
});

test('protects private APIs and enforces CSRF on writes', async () => {
  const anonymous = await fetch(`${running.origin}/api/apps`);
  assert.equal(anonymous.status, 401);

  const response = await fetch(`${running.origin}/api/apps`, {
    method: 'POST',
    headers: { Origin: running.origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(response.status, 403);
});

test('creates, updates, reorders, and deletes dashboard applications', async () => {
  const first = await request('/api/apps', {
    method: 'POST',
    body: {
      name: 'Notes',
      url: 'https://notes.example.com',
      description: 'Private notes',
      category: 'Productivity',
      icon: { type: 'preset', value: 'notes' },
      launchMode: 'external',
      pinnedToDock: true,
    },
  });
  assert.equal(first.response.status, 201);
  assert.equal(first.payload.app.name, 'Notes');

  const second = await request('/api/apps', {
    method: 'POST',
    body: {
      name: 'Files',
      url: 'https://files.example.com',
      description: '',
      category: 'Storage',
      icon: { type: 'preset', value: 'files' },
      launchMode: 'embed',
      pinnedToDock: false,
    },
  });
  assert.equal(second.response.status, 201);

  const updated = await request(`/api/apps/${first.payload.app.id}`, {
    method: 'PATCH',
    body: { description: 'Knowledge base', pinnedToDock: false },
  });
  assert.equal(updated.payload.app.description, 'Knowledge base');
  assert.equal(updated.payload.app.pinnedToDock, false);

  const reordered = await request('/api/apps/reorder', {
    method: 'POST',
    body: { ids: [second.payload.app.id, first.payload.app.id] },
  });
  assert.deepEqual(reordered.payload.apps.map((app) => app.id), [second.payload.app.id, first.payload.app.id]);

  const removed = await request(`/api/apps/${first.payload.app.id}`, { method: 'DELETE' });
  assert.equal(removed.response.status, 204);
});

test('persists settings, profile data, and protected icons', async () => {
  const settings = await request('/api/settings', {
    method: 'PATCH',
    body: { appearance: 'dark', accent: 'purple' },
  });
  assert.equal(settings.payload.settings.accent, 'purple');

  const profile = await request('/api/profile', {
    method: 'PATCH',
    body: { displayName: 'Private Owner' },
  });
  assert.equal(profile.payload.profile.displayName, 'Private Owner');

  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  const icon = await request('/api/icons', { method: 'POST', body: { dataUrl: pixel } });
  assert.equal(icon.response.status, 201);
  const iconResponse = await fetch(`${running.origin}${icon.payload.url}`, { headers: { Cookie: cookie } });
  assert.equal(iconResponse.status, 200);
  assert.equal(iconResponse.headers.get('content-type'), 'image/png');
});

test('locks the session and supports password login', async () => {
  const locked = await request('/api/auth/lock', { method: 'POST' });
  assert.equal(locked.response.status, 204);
  cookie = '';
  csrf = '';

  const wrong = await request('/api/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { password: 'incorrect-password' },
  });
  assert.equal(wrong.response.status, 401);

  const login = await request('/api/auth/login', {
    method: 'POST',
    authenticated: false,
    body: { password: 'correct horse battery staple' },
  });
  assert.equal(login.response.status, 200);
  csrf = login.payload.csrfToken;
  assert.equal(login.payload.profile.displayName, 'Private Owner');
});
