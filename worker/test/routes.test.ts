import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeTestDb } from './helpers.ts';
import { handle, type Env, type Deps } from '../src/index.ts';

const toolDir = new URL('../../tools/', import.meta.url).pathname;
const seed = join(toolDir, 'fixtures/test-seed.hex');
const PUB = execFileSync('node', [join(toolDir, 'ley81-sign.mjs'), 'pubkey', '--key-file', seed]).toString().trim();
const ORIGIN = 'https://admin.ley81-suite.com';
const FP = 'e'.repeat(64);

const NOW = new Date();
const future = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);

function setup(authed = true) {
  const env: Env = { DB: makeTestDb(), LICENSE_PUBLIC_KEY: PUB, ACCESS_TEAM_DOMAIN: 'ley81.cloudflareaccess.com', ACCESS_AUD: 'aud', ADMIN_EMAILS: 'marc@example.test' };
  const deps: Deps = { verifyAccess: async () => (authed ? { ok: true, email: 'marc@example.test' } : { ok: false, reason: 'no token' }), now: () => NOW };
  const call = (path: string, init: { method?: string; form?: Record<string, string | Blob>; origin?: string | null } = {}) => {
    const headers: Record<string, string> = {};
    if (init.origin !== null && init.method === 'POST') headers.Origin = init.origin ?? ORIGIN;
    let body: FormData | undefined;
    if (init.form) { body = new FormData(); for (const [k, v] of Object.entries(init.form)) body.append(k, v); }
    return handle(new Request(ORIGIN + path, { method: init.method ?? 'GET', headers, body }), env, deps);
  };
  return { env, call };
}

const newLic = { customer: 'Acme Consulting', email: 'ops@acme.test', tier: 'consultant', fingerprint: FP, expires: future(365), note: '' };
const idFrom = (res: Response) => res.headers.get('Location')!.match(/lic_[0-9a-f]{12}/)![0];

function signRequestJson(json: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'route-'));
  writeFileSync(join(dir, 'r.json'), json);
  execFileSync('node', [join(toolDir, 'ley81-sign.mjs'), 'sign-request', join(dir, 'r.json'), '--key-file', seed, '--out', join(dir, 'x.lic')]);
  return readFileSync(join(dir, 'x.lic'), 'utf8');
}

test('without a verified Access identity every admin route is refused', async () => {
  const { call } = setup(false);
  for (const [path, method] of [['/admin', 'GET'], ['/admin/licenses', 'GET'], ['/admin/licenses', 'POST'], ['/admin/audit', 'GET'], ['/admin/assets/admin.css', 'GET']] as const) {
    assert.equal((await call(path, { method })).status, 403, `${method} ${path}`);
  }
});

test('fails closed when Access is not configured, even if a token header is sent', async () => {
  const env: Env = { DB: makeTestDb(), LICENSE_PUBLIC_KEY: PUB, ACCESS_TEAM_DOMAIN: 'REPLACE.cloudflareaccess.com', ACCESS_AUD: 'REPLACE_WITH_ACCESS_APPLICATION_AUD_TAG', ADMIN_EMAILS: 'REPLACE_WITH_ADMIN_EMAIL' };
  const res = await handle(new Request(ORIGIN + '/admin/licenses', { headers: { 'Cf-Access-Jwt-Assertion': 'a.b.c' } }), env);
  assert.equal(res.status, 403);
});

test('public/unknown paths: API not published yet, everything else 404', async () => {
  const { call } = setup(false);
  assert.equal((await call('/api/v1/updates/manifest')).status, 404);
  assert.equal((await call('/')).status, 404);
  assert.equal((await call('/anything')).status, 404);
});

test('admin responses carry strict security headers', async () => {
  const { call } = setup();
  const res = await call('/admin/licenses');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('Content-Security-Policy')!, /default-src 'none'/);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(res.headers.get('Strict-Transport-Security')!, /max-age=31536000/);
  const html = await res.text();
  assert.ok(!/<script/i.test(html) && !/style="/.test(html), 'no scripts and no inline styles (the CSP forbids both)');
});

