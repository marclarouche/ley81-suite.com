# Handoff: Ley81-Suite — AI & data compliance workspace

## Overview

Ley81-Suite is compliance software for small businesses (PYMEs) that need to meet **and prove** privacy, data and AI compliance across their IT systems and business operations. The prototype covers the full working loop for a single client company: sign in, inventory the AI systems in use, track compliance gaps against the active regulatory frameworks, attach evidence, and generate a signed attestation document.

Regulatory scope is multi-framework: **Ley 81 de 2019 (Panamá) / ANTAI** and **Decreto Ejecutivo 285 de 2021** as the primary regime, plus **GDPR** and the **EU AI Act**, with ISO/IEC 42001 available but off by default.

The app is organised by object (Systems, Gaps, Evidence, Reports) with the four-phase governance cycle — **GOVERN → MAP → MEASURE → MANAGE** — surfaced as progress on the dashboard rather than as top-level navigation.

## About the Design Files

The files in this bundle are **design references created in HTML** — a prototype showing intended look and behaviour, not production code to copy directly.

`Ley81-Suite.dc.html` is a single-file component using a bespoke template runtime (`support.js`). Do **not** port that runtime. The task is to **recreate these designs in the target codebase's existing environment** (React, Vue, SwiftUI, native, etc.) using its established patterns, router, form library and component primitives. If no environment exists yet, pick the framework that best fits the project and implement there.

Read the prototype for: layout, hierarchy, exact copy (both languages), table columns, state transitions and the design tokens. Ignore its file structure entirely.

## Fidelity

**High-fidelity.** Final colours, typography, spacing and copy. Recreate the UI faithfully using the codebase's existing libraries. All visual values come from the **Broadsheet** design system stylesheet bundled here — use its CSS custom properties rather than re-deriving values.

### What is NOT built (scope gaps a developer must fill)

The prototype is a navigational and visual reference. The following are stubbed:

- **All data is static**, defined as two literal dictionaries (Spanish and English) in the component's logic class. There is no API layer, no fetching, no persistence.
- **No real authentication.** Both sign-in paths call the same "go to dashboard" handler. WebAuthn/passkey enrolment and invite-code redemption are visual only.
- **No role-based access control.** The sidebar "Switch view" control swaps a label and header line; it does not gate any screen or action.
- **Forms do not submit or validate.** Inputs are uncontrolled; Save and Cancel both navigate back to the gap list.
- **Search and the All/Open/Remediated filter on the gap register are non-functional** (rendered, not wired).
- **File upload, "View" evidence links, PDF export and "Send for signature" are no-ops.**
- **No empty, loading or error states** exist except one: the "Gaps by severity" table shows a prompt when every framework is deselected.
- **Not responsive.** Fixed desktop layout; a 236px sidebar plus fluid main column. No breakpoints.
- **No accessibility pass beyond semantics.** Native inputs and labels are used throughout and `aria-current="page"` marks the active nav item, but there is no focus management on view change, no live regions, and clickable table rows are `<tr>` elements with an onClick — they are not keyboard reachable. Fix this in implementation.

## Screens / Views

Nine views in one component, switched by a single `screen` state value. Two of them (login, onboarding) are full-bleed; the other seven render inside the app shell.

---

### 1. Login — `screen: 'login'`

**Purpose:** Sign in. There is no email/password anywhere in this product; access is device-bound or invite-based.

**Layout:** Full viewport, CSS grid `1.15fr 1fr`.

*Left panel* — padding `60px 60px 40px`, flex column, `justify-content: space-between`:
- Top: a masthead rule pair — a 3px solid `--color-text` bar, an 8px-padded row holding the dateline ("Ley 81 de 2019 · ANTAI · Panamá") on the left and the **ES/EN language toggle** on the right, then a 1px `--color-text` rule.
- Middle: the wordmark "Ley81·Suite" at 76px / weight 600 / line-height 1.02 / letter-spacing -0.02em, rendered with the Broadsheet `.cmyk-head` process-plate treatment (the interpunct is `--color-accent`). Below it the tagline at 22px, line-height 1.4, `max-width: 26ch`.
- Bottom: the phase line "Gobernanza IA · GOVERN → MAP → MEASURE → MANAGE" in kicker style.

