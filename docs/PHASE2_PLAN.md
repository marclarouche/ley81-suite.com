# Phase 2: licensing, releases and the admin console

Decided with Marc, 2026-10-04.

## Decisions
- The app gets updates from **https://ley81-suite.com** (TLS), not `enclave-ai.dev`.
- **Signing is offline.** Private keys live only in Marc's macOS Keychain, used through `tools/ley81-sign.mjs`. The website holds public keys only.
- **Separate keys:** one *licence* key (generated 2026-10-04) and the existing *release* key (public half already in the app as `SSP_PUBLIC_KEY`). One compromise cannot forge the other.
- **Licensing = the Enclave model:** offline Ed25519-signed `license.lic`, node-locked to the machine fingerprint (sha256 of the OS machine id).
  - Missing, invalid or wrong-machine licence: hard block at the Activate screen.
  - Valid but past `expires_at` (annual maintenance lapsed after one year): the app keeps working; **report generation is disabled** until a renewed licence is imported.
  - Renewal = Marc signs a new `.lic` with a later `expires_at`; the customer imports it. No network call is ever needed to check a licence.
- **Admin console:** only Marc, behind Cloudflare Access (2FA); the origin also verifies the Access JWT. A second admin is added later.

## Stages
**A. Licensing in the app + signing tool: DONE (2026-10-04).** `tools/ley81-sign.mjs`; `app/src-tauri/src/license.rs`; Activate screen; Reports gated on expiry; the Node signer and Rust verifier are tested against each other with fixtures.

**B. Admin console + licence records (next).** Astro with the Cloudflare adapter (marketing pages stay static; `/admin/*` and `/api/*` are server-rendered Workers), D1 database, Access-JWT verification middleware, audit log. Admin Licenses page: create a licence request (customer, tier, seats, fingerprint, expiry), download `request.json`, sign it offline with the tool, upload the `.lic` (the server checks the signature with the public key), mark delivered, record renewals. Revocation is recorded but cannot be enforced on offline apps: a lapsed licence simply is not renewed.

**C. Releases + signed manifest.** R2 bucket for installers, a Releases admin page (version, channel, release notes, SHA-256, publish/unpublish/rollback), and the public machine-facing `GET /api/v1/updates/manifest` (outside Access, protected by signatures). The tool gains a `release` key and a manifest-signing command. The app's existing client already verifies SHA-256 + Ed25519 per resource and never self-patches.

## Known limits
- A licence can be copied only to a machine with the same fingerprint (that is the point); reinstalling the OS changes the fingerprint and needs a re-issue.
- Offline licences cannot be remotely revoked.
- Expiry trusts the system clock, with one guard (Ley81-Suite only, added 2026-10-04): before generating a report the app compares the clock with the newest timestamp in the project's encrypted audit log and refuses if the clock is more than **24 hours** behind it. This stops "use the app past expiry, then set the clock back". It cannot stop freezing the clock before expiry and never advancing it. Side effect: if a computer's clock was once set more than 24 hours *forward* while the app was in use, reports stay locked in that project until real time catches up.
- Which reports are gated: the PDF/DOCX report documents (status report, attestation PDF/DOCX/evidence package, certificate, compliance report DOCX). Raw data exports (project JSON, controls CSV, full audit package) stay available so customers always keep access to their own data.
