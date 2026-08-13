const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',
  plan_expires_at TIMESTAMPTZ,
  pro_activated_at TIMESTAMPTZ,
  pro_product_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_activated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pro_product_id TEXT;

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period   TEXT NOT NULL,
  count    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, period)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function initSchema() {
  await pool.query(SCHEMA);
}

module.exports = { pool, initSchema };
