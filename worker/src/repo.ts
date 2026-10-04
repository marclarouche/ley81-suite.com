// Database access for licences and the admin audit log. Written against the
// small D1 surface below so the same code runs on Cloudflare D1 and, in tests,
// on an in-memory SQLite database.

import {
  type SigningRequest, type ValidRequest, newLicenseId, toSigningRequest, validateRequest,
  verifySignedLicense, endOfDayIso, type LicenseRequestInput,
} from './licenses.ts';

export interface D1Result<T = unknown> { results: T[]; meta: { changes?: number } }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface Db {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<D1Result[]>;
}

export type Status = 'requested' | 'issued' | 'superseded' | 'revoked';

export interface LicenseRow {
  id: number;
  license_id: string;
  customer_name: string;
  customer_email: string | null;
  tier: 'consultant' | 'company';
  fingerprint: string;
  expires_at: string;
  status: Status;
  lic_text: string | null;
  issued_at: string | null;
  delivered_at: string | null;
  renews_license_id: string | null;
  note: string | null;
  revoked_at: string | null;
  revoked_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditRow { id: number; ts: string; actor: string; action: string; target: string | null; details: string | null }

export type Outcome<T> = { ok: true; value: T } | { ok: false; errors: string[] };
const fail = (...errors: string[]): { ok: false; errors: string[] } => ({ ok: false, errors });

const iso = (d: Date) => d.toISOString();

function auditStmt(db: Db, actor: string, action: string, target: string | null, details: unknown, now: Date): D1Statement {
  return db
    .prepare('INSERT INTO audit_log (ts, actor, action, target, details) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(iso(now), actor, action, target, details === undefined ? null : JSON.stringify(details));
}

export async function listAudit(db: Db, limit = 200): Promise<AuditRow[]> {
  return (await db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?1').bind(limit).all<AuditRow>()).results;
}

export async function listLicenses(db: Db): Promise<LicenseRow[]> {
  return (await db.prepare('SELECT * FROM licenses ORDER BY id DESC').all<LicenseRow>()).results;
}

export async function getLicense(db: Db, licenseId: string): Promise<LicenseRow | null> {
  return db.prepare('SELECT * FROM licenses WHERE license_id = ?1').bind(licenseId).first<LicenseRow>();
}

function insertStmt(db: Db, id: string, v: ValidRequest, renews: string | null, now: Date): D1Statement {
  return db
    .prepare(
      `INSERT INTO licenses (license_id, customer_name, customer_email, tier, fingerprint, expires_at, status, renews_license_id, note, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'requested', ?7, ?8, ?9, ?9)`,
    )
    .bind(id, v.customer, v.email, v.tier, v.fingerprint, v.expires_at, renews, v.note, iso(now));
}

/** Records a new licence request (status "requested", awaiting the offline signature). */
export async function createLicenseRequest(db: Db, input: LicenseRequestInput, actor: string, now = new Date()): Promise<Outcome<LicenseRow>> {
  const v = validateRequest(input, now);
  if (!v.ok) return fail(...v.errors);
  const id = newLicenseId();
  await db.batch([insertStmt(db, id, v.value, null, now), auditStmt(db, actor, 'license.requested', id, { customer: v.value.customer, expires_at: v.value.expires_at }, now)]);
  return { ok: true, value: (await getLicense(db, id))! };
}

/** New request for the same customer and machine with a later expiry. */
export async function createRenewal(db: Db, licenseId: string, expiresYmd: string, actor: string, now = new Date()): Promise<Outcome<LicenseRow>> {
  const prev = await getLicense(db, licenseId);
  if (!prev) return fail('Licence not found.');
  if (prev.status !== 'issued') return fail('Only an issued licence can be renewed.');
  const v = validateRequest({ customer: prev.customer_name, email: prev.customer_email, tier: prev.tier, fingerprint: prev.fingerprint, expires: expiresYmd, note: prev.note }, now);
  if (!v.ok) return fail(...v.errors);
  if (v.value.expires_at <= prev.expires_at) return fail('The renewal must expire later than the current licence.');
  const id = newLicenseId();
  await db.batch([insertStmt(db, id, v.value, prev.license_id, now), auditStmt(db, actor, 'license.renewal_requested', id, { renews: prev.license_id, expires_at: v.value.expires_at }, now)]);
  return { ok: true, value: (await getLicense(db, id))! };
}

export function signingRequestFor(row: LicenseRow): SigningRequest {
  return toSigningRequest(row);
}

/**
 * Attaches the offline-signed .lic to its request after verifying the
 * signature and that it is exactly what was requested. A renewal that is
 * issued supersedes the licence it renews.
 */
export async function attachSignedLicense(db: Db, licenseId: string, licText: string, publicKeyHex: string, actor: string, now = new Date()): Promise<Outcome<LicenseRow>> {
  const row = await getLicense(db, licenseId);
  if (!row) return fail('Licence not found.');
  if (row.status !== 'requested') return fail(`This licence is already ${row.status}; only a pending request can take a signed file.`);
  const verified = await verifySignedLicense(licText, publicKeyHex, signingRequestFor(row), now);
  if (!verified.ok) {
    await auditStmt(db, actor, 'license.upload_rejected', licenseId, { reason: verified.reason }, now).run();
    return fail(verified.reason);
  }
  const stmts: D1Statement[] = [
    db.prepare("UPDATE licenses SET status = 'issued', lic_text = ?2, issued_at = ?3, updated_at = ?4 WHERE license_id = ?1 AND status = 'requested'")
      .bind(licenseId, licText.trim(), verified.payload.issued_at, iso(now)),
    auditStmt(db, actor, 'license.issued', licenseId, { customer: row.customer_name, expires_at: row.expires_at }, now),
  ];
  if (row.renews_license_id) {
    stmts.push(
      db.prepare("UPDATE licenses SET status = 'superseded', updated_at = ?2 WHERE license_id = ?1 AND status = 'issued'").bind(row.renews_license_id, iso(now)),
      auditStmt(db, actor, 'license.superseded', row.renews_license_id, { by: licenseId }, now),
    );
  }
  await db.batch(stmts);
  return { ok: true, value: (await getLicense(db, licenseId))! };
}

export async function markDelivered(db: Db, licenseId: string, actor: string, now = new Date()): Promise<Outcome<LicenseRow>> {
  const row = await getLicense(db, licenseId);
  if (!row) return fail('Licence not found.');
  if (row.status !== 'issued') return fail('Only an issued licence can be marked delivered.');
  await db.batch([
    db.prepare('UPDATE licenses SET delivered_at = ?2, updated_at = ?2 WHERE license_id = ?1').bind(licenseId, iso(now)),
    auditStmt(db, actor, 'license.delivered', licenseId, undefined, now),
  ]);
  return { ok: true, value: (await getLicense(db, licenseId))! };
}

/** Record-only: an offline licence cannot be recalled; it simply won't be renewed. */
export async function revokeLicense(db: Db, licenseId: string, reason: string, actor: string, now = new Date()): Promise<Outcome<LicenseRow>> {
  const row = await getLicense(db, licenseId);
  if (!row) return fail('Licence not found.');
  if (row.status === 'revoked') return fail('Already revoked.');
  const why = reason.trim();
  if (why.length < 3) return fail('Give a reason (at least 3 characters).');
  await db.batch([
    db.prepare("UPDATE licenses SET status = 'revoked', revoked_at = ?2, revoked_reason = ?3, updated_at = ?2 WHERE license_id = ?1").bind(licenseId, iso(now), why.slice(0, 500)),
    auditStmt(db, actor, 'license.revoked', licenseId, { reason: why.slice(0, 500) }, now),
  ]);
  return { ok: true, value: (await getLicense(db, licenseId))! };
}

export { endOfDayIso };
