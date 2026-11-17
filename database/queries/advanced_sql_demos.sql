-- BloodLink Advanced DBMS Concept Demonstrations
-- Safe demonstration queries covering DDL, DML, Joins, Aggregations, Subqueries, Transactions, and pgvector.

-- 1. SAFE DDL DEMONSTRATION (CREATE / ALTER / DROP on disposable test object only)
CREATE TABLE IF NOT EXISTS _demo_audit_scratch (
  id SERIAL PRIMARY KEY,
  note TEXT NOT NULL
);
ALTER TABLE _demo_audit_scratch ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
INSERT INTO _demo_audit_scratch (note) VALUES ('Disposable DDL verification row');
SELECT * FROM _demo_audit_scratch;
DELETE FROM _demo_audit_scratch WHERE note = 'Disposable DDL verification row';
DROP TABLE IF EXISTS _demo_audit_scratch;

-- 2. JOIN + GROUP BY + HAVING + ORDER BY + AGGREGATE FUNCTIONS
-- Find blood banks whose valid stock for a blood group is at or below 8 units
SELECT
  bb.bank_code,
  bb.name AS blood_bank,
  bi.blood_group,
  SUM(bi.units_available) AS total_valid_units,
  COUNT(bi.id) AS batch_count
FROM blood_inventory bi
JOIN blood_banks bb ON bb.id = bi.blood_bank_id
WHERE bi.expiry_date >= CURRENT_DATE::TEXT
GROUP BY bb.bank_code, bb.name, bi.blood_group
HAVING SUM(bi.units_available) <= 8
ORDER BY total_valid_units ASC;

-- 3. SUBQUERY + AGGREGATE COMPARISON
-- Identify requests whose priority score exceeds the network average
SELECT
  request_code,
  hospital_name,
  required_blood_group,
  priority,
  priority_score,
  status
FROM blood_requests
WHERE priority_score >= (SELECT AVG(priority_score) FROM blood_requests)
ORDER BY priority_score DESC;

-- 4. ATOMIC TRANSACTION DEMONSTRATION (Inventory Allocation)
-- Ensures stock deduction and request fulfillment update atomically or roll back completely.
/*
BEGIN;
  UPDATE blood_inventory
  SET units_available = units_available - 2, updated_at = NOW()
  WHERE id = '<inventory-uuid>' AND units_available >= 2 AND expiry_date >= CURRENT_DATE::TEXT;

  UPDATE blood_requests
  SET units_fulfilled = units_fulfilled + 2, status = 'Partially Fulfilled'
  WHERE id = '<request-uuid>';

  INSERT INTO inventory_transactions (inventory_id, blood_bank_id, request_id, transaction_type, units_delta, units_after, notes)
  VALUES ('<inventory-uuid>', '<bank-uuid>', '<request-uuid>', 'ALLOCATE', -2, 8, 'Atomic allocation');
COMMIT;
*/

-- 5. PGVECTOR COSINE SIMILARITY RETRIEVAL (<=> cosine distance)
SELECT
  a.request_code AS source_request,
  b.request_code AS similar_request,
  b.priority,
  b.required_blood_group,
  ROUND((1 - (ea.embedding <=> eb.embedding))::numeric, 4) AS cosine_similarity
FROM request_embeddings ea
JOIN blood_requests a ON a.id = ea.request_id
JOIN request_embeddings eb ON ea.request_id < eb.request_id
JOIN blood_requests b ON b.id = eb.request_id
ORDER BY cosine_similarity DESC
LIMIT 10;
