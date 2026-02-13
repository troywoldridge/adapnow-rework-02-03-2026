# Legacy migrations (deprecated)

These SQL files duplicate schema that is now managed by Drizzle ORM.

**Use Drizzle instead:**

- Generate migration: `DATABASE_URL=... pnpm db:generate`
- Apply migration: `DATABASE_URL=... pnpm db:migrate`
- Push schema (dev): `DATABASE_URL=... pnpm db:push`

Schema source: `src/lib/db/schema/`  
Migration output: `drizzle/`
