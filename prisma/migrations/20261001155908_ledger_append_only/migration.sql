-- LedgerEntry is an append-only money trail: corrections are new rows.
-- Reject UPDATE and DELETE at the database level so no code path (or
-- console session) can rewrite financial history.
CREATE OR REPLACE FUNCTION ledger_entry_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_no_update_delete
  BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_entry_immutable();
