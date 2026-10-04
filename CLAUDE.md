# CLAUDE.md: ley81-suite.com

Read `README.md` first, then `docs/WEBSITE_REQUIREMENTS.md` and `docs/PRODUCT_OVERVIEW.md`.

## What this site is
- Public **marketing and product-information** site for Ley81·Suite (a desktop AI-governance and data-privacy compliance suite for consultants and companies, Panama Ley 81 de 2019 first).
- A **gated admin area** for license and patch distribution. Both admin pages sit behind **Cloudflare Access with 2FA**. The public marketing pages are not gated.
- Owner: Marc Larouche (solo). Keep things simple to run and cheap to host.

## Constraints and decisions already made
- Cloudflare is the front door. Admin pages must be protected by Cloudflare Access (2FA) **and** the origin must independently verify the Access JWT (`Cf-Access-Jwt-Assertion`), never rely on the edge alone.
- The desktop app fetches update manifests from this domain at runtime, so that machine-facing endpoint must be reachable **without** a human 2FA login (see `docs/LICENSE_AND_PATCH_DISTRIBUTION.md`). Design the public/gated split deliberately.
- Release-signing and license-signing private keys must never live in this repo or on a web server in plaintext.
- No tracking or third-party scripts by default (the product's pitch is local-first and data-sovereign). Self-host fonts (they're in `brand/fonts/`).
- Bilingual: English and Spanish (Panama market). Spanish is the default for the Panama audience.
- Brand: see `brand/BRAND_GUIDE.md`. Use the logo files in `brand/`; do not redraw the mark.

## Do not
- Claim certifications, audits, or legal compliance guarantees the product doesn't have. `docs/PRODUCT_OVERVIEW.md` lists what can honestly be said.
- Publish anything under `docs/reference/` (internal).
- Commit secrets, API keys, signing keys, or customer data.

## Decided 2026-10-04
- Stack: **Astro 7 (static) on Cloudflare Pages**; phase 2 admin/manifest on Cloudflare Workers + R2 + D1. Plain CSS, no UI framework, no client JS by default.
- Both languages from day one; routes are `/es/...` (default) and `/en/...`; content lives inline in `src/pages/[lang]/*.astro`, shared strings in `src/i18n/ui.ts`.
- Pricing page: none yet, "Request a demo" (mailto) only. Contact address in `src/config.ts` is a placeholder.
- macOS is the first platform announced (Windows follows). Do not call it final until it is live-tested, signed and notarized.
- Privacy/Terms: placeholder drafts marked "pending legal review" (noindex). Spanish copy needs native/legal review.
- Run: `npm run dev` (port 4321), `npm run build`. Static assets for the site are copies in `public/`; `brand/` and `assets/` remain the sources.

## Still open (ask Marc before assuming)
Pricing and tiers, how customers buy (Stripe? invoiced?), license model details, real support email/domain, final legal text, real app screenshots (site uses design mockups, labelled as previews), phase 2 (admin, manifest, signing). See the requirements doc.
