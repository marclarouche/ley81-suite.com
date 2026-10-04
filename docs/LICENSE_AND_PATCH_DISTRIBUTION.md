# License and patch distribution: what exists, what the app expects, what's missing

Written 2026-10-04 from reading the app's code (`Ley81-Suite/app/src-tauri/src/network.rs`, `tauri.conf.json`) and the sibling Enclave suite's plans (copies in `reference/`). Where something couldn't be confirmed it says so.

## 1. What the desktop app already has (client side)

**Update client**: `network.rs`, ported from Enclave-AI. Commands: `check_for_updates`, `download_and_verify_delta`, `refresh_regulatory_data`, `check_maintenance_status`, `get_cached_regulatory_data_info`. I did not find any screen in the app that calls them, so today nothing user-visible triggers an update check.

How it works:
- Fetches one **manifest** over HTTPS from `<origin>/api/v1/ssp/updates/manifest`. The origin is hard-coded: `PRODUCTION_ORIGIN = "https://enclave-ai.dev"` (the Enclave suite's server), and the manifest path still says `ssp` (a leftover of the port). Neither matches this product or this domain.
- Every resource URL inside the manifest must be on that same origin (`validate_resource_origin`), otherwise it's refused.
- Each resource carries a SHA-256 and an **Ed25519 signature**; the app verifies both against an embedded public key (`SSP_PUBLIC_KEY`, generated 2026-08-23; the private key is held by Marc outside the repo) and discards anything that fails. Fail-secure.
- It **never self-applies** anything to the running binary: it downloads and verifies; it does not patch itself. "Patch distribution" therefore means publishing new, signed installers, and optionally signed regulatory-data bundles and a maintenance/advisory feed.
- Manifest fields (from the Rust struct): current/latest version, latest release date, delta available + delta bundle (id, url, sha256, size_bytes, signature, algorithm), regulatory data (version, updated, url, sha256, signature, available), maintenance status (same shape), release notes, advisory. **Caution:** the struct's incoming field names are snake_case while the outgoing ones are camelCase, which may not match what `enclave-ai.dev` actually serves. Check against the real server response before building the new one.

**Licensing**: **none.** There is no license file, hardware fingerprint, activation screen, or enforcement in Ley81-Suite today. The Enclave suite's decided design is in `reference/enclave_suite_license_plan.md` (Ed25519-signed `license.lic`, node-locked to a hardware fingerprint, hard block when missing or mismatched, Reports feature disabled after maintenance lapses, Track A online via Stripe + Keygen.sh vs Track B offline invoiced). That plan names the Enclave products, not Ley81-Suite; Marc would need to decide Ley81-Suite follows it.

**Build and signing**: `tauri.conf.json` has the macOS signing identity (Developer ID Application, team UZ6W4YL2P8) and hardened runtime. macOS builds also need notarization. A Windows code-signing certificate: not confirmed.

## 2. What the website would need to provide

### Machine-facing (must be reachable by the app, NOT behind 2FA)
Protect these by cryptography (signed manifests, hashes), not by login:
- `GET /api/v1/updates/manifest` (new, product-specific path): the signed manifest.
- Download URLs for installers / bundles (public or short-lived signed links).
- Optional maintenance/advisory feed.
- If the app is changed to point here, `PRODUCTION_ORIGIN` and the manifest path must change in the app and ship in a new build; old builds will keep calling `enclave-ai.dev`.

### Admin pages (behind Cloudflare Access + 2FA)
1. **Releases**: upload an installer (Windows `.msi/.exe`, macOS `.dmg`), version, release notes, channel (stable/beta), SHA-256 computed on upload, publish/unpublish, roll back, see download counts. **Signing**: produce the signed manifest without the private key sitting on the server: options are an offline signing step (Marc signs the manifest locally and uploads the signature), or a KMS/HSM-held key. Decide which.
2. **Licenses**: customer, product (Ley81-Suite), tier (consultant / company), seats, expiry, status; issue offline license (hardware fingerprint in, signed `license.lic` out); revoke; bind/unbind machine; audit log of every admin action.
3. Auth: Cloudflare Access JWT verified on every admin request (see `WEBSITE_REQUIREMENTS.md`).

### Data to store
Customers; licenses (id, customer, tier, seats, fingerprints[], issued_at, expires_at, status); releases (version, channel, files + hashes, notes, published_at); an admin audit log. Never store signing private keys here.

## 3. Open questions for Marc
1. Which origin should the app use: `ley81-suite.com` (needs an app change) or keep sharing `enclave-ai.dev`?
2. Does Ley81-Suite adopt the Enclave licensing design (hardware-locked `license.lic`, Reports gated on maintenance), or something simpler for launch?
3. Self-serve (Stripe) vs invoiced vs both; seat model for consultants (per consultant? per client?).
4. Where does the manifest/license signing happen (offline vs KMS)? Same key for manifests and licenses, or separate keys?
5. Does the app need an in-app "Check for updates" screen (none exists)?
6. Windows code-signing certificate and macOS notarization: who/when?
7. Update cadence and a rollback policy (see `reference/enclave_ai_update_channel_rollback_plan.md`: GAP removed its network client entirely on 2026-09-01 for STIG reasons; a conscious choice either way for this product).

## 4. Suggested build order
1. Marketing site (static) with brand assets, product pages, sample reports.
2. Release hosting + signed manifest endpoint, wired to an in-app update check.
3. Admin Releases page behind Access.
4. Licensing: license model decision, app-side verification, admin Licenses page, Stripe if self-serve.
