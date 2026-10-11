#!/usr/bin/env node
// Offline signing tool for Ley81·Suite licences (and, later, release manifests).
// Runs on Marc's own Mac. Zero dependencies (Node's built-in Ed25519).
//
// The PRIVATE key is generated here and stored only in the macOS login
// Keychain (service com.ley81suite.signing.<name>), with no application
// pre-trusted, so reading it triggers a macOS approval prompt. It never goes
// in the repo, on a web server, or on disk in plaintext. The website holds
// only the PUBLIC key.
//
// Licence wire format (a contract with app/src-tauri/src/license.rs; do not
// change without changing both): <base64url(payload JSON)>.<base64url(sig)>
// where the signature covers the base64url TEXT of the payload, not the
// decoded JSON, so signer and verifier cannot disagree on JSON formatting.

import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PRODUCT = 'ley81-suite';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const fromB64u = (s) => Buffer.from(s, 'base64url');

function die(msg) { console.error(`error: ${msg}`); process.exit(1); }

function args() {
  const out = { _: [] };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
      out[k] = v;
    } else out._.push(a[i]);
  }
  return out;
}

const service = (name) => `com.ley81suite.signing.${name}`;

function keychainStore(name, pkcs8B64) {
  // -T "" : no application is pre-trusted, so every read prompts for approval.
  execFileSync('security', ['add-generic-password', '-a', 'ley81', '-s', service(name), '-w', pkcs8B64, '-T', '', '-U'], { stdio: 'pipe' });
}
function keychainExists(name) {
  try { execFileSync('security', ['find-generic-password', '-a', 'ley81', '-s', service(name)], { stdio: 'pipe' }); return true; } catch { return false; }
}
function keychainRead(name) {
  try {
    return execFileSync('security', ['find-generic-password', '-a', 'ley81', '-s', service(name), '-w'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
  } catch { die(`could not read the "${name}" signing key from the Keychain (missing, or access was denied)`); }
}

// For tests/fixtures only: --key-file <path> reads a hex 32-byte seed.
function loadPrivateKey(opts) {
  if (opts['key-file']) {
    const seed = Buffer.from(readFileSync(opts['key-file'], 'utf8').trim(), 'hex');
    if (seed.length !== 32) die('key file must contain a 64-hex-character Ed25519 seed');
    const pkcs8 = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]);
    return createPrivateKey({ key: pkcs8, format: 'der', type: 'pkcs8' });
  }
  const name = opts.key || 'license';
  return createPrivateKey({ key: Buffer.from(keychainRead(name), 'base64'), format: 'der', type: 'pkcs8' });
}

const publicHex = (priv) => fromB64u(createPublicKey(priv).export({ format: 'jwk' }).x).toString('hex');

function signLicense(priv, p) {
  const payload = b64u(JSON.stringify(p));
  const sig = sign(null, Buffer.from(payload), priv);
  return `${payload}.${b64u(sig)}`;
}

function verifyLicense(pubHex, text) {
  const [payload, sig] = text.trim().split('.');
  if (!payload || !sig) die('malformed licence');
  const spki = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(pubHex, 'hex')]);
  const pub = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  const ok = verify(null, Buffer.from(payload), pub, fromB64u(sig));
  return { ok, payload: ok ? JSON.parse(fromB64u(payload).toString()) : null };
}

// Reads and validates a request.json exported by the admin console's Licenses page.
function readRequest(file) {
  let r;
  try { r = JSON.parse(readFileSync(file, 'utf8')); } catch { die('could not read that request file as JSON'); }
  if (r.version !== 1) die('unsupported request version');
  for (const k of ['license_id', 'customer', 'product', 'fingerprint', 'expires_at']) if (typeof r[k] !== 'string' || !r[k]) die(`request is missing "${k}"`);
  if (!/^lic_[0-9a-f]{12}$/.test(r.license_id)) die('request has a malformed license_id');
  if (!/^[0-9a-f]{64}$/.test(r.fingerprint)) die('request has a malformed fingerprint');
  if (Number.isNaN(Date.parse(r.expires_at))) die('request has a malformed expires_at');
  if (r.product !== PRODUCT && !opts.product) die(`request is for product "${r.product}", not ${PRODUCT}`);
  return r;
}

