import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

// The pool connects lazily on first query, so importing this file needs no settings.
// (Next.js imports every route while building, when .env isn't available.)
const globalForDb = globalThis as unknown as { pool?: pg.Pool };

const pool = globalForDb.pool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { schema };
