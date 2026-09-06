-- B3 (part 1): add the "changes requested" review decision.
--
-- review_decision currently is ('pending', 'approved', 'rejected'). On
-- PostgreSQL 12+ ALTER TYPE ... ADD VALUE may run inside a transaction, but the
-- new value cannot be *used* until that transaction commits. The migration
-- runner applies each file in its own transaction, so this value is added and
-- committed here on its own; migration 0005 (a separate transaction) is free to
-- reference it.
ALTER TYPE review_decision ADD VALUE IF NOT EXISTS 'changes_requested';
