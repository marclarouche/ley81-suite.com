# Product overview (as of 2026-10-06, written from the built app)

Use this, not `PRD_original.md`, as the source of truth for what the product does. The PRD describes the original plan; several things differ (e.g. the PRD says per-client `.cdb` files and `keyring-rs`; the app stores each client in an encrypted SQLCipher project database and keeps credentials in the OS-protected store).

## One-line description
Ley81·Suite is a local-first desktop application that helps consultants and companies assess, document, and attest AI governance and data-protection compliance, starting with Panama's Law 81 of 2019 and Executive Decree 285, alongside GDPR and the EU AI Act.

## Who it's for
- **Consultants / consulting firms**: run many client engagements from one install; every client is its own encrypted project; reports carry the firm's "Prepared by" name and contact details.
- **Companies / SMEs**: a single-organisation install with a team (Admin, Analyst, Auditor, Viewer).

## What it does
- **Frameworks** (eleven, each switched on or off per client; the set drives readiness scoring and filtering everywhere). Grouped as the app groups them:
  - *Privacy and data protection*: Panama Law 81 de 2019 and Decree 285 (verified against the official Gaceta Oficial; 25 controls, with Decree 285 reviewed article by article, including breach notification, data protection officer, processor contracts and the technical file), GDPR.
  - *Artificial intelligence*: EU AI Act (37 articles, kept current with the 2026 Digital Omnibus changes), ISO/IEC 42001, and **Agentic AI / Zero Trust** (added 2026-10-10: 19 controls for AI agents covering an agent inventory and named owners, documented scope and least privilege, a policy enforcement point, prompt-injection screening, human approval for high-impact actions, rate limits and circuit breakers, and supply-chain verification of tools, plugins, MCP servers and models; our own wording, informed by public guidance from SANS, the OWASP Agentic AI Top 10 and Silverfort; not an official standard. Marc's decision 2026-10-10: public pages say only "public industry guidance" and do not name those sources; the in-app catalog still credits them).
  - *Information security standards*: **NIST CSF 2.0** (all 106 subcategories, taken from NIST's own published Core), **ISO/IEC 27001:2022** (clauses 4 to 10 and all 93 Annex A controls; our own wording, official ids and titles).
  - *Cybercrime*: **Ley 478 de 2025** (12 controls from the articles that affect organizations; checked against Gaceta Oficial Digital No. 30337).
  - *IT governance and audit*: **COBIT 2019** (40 governance and management objectives; our own wording, ISACA ids and names).
  - *Public-sector requirements*: **AIG Resolucion No. 07 de 2026** (the ten minimum cybersecurity measures plus scope and report; checked against Gaceta Oficial Digital No. 30524-B).
  - **Public-copy status (updated 2026-10-10):** the public frameworks, home and consultants pages now list all eleven, including Agentic AI / Zero Trust. Still pending: **Ley 478 and AIG 07** review by Panamanian counsel (applicability, service-provider status, scope); confirmation of **ISACA's terms** for using COBIT 2019 objective names and ids commercially; legal-team review of **all new Spanish text**. The page states these as pending. Never write "compliant with" or "certified to" any of them; the reports say "consistent with".
- **Method**: GOVERN → MAP → MEASURE → MANAGE.
- **AI systems inventory** (Sistemas): each system with data category, legal basis, transfer mechanism, human-in-the-loop, DPA status, and EU AI Act risk level.
- **Gap register** (Brechas): findings with severity (calculated from a likelihood × impact matrix using the system's data sensitivity, transfer and legal basis), corrective action, owner, due date, framework tags, activity log, and tiered evidence (policy / procedure / proof).
- **Evidence vault** (Evidencia): every uploaded document across all gaps, who uploaded it and when. Evidence files are encrypted at rest.
- **Shared evidence with review**: one evidence file can be linked into other controls instead of being uploaded again. A link **counts only after a person reviews and accepts it** on the target control (a rejection needs a reason). A second reviewer is encouraged but **not required**: a solo consultant can review their own link, and the audit trail records plainly that it was a self-review. Reviewing is Admin/Analyst only; an "Awaiting review" list on the Evidence screen and a count in the sidebar show what is waiting. Deleting a file (Admin only) removes it everywhere and warns how many controls lose it.
- **Related controls (suggestions)**: the Panama-specific controls (Law 81 / Decree 285, Ley 478, AIG 07) carry suggested links to related GDPR, EU AI Act, ISO 42001, ISO 27001 and NIST CSF controls, shown on each control's detail screen. These are **our own judgment, not an official mapping** (NIST publishes no CSF-to-ISO 27001 mapping), the screen says so, and they never change a control's status.
- **ISO/IEC 27001 Statement of Applicability**: for each Annex A control, applicable or excluded, with a justification required either way. Excluded controls leave the readiness figure. Exports to PDF and Word (English and Spanish, titles included) and is bundled into the full audit package whenever ISO 27001 is switched on. It is a document aid for preparing for an audit, not a certification.
- **Dashboard** (Panel): readiness percentage per active framework, phase progress, gaps by severity; two layouts (Scoreboard and Ledger).
- **Reports** (Informes), PDF and Word, English and Spanish:
  - Remediation Plan & Attestation (PDF, DOCX, or a ZIP evidence package with the actual evidence files and a SHA-256 manifest). Only available once every in-scope gap is remediated, because it is an unconditional attestation.
  - Certificate of Self-Assessment: one page with an embossed seal and a SHA-256 content hash (an integrity hash, **not** a digital signature).
  - Compliance Status Report: a progress report at any completion level.
  - On Consultant installs every report gets a cover page and footer with the consulting firm's name and contact details, and a small "Generated by Ley81·Suite" label.
- **Bilingual**: the whole interface and the reports in Spanish and English. Since 2026-10-10 the control text (title, description, checklist) of all eleven frameworks also shows in Spanish on the application's screens; this Spanish is machine-assisted and awaiting legal review. **Marc's decision 2026-10-10: do not advertise Spanish control text on the public site until the legal review is done** (the public frameworks page keeps only the original "Spanish text ... pending legal review" caveat). Word/PDF reports and the Statement of Applicability export still print the control text in English (parked), so do not promise Spanish control text inside reports yet.

## Security model (what is true today)
- Local-first: client data lives on the user's machine in a SQLCipher-encrypted database; the audit trail is a separate encrypted database. No cloud account required.
- Sign-in with the platform authenticator: **Windows Hello** (WebAuthn) on Windows; **Touch ID** on macOS (newly built, in testing; macOS availability should not be announced as final until it is live-tested and the build is signed and notarized).
- Role-based access (Admin, Analyst, Auditor, Viewer) with segregation of duties: the Auditor role owns the audit trail.
- Recovery codes are **single-use**: using one issues a replacement. Admins can reissue a member's access.
- Account lockout, re-authentication for sensitive actions, 7-year audit-log retention with Auditor-gated purge, cryptographic erasure when a project is deleted. **Removed 2026-10-04:** the 60-day inactivity auto-disable is gone from the app (Marc's decision: the product inherits the desktop's security boundary). Lockout, re-authentication and the idle-session timeout stay. Do not advertise or imply dormant-account auto-disable.
- Security baseline: **CIS Controls v8, Implementation Group 1**, assessed internally against all 56 safeguards (see `reference/CIS_CONTROLS_STATUS_internal.md`: 18 product-level safeguards compliant, 2 partial, 1 deliberately not built (5.3 dormant accounts), 2 not applicable, 33 organisational and not software-verifiable). Static and dynamic scans were run in September 2026. These are internal assessments, not third-party certifications.

## What we can honestly say
- "Assessed against CIS Controls v8 IG1", "local-first", "encrypted at rest", "bilingual", "built for Panama's Law 81 with GDPR and EU AI Act coverage", "reports your clients can verify (content hash)".
- Law 81 content was checked against the official gazette text; the EU AI Act catalog against the European Commission's AI Act Service Desk.

## What we must not say
- That it is certified, audited by a third party, "SOC 2", "ISO 27001 certified", or "FedRAMP/CMMC" anything. It is not a CMMC tool (an earlier scaffold was; all of that has been removed).
- That it is **FIPS 140-2/140-3 validated or certified** (a module validation; deliberately not pursued). Accurate: "uses FIPS-approved algorithms (AES-256, SHA-256, Ed25519)". Argon2 key derivation is not FIPS-approved, so never say *all* algorithms are.
- That the Certificate is a digital signature or legal certification. It is a self-assessment with an integrity hash.
- That it guarantees legal compliance. It supports documentation and assessment; a qualified person still makes the determination.
- Anything about Panama's AI bill (Proyecto de Ley 588): it passed the Assembly on 2026-08-19 but was **not yet sanctioned** as of 2026-10-04. Do not describe it as law or as supported until it is promulgated and the product supports it.
- macOS as shipping, until live-tested and signed.

## Also must not say (added 2026-10-06)
- That any of the new frameworks makes a customer "ISO 27001 compliant", "NIST CSF compliant", or similar. The Statement of Applicability and the catalogs support preparation; certification is a third-party audit this product does not provide.
- That the related-control suggestions are an official or authoritative mapping.
- That two-person evidence review is enforced. It is encouraged and recorded, never required.
- That the Spanish text for the new frameworks has been legally reviewed (it has not yet).
- That Agentic AI / Zero Trust is an official SANS, OWASP or Silverfort standard, is endorsed by them, or makes an organization "OWASP compliant" or "Zero Trust certified". It is our own control set, informed by their public guidance.
- That Spanish control text appears inside the Word/PDF reports (screens only for now).

## Not built yet (don't promise)
SBP banking and AML packs (Ley 23), ISO 22301 / ISO 31000 / PCI DSS, an Admin setting to *require* an independent evidence reviewer, In-app update delivery, Stripe purchase flow, Bill 588 support, CAC/PIV smart-card sign-in, a logo upload / white-label option for consulting firms, logos in Word reports.

## Licensing (built 2026-10-04, not yet shipped to customers)
Offline, machine-locked licence file (Ed25519-signed). No licence for this machine: the app will not open past the Activation screen. Licence past its expiry date (annual maintenance not renewed): everything keeps working except report generation, until a renewed licence is imported. See `PHASE2_PLAN.md`.

## Stack (for context)
Tauri v2 (Rust backend, React frontend), SQLCipher, WebAuthn (Windows Hello), LocalAuthentication + Keychain (macOS). Roughly 390 automated Rust tests.
