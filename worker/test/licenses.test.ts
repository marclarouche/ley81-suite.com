import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  validateRequest, endOfDayIso, defaultExpiryYmd, toSigningRequest, verifySignedLicense, newLicenseId, PRODUCT,
} from '../src/licenses.ts';

const FP = 'a'.repeat(64);
const NOW = new Date('2026-10-04T12:00:00Z');
const good = { customer: 'Acme Consulting', email: 'ops@acme.test', tier: 'consultant', fingerprint: FP, expires: '2027-10-03' };

test('a complete request validates and normalises', () => {
  const r = validateRequest({ ...good, fingerprint: FP.toUpperCase(), note: ' hi ' }, NOW);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.fingerprint, FP);
    assert.equal(r.value.expires_at, '2027-10-03T23:59:59.000Z');
    assert.equal(r.value.note, 'hi');
  }
});

test('bad inputs are rejected with specific messages', () => {
  const cases: [object, RegExp][] = [
    [{ ...good, customer: 'x' }, /Customer name/],
    [{ ...good, email: 'nope' }, /Email/],
    [{ ...good, tier: 'enterprise' }, /Tier/],
    [{ ...good, fingerprint: 'abc' }, /Fingerprint/],
    [{ ...good, expires: '2027-02-30' }, /real date/],
    [{ ...good, expires: '2026-10-03' }, /future/],
    [{ ...good, expires: '2040-01-01' }, /five years/],
  ];
  for (const [input, re] of cases) {
    const r = validateRequest(input, NOW);
    assert.ok(!r.ok && r.errors.some((e) => re.test(e)), JSON.stringify(input));
  }
});

test('dates: end of day format matches the signing tool and default expiry is one year less a day', () => {
  assert.equal(endOfDayIso('2027-10-04'), '2027-10-04T23:59:59.000Z');
  assert.equal(endOfDayIso('2027-13-01'), null);
  assert.equal(defaultExpiryYmd(new Date('2026-10-04T10:00:00Z')), '2027-10-03');
  assert.equal(defaultExpiryYmd(new Date('2028-02-29T10:00:00Z')), '2029-02-28');
});

test('license ids look right and differ', () => {
  const a = newLicenseId(); const b = newLicenseId();
  assert.match(a, /^lic_[0-9a-f]{12}$/);
  assert.notEqual(a, b);
});

// --- cross-check against the REAL signing tool and a throwaway key ----------
const toolDir = new URL('../../tools/', import.meta.url).pathname;
const seed = join(toolDir, 'fixtures/test-seed.hex');
const TEST_PUB = execFileSync('node', [join(toolDir, 'ley81-sign.mjs'), 'pubkey', '--key-file', seed]).toString().trim();

function signWithTool(over: Record<string, string> = {}): { lic: string; request: ReturnType<typeof toSigningRequest> } {
  const dir = mkdtempSync(join(tmpdir(), 'lic-'));
  const request = toSigningRequest({ license_id: 'lic_abcdef012345', customer_name: 'Acme Consulting', fingerprint: FP, expires_at: '2027-10-03T23:59:59.000Z' });
  const reqFile = join(dir, 'request.json');
  writeFileSync(reqFile, JSON.stringify({ ...request, ...over }));
  const out = join(dir, 'x.lic');
  execFileSync('node', [join(toolDir, 'ley81-sign.mjs'), 'sign-request', reqFile, '--key-file', seed, '--out', out]);
  return { lic: readFileSync(out, 'utf8'), request };
}

test('a licence signed by the real tool verifies and matches its request', async () => {
  const { lic, request } = signWithTool();
  const r = await verifySignedLicense(lic, TEST_PUB, request);
  assert.ok(r.ok, JSON.stringify(r));
  if (r.ok) assert.equal(r.payload.product, PRODUCT);
});

test('a validly signed licence for something else is refused', async () => {
  const { lic, request } = signWithTool({ fingerprint: 'b'.repeat(64) });
  const r = await verifySignedLicense(lic, TEST_PUB, request);
  assert.ok(!r.ok && /not the one requested/.test(r.reason) && /fingerprint/.test(r.reason));
});

test('wrong key, tampering and garbage are all refused', async () => {
  const { lic, request } = signWithTool();
  const otherKey = 'dd0e2d2aedec9276a70f94fb0187975c25890d9ecb554d51dfb836f40b6f2d1f';
  assert.ok(!(await verifySignedLicense(lic, otherKey, request)).ok);
  const [p, s] = lic.trim().split('.');
  const tamperedPayload = Buffer.from(Buffer.from(p, 'base64url').toString().replace('2027', '2037')).toString('base64url');
  assert.ok(!(await verifySignedLicense(`${tamperedPayload}.${s}`, TEST_PUB, request)).ok);
  for (const bad of ['', 'abc', 'a.b.c', '!!!.???', `${p}.${Buffer.alloc(10).toString('base64url')}`]) {
    assert.ok(!(await verifySignedLicense(bad, TEST_PUB, request)).ok, bad);
  }
});
