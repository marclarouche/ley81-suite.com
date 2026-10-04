# Product Requirement Document (PRD) \& Engineering Implementation Plan

## Project: Consultant Compliance \& AI Governance Suite (Desktop App)

### 1\. Executive Summary \& Architecture Overview

This application is a lightweight, local-first desktop application designed for compliance consultants executing AI governance and data privacy frameworks (e.g., Panama Ley 81, ANTAI, NIST AI RMF).

```
                                  +-----------------------------------------------+
                                  |            Tauri v2 Frontend                  |
                                  |     (React/TypeScript + Tailwind CSS)         |
                                  +-----------------------+-----------------------+
                                                          |
                                           IPC Channel (Tauri Command)
                                                          |
                                  +-----------------------v-----------------------+
                                  |              Rust Backend Core                |
                                  +---------+--------------------+----------------+
                                            |                    |
                  +-------------------------+            +-------+------------------------+
                  |                                      |                                |
  +---------------+---------------+            +---------+---------+            +---------+---------+
  |    Local OS Keyring / Vault   |            | SQLite + SQLCipher|            | Encrypted File    |
  |  (Windows Hello / Touch ID)   |            |   (Encrypted DB)  |            | Store \& Attachments|
  +-------------------------------+            +-------------------+            +-------------------+
```

\---

### 2\. Core Technical Stack \& Decisions

* **Desktop Framework:** **Tauri v2** (Rust Core + React/TypeScript Frontend)

  * *Rationale:* Minimal RAM footprint (<100 MB), fast startup, compile-time memory safety, natively bundles for macOS and Windows.
* **Database \& Encryption at Rest:** **SQLite via SQLCipher** (`rusqlite` with `bundled-sqlcipher`)

  * *Rationale:* Provides AES-256 encryption at rest for database files. Each client gets an independent `.cdb` (Client Database) file.
* **Key Management \& Biometrics:** **OS Keyring Integration** (`keyring-rs`) + **Windows Hello / macOS Touch ID API**

  * *Rationale:* Key derivation keys (KDKs) are stored securely in OS credential stores (Windows Credential Manager / macOS Keychain), unlocked via biometric PIN or Fingerprint.
* **Report Generation Engine:** **Typst** (Rust binary wrapper) / **Docx-rs**

  * *Rationale:* Typst provides lightning-fast PDF rendering for simplified System Security Plans (SSP), while `docx-rs` handles Word exports natively in Rust without requiring Office dependencies.

\---

### 3\. Key Requirements Mapping \& Feature Specifications

#### 3.1 Client Multi-Tenancy \& File Directory Layout

Each client exists as an isolated directory structure in the system-wide shared data folder (`C:\\ProgramData\\ConsultantSuite\\Clients\\` on Windows or `/Users/Shared/ConsultantSuite/Clients/` on macOS).

```
Windows Path: C:\\ProgramData\\ConsultantSuite\\Clients\\\[ClientID\_Enterprise\_SA]\\
macOS Path:   /Users/Shared/ConsultantSuite/Clients/\[ClientID\_Enterprise\_SA]/
    ├── client\_data.cdb                 <-- Encrypted SQLCipher DB (Details, Controls, Mappings)
    ├── .keys/                          <-- Local encrypted salt \& master key wrapper
    ├── backups/                        <-- Automated \& Manual DB snapshots (.cdb.bak)
    │   ├── 2026-08-24\_backup.cdb
    │   └── ...
    ├── reports/                        <-- Generated SSP PDFs, Word Docs, JSONs, \& ZIPs
    │   ├── SSP\_Report\_Fase1\_4.pdf
    │   └── Full\_Client\_Export.zip
    └── evidence\_store/                 <-- Encrypted attachments/evidence uploaded by user
        ├── EV-001\_Policy\_Signed.pdf.enc
        └── EV-002\_DataFlow\_Diagram.png.enc
```

#### 3.2 Key Management \& Biometric Authentication Flow

1. **App Launch / Client Selection:** Consultant picks a client profile or clicks **"Switch Client"**.
2. **Biometric Challenge:** Tauri invokes OS-level biometric prompt via Windows Hello API (`UserConsentVerifier`) or macOS LocalAuthentication API (`LAContext`).
3. **Key Retrieval:** Upon biometric success, the master passphrase for `client\_data.cdb` is retrieved from macOS Keychain / Windows Credential Vault and supplied to SQLCipher.
4. **Session Idle Timeout:** Auto-locks and switches to read-only lock screen after 15 minutes of inactivity.

#### 3.3 Access Control (RBAC) \& Audit Logging

To keep the application lightweight, access control operates on a simplified two-role model:

|Capability|**Analyst**|Auditor|**Administrator**|
|-|:-:|-|:-:|
|**Data Entry \& Control Editing**|Yes|No|Yes|
|**Evidence / Document Uploads**|Yes|No|Yes|
|**Report Generation \& Exporting**|Yes|Yes|Yes|
|**System Security Plan (SSP) Customization**|No|No|Yes|
|**Audit Trail View \& Log Export**|No|Yes|No|
|**Client Key Management \& Deletion**|No|No|Yes|

* **Immutable Audit Trail:** All database operations (inserts, updates, deletes, evidence uploads, exports) emit an append-only JSON-lines log record inside `client\_data.cdb` containing `timestamp`, `user\_role`, `action\_type`, `target\_entity\_id`, and `hash\_signature`.

\---

### 4\. Database Schema Design (SQLCipher)

