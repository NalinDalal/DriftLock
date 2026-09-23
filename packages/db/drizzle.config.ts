import { defineConfig } from "drizzle-kit";
import { readFileSync } from "fs";
import { resolve } from "path";

let url = process.env.DATABASE_URL;
if (!url) {
  try {
    const env = readFileSync(resolve(__dirname, "../../.env"), "utf8");
    const match = env.match(/DATABASE_URL=['"]?([^'"\n]+)['"]?/);
    if (match) url = match[1];
  } catch (_e) {
    // ignore missing .env
  }
}

export default defineConfig({
  schema: "./schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: url!,
  },
});
