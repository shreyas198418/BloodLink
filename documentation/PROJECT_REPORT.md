# BloodLink — DBMS Experiential Learning (Level 3) Project Report

**Course**: Database Management Systems (DBMS) — Level 3 Project  
**Project Title**: BloodLink: A Multi-Bank Blood Inventory and Priority-Based Donor Matching System with Semantic Request Understanding  
**Database Paradigm**: Option 2 — SQL (`PostgreSQL`) + Vector Database (`pgvector`)

---

## 1. Problem Statement
Hospitals and regional blood centers struggle to coordinate blood unit availability across multiple facilities during critical emergencies. Fragmented spreadsheets and basic CRUD trackers fail to enforce blood group (ABO/Rh) safety rules, exclude expired batches automatically, prioritize life-threatening requests over routine reserves, or retrieve historically similar urgent requests from free-text clinical notes.

## 2. Objectives
1. Design a normalized relational PostgreSQL schema covering blood banks, staff/admin users, donors, blood batches, hospital requests, matches, and immutable audit ledgers.
2. Enforce data integrity at the database level using `CHECK` constraints, `UNIQUE` constraints, foreign keys, triggers, and ACID transactions.
3. Implement an explainable priority scoring engine (`Emergency`, `Urgent`, `Routine`) and an ABO/Rh red blood cell (RBC) compatibility matching engine with configurable donor screening rules.
4. Integrate `pgvector` semantic similarity search to extract clinical context and retrieve related blood requests using 128-dimensional embeddings.
5. Deliver a role-based web dashboard with analytics, live inventory allocation, and a DBMS query demonstration console.

## 3. Scope
- **Multi-Bank Network**: Manages multiple independent blood banks with facility-level stock tracking and low-stock alerts.
- **Role-Based Access Control**: Supports `ADMIN` (network-wide oversight, bank management, settings, SQL console) and `STAFF` (assigned blood bank operations, masked cross-bank donor PII).
- **Clinical Governance Boundary**: Donor eligibility checks enforce configurable operational screening rules (e.g., 56-day interval, 18–65 age range) and do not replace clinical medical clearance.

## 4. Functional Requirements
1. Authentication & RBAC (`ADMIN`, `STAFF`) using `bcryptjs` password hashing and Firebase Google Sign-In.
2. Multi-bank blood inventory intake, adjustment, expiry isolation, negative-stock prevention, and transaction logging.
3. Donor registration with duplicate email/phone detection and privacy masking for unauthorized cross-bank views.
4. Priority-scored blood request intake with status/priority audit history.
5. Smart donor & blood bank matching with atomic ACID allocation.
6. Semantic search and context extraction over clinical request descriptions via `pgvector`.
7. Real-time operational dashboard and Recharts analytical reports.

## 5. ER Diagram & Relational Schema
See [`ER-diagram.md`](./ER-diagram.md) for the Mermaid ER diagram and [`../database/schema.sql`](../database/schema.sql) for the complete SQL DDL.

