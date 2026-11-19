import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

async function audit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { await audit(path); continue; }
    if (!/\.tsx?$/.test(path) || path.includes('/api/')) continue;
    const source = await readFile(path, 'utf8');
    assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|axios\.create\s*\(/, `${path}: transport must live in src/api`);
    assert.doesNotMatch(source, /from\s+['"]@\/lib\/axios['"]/, `${path}: import the shared API client`);
  }
}
await audit(resolve('src'));
console.log('PASS: application requests use src/api');
const temporary = await mkdtemp(join(tmpdir(), 'erp-api-tests-'));
try {
  const outfile = join(temporary, 'client.cjs');
  await build({ entryPoints: [resolve('src/api/client.ts')], outfile, bundle: true,
    platform: 'node', format: 'cjs', define: { 'import.meta.env.VITE_API_URL': '"https://erp.test/api"' } });
  const storage = new Map([['user', JSON.stringify({ token: 'test-token' })]]);
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key) };
  globalThis.window = { location: { href: '/employees' } };
  const api = createRequire(import.meta.url)(outfile).default;
  let request;
  api.defaults.adapter = async config => {
    request = config;
    return { data: { id: 1 }, status: 200, statusText: 'OK', headers: {}, config };
  };
  await api.get('employees/');
  assert.equal(request.baseURL, 'https://erp.test/api');
  assert.equal(request.headers.Authorization, 'Token test-token');
  await api.post('/login/', { username: 'test' });
  assert.equal(request.headers.Authorization, undefined);
  const payload = new FormData(); payload.append('name', 'Material');
  await api.post('raw-materials/', payload);
  assert.equal(request.data, payload);
  api.defaults.adapter = async config => { throw { config, response: { status: 403, data: { detail: 'Permission denied.' } } }; };
  await assert.rejects(api.get('employees/'));
  assert.ok(storage.has('user'));
  assert.equal(window.location.href, '/employees');
  api.defaults.adapter = async config => { throw { config, response: { status: 401, data: { detail: 'Invalid token.' } } }; };
  await assert.rejects(api.get('employees/'));
  assert.equal(storage.has('user'), false);
  assert.equal(window.location.href, '/');
  console.log('PASS: shared base URL, authentication, login, uploads, permission errors and expired sessions');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