*Right panel* — vertically centred, `padding: 60px 60px 60px 0`, content column `max-width: 340px`:
- **Install-type segmented control** (`.seg` / `.seg-opt`), two options: *Consultor* / *Empresa*. This is the top-level branch and it also drives the role shown once signed in.
- **Consultant branch:** heading "Iniciar sesión"; sub-line "Su acceso está vinculado a este equipo — sin contraseña."; a "Device identity" kicker over the enrolled identity (`A. Moreno`, 17px heading weight) and machine (`consultoria.pa · MORENO-WS01`, 13px, 60% ink); a full-width primary button **"Continuar con Windows Hello"**; a 12px note that macOS uses Touch ID and the key never leaves the device; a 13px paragraph stating the install admin granted the combined **admin + analyst + auditor** role; then two ghost buttons — "Dar de alta una empresa cliente →" (goes to onboarding) and "Registrar otro dispositivo →" (no-op).
- **Company branch:** heading "Canjear invitación"; lead "El administrador de su empresa le envió un código de un solo uso."; a code field (17px, letter-spacing 0.14em, placeholder `L81-4K7Q-9ZTD`); a 12px note that the code sets the role — analyst, auditor or admin — and expires in 72 hours; primary button "Canjear y registrar este equipo"; a 1px `--color-divider` rule; an "I already have access" kicker over a secondary "Continuar con Windows Hello" button; a closing 12px note that company installs split roles by sign-in.

---

### 2. Onboarding — `screen: 'onboarding'`

**Purpose:** Step 2 of 4 in company setup — confirm which AI systems the operation touches. Reached from the consultant sign-in.

**Layout:** Centred column, `max-width: 900px`, `padding: 48px 40px 80px`. Same masthead rule pair at top (step label left, ES/EN toggle right).

- **Step indicator:** four equal flex columns, 2px gap. Each is a 5px bar over a 12px label. Completed and current steps use `--color-accent`; pending use `--color-neutral-300` with the label at 50% ink. The current step's label is heading weight 600. Steps: Datos de la empresa / Inventario de sistemas de IA / Marcos aplicables / Responsables.
- **Heading** (h2, `max-width: 24ch`) and a 15px lead paragraph at 70% ink, `max-width: 58ch`.
- **System cards:** 2-column grid, 12px gap, `max-width: 720px`. Each is a `.radio` label with a checkbox, `align-items: flex-start`, 14px padding, `--color-surface` background, `--radius-md`. Content is the service name (heading weight) over a 12px use description at 60% ink. Four entries; the first three checked. **These toggle.**
- **Footer row:** primary "Continuar" (goes to dashboard), secondary "Atrás" (back to login), and a right-aligned 12px note.

---

### 3. App shell (wraps views 4–9)

**Layout:** CSS grid `236px 1fr`, `min-height: 100vh`.

*Sidebar* — `padding: 34px 24px 34px 34px`, flex column, 34px gap:
- Brand block: "Ley81·Suite" at 20px heading weight 600, letter-spacing -0.01em, accent interpunct; below it "Gobernanza IA" in kicker style at 50% ink.
- `.nav` in column mode (`flex-direction: column; align-items: stretch; gap: var(--space-2); padding: 0`). Six items: Panel, Sistemas de IA, Brechas, Evidencia, Informes, Ajustes. The active item carries `aria-current="page"`. Gap detail and the gap form both keep **Brechas** active.
- Session block pinned to the bottom (`margin-top: auto`): "Sesión" kicker, the role name at 14px heading weight, "A. Moreno" at 12px / 60% ink, then two left-flush ghost buttons — "Cambiar de vista" and "Salir".

*Main* — `padding: 34px 44px 80px 0`, `min-width: 0` (required so tables can shrink). Opens with the same masthead rule pair: client line on the left; on the right, the framework/date line followed by the **ES/EN toggle**. Then `margin-bottom: 40px` before view content.

The client line is role-dependent: consultant sees "Cartera · 12 clientes — viendo Distribuidora Istmo, S.A."; company user sees just "Distribuidora Istmo, S.A."

