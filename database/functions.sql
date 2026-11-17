-- BloodLink Stored Functions (PostgreSQL PL/pgSQL)

-- 1. Calculate available valid (non-expired) units for a given blood group
CREATE OR REPLACE FUNCTION fn_available_stock_by_group(p_blood_group TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(units_available), 0)::INTEGER
  FROM blood_inventory
  WHERE blood_group = p_blood_group
    AND expiry_date >= CURRENT_DATE::TEXT
    AND units_available > 0;
$$;

-- 2. Calculate explainable request priority score
CREATE OR REPLACE FUNCTION fn_calculate_priority_score(
  p_priority TEXT,
  p_units_required INTEGER,
  p_compatible_units INTEGER
)
RETURNS DOUBLE PRECISION
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base DOUBLE PRECISION := 20;
  v_shortage DOUBLE PRECISION := 0;
  v_volume DOUBLE PRECISION := LEAST(15, GREATEST(1, p_units_required) * 2.5);
BEGIN
  IF p_priority = 'Emergency' THEN
    v_base := 100;
  ELSIF p_priority = 'Urgent' THEN
    v_base := 60;
  END IF;

  IF p_compatible_units <= 0 THEN
    v_shortage := 25;
  ELSIF p_compatible_units < p_units_required THEN
    v_shortage := 18;
  END IF;

  RETURN v_base + v_shortage + v_volume;
END;
$$;

-- 3. Find compatible non-expired inventory batches for a recipient blood group
CREATE OR REPLACE FUNCTION fn_find_compatible_inventory(p_recipient_group TEXT)
RETURNS TABLE (
  inventory_id UUID,
  blood_bank_id UUID,
  bank_name TEXT,
  batch_blood_group TEXT,
  units_available INTEGER,
  expiry_date TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    bi.id AS inventory_id,
    bi.blood_bank_id,
    bb.name AS bank_name,
    bi.blood_group AS batch_blood_group,
    bi.units_available,
    bi.expiry_date
  FROM blood_inventory bi
  JOIN blood_banks bb ON bb.id = bi.blood_bank_id
  WHERE bi.expiry_date >= CURRENT_DATE::TEXT
    AND bi.units_available > 0
    AND bb.operating_status <> 'Closed'
    AND (
      (p_recipient_group = 'O-'  AND bi.blood_group = 'O-') OR
      (p_recipient_group = 'O+'  AND bi.blood_group IN ('O-', 'O+')) OR
      (p_recipient_group = 'A-'  AND bi.blood_group IN ('O-', 'A-')) OR
      (p_recipient_group = 'A+'  AND bi.blood_group IN ('O-', 'O+', 'A-', 'A+')) OR
      (p_recipient_group = 'B-'  AND bi.blood_group IN ('O-', 'B-')) OR
      (p_recipient_group = 'B+'  AND bi.blood_group IN ('O-', 'O+', 'B-', 'B+')) OR
      (p_recipient_group = 'AB-' AND bi.blood_group IN ('O-', 'A-', 'B-', 'AB-')) OR
      (p_recipient_group = 'AB+' AND bi.blood_group IN ('O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'))
    )
  ORDER BY (bi.blood_group = p_recipient_group) DESC, bi.units_available DESC;
$$;
