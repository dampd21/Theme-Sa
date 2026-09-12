// CI-only preparation. All actual secrets are written outside the repository.
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function main() {
  const required = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SITE_PASSWORD', 'DATA_REPO_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length) throw new Error('Setup needed: configure ' + missing.join(', ') + ' in GitHub Actions settings. No Cloudflare deployment was made.');
  if (!/^[a-f0-9]{32}$/i.test(process.env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('CLOUDFLARE_ACCOUNT_ID must be your 32-character account ID.');
  if (/^(ghp_|github_pat_)/.test(process.env.CLOUDFLARE_API_TOKEN)) throw new Error('CLOUDFLARE_API_TOKEN must be a Cloudflare token, not a GitHub token.');
  const password = process.env.SITE_PASSWORD, token = process.env.DATA_REPO_TOKEN;
  if (password.trim().length < 12 || password.length > 200) throw new Error('SITE_PASSWORD must be 12–200 characters. Choose a long, unique password.');
  if (!/^github_pat_[A-Za-z0-9_]{20,}$/.test(token) || token.length > 255) throw new Error('DATA_REPO_TOKEN must be a dedicated Fine-grained token for the private data repository.');
  if (!process.env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required so runtime secrets stay outside the repository.');
  const config = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
  for (const key of ['ARCHIVE_OWNER', 'ARCHIVE_REPO', 'ARCHIVE_BRANCH', 'ARCHIVE_PATH']) if (process.env[key]?.trim()) config.vars[key] = process.env[key].trim();
  const { ARCHIVE_OWNER: owner, ARCHIVE_REPO: repo, ARCHIVE_BRANCH: branch, ARCHIVE_PATH: path } = config.vars;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || ['.', '..'].includes(repo)) throw new Error('Archive repository coordinates are invalid.');
  if (!branch || branch.length > 150 || /[\s?#\\]/.test(branch) || branch.includes('..')) throw new Error('ARCHIVE_BRANCH is invalid.');
  if (!path.endsWith('.json') || path.length > 200 || path.split('/').some(x => !x || x === '.' || x === '..') || /[\x00-\x1f?#\\]/.test(path)) throw new Error('ARCHIVE_PATH is invalid.');
  const response = await fetch('https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo), {
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error', signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('GitHub data repository access check failed (HTTP ' + response.status + '). Check DATA_REPO_TOKEN.');
  const data = await response.json();
  if (!data.private || data.full_name?.toLowerCase() !== (owner + '/' + repo).toLowerCase()) throw new Error('The configured data repository must be the expected PRIVATE repository.');
  await writeFile('wrangler.jsonc', JSON.stringify(config, null, 2) + '\n', 'utf8');
  const secrets = { SITE_PASSWORD: password, DATA_REPO_TOKEN: token, SESSION_SECRET: randomBytes(48).toString('base64url') };
  await writeFile(join(process.env.RUNNER_TEMP, 'theme-sa-runtime-secrets.json'), JSON.stringify(secrets), { encoding: 'utf8', mode: 0o600 });
  // New signing material intentionally expires prior sessions on a new deployment.
  console.log('Cloudflare runtime settings prepared. Secret values are not printed or copied into public assets.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
