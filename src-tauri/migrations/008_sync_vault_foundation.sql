-- Migrasi 008 — Fondasi Sync Vault (UUID, HLC, Field-Level LWW, Tombstone, Media, Device Meta)
--
-- Menambahkan identitas stabil lintas-perangkat, kolom jam logis (HLC), jam per-field (JSON),
-- penanda hapus lunak (deleted_at) untuk tombstone, serta tabel metadata perangkat & aset media.

-- 1. Kolom sinkronisasi untuk trades
ALTER TABLE trades ADD COLUMN uuid TEXT;
ALTER TABLE trades ADD COLUMN hlc TEXT;
ALTER TABLE trades ADD COLUMN field_clocks TEXT;
ALTER TABLE trades ADD COLUMN deleted_at INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_uuid
  ON trades(uuid)
  WHERE uuid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_deleted_at ON trades(deleted_at);

-- 2. Kolom sinkronisasi untuk trade_journal & planned_risk
ALTER TABLE trade_journal ADD COLUMN hlc TEXT;
ALTER TABLE trade_journal ADD COLUMN field_clocks TEXT;

ALTER TABLE planned_risk ADD COLUMN hlc TEXT;
ALTER TABLE planned_risk ADD COLUMN field_clocks TEXT;

-- 3. Kolom sinkronisasi untuk settings, account_balances, dan sync_state
ALTER TABLE settings ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE settings ADD COLUMN hlc TEXT;
ALTER TABLE settings ADD COLUMN deleted_at INTEGER;

ALTER TABLE account_balances ADD COLUMN hlc TEXT;
ALTER TABLE sync_state ADD COLUMN hlc TEXT;

-- 4. Indeks aset media content-addressed
CREATE TABLE IF NOT EXISTS media_assets (
  sha256        TEXT    PRIMARY KEY,
  kind          TEXT    NOT NULL CHECK (kind IN ('screenshot','share_media','exchange_logo')),
  ext           TEXT    NOT NULL,
  mime          TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL,
  original_name TEXT,
  created_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

-- 5. Kursor pembacaan operation log per perangkat remote (state lokal, tidak disinkronkan)
CREATE TABLE IF NOT EXISTS device_sync_cursors (
  device_id  TEXT    NOT NULL,
  file_name  TEXT    NOT NULL,
  last_line  INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, file_name)
);

-- 6. Metadata lokal per perangkat (device_id, path Sync Vault, derived key lokal, path Local Snapshot)
CREATE TABLE IF NOT EXISTS local_device_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
