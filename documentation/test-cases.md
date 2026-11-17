# BloodLink Test Cases & Verification Checklist

| ID | Category | Test Scenario | Expected Outcome | Status |
| :--- | :--- | :--- | :--- | :--- |
| TC-01 | Compatibility | `O-` donor to `AB+` recipient vs `O+` donor to `O-` recipient | `O- -> AB+` allowed; `O+ -> O-` blocked | Automated (`node:test`) |
| TC-02 | Screening Policy | Donor who donated 21 days ago under 56-day screening rule | Marked ineligible with remaining cooldown days | Automated (`node:test`) |
| TC-03 | Priority Scoring | Emergency due in 1.5h with shortage vs Routine due in 5 days | Emergency scores significantly higher with explainable breakdown | Automated (`node:test`) |
| TC-04 | Expiry Safety | Inventory batch with past `expiry_date` | Excluded from `compatibleBanks` and blocked from allocation (`400`) | Automated + API |
| TC-05 | Negative Stock | Updating stock to `-3` or allocating more units than available | Rejected (`400`/`409`), DB CHECK enforces `>= 0`, transaction rolled back | Automated + API |
| TC-06 | Semantic Search | Query `"O negative blood immediately after serious accident"` | Extracts `O-`, `Emergency`, `Trauma`, retrieves related requests via `pgvector` | Automated + API |
| TC-07 | RBAC & Privacy | `STAFF` user viewing cross-bank donors or modifying another bank | Cross-bank donor PII masked; cross-bank inventory edits return `403` | Verified in API & UI |
| TC-08 | Atomic Allocation | Allocate units from compatible bank to active request | Deducts inventory, updates request fulfillment, writes `inventory_transactions` & `request_status_history` | Verified End-to-End |
