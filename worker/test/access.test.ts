import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccessJwt, type AccessConfig, type Jwks } from '../src/access.ts';

const TEAM = 'ley81.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const cfg: AccessConfig = { teamDomain: TEAM, aud: AUD, allowedEmails: ['marc@example.test'] };
const NOW = 1_800_000_000_000;

const b64u = (b: ArrayBuffer | Uint8Array | string) =>
  Buffer.from(typeof b === 'string' ? Buffer.from(b) : b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');

async function makeKey(kid: string) {
  const pair = (await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as { n: string; e: string };
  return { pair, jwk: { kid, kty: 'RSA', alg: 'RS256', n: jwk.n, e: jwk.e } };
}

async function token(pair: CryptoKeyPair, kid: string, claims: Record<string, unknown>, alg = 'RS256') {
  const h = b64u(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64u(JSON.stringify(claims));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64u(sig)}`;
}

const goodClaims = () => ({ iss: `https://${TEAM}`, aud: [AUD], email: 'Marc@Example.test', exp: NOW / 1000 + 600, nbf: NOW / 1000 - 10 });

test('Access JWT verification', async (t) => {
  const k1 = await makeKey('k1');
  const k2 = await makeKey('k2');
  let jwks: Jwks = { keys: [k1.jwk] };
  let fetches = 0;
  const getJwks = async (force: boolean) => { fetches++; void force; return jwks; };
  const check = (tok: string | null, c: AccessConfig = cfg) => verifyAccessJwt(tok, c, getJwks, NOW);

  await t.test('a good token is accepted and the email normalised', async () => {
    const r = await check(await token(k1.pair, 'k1', goodClaims()));
    assert.deepEqual(r, { ok: true, email: 'marc@example.test' });
  });

  await t.test('missing or malformed tokens are refused', async () => {
    for (const bad of [null, '', 'a.b', 'a.b.c.d', 'x.y.z']) assert.equal((await check(bad)).ok, false, String(bad));
  });

  await t.test('alg none / HS256 are refused', async () => {
    for (const alg of ['none', 'HS256']) {
      const r = await check(await token(k1.pair, 'k1', goodClaims(), alg));
      assert.deepEqual(r, { ok: false, reason: 'unsupported algorithm' });
    }
  });

  await t.test('a token signed by a different key is refused', async () => {
    const r = await check(await token(k2.pair, 'k1', goodClaims()));
    assert.deepEqual(r, { ok: false, reason: 'bad signature' });
  });

  await t.test('tampered claims are refused', async () => {
    const tok = await token(k1.pair, 'k1', goodClaims());
    const [h, , s] = tok.split('.');
    const evil = b64u(JSON.stringify({ ...goodClaims(), email: 'attacker@evil.test' }));
    assert.equal((await check(`${h}.${evil}.${s}`)).ok, false);
  });

  await t.test('expired, not-yet-valid, wrong issuer, wrong audience, wrong person', async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ exp: NOW / 1000 - 3600 }, 'token expired'],
      [{ nbf: NOW / 1000 + 3600 }, 'token not yet valid'],
      [{ iss: 'https://other.cloudflareaccess.com' }, 'wrong issuer'],
      [{ aud: ['someone-elses-app'] }, 'wrong audience'],
      [{ email: 'stranger@example.test' }, 'not an authorised admin'],
      [{ email: undefined }, 'no email in token'],
    ];
    for (const [over, reason] of cases) {
      const r = await check(await token(k1.pair, 'k1', { ...goodClaims(), ...over }));
      assert.deepEqual(r, { ok: false, reason }, reason);
    }
  });

  await t.test('an empty configured AUD never matches', async () => {
    const r = await check(await token(k1.pair, 'k1', { ...goodClaims(), aud: [''] }), { ...cfg, aud: '' });
    assert.equal(r.ok, false);
  });

  await t.test('a rotated key is picked up by refetching once; an unknown key is refused', async () => {
    jwks = { keys: [k1.jwk] };
    fetches = 0;
    const rotatedTok = await token(k2.pair, 'k2', goodClaims());
    jwks = { keys: [k1.jwk, k2.jwk] }; // the "refresh" now contains k2
    assert.equal((await check(rotatedTok)).ok, true);
    assert.ok(fetches >= 1);
    const unknown = await makeKey('k3');
    assert.deepEqual(await check(await token(unknown.pair, 'k3', goodClaims())), { ok: false, reason: 'unknown signing key' });
  });
});
