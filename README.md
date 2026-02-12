# AdapNow

Next.js e-commerce app with Sinalite integration, deployed to Cloudflare.

## Database

Schema is managed by [Drizzle ORM](https://orm.drizzle.team/). Source of truth: `src/lib/db/schema/`.

### Migration workflow

1. **Generate migrations** after schema changes:
   ```bash
   DATABASE_URL=postgresql://... pnpm db:generate
   ```
2. **Apply migrations** (production/preview):
   ```bash
   DATABASE_URL=postgresql://... pnpm db:migrate
   ```
3. **Push schema directly** (development only – skips migration files):
   ```bash
   DATABASE_URL=postgresql://... pnpm db:push
   ```

> Legacy `scripts/migrations/*.sql` are deprecated; use Drizzle migrations instead.

## Tests

```bash
pnpm test
```

Unit and integration tests use [Vitest](https://vitest.dev/). Integration tests mock `server-only`, DB, and Sinalite. For tests requiring a real DB, set `DATABASE_URL` or `TEST_DATABASE_URL`.

## Getting Started

Read the documentation at https://opennext.js.org/cloudflare.

## Develop

Run the Next.js development server:

```bash
npm run dev
# or similar package manager command
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Preview

Preview the application locally on the Cloudflare runtime:

```bash
npm run preview
# or similar package manager command
```

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
