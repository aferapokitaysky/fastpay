import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migration flow: `npm run db:generate -w apps/api` diffs src/db/schema.ts
// against the migrations already in ./drizzle and writes new SQL files.
// `npm run db:migrate -w apps/api` (aliased to `drizzle-kit migrate`)
// applies any pending migration files in ./drizzle to DATABASE_URL. Both
// commands are committed as part of the generate+migrate workflow, so
// ./drizzle/*.sql is checked into git like any other schema change.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://fastpay:fastpay@localhost:5432/fastpay",
  },
  verbose: true,
  strict: true,
});
