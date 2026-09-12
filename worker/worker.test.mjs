import test from 'node:test';
import assert from 'node:assert/strict';
import worker from './index.mjs';

export function fakeEnvironment() {
  return { SITE_PASSWORD: 'Synthetic-server-password-9284', DATA_REPO_TOKEN: 'github_pat_' + 'x'.repeat(48), SESSION_SECRET: 'synthetic-session-secret-' + 's'.repeat(40), ARCHIVE_OWNER: 'test-owner', ARCHIVE_REPO: 'private-data', ARCHIVE_BRANCH: 'main', ARCHIVE_PATH: 'data/team.json', SESSION_HOURS: '12', LOGIN_RATE_LIMITER: { limit: async () => ({ success: true }) }, API_RATE_LIMITER: { limit: async () => ({ success: true }) }, ASSETS: { fetch: async () => new Response('<!doctype html><title>Public shell</title>', { headers: { 'Content-Type': 'text/html' } }) } };
}
const blank = () => ({ version: 1, teamName: '퇴마사', leaderId: null, updatedAt: null, members: [] });
const member = (id = 'a') => ({ id, name: '테스트 팀원', gender: '비공개', age: '30', birthYear: '1996', school: '', grade: '', classroom: '', position: '관리', abilities: ['퇴마', '예지'], address: '', memo: '가상 기록', createdAt: new Date().toISOString() });
const origin = 'https://theme-sa.test';
function request(path, { method = 'GET', cookie, body, from = origin, headers = {} } = {}) {
  const h = { ...headers }; if (cookie) h.Cookie = cookie; if (method !== 'GET' && method !== 'HEAD') { if (from !== null) h.Origin = from; if (!h['Content-Type']) h['Content-Type'] = 'application/json'; }
  return new Request(origin + path, { method, headers: h, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) });
}
const sessionCookie = r => r.headers.get('Set-Cookie')?.split(';')[0];
async function login(env) {
  const r = await worker.fetch(request('/api/login', { method: 'POST', body: { password: env.SITE_PASSWORD } }), env);
  assert.equal(r.status, 200); return sessionCookie(r);
}
function githubMock(env) {
  let state = blank(), sha = 'a'.repeat(40), exists = true, privateRepo = true, sequence = 1, readOnly = false, corrupt = false;
  const calls = [];
  const fetcher = async (url, options = {}) => {
    const u = new URL(url); calls.push({ url: u, options });
    assert.equal(u.hostname, 'api.github.com'); assert.equal(options.headers.Authorization, 'Bearer ' + env.DATA_REPO_TOKEN);
    const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/repos/test-owner/private-data') return response(200, { private: privateRepo, full_name: 'test-owner/private-data' });
    if (u.pathname.includes('/branches/')) return response(200, { name: 'main' });
    assert.equal(u.pathname, '/repos/test-owner/private-data/contents/data/team.json');
    if (options.method === 'PUT') {
      if (readOnly) return response(403, {});
      const update = JSON.parse(options.body);
      if ((exists && update.sha !== sha) || (!exists && update.sha)) return response(409, {});
      state = JSON.parse(Buffer.from(update.content, 'base64').toString('utf8')); sha = (++sequence).toString(16).padStart(40, '0'); exists = true;
      return response(200, { content: { sha } });
    }
    if (!exists) return response(404, {});
    return response(200, { type: 'file', encoding: 'base64', sha, size: Buffer.byteLength(JSON.stringify(state)), content: Buffer.from(corrupt ? 'not json' : JSON.stringify(state)).toString('base64') });
  };
  return { fetcher, calls, get state() { return structuredClone(state); }, get sha() { return sha; }, setExists(v) { exists = v; }, setPrivate(v) { privateRepo = v; }, setReadOnly(v) { readOnly = v; }, setCorrupt(v) { corrupt = v; } };
}

