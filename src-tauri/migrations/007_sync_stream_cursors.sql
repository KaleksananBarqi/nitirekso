-- Migrasi 007 — Menambahkan kolom pelacakan kursor asimetris per-stream pada sync_state
ALTER TABLE sync_state ADD COLUMN last_fill_time INTEGER;
ALTER TABLE sync_state ADD COLUMN last_fill_id TEXT;
ALTER TABLE sync_state ADD COLUMN last_funding_time INTEGER;
