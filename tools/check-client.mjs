import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const html = await readFile('site/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert(script, 'Inline client script is missing.');
const digest = createHash('sha256').update(script).digest('base64');
assert(html.includes('sha256-' + digest), 'Client script CSP hash does not match.');
for (const forbidden of ['api.github.com', 'unlockVault', 'DATA_REPO_TOKEN', 'SESSION_SECRET', 'Bearer ', 'github_pat_', 'ghp_']) assert(!html.includes(forbidden), 'Server-only item appears in the public HTML: ' + forbidden);
const files = await readdir('site');
assert(!files.includes('vault.json'), 'Remove the obsolete public credential vault.');
for (const name of files) {
  assert(!name.startsWith('.dev.vars') && !name.startsWith('.env') && !name.endsWith('.pem') && !name.endsWith('.key'), 'A private file is inside site/.');
  if (/\.(html|js|json|css|txt)$/.test(name)) {
    const text = await readFile('site/' + name, 'utf8');
    assert(!/(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/.test(text), 'Credential-shaped plaintext in a public file.');
  }
}
assert(html.includes("connect-src 'self';"), 'Browser connections should stay on the same origin.');
console.log('Public client passed: CSP hash, same-origin API, no GitHub token, no old vault, no server secret files.');