---

### 4. Dashboard — `screen: 'panel'`

**Purpose:** Answer "are we ready to attest, and if not what's blocking it".

**Header row:** h2 "Estado de cumplimiento" left; on the right a "Disposición" kicker beside a segmented control choosing **A · Marcador** or **B · Libro mayor**. Both layouts are real and both should ship unless the team picks one — this was an open design question.

**Layout A (scoreboard)** — grid `minmax(0,340px) 1fr`, 64px gap, `align-items: start`:
- *Left:* "Índice de preparación" kicker; the readiness percentage at **132px**, heading weight 600, in the Broadsheet `.cmyk-num` process-plate treatment; a 15px body paragraph (`max-width: 32ch`) whose wording changes with the data; a primary "Generar atestación" button.
- *Right:* "Avance por fase" kicker over four equal columns (2px gap) — a 6px bar, a 12px phase name, an 11px state at 55% ink. Complete phases use `--color-accent`; the pending MANAGE phase uses `--color-accent-2`. Then a "Brechas por severidad" `.table` — columns Marco / Abiertas / Críticas / Preparación — and a left-flush ghost link "Ver todas las brechas →".

**Layout B (ledger)**:
- A wrapping stat rail: four stats, 36px gap, each a kicker over a 44px heading-weight figure. Open gaps renders in `--color-accent-2`; the rest in `--color-text`. Primary "Generar atestación" pushed right with `margin-left: auto`.
- "Libro mayor de cumplimiento" kicker over a full-width `.table`: Marco / obligación (34% width) · Fase · Evidencia · Vence · Estado. Status is a `.tag`. Rows are clickable and open the gap detail.

---

### 5. AI systems — `screen: 'sistemas'`

Header: h2 "Inventario de sistemas de IA" over a kicker sub-line ("7 registros"); primary "Registrar sistema" right.

`.table` columns: Sistema (26%) · Proveedor · Datos personales · Riesgo · AI Act · DPA · Estado. Status is a `.tag`: `.tag-accent` for compliant, `.tag-accent-2` for systems with gaps, `.tag-neutral` for in-review. Seven rows, all clickable → gap detail (a placeholder link; a real system-detail view was scoped but not built).

---

### 6. Gap register — `screen: 'brechas'`

Header: h2 "Brechas y remediación" over a "Fase 4 · MANAGE" kicker; primary "Nueva brecha" right.

**Filter row** (flex, 10px gap, wrapping): a 260px search input, a segmented Todas / Abiertas / Remediadas control, and a right-aligned 12px record count. Neither control is wired.

`.table` columns: ID (80px) · Brecha (32%) · Marco · Responsable · Fecha · Estado. Nine rows; rows are clickable → gap detail. The list is filtered by the active frameworks (see State Management).

---

### 7. Gap detail — `screen: 'gap'`

**Purpose:** The core record. Everything in this product resolves to a gap: what was found, what was done about it, and what proves it.

A left-flush ghost "← Brechas" button, then a grid `minmax(0,1fr) 300px`, 64px gap, `align-items: start`.

*Main column:*
- Meta row (12px gap): the ID at 13px heading weight, letter-spacing 0.1em; a `.tag-accent` status; a `.tag-outline` article reference.
- h2 title, `max-width: 28ch`; a 15px description paragraph, `max-width: 62ch`.
- "Acción correctiva implementada" kicker (44px top margin) over a 15px paragraph.
- "Evidencia de cumplimiento" kicker over a `.table` — Documento · Tipo · Fecha · a "Ver" link — then a secondary "Añadir evidencia" button.
- "Bitácora" kicker over a flex column of log entries, 14px gap, `max-width: 62ch`. Each entry is a 12px date at 55% ink in a 92px-min column beside 14px text.

*Sidebar column* (flex column, 26px gap): kicker + value pairs for Fase, Responsable, Sistemas afectados, Marcos (as `.tag-neutral` chips) and Ejecución; then a primary "Incluir en atestación" and a secondary "Editar brecha".

---

### 8. New gap form — `screen: 'form'`