test('CSRF: POSTs need a same-origin Origin', async () => {
  const { call } = setup();
  assert.equal((await call('/admin/licenses', { method: 'POST', form: newLic, origin: null })).status, 403);
  assert.equal((await call('/admin/licenses', { method: 'POST', form: newLic, origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/admin/licenses', { method: 'POST', form: newLic })).status, 303);
});

test('invalid input: 422, errors shown, nothing stored', async () => {
  const { call } = setup();
  const res = await call('/admin/licenses', { method: 'POST', form: { ...newLic, fingerprint: 'short' } });
  assert.equal(res.status, 422);
  assert.match(await res.text(), /Fingerprint must be/);
  assert.ok(!/lic_[0-9a-f]{12}/.test(await (await call('/admin/licenses')).text()));
});

test('hostile text is escaped everywhere it is shown', async () => {
  const { call } = setup();
  const evil = '<img src=x onerror=alert(1)>"\'';
  const res = await call('/admin/licenses', { method: 'POST', form: { ...newLic, customer: evil, note: evil } });
  assert.equal(res.status, 303);
  for (const page of [await (await call('/admin/licenses')).text(), await (await call(`/admin/licenses/${idFrom(res)}`)).text(), await (await call('/admin/audit')).text()]) {
    assert.ok(!page.includes('<img src=x'), 'raw tag must not appear');
    assert.ok(page.includes('&lt;img src=x'));
  }
});

test('malformed licence ids never reach the database', async () => {
  const { call } = setup();
  for (const id of ["lic_zzzzzzzzzzzz", "lic_1' OR '1'='1", '../etc/passwd', 'lic_abcdef01234']) {
    assert.equal((await call(`/admin/licenses/${encodeURIComponent(id)}`)).status, 404, id);
  }
  assert.equal((await call('/admin/licenses/lic_abcdef012345')).status, 404, 'well-formed but unknown');
});

test('full lifecycle: request → sign offline → upload → deliver → renew → revoke', async () => {
  const { call } = setup();
  const created = await call('/admin/licenses', { method: 'POST', form: newLic });
  assert.equal(created.status, 303);
  const id = idFrom(created);

  const detail = await (await call(`/admin/licenses/${id}`)).text();
  assert.match(detail, /Download request\.json/);

  const reqRes = await call(`/admin/licenses/${id}/request.json`);
  assert.match(reqRes.headers.get('Content-Disposition')!, /request\.json/);
  const reqJson = await reqRes.text();
  assert.equal(JSON.parse(reqJson).license_id, id);
  assert.equal((await call(`/admin/licenses/${id}/download`)).status, 404, 'no licence file before it is issued');

  const lic = signRequestJson(reqJson);

  // a wrong file is refused
  const bad = await call(`/admin/licenses/${id}/upload`, { method: 'POST', form: { text: 'not-a-licence' } });
  assert.equal(bad.status, 422);

  // the right file, uploaded as a real multipart file
  const good = await call(`/admin/licenses/${id}/upload`, { method: 'POST', form: { file: new File([lic], 'x.lic') } });
  assert.equal(good.status, 303, await good.text());
  const dl = await call(`/admin/licenses/${id}/download`);
  assert.equal((await dl.text()).trim(), lic.trim());

  assert.equal((await call(`/admin/licenses/${id}/delivered`, { method: 'POST' })).status, 303);

  const renewed = await call(`/admin/licenses/${id}/renew`, { method: 'POST', form: { expires: future(730) } });
  assert.equal(renewed.status, 303);
  const rid = idFrom(renewed);
  assert.notEqual(rid, id);
  const rlic = signRequestJson(await (await call(`/admin/licenses/${rid}/request.json`)).text());
  assert.equal((await call(`/admin/licenses/${rid}/upload`, { method: 'POST', form: { text: rlic } })).status, 303);
  assert.match(await (await call(`/admin/licenses/${id}`)).text(), /superseded/);

  const rv = await call(`/admin/licenses/${rid}/revoke`, { method: 'POST', form: { reason: 'test revoke' } });
  assert.equal(rv.status, 303);
  const audit = await (await call('/admin/audit')).text();
  for (const a of ['license.requested', 'license.upload_rejected', 'license.issued', 'license.delivered', 'license.renewal_requested', 'license.superseded', 'license.revoked']) {
    assert.ok(audit.includes(a), a);
  }
  assert.ok(audit.includes('marc@example.test'), 'actor recorded');
});
