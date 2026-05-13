import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

// Diagnostic: log env var keys available at runtime (not values)
console.error(
  "[db] ENV KEYS AVAILABLE:",
  Object.keys(process.env)
    .filter((k) => k.startsWith("D") || k.startsWith("SESSION") || k.startsWith("NODE") || k.startsWith("PORT") || k.startsWith("ALLOW"))
    .join(", ")
);
console.error("[db] DATABASE_URL present:", !!process.env.DATABASE_URL);
console.error("[db] DATABASE_URL length:", process.env.DATABASE_URL?.length ?? 0);

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export * from "./schema";