### Relational Schema Notation
- **BLOOD_BANKS** (**id** PK, bank_code UK, name, city, address, latitude, longitude, contact_number, email UK, operating_status, created_at)
- **USERS** (**id** PK, uid UK, email UK, password_hash, full_name, role, *blood_bank_id* FK -> BLOOD_BANKS, is_active, created_at)
- **DONORS** (**id** PK, donor_code UK, full_name, date_of_birth, blood_group, rh_factor, phone_number UK, email UK, city, address, latitude, longitude, last_donation_date, availability_status, *associated_bank_id* FK -> BLOOD_BANKS, is_active, registered_at)
- **BLOOD_INVENTORY** (**id** PK, *blood_bank_id* FK -> BLOOD_BANKS, blood_group, rh_factor, units_available, minimum_threshold, collection_date, expiry_date, inventory_status, updated_at)
- **BLOOD_REQUESTS** (**id** PK, request_code UK, hospital_name, hospital_location, latitude, longitude, contact_person, contact_phone, required_blood_group, rh_factor, units_required, units_fulfilled, priority, priority_score, request_description, medical_urgency_notes, extracted_context, request_date, required_by_date, status, *assigned_bank_id* FK -> BLOOD_BANKS, *created_by_user_id* FK -> USERS)
- **DONOR_MATCHES** (**id** PK, *request_id* FK -> BLOOD_REQUESTS, *donor_id* FK -> DONORS, *blood_bank_id* FK -> BLOOD_BANKS, match_type, match_score, distance_km, explanation, status, created_at)
- **REQUEST_STATUS_HISTORY** (**id** PK, *request_id* FK -> BLOOD_REQUESTS, previous_status, new_status, previous_priority, new_priority, *changed_by_user_id* FK -> USERS, notes, changed_at)
- **INVENTORY_TRANSACTIONS** (**id** PK, *inventory_id* FK -> BLOOD_INVENTORY, *blood_bank_id* FK -> BLOOD_BANKS, *request_id* FK -> BLOOD_REQUESTS, transaction_type, units_delta, units_after, *performed_by_user_id* FK -> USERS, notes, created_at)
- **NOTIFICATIONS** (**id** PK, *blood_bank_id* FK -> BLOOD_BANKS, severity, title, message, is_read, created_at)
- **REQUEST_EMBEDDINGS** (**id** PK, *request_id* FK UK -> BLOOD_REQUESTS, embedding_model, embedding VECTOR(128), metadata, created_at)
- **SYSTEM_SETTINGS** (**id** PK, min_donation_interval_days, min_donor_age, max_donor_age, default_low_stock_threshold, emergency_weight, urgent_weight, routine_weight, updated_at)

## 6. Database Choice & Justification (SQL vs. Vector Database)
| Data Category | Chosen Database Paradigm | Engineering Justification |
| :--- | :--- | :--- |
| **Inventory Batches, Donors, Requests, Transactions, Users** | **PostgreSQL (Relational SQL)** | Requires strict ACID atomicity (preventing double-allocation or negative stock during concurrent emergency requests), foreign-key referential integrity, `CHECK` constraints (`units_available >= 0`), and relational `JOIN` / `GROUP BY` reporting. |
| **Clinical Request Descriptions & Semantic Retrieval** | **pgvector (Vector Extension in PostgreSQL)** | Free-text hospital descriptions (e.g., *"serious highway accident trauma"* vs. *"urgent ER collision hemorrhage"*) share semantic intent without exact keyword overlap. Storing `VECTOR(128)` embeddings alongside relational metadata enables single-transaction cosine similarity (`<=>`) retrieval without cross-database sync drift. |

## 7. Data Dictionary
See [`data-dictionary.md`](./data-dictionary.md) for the complete column, key, and constraint summary across all 11 tables.

## 8. Vector Database / Semantic Search Implementation (`pgvector`)
1. **What data is converted into embeddings**: Combined clinical request text (`request_description` + `medical_urgency_notes` + `required_blood_group` + `priority`).
2. **Embedding approach/model**: `bloodlink-semantic-v1-128d` (`src/lib/semantic-embedding.ts`), a deterministic local 128-dimensional embedding pipeline combining clinical domain cluster weights (emergency/trauma, surgical, maternal, scheduled, Rh-negative) with token/n-gram projections normalized to unit L2 length (`||v|| = 1`), avoiding paid external API dependencies.
3. **How vectors are stored**: In `request_embeddings` (`embedding VECTOR(128) NOT NULL`, `request_id UUID UNIQUE REFERENCES blood_requests(id)`, `metadata JSONB`).
4. **Similarity metric used**: Cosine distance operator `<=>` in PostgreSQL (`similarity = 1 - (embedding <=> query_vector::vector)`).
5. **How relevant results are retrieved**: `POST /api/semantic-search` and `GET /api/matching/:requestId` rank candidate requests by ascending cosine distance (`ORDER BY re.embedding <=> query_vector ASC`) joined with `blood_requests`, accompanied by a natural-language explanation of shared clinical context and urgency cues.

