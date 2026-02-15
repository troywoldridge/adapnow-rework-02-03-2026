import "dotenv/config";
import { defineConfig } from "drizzle-kit";

const schema = "./src/lib/db/schema/index.ts";
const out = "./drizzle";

if (!process.env.DATABASE_URL) {
  // drizzle-kit reads env at runtime; failing fast prevents confusing partial generation
  throw new Error("Missing DATABASE_URL for drizzle-kit");
}

export default defineConfig({
  schema,
  out,
  dialect: "postgresql",

  // This must match your existing env convention.
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },

  // Make drift obvious:
  strict: true,
  verbose: true,
});