Grid `minmax(0,1fr) 280px`, 64px gap, `max-width: 960px`.

*Fields* (flex column, 20px gap): gap title (text) · finding description (textarea) · a two-column row of affected system (select) and phase (select, MANAGE preselected) · **affected frameworks** as a wrapping row of checkboxes (these toggle) · proposed corrective action (textarea) · a two-column row of owner (select) and target date (date, `2026-10-15`) · a Save / Cancel button pair. Both buttons return to the register.

*Right rail:* "Severidad calculada" kicker over the word "Crítica" at 32px heading weight in `--color-accent-2`, then two 13px paragraphs at 70% ink explaining the derivation and the consequence (saving blocks attestation until closed). The severity is hard-coded — implementing the real rule is a developer task.

---

### 9. Evidence vault — `screen: 'evidencia'`

Header: h2 "Repositorio de evidencia" over a "24 documentos" kicker; primary "Subir documento" right.

`.table` columns: Documento (34%) · Tipo · Brecha (rendered as a link to the gap) · Subido por · Fecha. Seven rows.

---

### 10. Reports — `screen: 'informes'`

Header: h2 "Informes y atestación"; right-aligned secondary "Enviar a firma" and primary "Exportar PDF".

Grid `230px minmax(0,1fr)`, 48px gap.

*Left rail:* "Plantillas" kicker over five text links in a 12px-gap column — the selected one in `--color-accent`, the rest `color: inherit`, all `text-decoration: none`. Then a "Formato" kicker over a vertical segmented control (Signed PDF / Editable DOCX / Evidence package ZIP) — stacked by setting `flex-direction: column; align-items: stretch` on `.seg` and replacing each option's left border with a top border.

*Right — the document preview.* This is the one place the design deliberately breaks the paper ground: a true white `#fff` sheet with `--shadow-md`, `padding: 48px 52px`, `max-width: 820px`. It reproduces the source attestation document: title at 19px heading weight letter-spacing 0.02em; a 13px subtitle at 65% ink; a 2px `--color-text` rule; a two-column metadata grid (client, closing date, gap status, certifying auditor) at 13px with labels at 60% ink; section heading "1. Plan accionable de remediación ejecutado" over a 12px `.table` of the four executed remediations; the "Declaración oficial de atestación" section with its 13px / 1.6 line-height statement; and two signature rules (1px, 40px gap) labelled Legal Representative and Senior AI & Data Compliance Consultant.

---

### 11. Settings — `screen: 'ajustes'`

Grid `minmax(0,420px) minmax(0,340px)`, 72px gap.

*Left column* (flex, 22px gap):
- **Empresa:** legal name, tax ID (RUC), data protection officer — three `.field` inputs.
- **Marcos activos:** five checkboxes in a 10px-gap column (Ley 81, Decreto Ejecutivo 285, GDPR, EU AI Act, ISO/IEC 42001 — the first four on). **This is the app's most consequential control** — see State Management. Below it a 12px count line at 55% ink.
- **Idioma de la interfaz:** an ES/EN segmented control bound to the same language state as the header toggle.
- Primary "Guardar cambios", `align-self: flex-start`.

*Right column:* "Equipo y permisos" kicker over a 13px `.table` of Persona / Rol · acceso — five rows showing the split-role model (consultant with combined access, admin, analyst, auditor, legal representative with signature only) — then a left-flush ghost "Enviar código de invitación →". Below, a "Retención de registros" kicker over a 13px note at 70% ink: the compliance log is kept 7 years and cannot be edited retroactively.

## Interactions & Behavior

**Navigation.** Every transition sets one `screen` value and calls `window.scrollTo(0, 0)`. Sidebar items, table rows, back buttons and most CTAs navigate; nothing uses a router or the URL. In implementation these should be real routes.

**Language toggle (ES/EN).** Present in three places — the login masthead, the onboarding masthead and the app header rail — plus the Settings control, all bound to one `lang` value. It swaps the entire copy dictionary: nav, headings, table headers, every row of data, the attestation document, placeholders and notes. There are no side-by-side glosses; the user picks one language and sees only that. Dates are localised in the copy (`10 Ago 2026` / `10 Aug 2026`) rather than formatted — implement with a real i18n library and date formatter.

