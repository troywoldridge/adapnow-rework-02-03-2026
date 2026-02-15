# API Access Matrix (Stage 2)

This document describes the **canonical access policy model** for API routes.

## Policy model

Policies are enforced by a shared guard:

- **public**: no auth required
- **auth**: signed-in user required
- **admin**: signed-in user + admin check required
- **cron**: secret header/bearer required

### Admin rules

A request is considered **admin** if any of the following is true:

- `ALLOW_ALL_ADMINS=true` (escape hatch; intended for local/dev or temporary operations)
- Clerk `currentUser().publicMetadata.role === "admin"`
- Any user email matches `ADMIN_EMAILS` allowlist

### Cron rules

Cron policy accepts the secret provided by any of:

- `x-cron-secret` header (canonical)
- `x-job-secret` header (back-compat)
- `Authorization: Bearer <secret>` header

Expected secret is read from:

- `CRON_SECRET` (canonical)
- fallback `JOB_SECRET` (temporary back-compat)

If no expected secret is configured, cron requests are rejected with `CRON_MISCONFIGURED`.

## Response behavior

- Denials return `401 UNAUTHORIZED` or `403 FORBIDDEN` (or `403 CRON_MISCONFIGURED`)
- Responses should include a requestId for correlation
- Authz denials are logged with `{ route, policy, requestId }`

## Environment variables

| Variable | Purpose | Notes |
|---|---|---|
| `CRON_SECRET` | Cron secret | Canonical |
| `JOB_SECRET` | Cron secret fallback | Temporary back-compat |
| `ADMIN_EMAILS` | Comma/space separated allowlist | Lowercased compare |
| `ALLOW_ALL_ADMINS` | Escape hatch | `true/1/yes/on` |

## Implementation status (Stage 2)

Stage 2 delivers:
- Policy model implementation
- Route migrations in batches
- Unit/integration tests validating policy behavior
- Observability logging for denials
- Docs for access expectations and env contract

