-- Migrasi 005 — Tambah dukungan exchange Bybit, Binance, dan BingX
--
-- Rekreasi tabel trades dan sync_state untuk memperluas CHECK constraint exchange
-- mencakup ('mexc', 'bitunix', 'bybit', 'binance', 'bingx', 'manual') pada trades,
-- dan ('mexc', 'bitunix', 'bybit', 'binance', 'bingx') pada sync_state.

PRAGMA foreign_keys = OFF;

-- 1. Rekreasi tabel trades
CREATE TABLE trades_new (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  exchange        TEXT    NOT NULL CHECK (exchange IN ('mexc','bitunix','bybit','binance','bingx','manual')),
  external_id     TEXT,
  symbol          TEXT    NOT NULL,
  direction       TEXT    NOT NULL CHECK (direction IN ('long','short')),

  entry_price     REAL    NOT NULL,
  exit_price      REAL    NOT NULL,
  entry_time      INTEGER NOT NULL,
  exit_time       INTEGER NOT NULL,

  size            REAL    NOT NULL,
  leverage        REAL    NOT NULL,
  margin_mode     TEXT    CHECK (margin_mode IN ('isolated','cross')),

  realized_pnl    REAL    NOT NULL,
  pnl_source      TEXT    NOT NULL CHECK (pnl_source IN
                    ('exchange_reported','computed_average_cost','manual')),

  fee_open        REAL    NOT NULL DEFAULT 0,
  fee_close       REAL    NOT NULL DEFAULT 0,
  fee_open_maker  REAL,
  fee_close_maker REAL,
  funding_fee     REAL    NOT NULL DEFAULT 0,

  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

INSERT INTO trades_new (
  id, exchange, external_id, symbol, direction,
  entry_price, exit_price, entry_time, exit_time,
  size, leverage, margin_mode, realized_pnl, pnl_source,
  fee_open, fee_close, fee_open_maker, fee_close_maker, funding_fee,
  created_at, updated_at
)
SELECT
  id, exchange, external_id, symbol, direction,
  entry_price, exit_price, entry_time, exit_time,
  size, leverage, margin_mode, realized_pnl, pnl_source,
  fee_open, fee_close, fee_open_maker, fee_close_maker, funding_fee,
  created_at, updated_at
FROM trades;

DROP TABLE trades;
ALTER TABLE trades_new RENAME TO trades;

CREATE UNIQUE INDEX idx_trades_dedup
  ON trades(exchange, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX idx_trades_exit_time ON trades(exit_time);
CREATE INDEX idx_trades_entry_time ON trades(entry_time);
CREATE INDEX idx_trades_symbol ON trades(symbol);
CREATE INDEX idx_trades_exchange ON trades(exchange);

-- 2. Rekreasi tabel sync_state
CREATE TABLE sync_state_new (
  exchange         TEXT PRIMARY KEY CHECK (exchange IN ('mexc','bitunix','bybit','binance','bingx')),
  last_exit_time   INTEGER,
  last_external_id TEXT,
  last_sync_at     INTEGER,
  last_status      TEXT CHECK (last_status IN ('ok','partial','error')),
  last_error       TEXT
);

INSERT INTO sync_state_new (
  exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error
)
SELECT
  exchange, last_exit_time, last_external_id, last_sync_at, last_status, last_error
FROM sync_state;

DROP TABLE sync_state;
ALTER TABLE sync_state_new RENAME TO sync_state;

PRAGMA foreign_keys = ON;