// Everything in the licence comes from the request, so what gets signed is
// exactly what was entered in the console; only issued_at is added here.
function signRequestFile(file, outPath, o) {
  const r = readRequest(file);
  const payload = { license_id: r.license_id, customer: r.customer, product: r.product, fingerprint: r.fingerprint, issued_at: new Date().toISOString(), expires_at: r.expires_at };
  const lic = signLicense(loadPrivateKey(o), payload);
  const out = outPath || `${payload.license_id}.lic`;
  writeFileSync(out, lic + '\n');
  console.log(`Wrote ${out}`);
  console.log(JSON.stringify(payload, null, 2));
}

// A PKCS8 Ed25519 private key as base64 text (the form stored in the Keychain).
function parseKeyText(text) {
  const der = Buffer.from(text.trim(), 'base64');
  if (der.length !== 48) die(`that is not an Ed25519 signing key (expected 48 bytes, got ${der.length}); check nothing was trimmed, such as a trailing "+"`);
  let key;
  try { key = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }); } catch { die('that text does not decode to a private key'); }
  if (key.asymmetricKeyType !== 'ed25519') die('that key is not Ed25519');
  return { text: der.toString('base64'), key };
}

const [cmd] = process.argv.slice(2);
const opts = args();

switch (cmd) {
  case 'keygen': {
    const name = opts.name || 'license';
    if (keychainExists(name) && !opts.force) die(`a "${name}" key already exists in the Keychain; use --force only if you really mean to replace it (every licence signed with the old key will stop verifying in shipped apps)`);
    const { privateKey } = generateKeyPairSync('ed25519');
    keychainStore(name, privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'));
    console.log(`Stored the "${name}" private key in the macOS login Keychain (${service(name)}).`);
    console.log(`PUBLIC KEY (hex, embed in the app): ${publicHex(privateKey)}`);
    break;
  }
  case 'export-key': {
    // For backup only. The key goes to stdout, never to a terminal: pipe it, e.g. `export-key | pbcopy`.
    if (process.stdout.isTTY) die('refusing to print the private key to the screen; pipe it instead, e.g. `node tools/ley81-sign.mjs export-key | pbcopy`, then paste it into your password manager and clear the clipboard (`pbcopy < /dev/null`)');
    if (!process.stdin.isTTY) die('export-key must be run by a person at an interactive terminal (stdin is not one), so scripts and automation cannot read the private key');
    const { text, key } = parseKeyText(keychainRead(opts.name || 'license'));
    process.stdout.write(text + '\n');
    console.error(`Exported the "${opts.name || 'license'}" key. Its public key is ${publicHex(key)}; check it against the app.`);
    break;
  }
  case 'import-key': {
    // Restore a backup into the Keychain. The key is read from stdin so it never lands in shell history, e.g. `pbpaste | node tools/ley81-sign.mjs import-key --expect <public hex>`.
    if (process.stdin.isTTY) die('pipe the key in, e.g. `pbpaste | node tools/ley81-sign.mjs import-key --expect <public hex>`');
    const name = opts.name || 'license';
    const { text, key } = parseKeyText(readFileSync(0, 'utf8'));
    const pub = publicHex(key);
    if (typeof opts.expect === 'string' && opts.expect.toLowerCase() !== pub) die(`public key mismatch: this key's public half is ${pub}, not the expected ${opts.expect}. Nothing was stored.`);
    if (opts['dry-run']) { console.log(`Key is valid. Public key: ${pub} (dry run, nothing stored)`); break; }
    if (keychainExists(name) && !opts.force) die(`a "${name}" key already exists in the Keychain; use --force only if you mean to replace it`);
    keychainStore(name, text);
    console.log(`Stored the "${name}" private key in the macOS login Keychain (${service(name)}). Public key: ${pub}`);
    break;
  }
  case 'pubkey': {
    console.log(publicHex(loadPrivateKey(opts)));
    break;
  }
  case 'sign': {
    for (const r of ['customer', 'fingerprint', 'expires']) if (!opts[r] || opts[r] === true) die(`--${r} is required`);
    if (!/^[0-9a-f]{64}$/.test(opts.fingerprint)) die('--fingerprint must be the 64-hex-character machine fingerprint shown in the app');
    const exp = new Date(opts.expires.length === 10 ? `${opts.expires}T23:59:59Z` : opts.expires);
    if (Number.isNaN(exp.getTime())) die('--expires must be YYYY-MM-DD or an ISO timestamp');
    const payload = {
      license_id: opts['license-id'] || `lic_${randomBytes(6).toString('hex')}`,
      customer: opts.customer,
      product: opts.product || PRODUCT, // --product is for test fixtures only
      fingerprint: opts.fingerprint,
      issued_at: new Date().toISOString(),
      expires_at: exp.toISOString(),
    };
    const lic = signLicense(loadPrivateKey(opts), payload);
    const out = opts.out || `${payload.license_id}.lic`;
    writeFileSync(out, lic + '\n');
    console.log(`Wrote ${out}`);
    console.log(JSON.stringify(payload, null, 2));
    break;
  }
  case 'sign-request': {
    const file = opts._[1] || die('usage: sign-request <request.json> [--out file.lic]');
    signRequestFile(file, opts.out, opts);
    break;
  }
  case 'sign-latest': {
    // Convenience: sign the newest lic_*.request.json in a folder (default ~/Downloads).
    // It shows what it is about to sign and asks first, so "newest" can never sign the wrong thing silently.
    const dir = typeof opts.dir === 'string' ? opts.dir : join(homedir(), 'Downloads');
    let found;
    try {
      found = readdirSync(dir).filter((f) => /^lic_[0-9a-f]{12}\.request\.json$/.test(f)).map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs })).sort((x, y) => y.t - x.t);
    } catch { die(`cannot read the folder ${dir}`); }
    if (!found.length) die(`no lic_*.request.json files in ${dir}; download one from the admin console first`);
    const file = join(dir, found[0].f);
    const r = readRequest(file);
    console.log(`Newest request: ${file}\n  customer:    ${r.customer}\n  machine:     ${r.fingerprint}\n  valid until: ${r.expires_at}`);
    if (!opts.yes) {
      if (!process.stdin.isTTY) die('run this at an interactive terminal, or pass --yes to skip the confirmation');
      process.stdout.write('Sign this request? [y/N] ');
      const answer = readFileSync(0, 'utf8').trim().toLowerCase();
      if (answer !== 'y' && answer !== 'yes') die('not signed');
    }
    signRequestFile(file, join(dir, `${r.license_id}.lic`), opts);
    break;
  }
  case 'verify': {
    const file = opts._[1] || die('usage: verify <file.lic> [--pubkey <hex> | --key-file <seed>]');
    const pub = opts.pubkey || publicHex(loadPrivateKey(opts));
    const { ok, payload } = verifyLicense(pub, readFileSync(file, 'utf8'));
    console.log(ok ? 'SIGNATURE OK' : 'SIGNATURE INVALID');
    if (ok) console.log(JSON.stringify(payload, null, 2)); else process.exit(2);
    break;
  }
  default:
    console.log(`Ley81·Suite signing tool

  keygen [--name license]                       create a keypair; private key goes to the macOS Keychain
  pubkey [--key license]                        print the public key (hex)
  export-key [--name license] | pbcopy          back up the private key (stdout only; refuses a terminal)
  pbpaste | import-key [--expect <pubhex>] [--name license] [--dry-run] [--force]
                                                restore a backup into the Keychain; --expect refuses a wrong key
  sign --customer "Acme" --fingerprint <64hex> --expires 2027-10-04 [--license-id lic_x] [--out f.lic]
  sign-request <request.json> [--out f.lic]     sign a request exported from the admin console
  sign-latest [--dir ~/Downloads] [--yes]       sign the newest lic_*.request.json there, after showing it and asking
  verify <file.lic> [--pubkey <hex>]            check a licence's signature

Test fixtures only: add --key-file <path-to-hex-seed> to use a throwaway key instead of the Keychain.`);
}
