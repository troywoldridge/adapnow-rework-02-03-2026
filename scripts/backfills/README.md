# Backfills (one-off data migrations)

Backfills live in this folder and must be:

## Requirements
- **Idempotent**: safe to run multiple times with the same result.
- **Observable**: logs start/end, counts, and errors.
- **Safe**:
  - Use transactions when appropriate
  - Provide a `--dry-run` mode when feasible
- **Scoped**:
  - One backfill per file
  - Use a timestamp prefix in the filename

## Naming
Example:
- `2026-02-15_artwork_staged_canonicalize.js`

## Running
Prefer dotenv loading:

```bash
node -r dotenv/config scripts/backfills/<file>.js
For dry-run (if supported):

node -r dotenv/config scripts/backfills/<file>.js --dry-run
Common pattern
Connect to DB using DATABASE_URL

Read rows that need transformation

Update only rows that still need it

Print counts:

scanned

eligible

updated

skipped

errors
