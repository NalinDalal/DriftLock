import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

export type Database = ReturnType<typeof drizzle<typeof schema>>;

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const client = postgres(connectionString);
    _db = drizzle(client, { schema });
  }
  return _db;
}

export function createDb(connectionString: string): Database {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

export * from "./schema";