test('server session, private archive, validation and credential boundary', async t => {
  const env = fakeEnvironment(), mock = githubMock(env), original = globalThis.fetch;
  globalThis.fetch = mock.fetcher; t.after(() => { globalThis.fetch = original; });
  const publicPage = await worker.fetch(request('/'), env);
  assert.equal(publicPage.status, 200); assert.equal(publicPage.headers.get('X-Frame-Options'), 'DENY');
  assert.equal((await worker.fetch(request('/vault.json'), env)).status, 404);
  assert.equal((await worker.fetch(request('/worker/index.mjs'), env)).status, 404);
  assert.equal((await worker.fetch(request('/.dev.vars'), env)).status, 404);
  assert.equal((await worker.fetch(request('/api/archive'), env)).status, 401); assert.equal(mock.calls.length, 0);
  const anonymous = await worker.fetch(request('/api/session'), env); assert.deepEqual(await anonymous.json(), { authenticated: false });
  const wrong = await worker.fetch(request('/api/login', { method: 'POST', body: { password: 'not the password' } }), env);
  assert.equal(wrong.status, 401); assert.equal(mock.calls.length, 0);
  const loggedIn = await worker.fetch(request('/api/login', { method: 'POST', body: { password: env.SITE_PASSWORD } }), env);
  assert.equal(loggedIn.status, 200); const setCookie = loggedIn.headers.get('Set-Cookie');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) assert(setCookie.includes(flag));
  assert(setCookie.startsWith('__Host-theme_sa='));
  const cookie = sessionCookie(loggedIn), payload = await loggedIn.json();
  assert.equal(payload.authenticated, true); assert(!JSON.stringify(payload).includes(env.DATA_REPO_TOKEN)); assert(!setCookie.includes(env.SITE_PASSWORD));
  const restored = await worker.fetch(request('/api/session', { cookie }), env);
  assert.equal((await restored.json()).authenticated, true);
  const loaded = await worker.fetch(request('/api/archive', { cookie }), env);
  assert.equal(loaded.status, 200); assert(loaded.headers.get('Cache-Control').includes('no-store'));
  const archive = await loaded.json(); assert.deepEqual(archive.state, blank());
  assert(!JSON.stringify(archive).includes(env.DATA_REPO_TOKEN));
  const next = blank(); next.members = [member()]; next.leaderId = 'a';
  const saved = await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: next, sha: archive.sha, path: 'unauthorized.json' } }), env);
  assert.equal(saved.status, 200); const savedData = await saved.json(); assert.equal(savedData.state.members.length, 1); assert(savedData.state.updatedAt); assert.equal(mock.state.members[0].memo, '가상 기록');
  const conflict = await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: next, sha: archive.sha } }), env);
  assert.equal(conflict.status, 409); assert.equal(mock.state.members.length, 1);
  const removed = await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: blank(), sha: savedData.sha } }), env);
  assert.equal(removed.status, 200); assert.equal(mock.state.members.length, 0);
  const malformed = structuredClone(next); malformed.members[0].memo = 'x'.repeat(1501);
  const before = mock.calls.length;
  assert.equal((await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: malformed, sha: mock.sha } }), env)).status, 400); assert.equal(mock.calls.length, before);
  assert.equal((await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: next, sha: 'bad' } }), env)).status, 400);
  assert.equal((await worker.fetch(request('/api/archive', { method: 'DELETE', cookie }), env)).status, 405);
  assert.equal((await worker.fetch(request('/api/login', { method: 'POST', body: 'x'.repeat(4100) }), env)).status, 413);
  assert.equal((await worker.fetch(request('/api/login', { method: 'POST', body: 'bad-json' }), env)).status, 400);
  assert.equal((await worker.fetch(request('/api/login', { method: 'POST', body: 'x', headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
  mock.setPrivate(false); assert.equal((await worker.fetch(request('/api/archive', { cookie }), env)).status, 503); mock.setPrivate(true);
  mock.setReadOnly(true); assert.equal((await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: next, sha: mock.sha } }), env)).status, 503); mock.setReadOnly(false);
  mock.setCorrupt(true); assert.equal((await worker.fetch(request('/api/archive', { cookie }), env)).status, 502); mock.setCorrupt(false);
  mock.setExists(false); const missing = await worker.fetch(request('/api/archive', { cookie }), env); assert.equal(missing.status, 404); assert.equal((await missing.json()).error.code, 'ARCHIVE_NOT_INITIALIZED');
  const init = await worker.fetch(request('/api/archive', { method: 'PUT', cookie, body: { state: blank(), sha: null } }), env); assert.equal(init.status, 200);
  const logout = await worker.fetch(request('/api/logout', { method: 'POST', cookie, body: {} }), env); assert.equal(logout.status, 200); assert(logout.headers.get('Set-Cookie').includes('Max-Age=0'));
});

test('CSRF, tampered/expired sessions, password changes and login protection', async () => {
  const env = fakeEnvironment(), cookie = await login(env);
  for (const path of ['/api/login', '/api/logout', '/api/archive']) {
    assert.equal((await worker.fetch(request(path, { method: path === '/api/archive' ? 'PUT' : 'POST', cookie, from: 'https://attacker.test', body: { password: env.SITE_PASSWORD } }), env)).status, 403);
    assert.equal((await worker.fetch(request(path, { method: 'POST', cookie, from: null, body: {} }), env)).status, 403);
  }
  assert.equal((await worker.fetch(request('/api/session', { cookie, headers: { 'Sec-Fetch-Site': 'cross-site' } }), env)).status, 403);
  const parts = cookie.split('.'); parts[parts.length - 1] = (parts.at(-1)[0] === 'a' ? 'b' : 'a') + parts.at(-1).slice(1);
  assert.equal((await worker.fetch(request('/api/archive', { cookie: parts.join('.') }), env)).status, 401);
  const other = new Request('https://another-site.test/api/archive', { headers: { Cookie: cookie } }); assert.equal((await worker.fetch(other, env)).status, 401);
  const changed = { ...env, SITE_PASSWORD: 'A-different-valid-password-3928' }; assert.equal((await worker.fetch(request('/api/archive', { cookie }), changed)).status, 401);
  const now = Date.now; try { Date.now = () => now() + 13 * 3600000; assert.equal((await worker.fetch(request('/api/archive', { cookie }), env)).status, 401); } finally { Date.now = now; }
  const limited = { ...env, LOGIN_RATE_LIMITER: { limit: async () => ({ success: false }) } };
  const limit = await worker.fetch(request('/api/login', { method: 'POST', body: { password: env.SITE_PASSWORD } }), limited); assert.equal(limit.status, 429); assert.equal(limit.headers.get('Retry-After'), '60');
  const apiLimited = { ...env, API_RATE_LIMITER: { limit: async () => ({ success: false }) } }; assert.equal((await worker.fetch(request('/api/archive', { cookie }), apiLimited)).status, 429);
  assert.equal((await worker.fetch(request('/api/session'), { ...env, SITE_PASSWORD: '' })).status, 503);
  assert.equal((await worker.fetch(request('/api/session'), { ...env, DATA_REPO_TOKEN: 'ghp_' + 'a'.repeat(36) })).status, 503);
  assert.equal((await worker.fetch(request('/api/login', { method: 'POST', body: { password: env.SITE_PASSWORD } }), { ...env, LOGIN_RATE_LIMITER: undefined })).status, 503);
});
