// Database abstraction for Forge AI.
// Production: pg client over DATABASE_URL.
// Tests: inject a fake that implements the same query() interface.

import { Pool } from "pg";

let pool = null;

function initPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Set it to your Postgres connection string (Replit provides it automatically).",
    );
  }
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function query(sql, params = []) {
  const client = initPool();
  const result = await client.query(sql, params);
  return result.rows;
}

export async function transaction(fn) {
  const client = initPool();
  const pgClient = await client.connect();
  try {
    await pgClient.query("BEGIN");
    const result = await fn({
      query: (sql, params) => pgClient.query(sql, params),
    });
    await pgClient.query("COMMIT");
    return result;
  } catch (err) {
    await pgClient.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    pgClient.release();
  }
}

export function setPool(fakePool) {
  pool = fakePool;
}

export function resetPool() {
  pool = null;
}
