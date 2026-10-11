// export-key / import-key. Nothing here touches the real Keychain: the key is a
// throwaway generated per run and import is exercised with --dry-run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { mkdtempSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';

const tool = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'tools', 'ley81-sign.mjs');
const run = (args: string[], input: string) => spawnSync('node', [tool, ...args], { input, encoding: 'utf8' });

const { privateKey } = generateKeyPairSync('ed25519');
const keyText = Buffer.from(privateKey.export({ format: 'der', type: 'pkcs8' }) as Uint8Array).toString('base64');
const pubHex = Buffer.from(createPublicKey(privateKey).export({ format: 'jwk' }).x!, 'base64url').toString('hex');

test('import-key --dry-run accepts a valid key and reports its public half', () => {
  const r = run(['import-key', '--dry-run'], keyText + '\n');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(pubHex));
  assert.ok(r.stdout.includes('nothing stored'));
});

test('import-key --expect refuses a different key and a matching one passes', () => {
  assert.notEqual(run(['import-key', '--dry-run', '--expect', 'ab'.repeat(32)], keyText).status, 0);
  assert.equal(run(['import-key', '--dry-run', '--expect', pubHex.toUpperCase()], keyText).status, 0);
});

test('import-key rejects a trimmed key, garbage, and a non-Ed25519 key', () => {
  const trimmed = run(['import-key', '--dry-run'], keyText.slice(0, -2));
  assert.notEqual(trimmed.status, 0);
  assert.match(trimmed.stderr, /48 bytes/);
  assert.notEqual(run(['import-key', '--dry-run'], 'not a key at all').status, 0);
  const rsa = Buffer.from(generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ format: 'der', type: 'pkcs8' }) as Uint8Array).toString('base64');
  assert.notEqual(run(['import-key', '--dry-run'], rsa).status, 0);
});

test('export-key refuses to run non-interactively, so automation cannot read the private key', () => {
  // spawnSync gives the child a pipe for stdin and stdout; the guard must stop it before the Keychain is touched.
  const r = run(['export-key'], '');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /interactive terminal/);
  assert.equal(r.stdout, '');
});

// --- sign-latest, with the throwaway test key and a temp folder (never the real key or ~/Downloads) ---
const seedFile = join(dirname(tool), 'fixtures', 'test-seed.hex');
const FP = 'a'.repeat(64);
function requestFile(dir: string, id: string, customer: string, ageSeconds: number) {
  const f = join(dir, `${id}.request.json`);
  writeFileSync(f, JSON.stringify({ version: 1, license_id: id, customer, product: 'ley81-suite', fingerprint: FP, expires_at: '2027-10-03T23:59:59.000Z' }));
  const t = new Date(Date.now() - ageSeconds * 1000);
  utimesSync(f, t, t);
}

test('sign-latest signs the newest request, ignores other files, and the result verifies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'latest-'));
  requestFile(dir, 'lic_000000000001', 'Older Customer', 300);
  requestFile(dir, 'lic_000000000002', 'Newest Customer', 10);
  writeFileSync(join(dir, 'notes.request.json'), 'ignored');
  const r = run(['sign-latest', '--dir', dir, '--yes', '--key-file', seedFile], '');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Newest Customer'));
  assert.ok(existsSync(join(dir, 'lic_000000000002.lic')));
  assert.ok(!existsSync(join(dir, 'lic_000000000001.lic')), 'must not sign the older request');
  const pub = run(['pubkey', '--key-file', seedFile], '').stdout.trim();
  const v = run(['verify', join(dir, 'lic_000000000002.lic'), '--pubkey', pub], '');
  assert.equal(v.status, 0, v.stderr);
  assert.ok(v.stdout.includes('SIGNATURE OK') && v.stdout.includes('Newest Customer'));
});

test('sign-latest refuses without --yes when not interactive, and when the folder has no requests', () => {
  const dir = mkdtempSync(join(tmpdir(), 'latest-'));
  const none = run(['sign-latest', '--dir', dir, '--yes', '--key-file', seedFile], '');
  assert.notEqual(none.status, 0);
  assert.match(none.stderr, /no lic_\*\.request\.json/);
  requestFile(dir, 'lic_000000000003', 'Someone', 5);
  const noYes = run(['sign-latest', '--dir', dir, '--key-file', seedFile], '');
  assert.notEqual(noYes.status, 0);
  assert.match(noYes.stderr, /interactive terminal/);
  assert.ok(!existsSync(join(dir, 'lic_000000000003.lic')), 'nothing is signed without confirmation');
});
