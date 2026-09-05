-- Free-text user note on a transaction, separate from the bank-supplied
-- memo so a sync can never overwrite what the user wrote.
ALTER TABLE transactions ADD COLUMN note TEXT;
