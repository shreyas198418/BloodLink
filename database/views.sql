-- BloodLink Analytical & Operational SQL Views

-- 1. Total valid inventory aggregated by blood group
CREATE OR REPLACE VIEW vw_total_inventory_by_group AS
SELECT
  blood_group,
  COUNT(*) AS batch_count,
  COALESCE(SUM(units_available), 0) AS total_valid_units
FROM blood_inventory
WHERE expiry_date >= CURRENT_DATE::TEXT
  AND units_available > 0
GROUP BY blood_group
ORDER BY blood_group;

-- 2. Blood bank stock summary across facilities
CREATE OR REPLACE VIEW vw_blood_bank_stock_summary AS
SELECT
  bb.id AS blood_bank_id,
  bb.bank_code,
  bb.name AS bank_name,
  bb.city,
  bb.operating_status,
  COALESCE(SUM(CASE WHEN bi.expiry_date >= CURRENT_DATE::TEXT THEN bi.units_available ELSE 0 END), 0) AS valid_units,
  COUNT(CASE WHEN bi.expiry_date >= CURRENT_DATE::TEXT AND bi.units_available <= bi.minimum_threshold THEN 1 END) AS low_stock_batches
FROM blood_banks bb
LEFT JOIN blood_inventory bi ON bi.blood_bank_id = bb.id
GROUP BY bb.id, bb.bank_code, bb.name, bb.city, bb.operating_status
ORDER BY bb.bank_code;

-- 3. Active pending request summary ordered by priority score
CREATE OR REPLACE VIEW vw_pending_request_summary AS
SELECT
  br.id,
  br.request_code,
  br.hospital_name,
  br.required_blood_group,
  br.units_required,
  br.units_fulfilled,
  br.priority,
  br.priority_score,
  br.status,
  br.required_by_date
FROM blood_requests br
WHERE br.status IN ('Pending', 'Processing', 'Partially Fulfilled')
ORDER BY br.priority_score DESC, br.request_date ASC;
