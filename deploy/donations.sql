CREATE TABLE IF NOT EXISTS donations (
  signature TEXT NOT NULL,
  transfer_index TEXT NOT NULL,
  sender TEXT NOT NULL,
  name TEXT,
  symbol TEXT NOT NULL CHECK (symbol IN ('SOL', 'USDC', 'EURC')),
  amount REAL NOT NULL CHECK (amount > 0),
  timestamp INTEGER NOT NULL,
  rate_hour TEXT NOT NULL,
  eur_micros INTEGER,
  PRIMARY KEY (signature, transfer_index)
);
CREATE INDEX IF NOT EXISTS donations_recent ON donations(timestamp DESC);
CREATE INDEX IF NOT EXISTS donations_sender ON donations(sender, timestamp DESC);
CREATE TABLE IF NOT EXISTS rates (
  symbol TEXT NOT NULL,
  rate_hour TEXT NOT NULL,
  eur REAL NOT NULL CHECK (eur > 0),
  PRIMARY KEY (symbol, rate_hour)
);
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  cursor TEXT,
  caught_up INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER,
  error TEXT,
  lease TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO sync_state (id) VALUES (1);
CREATE TABLE IF NOT EXISTS claims (
  sender TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
