const COOKIE = '__Host-theme_sa';
const LIMIT = 900000;
const encoder = new TextEncoder();
const EMPTY = () => ({ version: 1, teamName: '퇴마사', leaderId: null, members: [], updatedAt: null });
export class HttpError extends Error {
  constructor(status, code, message, headers = {}) { super(message); this.status = status; this.code = code; this.headers = headers; }
}
const fail = (status, code, message, headers) => { throw new HttpError(status, code, message, headers); };
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store, private', ...extra } });
}
function headers(response, request) {
  const out = new Response(response.body, response);
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('Referrer-Policy', 'no-referrer');
  out.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'none'; object-src 'none'");
  if (new URL(request.url).protocol === 'https:') out.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return out;
}
function connection(env) {
  const c = { owner: env.ARCHIVE_OWNER, repo: env.ARCHIVE_REPO, branch: env.ARCHIVE_BRANCH || 'main', path: env.ARCHIVE_PATH || 'data/team.json' };
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(c.owner || '') || !/^[A-Za-z0-9_.-]{1,100}$/.test(c.repo || '') || ['.', '..'].includes(c.repo)) fail(503, 'CONFIGURATION', '관리자가 기록 저장소 설정을 확인해야 합니다.');
  if (typeof c.branch !== 'string' || !c.branch || c.branch.length > 150 || /[\s?#\\]/.test(c.branch) || c.branch.includes('..')) fail(503, 'CONFIGURATION', '기록 브랜치 설정을 확인해 주세요.');
  if (typeof c.path !== 'string' || c.path.length > 200 || !c.path.endsWith('.json') || c.path.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f?#\\]/.test(c.path)) fail(503, 'CONFIGURATION', '기록 경로 설정을 확인해 주세요.');
  return c;
}
function configured(env) {
  if (typeof env.SITE_PASSWORD !== 'string' || env.SITE_PASSWORD.trim().length < 12 || env.SITE_PASSWORD.length > 200 || typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32 || !/^github_pat_[A-Za-z0-9_]{20,}$/.test(env.DATA_REPO_TOKEN || '') || env.DATA_REPO_TOKEN.length > 255) fail(503, 'SETUP_REQUIRED', 'Cloudflare 서버 설정이 아직 준비되지 않았어요. 관리자에게 알려 주세요.');
  connection(env);
}
function base64url(bytes) { let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unbase64url(value) { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding'); return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0)); }
async function signingKey(env) {
  const raw = await crypto.subtle.digest('SHA-256', encoder.encode('theme-sa-session-v1\0' + env.SESSION_SECRET + '\0' + env.SITE_PASSWORD));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function passwordMatches(input, env) {
  const key = await signingKey(env);
  const expected = await crypto.subtle.sign('HMAC', key, encoder.encode('password-check\0' + env.SITE_PASSWORD));
  return crypto.subtle.verify('HMAC', key, expected, encoder.encode('password-check\0' + input));
}
function cookie(value, seconds) { return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`; }
async function issueSession(request, env) {
  const hours = Math.min(24, Math.max(1, Number(env.SESSION_HOURS) || 12));
  const now = Math.floor(Date.now() / 1000), exp = now + hours * 3600;
  const payload = { v: 1, iat: now, exp, aud: new URL(request.url).origin, jti: base64url(crypto.getRandomValues(new Uint8Array(16))) };
  const encoded = base64url(encoder.encode(JSON.stringify(payload)));
  const signature = base64url(await crypto.subtle.sign('HMAC', await signingKey(env), encoder.encode(encoded)));
  return { payload, cookie: cookie(encoded + '.' + signature, exp - now) };
}
async function sessionFor(request, env) {
  const value = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!value || value.length > 1500) return null;
  try {
    const parts = value.split('.'); if (parts.length !== 2) return null;
    if (!(await crypto.subtle.verify('HMAC', await signingKey(env), unbase64url(parts[1]), encoder.encode(parts[0])))) return null;
    const payload = JSON.parse(new TextDecoder().decode(unbase64url(parts[0]))), now = Math.floor(Date.now() / 1000);
    if (payload.v !== 1 || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= now || payload.iat > now + 30 || payload.exp - payload.iat > 86400 || payload.exp <= payload.iat || payload.aud !== new URL(request.url).origin || !/^[A-Za-z0-9_-]{20,30}$/.test(payload.jti || '')) return null;
    return payload;
  } catch { return null; }
}
function sameOrigin(request, mutate = false) {
  const origin = request.headers.get('Origin');
  if (request.headers.get('Sec-Fetch-Site') === 'cross-site' || (origin && origin !== new URL(request.url).origin) || (mutate && !origin)) fail(403, 'ORIGIN_REJECTED', '이 홈페이지에서 보낸 요청만 처리할 수 있어요.');
}
async function readJson(request, max = LIMIT + 20000) {
  if (!(request.headers.get('Content-Type') || '').toLowerCase().startsWith('application/json')) fail(415, 'JSON_REQUIRED', 'JSON 요청만 지원합니다.');
  const length = Number(request.headers.get('Content-Length'));
  if (length > max) fail(413, 'TOO_LARGE', '요청이 너무 커요.');
  if (!request.body) fail(400, 'INVALID_JSON', '요청 내용이 없어요.');
  const reader = request.body.getReader(); const chunks = []; let size = 0;
  try { while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > max) { await reader.cancel(); fail(413, 'TOO_LARGE', '요청이 너무 커요.'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const all = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  try { const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(all)); if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(); return data; } catch { fail(400, 'INVALID_JSON', '올바른 JSON 요청이 아니에요.'); }
}
function text(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, 'VALIDATION', label + ' 형식을 확인해 주세요.'); return value.trim();
}
function numberText(value, min, max, label) {
  if (value === '' || value === null || value === undefined) return '';
  const s = String(value); if (!/^\d+$/.test(s) || Number(s) < min || Number(s) > max) fail(400, 'VALIDATION', label + ' 범위를 확인해 주세요.'); return s;
}
export function validateState(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.members) || data.members.length > 300) fail(400, 'VALIDATION', '지원하는 기록 형식이 아니거나 팀원이 300명을 초과했어요.');
  const teamName = text(data.teamName, 30, '팀명', true), ids = new Set();
  const members = data.members.map(m => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) fail(400, 'VALIDATION', '팀원 정보를 확인해 주세요.');
    const id = text(m.id, 100, '기록 ID', true); if (ids.has(id)) fail(400, 'VALIDATION', '중복된 기록 ID가 있어요.'); ids.add(id);
    const gender = text(m.gender ?? '', 10, '성별'); if (!['', '여자', '남자', '기타', '비공개'].includes(gender)) fail(400, 'VALIDATION', '성별 선택값을 확인해 주세요.');
    if (!Array.isArray(m.abilities) || m.abilities.length > 12) fail(400, 'VALIDATION', '능력은 12개까지 기록할 수 있어요.');
    return { id, name: text(m.name, 30, '이름', true), gender, age: numberText(m.age, 1, 120, '나이'), birthYear: numberText(m.birthYear, 1900, 2100, '출생 연도'), school: text(m.school ?? '', 70, '학교'), grade: numberText(m.grade, 1, 12, '학년'), classroom: text(m.classroom ?? '', 15, '반'), position: text(m.position ?? '', 40, '역할'), abilities: [...new Set(m.abilities.map(a => text(a, 30, '능력', true)))], address: text(m.address ?? '', 200, '주소'), memo: text(m.memo ?? '', 1500, '메모'), createdAt: typeof m.createdAt === 'string' && Number.isFinite(Date.parse(m.createdAt)) ? new Date(m.createdAt).toISOString() : new Date().toISOString() };
  });
  if ((members.length && !ids.has(data.leaderId)) || (!members.length && data.leaderId !== null)) fail(400, 'VALIDATION', '팀장 지정을 확인해 주세요.');
  const result = { version: 1, teamName, leaderId: members.length ? data.leaderId : null, members, updatedAt: typeof data.updatedAt === 'string' && Number.isFinite(Date.parse(data.updatedAt)) ? new Date(data.updatedAt).toISOString() : null };
  if (encoder.encode(JSON.stringify(result, null, 2) + '\n').byteLength > LIMIT) fail(413, 'TOO_LARGE', '기록은 900KB 이하로 저장해 주세요.'); return result;
}
const repoPath = c => '/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo);
const filePath = c => repoPath(c) + '/contents/' + c.path.split('/').map(encodeURIComponent).join('/');
async function github(path, env, method = 'GET', body) {
  let response;
  try { response = await fetch('https://api.github.com' + path, { method, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + env.DATA_REPO_TOKEN, 'User-Agent': 'Theme-Sa-Cloudflare', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000) }); } catch { fail(502, 'UPSTREAM_NETWORK', 'GitHub 연결이 지연되고 있어요. 저장 요청이었다면 최신 기록을 확인한 뒤 다시 시도해 주세요.'); }
  if (response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0') fail(429, 'GITHUB_RATE_LIMIT', 'GitHub 요청 제한에 도달했어요. 잠시 후 다시 시도해 주세요.', { 'Retry-After': '60' });
  if (response.status === 401 || response.status === 403) fail(503, 'GITHUB_PERMISSION', '관리자가 GitHub 연결키의 만료·권한과 저장소 규칙을 확인해야 합니다.');
  if (response.status === 409 || response.status === 422) fail(409, 'CONFLICT', '다른 사람이 먼저 저장했거나 저장소 규칙에 따라 변경이 거절됐어요. 최신 기록을 확인해 주세요.');
  if (response.status === 404) return { missing: true };
  if (!response.ok) fail(502, 'UPSTREAM_FAILURE', 'GitHub가 요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.');
  try { return await response.json(); } catch { fail(502, 'UPSTREAM_FAILURE', 'GitHub 응답을 읽지 못했어요.'); }
}
async function privateRepo(env) {
  const c = connection(env), repo = await github(repoPath(c), env);
  if (repo.missing || typeof repo.full_name !== 'string' || repo.full_name.toLowerCase() !== (c.owner + '/' + c.repo).toLowerCase()) fail(503, 'GITHUB_REPOSITORY', '기록 저장소 주소와 연결키 권한을 확인해 주세요.');
  if (!repo.private) fail(503, 'PUBLIC_REPOSITORY', '개인정보 보호를 위해 공개 저장소 접근을 중단했어요. 기록 저장소를 비공개로 바꿔 주세요.');
  return c;
}
async function getArchive(env) {
  const c = await privateRepo(env), file = await github(filePath(c) + '?ref=' + encodeURIComponent(c.branch) + '&_=' + Date.now(), env);
  if (file.missing) { const branch = await github(repoPath(c) + '/branches/' + encodeURIComponent(c.branch), env); if (branch.missing) fail(503, 'GITHUB_BRANCH', '기록 브랜치를 찾지 못했어요.'); fail(404, 'ARCHIVE_NOT_INITIALIZED', '아직 팀 기록 파일이 없어요.'); }
  if (file.type !== 'file' || file.encoding !== 'base64' || typeof file.content !== 'string' || file.size > LIMIT || !/^[a-f0-9]{40,64}$/.test(file.sha || '')) fail(502, 'ARCHIVE_FORMAT', 'GitHub 기록 파일 형식을 확인해 주세요.');
  let state;
  try { const bytes = Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0)); if (bytes.length > LIMIT) throw new Error(); state = validateState(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); } catch { fail(502, 'ARCHIVE_CORRUPT', '기록 파일을 읽지 못했어요. 기존 파일은 덮어쓰지 않았습니다.'); }
  return { state, sha: file.sha, connection: c };
}
function encodeState(state) { const bytes = encoder.encode(JSON.stringify(state, null, 2) + '\n'); if (bytes.length > LIMIT) fail(413, 'TOO_LARGE', '기록은 900KB 이하로 저장해 주세요.'); let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(binary); }
async function putArchive(request, env) {
  const body = await readJson(request);
  if (body.sha !== null && !/^[a-f0-9]{40,64}$/.test(body.sha || '')) fail(400, 'INVALID_SHA', '기록 버전이 올바르지 않아요. 최신 기록을 불러와 주세요.');
  const state = validateState(body.state); state.updatedAt = new Date().toISOString();
  const c = await privateRepo(env);
  const update = { message: body.sha ? 'Update team archive via Cloudflare' : 'Initialize private team archive', content: encodeState(state), branch: c.branch };
  if (body.sha) update.sha = body.sha;
  const result = await github(filePath(c), env, 'PUT', update);
  if (result.missing) fail(503, 'GITHUB_REPOSITORY', '기록 저장소에 저장할 수 없어요.');
  if (!/^[a-f0-9]{40,64}$/.test(result.content?.sha || '')) fail(502, 'SAVE_UNCONFIRMED', '저장 응답을 확인하지 못했어요. 최신 기록을 확인해 주세요.');
  return { state, sha: result.content.sha, connection: c };
}
async function apiRoute(request, env) {
  const path = new URL(request.url).pathname, method = request.method;
  const write = !['GET', 'HEAD'].includes(method);
  sameOrigin(request, write);
  if (path === '/api/logout') {
    if (method !== 'POST') fail(405, 'METHOD', '지원하지 않는 요청이에요.');
    return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  configured(env);
  if (path === '/api/login') {
    if (method !== 'POST') fail(405, 'METHOD', '지원하지 않는 요청이에요.');
    if (!env.LOGIN_RATE_LIMITER?.limit) fail(503, 'RATE_LIMIT_SETUP', '로그인 보호 설정이 준비되지 않았어요.');
    // Login has no authenticated user ID; this limits attempts per connection IP and location.
    // Shared networks may temporarily share this quota; the server returns a short retry window.
    const ip = request.headers.get('CF-Connecting-IP') || 'local-development';
    const key = base64url(await crypto.subtle.digest('SHA-256', encoder.encode('login:' + ip)));
    if (!(await env.LOGIN_RATE_LIMITER.limit({ key })).success) fail(429, 'LOGIN_RATE_LIMIT', '로그인 시도가 많아요. 1분 후 다시 시도해 주세요.', { 'Retry-After': '60' });
    const body = await readJson(request, 4096);
    if (typeof body.password !== 'string' || body.password.length < 1 || body.password.length > 200 || !(await passwordMatches(body.password, env))) fail(401, 'BAD_PASSWORD', '비밀번호가 맞지 않아요. 다시 확인해 주세요.');
    const issued = await issueSession(request, env);
    return json({ authenticated: true, expiresAt: issued.payload.exp * 1000, connection: connection(env) }, 200, { 'Set-Cookie': issued.cookie });
  }
  const session = await sessionFor(request, env);
  if (path === '/api/session') {
    if (method !== 'GET') fail(405, 'METHOD', '지원하지 않는 요청이에요.');
    return session ? json({ authenticated: true, expiresAt: session.exp * 1000, connection: connection(env) }) : json({ authenticated: false }, 200, { 'Set-Cookie': cookie('', 0) });
  }
  if (!session) fail(401, 'SESSION_REQUIRED', '로그인 시간이 만료됐어요. 비밀번호를 다시 입력해 주세요.', { 'Set-Cookie': cookie('', 0) });
  if (path !== '/api/archive') fail(404, 'NOT_FOUND', '요청한 기능을 찾을 수 없어요.');
  if (!['GET', 'PUT'].includes(method)) fail(405, 'METHOD', '지원하지 않는 요청이에요.');
  if (!env.API_RATE_LIMITER?.limit) fail(503, 'RATE_LIMIT_SETUP', '서버 요청 보호 설정이 준비되지 않았어요.');
  if (!(await env.API_RATE_LIMITER.limit({ key: session.jti })).success) fail(429, 'API_RATE_LIMIT', '요청이 많아요. 잠시 후 다시 시도해 주세요.', { 'Retry-After': '60' });
  return json(method === 'GET' ? await getArchive(env) : await putArchive(request, env));
}
export default {
  async fetch(request, env) {
    let response;
    try {
      const url = new URL(request.url);
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) response = await apiRoute(request, env);
      else if (url.pathname === '/vault.json' || url.pathname.startsWith('/worker/') || url.pathname.startsWith('/tools/') || /(^|\/)\.(?!well-known\/)/.test(url.pathname)) response = new Response('Not found', { status: 404 });
      else if (request.method !== 'GET' && request.method !== 'HEAD') response = new Response('Method not allowed', { status: 405 });
      else {
        response = await env.ASSETS.fetch(request);
        response = new Response(response.body, response);
        if ((response.headers.get('Content-Type') || '').includes('text/html')) response.headers.set('Cache-Control', 'no-cache');
      }
    } catch (error) {
      if (error instanceof HttpError) response = json({ error: { code: error.code, message: error.message } }, error.status, error.headers);
      else response = json({ error: { code: 'SERVER_ERROR', message: '서버가 요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.' } }, 500);
      // Deliberately do not log credentials, cookies, password bodies, or team records.
    }
    return headers(response, request);
  }
};
