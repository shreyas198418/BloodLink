# BloodLink Database Data Dictionary

| Table | Purpose | Primary Key | Key Constraints & Indexes |
| :--- | :--- | :--- | :--- |
| `users` | Staff and Administrator accounts (local bcrypt + Firebase UID) | `id (uuid)` | `email UNIQUE`, `uid UNIQUE`, `CHECK role IN ('ADMIN','STAFF')` |
| `blood_banks` | Regional blood bank facilities | `id (uuid)` | `bank_code UNIQUE`, `email UNIQUE`, `idx_blood_banks_city` |
| `donors` | Voluntary blood donor registry | `id (uuid)` | `donor_code/phone_number/email UNIQUE`, `CHECK blood_group`, `idx_donors_blood_group` |
| `blood_inventory` | Per-bank blood batches with expiry tracking | `id (uuid)` | `CHECK units_available >= 0`, `idx_inventory_blood_group`, `idx_inventory_expiry` |
| `blood_requests` | Hospital blood requests with composite priority score | `id (uuid)` | `request_code UNIQUE`, `CHECK units_required > 0`, `idx_requests_priority` |
| `donor_matches` | Ranked donor & bank match recommendations & allocations | `id (uuid)` | `CHECK match_type IN ('DONOR','BLOOD_BANK')`, `idx_matches_request` |
| `request_status_history` | Immutable audit log of priority & status changes | `id (uuid)` | `FK request_id -> blood_requests(id) ON DELETE CASCADE` |
| `inventory_transactions` | Immutable stock ledger (`ADD`, `RESTOCK`, `ALLOCATE`, `ADJUST`) | `id (uuid)` | `FK inventory_id`, `FK blood_bank_id`, `idx_inv_tx_bank` |
| `notifications` | Real-time low-stock, expiry, and emergency request alerts | `id (uuid)` | `CHECK severity IN ('Critical','Warning','Info')` |
| `request_embeddings` | 128-dimensional `pgvector` embeddings for semantic search | `id (uuid)` | `request_id UNIQUE`, `embedding vector(128)` |
| `system_settings` | Configurable donor screening & priority scoring policy | `id (text)` | Default row `'default'` (`min_donation_interval_days = 56`) |
