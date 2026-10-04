// Ley81·Suite admin console and machine-facing API (Cloudflare Worker).
//
//   /admin/*   gated: Cloudflare Access (2FA) in front, AND this code verifies
//              the Access JWT itself on every request (see access.ts).
//   /api/v1/*  public machine endpoints for the desktop app (Stage C: signed
//              update manifest). Protected by cryptographic signatures, not login.

import { verifyAccessJwt, makeJwksFetcher, type AccessResult } from './access.ts';
import {
  type Db, createLicenseRequest, createRenewal, attachSignedLicense, markDelivered, revokeLicense, listLicenses, getLicense, listAudit, signingRequestFor,
} from './repo.ts';
import { ADMIN_CSS, licensesPage, detailPage, auditPage, forbiddenPage } from './html.ts';

export interface Env {
  DB: Db;
  /** Ed25519 public key (hex) that licences are signed with. Public. */
  LICENSE_PUBLIC_KEY: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  /** Comma-separated admin emails. */
  ADMIN_EMAILS: string;
}

export interface Deps {
  verifyAccess?: (req: Request, env: Env) => Promise<AccessResult>;
  now?: () => Date;
}

const MAX_LIC_BYTES = 16 * 1024;
const jwksFetchers = new Map<string, ReturnType<typeof makeJwksFetcher>>();

async function defaultVerifyAccess(req: Request, env: Env): Promise<AccessResult> {
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || /REPLACE/.test(env.ACCESS_TEAM_DOMAIN + env.ACCESS_AUD)) {
    return { ok: false, reason: 'access not configured' }; // fail closed
  }
  let fetcher = jwksFetchers.get(env.ACCESS_TEAM_DOMAIN);
  if (!fetcher) { fetcher = makeJwksFetcher(env.ACCESS_TEAM_DOMAIN); jwksFetchers.set(env.ACCESS_TEAM_DOMAIN, fetcher); }
  const allowed = (env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
  return verifyAccessJwt(req.headers.get('Cf-Access-Jwt-Assertion'), { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD, allowedEmails: allowed }, fetcher);
}

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
};

function respond(body: BodyInit | null, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...SECURITY_HEADERS, ...extra } });
}
const html = (body: string, status = 200) => respond(body, status, { 'Content-Type': 'text/html; charset=utf-8' });
const redirect = (to: string) => respond(null, 303, { Location: to });

/** State-changing requests must come from this same origin (CSRF defence in depth). */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('Origin');
  if (origin) return origin === new URL(req.url).origin;
  return req.headers.get('Sec-Fetch-Site') === 'same-origin';
}

const LIC_ID = /^lic_[0-9a-f]{12}$/;

export async function handle(req: Request, env: Env, deps: Deps = {}): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const now = (deps.now ?? (() => new Date()))();

  if (path.startsWith('/api/v1/')) {
    // Stage C will serve the signed update manifest here. Until a release is
    // published there is nothing to serve.
    return respond(JSON.stringify({ error: 'not available' }), 404, { 'Content-Type': 'application/json' });
  }
  if (path !== '/admin' && !path.startsWith('/admin/')) return respond('Not found', 404, { 'Content-Type': 'text/plain' });

  // --- everything under /admin requires a verified Access identity ---
  const access = await (deps.verifyAccess ?? defaultVerifyAccess)(req, env);
  if (!access.ok) {
    console.warn(`admin access refused: ${access.reason}`);
    return html(forbiddenPage(), 403);
  }
  const who = access.email;
  const db = env.DB;

  if (req.method === 'POST' && !sameOrigin(req)) return html(forbiddenPage(), 403);
  if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return respond('Method not allowed', 405);

  if (path === '/admin') return redirect('/admin/licenses');
  if (path === '/admin/assets/admin.css') return respond(ADMIN_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'private, max-age=300' });

  if (path === '/admin/audit' && req.method === 'GET') return html(auditPage(await listAudit(db), who));

  if (path === '/admin/licenses') {
    if (req.method === 'GET') return html(licensesPage(await listLicenses(db), who, { now, flash: url.searchParams.get('msg') ?? undefined }));
    const form = await req.formData();
    const values = Object.fromEntries(['customer', 'email', 'tier', 'fingerprint', 'expires', 'note'].map((k) => [k, String(form.get(k) ?? '')]));
    const r = await createLicenseRequest(db, values, who, now);
    if (!r.ok) return html(licensesPage(await listLicenses(db), who, { now, errors: r.errors, values }), 422);
    return redirect(`/admin/licenses/${r.value.license_id}?msg=created`);
  }

  const m = path.match(/^\/admin\/licenses\/([^/]+)(?:\/([a-z.]+))?$/);
  if (m) {
    const [, id, action] = m;
    if (!LIC_ID.test(id)) return html(forbiddenPage(), 404);
    const row = await getLicense(db, id);
    if (!row) return html('<!doctype html><meta charset="utf-8"><p>Not found.</p>', 404);

    const page = async (errors?: string[], flash?: string, status = 200) => {
      const renewals = (await listLicenses(db)).filter((x) => x.renews_license_id === id);
      return html(detailPage((await getLicense(db, id))!, who, { errors, flash, renewals, now }), status);
    };

    if (!action && req.method === 'GET') return page(undefined, url.searchParams.get('msg') ?? undefined);

    if (action === 'request.json' && req.method === 'GET') {
      return respond(JSON.stringify(signingRequestFor(row), null, 2) + '\n', 200, { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${id}.request.json"` });
    }
    if (action === 'download' && req.method === 'GET') {
      if (row.status !== 'issued' && row.status !== 'superseded') return html(forbiddenPage(), 404);
      return respond((row.lic_text ?? '') + '\n', 200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${id}.lic"` });
    }
    if (req.method !== 'POST') return respond('Method not allowed', 405);

    if (action === 'upload') {
      const form = await req.formData();
      const file = form.get('file');
      let text = String(form.get('text') ?? '');
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_LIC_BYTES) return page(['That file is too large to be a licence.'], undefined, 422);
        text = await file.text();
      }
      if (!text.trim()) return page(['Choose the signed .lic file or paste its contents.'], undefined, 422);
      if (text.length > MAX_LIC_BYTES) return page(['That is too large to be a licence.'], undefined, 422);
      const r = await attachSignedLicense(db, id, text, env.LICENSE_PUBLIC_KEY, who, now);
      return r.ok ? redirect(`/admin/licenses/${id}?msg=issued`) : page(r.errors, undefined, 422);
    }
    if (action === 'delivered') {
      const r = await markDelivered(db, id, who, now);
      return r.ok ? redirect(`/admin/licenses/${id}?msg=delivered`) : page(r.errors, undefined, 422);
    }
    if (action === 'renew') {
      const form = await req.formData();
      const r = await createRenewal(db, id, String(form.get('expires') ?? ''), who, now);
      return r.ok ? redirect(`/admin/licenses/${r.value.license_id}?msg=renewal`) : page(r.errors, undefined, 422);
    }
    if (action === 'revoke') {
      const form = await req.formData();
      const r = await revokeLicense(db, id, String(form.get('reason') ?? ''), who, now);
      return r.ok ? redirect(`/admin/licenses/${id}?msg=revoked`) : page(r.errors, undefined, 422);
    }
  }
  return html('<!doctype html><meta charset="utf-8"><p>Not found.</p>', 404);
}

export default {
  fetch: (req: Request, env: Env): Promise<Response> => handle(req, env),
};
