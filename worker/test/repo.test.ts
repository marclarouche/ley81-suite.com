import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestDb } from './helpers.ts';
import {
  createLicenseRequest, createRenewal, attachSignedLicense, markDelivered, revokeLicense, listLicenses, listAudit, getLicense, signingRequestFor,
} from '../src/repo.ts';

const toolDir = new URL('../../tools/', import.meta.url).pathname;
const seed = join(toolDir, 'fixtures/test-seed.hex');
const PUB = execFileSync('node', [join(toolDir, 'ley81-sign.mjs'), 'pubkey', '--key-file', seed]).toString().trim();
const NOW = new Date('2026-10-04T12:00:00Z');
const FP = 'c'.repeat(64);
const req = { customer: 'Acme Consulting', email: 'ops@acme.test', tier: 'consultant', fingerprint: FP, expires: '2027-10-03' };

function sign(request: object): string {
  const dir = mkdtempSync(join(tmpdir(), 'repo-'));
  writeFileSync(join(dir, 'r.json'), JSON.stringify(request));
  execFileSync('node', [join(toolDir, 'ley81-sign.mjs'), 'sign-request', join(dir, 'r.json'), '--key-file', seed, '--out', join(dir, 'x.lic')]);
  return readFileSync(join(dir, 'x.lic'), 'utf8');
}

test('request → sign offline → upload → issued, with an audit trail', async () => {
  const db = makeTestDb();
  const made = await createLicenseRequest(db, req, 'marc@example.test', NOW);
  assert.ok(made.ok);
  if (!made.ok) return;
  assert.equal(made.value.status, 'requested');
  assert.match(made.value.license_id, /^lic_[0-9a-f]{12}$/);

  const lic = sign(signingRequestFor(made.value));
  const issued = await attachSignedLicense(db, made.value.license_id, lic, PUB, 'marc@example.test', NOW);
  assert.ok(issued.ok, JSON.stringify(issued));
  if (issued.ok) { assert.equal(issued.value.status, 'issued'); assert.equal(issued.value.lic_text, lic.trim()); }

  const again = await attachSignedLicense(db, made.value.license_id, lic, PUB, 'marc@example.test', NOW);
  assert.ok(!again.ok, 'a second upload to an issued record is refused');

  const actions = (await listAudit(db)).map((a) => a.action).reverse();
  assert.deepEqual(actions, ['license.requested', 'license.issued', ]);
});

test('invalid requests are rejected and nothing is stored', async () => {
  const db = makeTestDb();
  const r = await createLicenseRequest(db, { ...req, fingerprint: 'nope' }, 'marc@example.test', NOW);
  assert.ok(!r.ok);
  assert.equal((await listLicenses(db)).length, 0);
});

test('a wrong, swapped or foreign-key file is refused, leaves the record pending, and is audited', async () => {
  const db = makeTestDb();
  const a = await createLicenseRequest(db, req, 'm', NOW);
  const b = await createLicenseRequest(db, { ...req, customer: 'Other Co', fingerprint: 'd'.repeat(64) }, 'm', NOW);
  assert.ok(a.ok && b.ok);
  if (!a.ok || !b.ok) return;
  const licForB = sign(signingRequestFor(b.value));
  const r = await attachSignedLicense(db, a.value.license_id, licForB, PUB, 'm', NOW);
  assert.ok(!r.ok && /not the one requested/.test(r.errors[0]));
  assert.equal((await getLicense(db, a.value.license_id))!.status, 'requested');
  const wrongKey = await attachSignedLicense(db, b.value.license_id, licForB, 'dd0e2d2aedec9276a70f94fb0187975c25890d9ecb554d51dfb836f40b6f2d1f', 'm', NOW);
  assert.ok(!wrongKey.ok);
  assert.ok((await listAudit(db)).some((x) => x.action === 'license.upload_rejected'));
});

test('renewal: requested for an issued licence; issuing it supersedes the old one', async () => {
  const db = makeTestDb();
  const first = await createLicenseRequest(db, req, 'm', NOW);
  assert.ok(first.ok); if (!first.ok) return;
  assert.ok(!(await createRenewal(db, first.value.license_id, '2028-10-03', 'm', NOW)).ok, 'cannot renew a licence that is not issued yet');
  assert.ok((await attachSignedLicense(db, first.value.license_id, sign(signingRequestFor(first.value)), PUB, 'm', NOW)).ok);

  assert.ok(!(await createRenewal(db, first.value.license_id, '2027-10-03', 'm', NOW)).ok, 'must expire later');
  const renewal = await createRenewal(db, first.value.license_id, '2028-10-03', 'm', NOW);
  assert.ok(renewal.ok); if (!renewal.ok) return;
  assert.equal(renewal.value.renews_license_id, first.value.license_id);
  assert.equal(renewal.value.fingerprint, FP);

  assert.equal((await getLicense(db, first.value.license_id))!.status, 'issued', 'old licence stays issued until the renewal is signed');
  assert.ok((await attachSignedLicense(db, renewal.value.license_id, sign(signingRequestFor(renewal.value)), PUB, 'm', NOW)).ok);
  assert.equal((await getLicense(db, first.value.license_id))!.status, 'superseded');
  assert.equal((await getLicense(db, renewal.value.license_id))!.status, 'issued');
});

test('delivered and revoked are recorded; revoke needs a reason', async () => {
  const db = makeTestDb();
  const m = await createLicenseRequest(db, req, 'm', NOW);
  assert.ok(m.ok); if (!m.ok) return;
  assert.ok(!(await markDelivered(db, m.value.license_id, 'm', NOW)).ok, 'cannot deliver before it is issued');
  assert.ok((await attachSignedLicense(db, m.value.license_id, sign(signingRequestFor(m.value)), PUB, 'm', NOW)).ok);
  const d = await markDelivered(db, m.value.license_id, 'm', NOW);
  assert.ok(d.ok && d.value.delivered_at);
  assert.ok(!(await revokeLicense(db, m.value.license_id, 'x', 'm', NOW)).ok);
  const rv = await revokeLicense(db, m.value.license_id, 'chargeback', 'm', NOW);
  assert.ok(rv.ok && rv.value.status === 'revoked' && rv.value.revoked_reason === 'chargeback');
  assert.ok(!(await revokeLicense(db, m.value.license_id, 'again', 'm', NOW)).ok);
});

test('the database itself rejects bad values (CHECK constraints)', async () => {
  const db = makeTestDb();
  assert.throws(() => db.raw.exec("INSERT INTO licenses (license_id,customer_name,tier,fingerprint,expires_at,status,created_at,updated_at) VALUES ('lic_x','n','weird','"+FP+"','e','requested','t','t')"));
  assert.throws(() => db.raw.exec("INSERT INTO licenses (license_id,customer_name,tier,fingerprint,expires_at,status,created_at,updated_at) VALUES ('lic_y','n','company','short','e','requested','t','t')"));
});