## 9. Advanced SQL & Important Queries
Implemented across [`../database/functions.sql`](../database/functions.sql), [`../database/triggers.sql`](../database/triggers.sql), [`../database/views.sql`](../database/views.sql), [`../database/queries/advanced_sql_demos.sql`](../database/queries/advanced_sql_demos.sql), and `src/routes/api.ts`:
- **ACID Transactions**: Atomic unit deduction, request fulfillment update, and ledger insertion in `POST /api/matching/:requestId/allocate`.
- **Stored Functions**: `fn_available_stock_by_group`, `fn_calculate_priority_score`, `fn_find_compatible_inventory`.
- **Triggers**: `trg_validate_inventory`, `trg_fn_audit_inventory_change`, `trg_fn_audit_request_status`.
- **Views**: `vw_total_inventory_by_group`, `vw_blood_bank_stock_summary`, `vw_pending_request_summary`.
- **Indexes**: 15 B-tree indexes across blood group, blood bank, expiry date, priority score, and status.
- **DDL & DML**: Safe disposable DDL (`CREATE`, `ALTER`, `DROP`), `INSERT`, `UPDATE`, `DELETE`, `SELECT`, `JOIN`, `GROUP BY`, `HAVING`, `ORDER BY`, `SUM`/`COUNT`/`AVG`, and scalar subqueries.

## 10. System Architecture & Security
See [`architecture.md`](./architecture.md).
- Passwords hashed using `bcryptjs` (salt rounds = 10); Google OAuth verified via `firebase-admin`.
- All API routes validate inputs server-side, use parameterized Drizzle/SQL queries (preventing SQL injection), enforce RBAC (`ADMIN` vs `STAFF`), and read database configuration strictly from environment variables.

## 11. Testing Results
- Automated unit test suite (`tests/bloodlink-core.test.ts` via `npm test`): **6/6 passing** (RBC compatibility, 56-day screening policy, priority scoring, expired-batch exclusion, semantic context & cosine ordering, input validation).
- End-to-end headless Chromium verification (`playwright-cli`): Verified login, dashboard charts/KPIs, smart matching + `pgvector` search, atomic allocation persistence across reload, Settings live SQL demo console, and mobile responsiveness (`390x844`) with 0 console errors.
- See [`test-cases.md`](./test-cases.md) for the full test matrix.

## 12. Team Contribution Matrix (2-Member Team Template)
| Member | Database Responsibilities | Application Responsibilities |
| :--- | :--- | :--- |
| **Team Member 1** | ER diagram, relational schema (`blood_banks`, `blood_inventory`, `inventory_transactions`), `CHECK` constraints, indexes, stored functions, triggers | Backend REST API (`server.ts`, `src/routes/api.ts`), ACID allocation transaction, Inventory & Blood Banks UI views |
| **Team Member 2** | `blood_requests`, `donors`, `request_embeddings` (`pgvector`), views, advanced SQL demonstration queries, seed dataset | Priority scoring & RBC matching engine, `pgvector` semantic search, Donors/Requests/Smart Matching/Analytics UI & testing |

## 13. Live Presentation / Demonstration Walkthrough
1. **Architecture & ER Overview**: Show `documentation/ER-diagram.md` and explain SQL (`PostgreSQL`) + Vector (`pgvector`) justification.
2. **Authentication & RBAC**: Log in as `admin@bloodlink.org` (`ADMIN`) vs `staff.central@bloodlink.org` (`STAFF`) to demonstrate masked donor PII and bank-scoped permissions.
3. **Dashboard & Multi-Bank Inventory**: Show live KPIs, Recharts charts, low-stock alerts, and expired stock quarantine.
4. **Priority Request & Semantic Search**: Create an Emergency request or search in Smart Matching to show `pgvector` cosine similarity results and extracted clinical context.
5. **Atomic Allocation**: Allocate units in Smart Matching and verify the transaction ledger (`Inventory -> Transaction Ledger`) and decremented stock on Dashboard.
6. **Live DBMS Console**: Open **Settings -> Advanced PostgreSQL & pgvector Query Demonstrations** and execute live `JOIN + GROUP BY + HAVING`, scalar subquery, and `pgvector <=>` queries.

## 14. Conclusion & Future Enhancements
BloodLink demonstrates how relational SQL integrity and `pgvector` semantic retrieval complement each other in mission-critical healthcare logistics. Future enhancements include HL7/FHIR hospital EHR integration, automated cold-chain IoT temperature telemetry alerts, and multilingual clinical embedding models.
