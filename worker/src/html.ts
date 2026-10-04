// Server-rendered admin pages. No client JavaScript and no inline styles, so a
// strict CSP can forbid both. Every dynamic value goes through esc().

import type { LicenseRow, AuditRow } from './repo.ts';
import { defaultExpiryYmd } from './licenses.ts';

export function esc(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const ADMIN_CSS = `
:root{--navy:#1b3a5c;--teal:#00708f;--bg:#f3f2f2;--paper:#fff;--rule:#cfcdcc;--text:#201e1d;--muted:#5a5653;--ok:#2f7d4f;--warn:#9a5b12;--bad:#aa0b56}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 Georgia,'Times New Roman',serif}
header{background:var(--navy);color:#fff;padding:.8rem 1.25rem;display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap}
header strong{font-size:1.1rem}header a{color:#cfe8f1;text-decoration:none}header a:hover{text-decoration:underline}
header .who{margin-left:auto;font-size:.85rem;color:#cfe8f1}
main{max-width:1100px;margin:0 auto;padding:1.5rem 1.25rem 4rem}
h1{font-size:1.6rem;color:var(--navy);margin:.2rem 0 1rem}h2{font-size:1.15rem;color:var(--navy);margin:1.6rem 0 .6rem}
a{color:var(--teal)}table{width:100%;border-collapse:collapse;background:var(--paper)}
th,td{text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--rule);vertical-align:top;font-size:.92rem}
th{border-bottom:2px solid var(--navy);color:var(--navy)}
.card{background:var(--paper);border-top:3px solid var(--navy);padding:1rem 1.2rem;margin:0 0 1.2rem}
label{display:block;font-size:.85rem;color:var(--muted);margin:.7rem 0 .2rem}
input,select,textarea{width:100%;padding:.5rem .6rem;border:1px solid var(--rule);background:#fff;font:inherit}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0 1rem}
button,.btn{display:inline-block;margin-top:.9rem;background:var(--navy);color:#fff;border:2px solid var(--navy);padding:.5rem 1rem;font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
button.ghost,.btn.ghost{background:transparent;color:var(--navy)}button.danger{background:var(--bad);border-color:var(--bad)}
.badge{display:inline-block;padding:.05rem .5rem;font-size:.78rem;border:1px solid currentColor;text-transform:uppercase;letter-spacing:.05em}
.s-requested{color:var(--warn)}.s-issued{color:var(--ok)}.s-superseded{color:var(--muted)}.s-revoked{color:var(--bad)}
.err{border-left:4px solid var(--bad);background:#fff;padding:.7rem 1rem;margin:0 0 1rem}.ok{border-left:4px solid var(--ok);background:#fff;padding:.7rem 1rem;margin:0 0 1rem}
code,pre{font-family:ui-monospace,Menlo,monospace;font-size:.85rem}pre{background:#fff;border:1px solid var(--rule);padding:.7rem;overflow:auto}
.mono{font-family:ui-monospace,Menlo,monospace;font-size:.82rem;word-break:break-all}.muted{color:var(--muted)}.flush{margin-top:0}
`;

export function layout(title: string, body: string, who: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Ley81·Suite admin</title>
<link rel="stylesheet" href="/admin/assets/admin.css"></head><body>
<header><strong>Ley81·Suite admin</strong><a href="/admin/licenses">Licences</a><a href="/admin/audit">Audit log</a><span class="who">${esc(who)}</span></header>
<main>${body}</main></body></html>`;
}

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');
const badge = (s: string) => `<span class="badge s-${esc(s)}">${esc(s)}</span>`;

export const FLASH: Record<string, string> = {
  created: 'Licence request created. Next: download the request file and sign it on your Mac.',
  issued: 'Signed licence verified and attached. It is ready to send to the customer.',
  delivered: 'Marked as delivered.',
  renewal: 'Renewal request created. Sign it the same way, then upload the file.',
  revoked: 'Licence revoked in the records (an installed licence keeps working until it expires).',
};

export function licensesPage(rows: LicenseRow[], who: string, opts: { errors?: string[]; values?: Record<string, string>; now: Date; flash?: string }): string {
  const v = opts.values ?? {};
  const errs = opts.errors?.length ? `<div class="err"><strong>Not saved:</strong><ul>${opts.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
  const flash = opts.flash && FLASH[opts.flash] ? `<div class="ok">${esc(FLASH[opts.flash])}</div>` : '';
  const list = rows.length
    ? `<table><thead><tr><th>Customer</th><th>Tier</th><th>Machine</th><th>Expires</th><th>Status</th><th></th></tr></thead><tbody>${rows
        .map(
          (r) => `<tr><td>${esc(r.customer_name)}<br><span class="muted">${esc(r.customer_email ?? '')}</span></td><td>${esc(r.tier)}</td>
<td class="mono">${esc(r.fingerprint.slice(0, 12))}…</td><td>${esc(day(r.expires_at))}</td><td>${badge(r.status)}</td>
<td><a href="/admin/licenses/${esc(r.license_id)}">Open</a></td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<p class="muted">No licences yet.</p>';
  return layout(
    'Licences',
    `<h1>Licences</h1>${flash}${errs}
<div class="card"><h2 class="flush">New licence request</h2>
<p class="muted">One licence per machine. The customer reads their machine fingerprint from the app’s Activate screen. Nothing is signed here: you sign the request file offline on your Mac.</p>
<form method="post" action="/admin/licenses">
<div class="row"><div><label for="customer">Customer / firm</label><input id="customer" name="customer" required maxlength="200" value="${esc(v.customer)}"></div>
<div><label for="email">Contact email (optional)</label><input id="email" name="email" type="email" value="${esc(v.email)}"></div></div>
<div class="row"><div><label for="tier">Tier</label><select id="tier" name="tier"><option value="consultant"${v.tier === 'company' ? '' : ' selected'}>Consultant</option><option value="company"${v.tier === 'company' ? ' selected' : ''}>Company</option></select></div>
<div><label for="expires">Maintenance valid until (UTC, end of day)</label><input id="expires" name="expires" type="date" required value="${esc(v.expires ?? defaultExpiryYmd(opts.now))}"></div></div>
<label for="fingerprint">Machine fingerprint (64 characters)</label><input id="fingerprint" name="fingerprint" required minlength="64" maxlength="64" class="mono" value="${esc(v.fingerprint)}">
<label for="note">Note (optional)</label><textarea id="note" name="note" rows="2" maxlength="1000">${esc(v.note)}</textarea>
<button type="submit">Create request</button></form></div>
<h2>All licences</h2>${list}`,
    who,
  );
}

export function detailPage(r: LicenseRow, who: string, opts: { errors?: string[]; flash?: string; renewals: LicenseRow[]; now: Date }): string {
  const errs = opts.errors?.length ? `<div class="err"><ul>${opts.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
  const flash = opts.flash && FLASH[opts.flash] ? `<div class="ok">${esc(FLASH[opts.flash])}</div>` : '';
  const id = esc(r.license_id);
  const nextYear = new Date(r.expires_at);
  nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);

  let actions = '';
  if (r.status === 'requested') {
    actions = `<div class="card"><h2 class="flush">1. Sign it on your Mac</h2>
<p><a class="btn" href="/admin/licenses/${id}/request.json">Download request.json</a></p>
<p>In Terminal, from the website repo (you will be asked to approve Keychain access):</p>
<pre>node tools/ley81-sign.mjs sign-request ~/Downloads/${id}.request.json --out ~/Downloads/${id}.lic</pre></div>
<div class="card"><h2 class="flush">2. Upload the signed licence</h2>
<p class="muted">The server checks the signature and that it is exactly this request (same customer, machine and expiry). Anything else is refused.</p>
<form method="post" action="/admin/licenses/${id}/upload" enctype="multipart/form-data">
<label for="file">Signed licence file (.lic)</label><input id="file" name="file" type="file" accept=".lic,text/plain">
<label for="text">…or paste its contents</label><textarea id="text" name="text" rows="3" class="mono"></textarea>
<button type="submit">Verify and attach</button></form></div>`;
  } else if (r.status === 'issued') {
    actions = `<div class="card"><h2 class="flush">Send to the customer</h2>
<p><a class="btn" href="/admin/licenses/${id}/download">Download ${id}.lic</a></p>
<p class="muted">Email the file. They import it from the Activate screen, or from Settings → Licence for a renewal.</p>
${r.delivered_at ? `<p>Marked delivered on ${esc(day(r.delivered_at))}.</p>` : `<form method="post" action="/admin/licenses/${id}/delivered"><button class="ghost" type="submit">Mark as delivered</button></form>`}</div>
<div class="card"><h2 class="flush">Renew maintenance</h2>
<form method="post" action="/admin/licenses/${id}/renew"><label for="rexp">New expiry (UTC, end of day)</label>
<input id="rexp" name="expires" type="date" required value="${esc(nextYear.toISOString().slice(0, 10))}"><button type="submit">Create renewal request</button></form></div>`;
  }
  if (r.status === 'requested' || r.status === 'issued') {
    actions += `<div class="card"><h2 class="flush">Revoke (record only)</h2>
<p class="muted">An installed licence cannot be recalled; it stops being renewed and expires on its date. This records why.</p>
<form method="post" action="/admin/licenses/${id}/revoke"><label for="reason">Reason</label><input id="reason" name="reason" required minlength="3" maxlength="500">
<button class="danger" type="submit">Revoke</button></form></div>`;
  }
  const related = opts.renewals.length
    ? `<h2>Renewals of this licence</h2><ul>${opts.renewals.map((x) => `<li><a href="/admin/licenses/${esc(x.license_id)}">${esc(x.license_id)}</a> ${badge(x.status)} until ${esc(day(x.expires_at))}</li>`).join('')}</ul>`
    : '';
  return layout(
    r.license_id,
    `<p><a href="/admin/licenses">← All licences</a></p><h1>${esc(r.customer_name)} ${badge(r.status)}</h1>${flash}${errs}
<div class="card"><table><tbody>
<tr><th>Licence id</th><td class="mono">${id}</td></tr>
<tr><th>Customer</th><td>${esc(r.customer_name)} <span class="muted">${esc(r.customer_email ?? '')}</span></td></tr>
<tr><th>Tier</th><td>${esc(r.tier)}</td></tr>
<tr><th>Machine fingerprint</th><td class="mono">${esc(r.fingerprint)}</td></tr>
<tr><th>Valid until</th><td>${esc(r.expires_at)}</td></tr>
<tr><th>Issued</th><td>${esc(r.issued_at ?? '—')}</td></tr>
<tr><th>Renews</th><td>${r.renews_license_id ? `<a href="/admin/licenses/${esc(r.renews_license_id)}">${esc(r.renews_license_id)}</a>` : '—'}</td></tr>
${r.status === 'revoked' ? `<tr><th>Revoked</th><td>${esc(day(r.revoked_at))}: ${esc(r.revoked_reason)}</td></tr>` : ''}
${r.note ? `<tr><th>Note</th><td>${esc(r.note)}</td></tr>` : ''}
</tbody></table></div>${actions}${related}`,
    who,
  );
}

export function auditPage(rows: AuditRow[], who: string): string {
  return layout(
    'Audit log',
    `<h1>Audit log</h1><table><thead><tr><th>Time (UTC)</th><th>Who</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>${rows
      .map((a) => `<tr><td class="mono">${esc(a.ts)}</td><td>${esc(a.actor)}</td><td>${esc(a.action)}</td><td class="mono">${esc(a.target ?? '')}</td><td class="mono">${esc(a.details ?? '')}</td></tr>`)
      .join('')}</tbody></table>`,
    who,
  );
}

export function forbiddenPage(): string {
  return '<!doctype html><meta charset="utf-8"><title>Forbidden</title><p>Forbidden.</p>';
}
