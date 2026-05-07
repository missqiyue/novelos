-- V003: Add retcon workflow extension columns
-- Supports: scheme selection, approval/rejection tracking, execution state

ALTER TABLE retcon_requests ADD COLUMN scheme TEXT;
ALTER TABLE retcon_requests ADD COLUMN approved_at TEXT;
ALTER TABLE retcon_requests ADD COLUMN rejection_reason TEXT;
