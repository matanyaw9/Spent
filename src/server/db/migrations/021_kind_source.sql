-- Track whether a transaction's kind was set automatically or by the user.
-- The post-sync card-transfer reclassification pass only touches 'auto' rows,
-- so a manual kind override is never overwritten by a later sync.
ALTER TABLE transactions
  ADD COLUMN kind_source TEXT NOT NULL DEFAULT 'auto'
    CHECK(kind_source IN ('auto','user'));
