# Website requirements (proposal for the first build session)

Marc's brief (2026-10-04): a **marketing / product-information site** plus a **gated admin area for license and patch distribution**, with the admin pages behind **Cloudflare Access 2FA**. Everything below is a proposal to react to, not a decided spec.

## 1. Public site (no login)
Suggested pages, Spanish default with English toggle (or `/es` and `/en`):
1. **Home**: one-line pitch, the logo mark, three benefits (local-first and private; Law 81 + GDPR + EU AI Act in one place; client-ready bilingual reports), a screenshot, a call to action.
2. **Product**: the GOVERN→MAP→MEASURE→MANAGE flow and the screens (Panel, Sistemas, Brechas, Evidencia, Informes).
3. **For consultants**: multi-client installs, "Prepared by" firm branding on reports, per-client encrypted projects.
4. **For companies**: single-org install, roles, audit trail.
5. **Frameworks**: Law 81 / Decree 285, GDPR, EU AI Act, ISO 42001, with plain-language notes on what each control area covers. (A natural place to be useful for search.)
6. **Reports / samples**: downloadable sample PDFs from `assets/sample-reports/` (clearly labelled as samples).
7. **Security & privacy**: honest summary from `PRODUCT_OVERVIEW.md` ("what we can say"). No overclaiming.
8. **Pricing / Buy**: undecided (see open decisions). Until then "Contact us" or "Request a demo".
9. **Docs / FAQ / Support**: install steps, system requirements, how recovery codes work, contact.
10. **Legal**: Privacy policy, Terms/EULA, cookie statement (ideally "no cookies"). None exist yet; they need writing.
11. **About / contact**.

Technical wants: fast static-first pages, self-hosted fonts from `brand/fonts/`, favicon set from `brand/icons/`, Open Graph image (to create from the lockup), sitemap and hreflang for ES/EN, accessible contrast (navy/teal on light backgrounds is fine), no third-party trackers.

## 2. Gated admin area (Cloudflare Access + 2FA)
Two admin pages, as requested:
- **Licenses**: create, view, revoke licenses; bind/unbind machines; issue offline licenses; see expiry. (Design background in `LICENSE_AND_PATCH_DISTRIBUTION.md` and `reference/enclave_suite_license_plan.md`.)
- **Patches / releases**: upload a release, record version + release notes, publish it to a channel, sign the manifest, see what's live, roll back.

### How the gating should work
- Put the admin hostname/path (e.g. `admin.ley81-suite.com` or `/admin*`) behind a **Cloudflare Access application** with a policy limited to Marc's identity and **2FA enforced** (IdP MFA or Access one-time PIN plus a second factor; a hardware key requirement is possible with a supported IdP).
- **Defence in depth**: the admin backend must verify the `Cf-Access-Jwt-Assertion` header (signature against the team's Access certs, audience, expiry) on every request. If the origin is reachable directly, Access alone is bypassable; use **Cloudflare Tunnel** (no public origin IP) or firewall the origin to Cloudflare.
- Add a short Access session duration, and log admin actions.
- Automation (CI uploading builds) should use an Access **service token**, not a person's session.

### The one trap: the app itself must reach some of this
The desktop app downloads update manifests and files over HTTPS at runtime. It can't pass a 2FA prompt. So the machine-facing endpoints (manifest, signed downloads, status) must be **outside** the Access-protected paths (or use a narrowly-scoped bypass/service-token policy), and protected instead by cryptography: Ed25519-signed manifests and SHA-256 checks, which the app already verifies. Keep the signing private key offline or in a KMS/HSM, never on the web server. See the next doc.

## 3. Open decisions (need Marc)
1. **Stack and hosting**: static site + Cloudflare Pages/Workers, or a small server app? (An admin area with uploads and signing suggests Workers + R2/KV/D1 or a small VPS behind a Tunnel.)
2. **Domains**: `ley81-suite.com` apex for marketing; separate admin subdomain?
3. **Pricing and tiers**: per consultant seat? per company? maintenance fee (the suite plan gates *Reports* on expired maintenance)? Currency and invoicing.
4. **How customers buy**: Stripe checkout (self-serve) vs invoiced/offline (the suite plan's Track A/Track B); who delivers the installer and license.
5. **Update server home**: the app currently points at `enclave-ai.dev` (see next doc). Move it to `ley81-suite.com`?
6. **Languages**: Spanish and English from day one?
7. **Content owner**: who writes Spanish legal text? (A Panama-qualified lawyer should review terms, privacy and the compliance claims.)
8. **Launch scope**: is macOS announced? Is the license system required before first sale?
