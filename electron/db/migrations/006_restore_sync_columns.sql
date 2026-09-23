-- Migrasi 006 — Mengembalikan kolom sync_state dan trades yang hilang pada migrasi 005
--
-- Pada migrasi 005, rekreasi tabel trades dan sync_state melewatkan kolom-kolom
-- yang sebelumnya ditambahkan pada migrasi 002 (raw_payload, positions_synced,
-- fills_synced, funding_synced). Migrasi ini mengembalikan kolom-kolom tersebut
-- agar sinkronisasi exchange berjalan normal.

ALTER TABLE trades ADD COLUMN raw_payload TEXT;
ALTER TABLE sync_state ADD COLUMN positions_synced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN fills_synced INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_state ADD COLUMN funding_synced INTEGER NOT NULL DEFAULT 0;
