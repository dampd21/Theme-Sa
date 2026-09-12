// Build-time only. Never publish the plaintext environment or put this script in site/.
// Anyone who knows SITE_PASSWORD can recover the repository token from the published vault.
import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ITERATIONS = 600000;
export const AAD = 'Theme-Sa shared repository vault v1';

export function makeVault(password, token, connection) {
  if (typeof password !== 'string' || password.trim().length < 12 || password.length > 200) {
    throw new Error('SITE_PASSWORD must contain 12–200 characters. Use a long, unique password.');
  }
  if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token || '') || token.length > 255) {
    throw new Error('DATA_REPO_TOKEN must be a dedicated Fine-grained token. Classic tokens are not supported in a shared vault.');
  }
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256');
  const clear = Buffer.from(JSON.stringify({ version: 1, token, ...connection }), 'utf8');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(AAD));
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Web Crypto expects the authentication tag appended to the ciphertext.
  const vault = {
    version: 1,
    algorithm: 'PBKDF2-SHA256/AES-256-GCM',
    iterations: ITERATIONS,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64')
  };
  // Fail closed if the build-time round trip does not reproduce the exact payload.
  const check = createDecipheriv('aes-256-gcm', key, iv);
  check.setAAD(Buffer.from(AAD));
  check.setAuthTag(tag);
  const decoded = Buffer.concat([check.update(encrypted), check.final()]);
  if (!decoded.equals(clear)) throw new Error('Encrypted vault round-trip verification failed.');
  key.fill(0); clear.fill(0); decoded.fill(0);
  return vault;
}

async function main() {
  const password = process.env.SITE_PASSWORD;
  const token = process.env.DATA_REPO_TOKEN;
  if (!password || !token) {
    throw new Error('Setup needed: add SITE_PASSWORD and DATA_REPO_TOKEN in Settings > Secrets and variables > Actions > Secrets, then run this workflow again. No new site was deployed.');
  }
  const configSource = await readFile('site/config.js', 'utf8');
  const match = configSource.match(/Object\.freeze\(\s*(\{[\s\S]*?\})\s*\)/);
  if (!match) throw new Error('Public repository configuration could not be read.');
  const c = JSON.parse(match[1]);
  const connection = { owner: c.owner, repo: c.repo, branch: c.branch, path: c.path };
  if (Object.values(connection).some(v => typeof v !== 'string' || !v)) throw new Error('Repository coordinates are incomplete.');
  const vault = makeVault(password, token, connection);
  // Check the actual token's access without modifying team records.
  const repoUrl = 'https://api.github.com/repos/' + encodeURIComponent(c.owner) + '/' + encodeURIComponent(c.repo);
  const response = await fetch(repoUrl, {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(20000), redirect: 'error'
  });
  if (!response.ok) throw new Error('DATA_REPO_TOKEN cannot access the configured data repository (HTTP ' + response.status + ').');
  const repo = await response.json();
  if (!repo.private) throw new Error('The data repository must remain PRIVATE.');
  if (repo.full_name.toLowerCase() !== (c.owner + '/' + c.repo).toLowerCase()) throw new Error('Unexpected data repository identity.');
  await mkdir('site', { recursive: true });
  await writeFile('site/vault.json', JSON.stringify(vault, null, 2) + '\n', 'utf8');
  // Never log either secret, derived keys, or decrypted payloads.
  console.log('Encrypted shared-login vault created for the private data repository.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