**Role / view switch.** The "Cambiar de vista" ghost button in the sidebar flips between consultant and company-user presentation. It changes only the role label and the client line. In production this must be replaced by actual RBAC: the company install splits admin, analyst and auditor by sign-in, while the consultant install grants all three to one identity.

**Dashboard layout switch.** The A/B segmented control swaps the entire dashboard body. Both layouts read the same derived data.

**Checkbox groups.** Three groups toggle: onboarding AI systems, gap-form frameworks, and Settings active frameworks. Each holds independent state that survives navigation and language changes.

**No transitions or animations anywhere.** Views swap instantly. Hover, active and focus states come entirely from the Broadsheet stylesheet — do not restyle them.

**Non-functional by design:** search, the gap status filter, file upload, evidence "Ver" links, PDF export, send-for-signature, invite send, device enrolment, and all Save buttons.

## State Management

Six state values drive everything:

| State | Type | Initial | Drives |
| --- | --- | --- | --- |
| `screen` | one of `login`, `onboarding`, `panel`, `sistemas`, `brechas`, `gap`, `form`, `evidencia`, `informes`, `ajustes` | `login` | Which view renders; which nav item is active |
| `role` | `consultor` \| `pyme` | `consultor` | Login branch, role label, client line |
| `lang` | `es` \| `en` | `es` | The entire copy dictionary |
| `dash` | `a` \| `b` | `a` | Dashboard layout |
| `fw` | 5 booleans (`ley81`, `decree`, `gdpr`, `aiact`, `iso`) | first four true | **See below** |
| `fwForm`, `obSys` | booleans | mixed | Local checkbox state on the gap form and onboarding |

### The framework filter is the important one

Every gap, ledger row and severity row carries a framework key. The active-framework set in Settings filters the whole dashboard, and four figures are **derived, never stored**:

1. **Severity table** — shows only rows whose framework is active. If all are deselected it renders an empty-state note directing the user to Settings.
2. **Readiness index** — the arithmetic mean of the active frameworks' readiness values, rounded. Per-framework baselines: Ley 81 100%, Decreto 285 100%, GDPR 78%, EU AI Act 64%. With the default four active this yields 87%; deselect GDPR and the AI Act and it reads 100%.
3. **Readiness paragraph** — counts remediated vs. total gaps in the active frameworks, and switches its closing sentence between "ready for attestation, pending signature" and "attestation stays blocked until the rest are closed".
4. **Ledger table, open-gaps stat and the gap register's record count** — all filtered and recomputed from the same set.

This coupling was a deliberate correction: an unfiltered severity table made the gap counts look wrong. Preserve it. In production the readiness figure should come from the backend using the same rule, not from a client-side average of static baselines.

### Data shape

Each gap record needs, at minimum: `id`, `title`, `framework`, `owner`, `date`, `status`, `phase`, `description`, `correctiveAction`, `affectedSystems[]`, `frameworks[]`, `evidence[]` and `log[]`. Each AI system needs: `name`, `vendor`, `personalData`, `aiActRisk`, `dpaStatus`, `complianceStatus`. Evidence documents need `filename`, `type`, `gapId`, `uploadedBy`, `date`.

## Design Tokens

All values come from the **Broadsheet** design system — `_ds/broadsheet-fd145519-0c9f-4b12-95db-8dc0af65236a/styles.css`, included in this bundle. Consume the custom properties; do not hard-code.

**Colour**

| Token | Value | Use |
| --- | --- | --- |
| `--color-bg` | `#f3f2f2` | Page ground (paper) |
| `--color-text` | `#201e1d` | All body and heading ink |
| `--color-accent` | `#0088b0` | Interactive elements, completed phases, compliant tags |
| `--color-accent-2` | `#d6006c` | The rarer second spot: critical severity, open-gap count, pending signature |
| `--color-surface` | from tokens | Onboarding system cards |
| `--color-divider` | from tokens | The two hairlines that exist (login branch, vertical segmented control) |
| `--color-neutral-300` | from tokens | Incomplete step bars |
| `#fff` | literal | The attestation preview sheet only — the one intentional exception |

