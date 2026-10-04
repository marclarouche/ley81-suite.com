// Verifies the Cloudflare Access JWT (Cf-Access-Jwt-Assertion) on every admin
// request. Access in front of the hostname is the first gate; this is the
// second, independent one: if the Worker is reached any other way (for example
// its workers.dev address) there is no valid token and admin routes refuse.

export interface AccessConfig {
  /** e.g. "ley81.cloudflareaccess.com" (no scheme) */
  teamDomain: string;
  /** The Access application's AUD tag. */
  aud: string;
  /** Lower-case emails allowed in. For now only Marc. */
  allowedEmails: string[];
}

export interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}
export type Jwks = { keys: Jwk[] };
export type JwksFetcher = (forceRefresh: boolean) => Promise<Jwks>;

export type AccessResult = { ok: true; email: string } | { ok: false; reason: string };

const CLOCK_SKEW_SECONDS = 60;

function b64urlDecode(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function decodeJson(part: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(new TextDecoder().decode(b64urlDecode(part)));
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function verifyAccessJwt(
  token: string | null | undefined,
  cfg: AccessConfig,
  getJwks: JwksFetcher,
  nowMs: number = Date.now(),
): Promise<AccessResult> {
  if (!token) return { ok: false, reason: 'missing token' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed token' };
  const [h, p, s] = parts;

  const header = decodeJson(h);
  const claims = decodeJson(p);
  if (!header || !claims) return { ok: false, reason: 'malformed token' };
  // Only RS256 is accepted: never "none", never an HMAC (alg-confusion attacks).
  if (header.alg !== 'RS256') return { ok: false, reason: 'unsupported algorithm' };
  if (typeof header.kid !== 'string') return { ok: false, reason: 'missing key id' };

  let jwks = await getJwks(false);
  let jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Keys rotate; refetch once before giving up.
    jwks = await getJwks(true);
    jwk = jwks.keys.find((k) => k.kid === header.kid);
  }
  if (!jwk || jwk.kty !== 'RSA') return { ok: false, reason: 'unknown signing key' };

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      'jwk',
      { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
  } catch {
    return { ok: false, reason: 'bad signing key' };
  }
  let sigOk = false;
  try {
    sigOk = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlDecode(s), new TextEncoder().encode(`${h}.${p}`));
  } catch {
    sigOk = false;
  }
  if (!sigOk) return { ok: false, reason: 'bad signature' };

  const nowS = Math.floor(nowMs / 1000);
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < nowS) return { ok: false, reason: 'token expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - CLOCK_SKEW_SECONDS > nowS) return { ok: false, reason: 'token not yet valid' };
  if (claims.iss !== `https://${cfg.teamDomain}`) return { ok: false, reason: 'wrong issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!cfg.aud || !aud.includes(cfg.aud)) return { ok: false, reason: 'wrong audience' };

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  if (!email) return { ok: false, reason: 'no email in token' };
  if (!cfg.allowedEmails.map((e) => e.toLowerCase()).includes(email)) return { ok: false, reason: 'not an authorised admin' };
  return { ok: true, email };
}

/** Fetches and caches the team's signing keys (module-level cache, 1 hour). */
export function makeJwksFetcher(teamDomain: string, fetchImpl: typeof fetch = fetch): JwksFetcher {
  let cached: { jwks: Jwks; at: number } | null = null;
  return async (force) => {
    if (!force && cached && Date.now() - cached.at < 3_600_000) return cached.jwks;
    const res = await fetchImpl(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`could not fetch Access keys (${res.status})`);
    const jwks = (await res.json()) as Jwks;
    cached = { jwks, at: Date.now() };
    return jwks;
  };
}