```sql
-- Client Metadata
CREATE TABLE client\_info (
    client\_id TEXT PRIMARY KEY,
    company\_name TEXT NOT NULL,
    tax\_id TEXT,
    primary\_contact TEXT,
    created\_at DATETIME DEFAULT CURRENT\_TIMESTAMP
);

-- Core Controls Framework (Mapped to 4 Phases: GOVERN, MAP, MEASURE, MANAGE)
CREATE TABLE controls (
    control\_id TEXT PRIMARY KEY, -- e.g., CTL-01, CTL-02
    phase TEXT CHECK(phase IN ('GOVERN', 'MAP', 'MEASURE', 'MANAGE')),
    domain TEXT NOT NULL,        -- e.g., Consent, Data Flow, HITL
    title TEXT NOT NULL,
    description TEXT,
    status TEXT CHECK(status IN ('CONFORME', 'PARCIAL', 'BRECHA', 'N/A')),
    score INTEGER CHECK(score BETWEEN 0 AND 10),
    legal\_basis TEXT,
    remediation\_notes TEXT
);

-- System Assets \& Data Inventory
CREATE TABLE assets (
    asset\_id TEXT PRIMARY KEY,   -- e.g., SYS-01
    name TEXT NOT NULL,
    provider TEXT NOT NULL,
    location TEXT,
    purpose TEXT,
    processes\_pii BOOLEAN,
    risk\_level TEXT CHECK(risk\_level IN ('BAJO', 'MEDIO', 'ALTO'))
);

-- Evidence \& Artifact Store
CREATE TABLE evidence\_artifacts (
    artifact\_id TEXT PRIMARY KEY,
    control\_id TEXT,
    artifact\_type TEXT CHECK(artifact\_type IN ('POLICY', 'PROCEDURE', 'EVIDENCE')),
    file\_name TEXT NOT NULL,
    file\_path\_encrypted TEXT NOT NULL,
    file\_hash\_sha256 TEXT NOT NULL,
    uploaded\_at DATETIME DEFAULT CURRENT\_TIMESTAMP,
    FOREIGN KEY(control\_id) REFERENCES controls(control\_id)
);

-- Immutable Audit Log Table
CREATE TABLE audit\_logs (
    log\_id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT\_TIMESTAMP,
    user\_role TEXT CHECK(user\_role IN ('ADMIN', 'ANALYST')),
    action TEXT NOT NULL,
    entity\_affected TEXT,
    details TEXT
);
```

\---

### 5\. Simplified System Security Plan (SSP) Report Engine

The system features an automated **SSP Generator** that converts captured control statuses, evidence references, and asset lists into a standardized compliance report structure:

#### Simplified SSP Report Structure

1. **Section 1: Information System Boundary \& Assets**

   * High-level architecture summary.
   * Tabular output of tracked software/AI assets (from Phase 2: MAP).
2. **Section 2: Management \& Operational Controls**

   * Corporate policies, roles, and responsibilities (from Phase 1: GOVERN).
3. **Section 3: Security \& Privacy Control Assessment**

   * Itemized matrix of all controls, status, scores, and legal grounds (from Phase 3: MEASURE).
4. **Section 4: Action Plan \& Milestones (POA\&M)**

   * Remediation timelines, assigned owners, and audit attestations (from Phase 4: MANAGE).
5. **Section 5: Evidence Index \& Hash Verification**

   * Cryptographic verification ledger mapping attachments to evaluated controls.

\---

### 6\. Implementation Roadmap \& Phased Sprints

```
          Sprint 1              Sprint 2              Sprint 3              Sprint 4
     +-----------------+   +-----------------+   +-----------------+   +-----------------+
     | Core Engine \&   |   | UI Workflows \&  |   | Reporting \&     |   | Final Hardening |
     | Security Layer  |-->| 4-Phase Modules |-->| Export Engine   |-->| \& Packaging     |
     +-----------------+   +-----------------+   +-----------------+   +-----------------+
```

#### Sprint 1: Security Core \& Client Management (Weeks 1-2)

* \[x] Initialize Tauri v2 project with Rust backend and React frontend.
* \[x] Implement SQLCipher integration (`rusqlite`) for encrypted database creation.
* \[x] Build local folder scaffold generator (`/Clients/\[ClientID]`).
* \[x] Integrate Windows Hello and macOS Touch ID native biometric prompts.
* \[x] Build "Switch Client" and "Log Off" state machine.

#### Sprint 2: Control Mapping \& Audit Engine (Weeks 3-4)

* \[x] Implement database schema and CRUD operations for Controls, Assets, Policies, and Evidence.
* \[x] Create step-by-step UI wizard corresponding to Phase 1 (GOVERN), Phase 2 (MAP), Phase 3 (MEASURE), and Phase 4 (MANAGE).
* \[x] Build file upload pipeline: Encrypt uploaded evidence with AES-GCM and store in `/evidence\_store/`.
* \[x] Implement simplified RBAC (Admin vs. Analyst session toggles) and append-only audit logging.

#### Sprint 3: Export \& Simplified SSP Generator (Weeks 5-6)

* \[x] Implement JSON export/import serializer for complete client profiles.
* \[x] Integrate Typst/Docx engine to compile client database entries into simplified SSP reports.
* \[x] Build ZIP packager module to bundle SSP reports (`.pdf`, `.docx`), raw raw exports (`.json`), and decrypted evidence packages into a single archive.

#### Sprint 4: QA, Hardening \& Binary Distribution (Weeks 7-8)

* \[x] Conduct security testing (verify zero unencrypted traces in temp directories).
* \[x] Run stress tests on biometric unlock and database lock workflows.
* \[x] Compile signed native installers (`.msi` for Windows, `.dmg` for macOS).

