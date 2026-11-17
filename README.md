# BloodLink: Multi-Bank Blood Inventory, Priority Donor Matching & Semantic Request Understanding

BloodLink is a full-stack **DBMS Level 3** healthcare operations platform built with **React**, **Express**, **Drizzle ORM**, **PostgreSQL**, and **pgvector**. It enables regional blood bank networks to manage multi-facility inventories, screen compatible RBC donors, prioritize emergency hospital requests, perform ACID-compliant blood unit allocations, and retrieve semantically similar historical requests via `pgvector`.

---

## 1. Problem Statement & Motivation

Hospitals frequently face critical delays locating compatible blood units across fragmented blood banks, while manual spreadsheets fail to enforce expiry quarantines, Rh compatibility rules, or real-time shortage alerts. BloodLink solves this with a unified relational + vector database architecture that combines strict transactional safety with semantic clinical request understanding.

## 2. Core Features

- **Operations Dashboard**: Live PostgreSQL KPIs, Recharts blood inventory bar chart, request urgency donut chart, quick actions, recent priority-sorted requests, and low-stock alerts.
- **Multi-Bank Blood Inventory**: Per-bank batch tracking, blood group/bank/expiry filters, negative-stock prevention (`CHECK units_available >= 0`), expired-stock quarantine, and full `inventory_transactions` audit ledger.
- **Donor Registry & Screening**: Duplicate email/phone protection, RBAC-scoped personal contact masking, and configurable 56-day donation interval screening rules (explicitly labeled as screening rules, not medical clearance).
- **Priority-Based Blood Requests**: Explainable composite scoring (`Emergency=100`, `Urgent=60`, `Routine=20` + deadline urgency + shortage scarcity + queue age + volume) with priority escalation audit trail (`request_status_history`).
- **Smart Matching Engine**: Complete RBC compatibility matrix (`O-` universal donor to `AB+` universal recipient), Haversine proximity distance, ranked bank & donor recommendations, excluded batch transparency, and **atomic `db.transaction` unit allocation**.
- **Semantic Request Understanding (`pgvector`)**: Local 128-dimensional semantic embedding model stored in PostgreSQL `vector(128)` (`request_embeddings`), using cosine similarity (`<=>`) to find related clinical requests and extract urgency/blood-group/unit hints without mandatory paid external APIs.
- **Authentication & RBAC**: Dual support for bcrypt-hashed email/password credentials and Firebase Google Sign-In, enforcing `ADMIN` and `STAFF` authorization on the server.
- **Analytics & Live SQL Console**: Multi-chart Recharts reports and an Admin DBMS demonstration console executing live `JOIN + GROUP BY + HAVING`, scalar subqueries, and `pgvector` similarity queries.

---

## 3. Technology Stack

- **Frontend**: React 19, Tailwind CSS v4, Lucide React, Recharts
- **Backend**: Node.js, Express, TypeScript (`server.ts`)
- **Database**: PostgreSQL + `pgvector` extension, Drizzle ORM
- **Authentication**: Firebase Auth (Google Sign-In) + `bcryptjs` & HMAC-SHA256 signed sessions

---

## 4. Database Architecture & Advanced SQL Concepts

See [`documentation/ER-diagram.md`](./documentation/ER-diagram.md), [`documentation/data-dictionary.md`](./documentation/data-dictionary.md), and [`database/`](./database/):

1. **Transactions**: Atomic allocation in `POST /api/matching/:requestId/allocate` deducts `blood_inventory`, updates `blood_requests`, and records `inventory_transactions`, `donor_matches`, and `request_status_history`.
2. **Stored Functions** (`database/functions.sql`): `fn_available_stock_by_group`, `fn_calculate_priority_score`, `fn_find_compatible_inventory`.
3. **Triggers** (`database/triggers.sql`): Negative stock guard & automatic status sync (`trg_validate_inventory`), transaction & request status audit triggers.
4. **Views** (`database/views.sql`): `vw_total_inventory_by_group`, `vw_blood_bank_stock_summary`, `vw_pending_request_summary`.
5. **Indexing**: B-tree indexes on blood group, bank ID, expiry date, priority score, and request status.
6. **Vector Similarity Search**: `1 - (embedding <=> query_vector::vector)` cosine similarity in PostgreSQL.

---

## 5. Demo Credentials (Development Only)

| Role | Email | Password | Scope |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@bloodlink.org` | `Admin@1234` | All blood banks, staff provisioning, settings, SQL console |
| **STAFF** | `staff.central@bloodlink.org` | `Staff@1234` | Metro Central Blood Bank inventory & scoped donor PII |
| **STAFF** | `staff.mercy@bloodlink.org` | `Staff@1234` | Mercy Regional Blood Center inventory & scoped donor PII |

---

## 6. Windows PowerShell Setup & Execution Commands

Run these commands in **PowerShell** inside the project root directory (`bloodlink/`):

### 1. Install Dependencies
```powershell
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and populate your PostgreSQL connection credentials (`SQL_HOST`, `SQL_DB_NAME`, `SQL_USER`, `SQL_PASSWORD`, `SQL_ADMIN_USER`, `SQL_ADMIN_PASSWORD`, `SESSION_SECRET`).

### 3. Enable `pgvector` & Push Schema (Local PostgreSQL)
```powershell
psql -U postgres -d bloodlink -c "CREATE EXTENSION IF NOT EXISTS vector;"
npx drizzle-kit push --config=src/db/drizzle.config.ts
```

### 4. Run Automated Unit Tests
```powershell
npm test
```

### 5. Start Development Server (`http://localhost:3000`)
```powershell
npm run dev
```

### 6. Build & Run Production Server
```powershell
npm run build
$env:NODE_ENV="production"
npm start
```
