import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://co2api:co2secret2026@localhost:5432/co2_data",
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS readings (
      id SERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      co2 INTEGER NOT NULL,
      temperature REAL NOT NULL,
      humidity REAL NOT NULL,
      alarm INTEGER NOT NULL DEFAULT 0,
      slope INTEGER DEFAULT 0,
      eta INTEGER DEFAULT -1,
      trend INTEGER DEFAULT 0,
      device TEXT NOT NULL DEFAULT 'co2_001'
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      level INTEGER NOT NULL,
      co2 INTEGER NOT NULL,
      message TEXT NOT NULL
    );
  `);
}

// Retry DB connection on startup (postgres may not be ready yet)
export async function waitForDB(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDB();
      console.log("PostgreSQL connected");
      return;
    } catch (err) {
      console.log(`DB not ready (attempt ${i + 1}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Could not connect to PostgreSQL after retries");
}
