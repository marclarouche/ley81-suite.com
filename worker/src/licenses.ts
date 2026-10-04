// Licence request validation and verification of signed .lic files.
//
// Wire format (a contract with tools/ley81-sign.mjs and the app's license.rs):
//   <base64url(payload JSON)>.<base64url(Ed25519 signature)>
// where the signature covers the base64url TEXT of the payload.

export const PRODUCT = 'ley81-suite';
export const TIERS = ['consultant', 'company'] as const;
export type Tier = (typeof TIERS)[number];

export interface LicenseRequestInput {
  customer?: unknown;
  email?: unknown;
  tier?: unknown;
  fingerprint?: unknown;
  expires?: unknown; // YYYY-MM-DD
  note?: unknown;
}

export interface ValidRequest {
  customer: string;
  email: string | null;
  tier: Tier;
  fingerprint: string;
  expires_at: string; // ISO, end of the chosen day, UTC
  note: string | null;
}

/** What the offline signer needs to build a licence. `issued_at` is set at signing time. */
export interface SigningRequest {
  version: 1;
  license_id: string;
  customer: string;
  product: string;
  fingerprint: string;
  expires_at: string;
}

export interface LicPayload {
  license_id: string;
  customer: string;
  product: string;
  fingerprint: string;
  issued_at: string;
  expires_at: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** End of the given UTC day, in the exact format the signing tool produces. */
export function endOfDayIso(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const d = new Date(`${ymd}T23:59:59Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== ymd) return null;
  return d.toISOString();
}

/** One year of maintenance from `from`, ending the day before the anniversary. */
export function defaultExpiryYmd(from: Date): string {
  const d = new Date(Date.UTC(from.getUTCFullYear() + 1, from.getUTCMonth(), from.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function validateRequest(
  input: LicenseRequestInput,
  now: Date = new Date(),
): { ok: true; value: ValidRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const customer = str(input.customer);
  if (customer.length < 2 || customer.length > 200) errors.push('Customer name must be 2–200 characters.');

  const email = str(input.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Email address is not valid.');

  const tier = str(input.tier);
  if (!(TIERS as readonly string[]).includes(tier)) errors.push('Tier must be consultant or company.');

  const fingerprint = str(input.fingerprint).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) errors.push('Fingerprint must be the 64-character code shown on the app’s Activate screen.');

  const expires_at = endOfDayIso(str(input.expires));
  if (!expires_at) errors.push('Expiry must be a real date (YYYY-MM-DD).');
  else if (new Date(expires_at).getTime() <= now.getTime()) errors.push('Expiry must be in the future.');
  else if (new Date(expires_at).getTime() > now.getTime() + 5 * 366 * 86_400_000) errors.push('Expiry is more than five years away; check the date.');

  const note = str(input.note);
  if (note.length > 1000) errors.push('Note is too long (1000 characters maximum).');

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { customer, email: email || null, tier: tier as Tier, fingerprint, expires_at: expires_at!, note: note || null },
  };
}

export function newLicenseId(): string {
  const b = new Uint8Array(6);
  crypto.getRandomValues(b);
  return 'lic_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function toSigningRequest(rec: { license_id: string; customer_name: string; fingerprint: string; expires_at: string }): SigningRequest {
  return {
    version: 1,
    license_id: rec.license_id,
    customer: rec.customer_name,
    product: PRODUCT,
    fingerprint: rec.fingerprint,
    expires_at: rec.expires_at,
  };
}

// --- base64url / hex helpers ------------------------------------------------

export function b64urlToBytes(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function hexToBytes(h: string): Uint8Array {
  if (!/^([0-9a-fA-F]{2})+$/.test(h)) throw new Error('not hex');
  return Uint8Array.from(h.match(/../g)!, (x) => parseInt(x, 16));
}

// --- verifying an uploaded .lic ---------------------------------------------

export type VerifyResult = { ok: true; payload: LicPayload } | { ok: false; reason: string };

/**
 * Checks that `licText` is a correctly signed licence AND is exactly the one
 * that was requested (same id, customer, product, machine and expiry), so a
 * wrong or swapped file can't be attached to a record.
 */
export async function verifySignedLicense(
  licText: string,
  publicKeyHex: string,
  expected: SigningRequest,
  now: Date = new Date(),
): Promise<VerifyResult> {
  const text = licText.trim();
  const parts = text.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'The file is not a licence (expected two dot-separated parts).' };
  const [payloadB64, sigB64] = parts;

  let sig: Uint8Array;
  let payloadBytes: Uint8Array;
  try {
    sig = b64urlToBytes(sigB64);
    payloadBytes = b64urlToBytes(payloadB64);
  } catch {
    return { ok: false, reason: 'The file is not valid base64url.' };
  }
  if (sig.length !== 64) return { ok: false, reason: 'The signature has the wrong length.' };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('raw', hexToBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
  } catch {
    return { ok: false, reason: 'The server’s licence public key is not configured correctly.' };
  }
  const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, new TextEncoder().encode(payloadB64));
  if (!valid) return { ok: false, reason: 'The signature does not verify against the Ley81·Suite licence key.' };

  let payload: LicPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(payloadBytes));
  } catch {
    return { ok: false, reason: 'The licence contents are not valid JSON.' };
  }

  const mismatches: string[] = [];
  for (const k of ['license_id', 'customer', 'product', 'fingerprint', 'expires_at'] as const) {
    if (payload[k] !== (expected as unknown as Record<string, string>)[k]) mismatches.push(k);
  }
  if (mismatches.length) return { ok: false, reason: `This is a validly signed licence, but not the one requested (differs: ${mismatches.join(', ')}).` };

  const issued = Date.parse(payload.issued_at);
  if (Number.isNaN(issued)) return { ok: false, reason: 'The licence has no valid issue date.' };
  if (issued > now.getTime() + 86_400_000) return { ok: false, reason: 'The licence issue date is in the future.' };

  return { ok: true, payload };
}