Each role also carries a 100–900 OKLCH ramp. Use ramp steps over ad-hoc `color-mix()`. Accent-on-ground meets 3:1 — fine for chrome and large text, not for paragraph copy; use `--color-accent-700` for accent-coloured body text.

Ink at partial strength is written as `color-mix(in srgb, var(--color-text) N%, transparent)` — 70% for secondary body copy, 65% for document subtitles, 60% for metadata labels, 55% for kickers and notes, 50% for the most recessive labels.

**Typography** — Source Serif 4 throughout, for both `--font-heading` and `--font-body`, with the true italic at body weight. No sans-serif anywhere: the serif is the UI chrome.

| Role | Size | Weight | Notes |
| --- | --- | --- | --- |
| Wordmark (login) | 76px | 600 | line-height 1.02, letter-spacing -0.02em |
| Readiness figure | 132px | 600 | `.cmyk-num` plate treatment |
| Stat figures | 44px | 600 | line-height 1 |
| Severity word | 32px | 600 | line-height 1 |
| h2 (view titles) | stylesheet | — | Constrained by `max-width` in ch |
| Lead paragraph | 22px | 400 | line-height 1.4, `max-width: 26ch` |
| Body | 15px | 400 | `max-width: 62ch` on long copy |
| Table / secondary | 13px | 400 | 12px for the document table |
| Kicker | 11px | 400 | uppercase, letter-spacing 0.08em, 55% ink |

The **kicker** is the workhorse label style and appears dozens of times; implement it once as a component or utility.

**Spacing** — the Broadsheet `--space-*` scale at density 1.25×. Do not tighten it. Recurring literals: 64px between major columns, 72px in Settings, 48px reports rail, 44px above a new kicker section, 40px under the masthead, 34px sidebar padding, 26px between sidebar meta blocks, 22/20/14/12/10px within groups.

**Radius** — 2px base. `--radius-md` on the onboarding cards. Nothing else is rounded.

**Shadow** — `--shadow-md` on the attestation sheet. Nowhere else.

**Structure** — no dividers or borders between sections; hierarchy comes from the serif scale and whitespace. The two exceptions are the masthead rule pair (3px + 1px in full-strength ink, front-page furniture) and the signature rules on the document. Sibling groups are laid out with flex/grid `gap`, never margins on children.

## Assets

**None.** No images, photographs or icon files are used. The Broadsheet system specifies Phosphor icons in duotone weight if the implementation adds any — the prototype adds none deliberately.

The wordmark and the readiness figure use the Broadsheet `.cmyk-head` / `.cmyk-num` process-plate treatment, which is pure CSS plus SVG filter definitions supplied by the design system bundle (`print-plates.js`, inlined into `_ds_bundle.js`). Both are in this bundle. If the target codebase can't carry those filters, fall back to flat `--color-text` type at the same size and weight — the layout does not depend on the effect.

Fonts: Source Serif 4, loaded by the design system stylesheet.

## Files

| File | What it is |
| --- | --- |
| `screenshots/` | Eleven reference captures, one per view, in reading order. Captured in a **narrow preview pane (~900px)**, so columns are compressed and the right edge is clipped — treat them as a guide to content and hierarchy, and take exact layout from the prototype and this README, not from the images. |
| `Ley81-Suite.dc.html` | The prototype. All nine views, both language dictionaries, all state logic. The copy dictionaries near the bottom of its script block are the authoritative source for every string. |
| `support.js` | The prototype's template runtime. **Reference only — do not port.** |
| `_ds/broadsheet-.../styles.css` | The Broadsheet token sheet and component layer. This is the real styling contract. |
| `_ds/broadsheet-.../_ds_bundle.js` | The compiled design-system bundle (includes the process-plate filter defs). |
| `_ds/broadsheet-.../readme.md` | The Broadsheet design system guide — direction, colour, type, component inventory, do's and don'ts. |

To view the prototype, open `Ley81-Suite.dc.html` in a browser with the `_ds` folder and `support.js` alongside it.
