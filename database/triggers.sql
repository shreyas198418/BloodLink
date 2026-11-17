-- BloodLink PostgreSQL Triggers for Integrity & Audit Trails

-- 1. Prevent invalid negative stock updates & automatically synchronize status
CREATE OR REPLACE FUNCTION trg_fn_validate_inventory_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.units_available < 0 THEN
    RAISE EXCEPTION 'Negative blood inventory is prohibited (attempted: %)', NEW.units_available;
  END IF;

  IF NEW.expiry_date < CURRENT_DATE::TEXT THEN
    NEW.inventory_status := 'Expired';
  ELSIF NEW.units_available = 0 THEN
    NEW.inventory_status := 'Depleted';
  ELSIF NEW.units_available <= NEW.minimum_threshold THEN
    NEW.inventory_status := 'Low Stock';
  ELSE
    NEW.inventory_status := 'Available';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inventory ON blood_inventory;
CREATE TRIGGER trg_validate_inventory
BEFORE INSERT OR UPDATE ON blood_inventory
FOR EACH ROW
EXECUTE FUNCTION trg_fn_validate_inventory_update();

-- 2. Automatically log inventory delta transactions on updates
CREATE OR REPLACE FUNCTION trg_fn_audit_inventory_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.units_available <> NEW.units_available THEN
    INSERT INTO inventory_transactions (
      inventory_id, blood_bank_id, transaction_type, units_delta, units_after, notes
    )
    VALUES (
      NEW.id,
      NEW.blood_bank_id,
      CASE WHEN NEW.units_available < OLD.units_available THEN 'ADJUST' ELSE 'RESTOCK' END,
      NEW.units_available - OLD.units_available,
      NEW.units_available,
      'Automated trigger audit entry'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Automatically maintain request_status_history when status or priority changes
CREATE OR REPLACE FUNCTION trg_fn_audit_request_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO request_status_history (
      request_id, previous_status, new_status, previous_priority, new_priority, notes
    )
    VALUES (
      NEW.id, OLD.status, NEW.status, OLD.priority, NEW.priority, 'Recorded by database trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;
