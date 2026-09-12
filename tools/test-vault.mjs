// Synthetic test values only. This file does not read production credentials.
import assert from 'node:assert/strict';
import { pbkdf2Sync, createDecipheriv } from 'node:crypto';
import { makeVault, AAD, ITERATIONS } from './build-vault.mjs';

const password = 'Synthetic-test-password-9284';
const token = 'github_pat_' + 'x'.repeat(48);
const connection = { owner: 'test-owner', repo: 'private-test-data', branch: 'main', path: 'data/team.json' };
function open(vault, pass) {
  const key = pbkdf2Sync(pass, Buffer.from(vault.salt, 'base64'), vault.iterations, 32, 'sha256');
  const bytes = Buffer.from(vault.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(vault.iv, 'base64'));
  decipher.setAAD(Buffer.from(AAD));
  decipher.setAuthTag(bytes.subarray(-16));
  const plain = Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
assert.throws(() => makeVault('too-short', token, connection));
assert.throws(() => makeVault(' '.repeat(20), token, connection));
assert.throws(() => makeVault(password, 'ghp_' + 'x'.repeat(36), connection));
const first = makeVault(password, token, connection);
const second = makeVault(password, token, connection);
assert.equal(first.iterations, ITERATIONS);
assert.notEqual(first.salt, second.salt);
assert.notEqual(first.iv, second.iv);
assert.notEqual(first.ciphertext, second.ciphertext);
assert(!JSON.stringify(first).includes(password));
assert(!JSON.stringify(first).includes(token));
assert.deepEqual(open(first, password), { version: 1, token, ...connection });
assert.throws(() => open(first, 'a-different-password-9284'));
const damaged = structuredClone(first);
const bytes = Buffer.from(damaged.ciphertext, 'base64');
bytes[0] ^= 1;
damaged.ciphertext = bytes.toString('base64');
assert.throws(() => open(damaged, password));
console.log('Vault tests passed: round trip, randomness, no plaintext secret, bad password, tamper rejection, password length and Classic-token rejection.');
