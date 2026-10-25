import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({
  connectionString,
  // Railway's internal Postgres doesn't need TLS; their proxy/public URL does.
  ssl: connectionString.includes("railway") ? { rejectUnauthorized: false } : undefined,
});
