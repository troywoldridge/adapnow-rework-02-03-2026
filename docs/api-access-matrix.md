# API Access Matrix (Stage 2)

This document defines the canonical access policy for API routes.

Policies:
- **public**: no session required
- **auth**: signed-in required
- **admin**: signed-in + admin required (Clerk `publicMetadata.role=admin` OR `ADMIN_EMAILS` allowlist)
- **cron**: requires secret (`CRON_SECRET`) via `x-cron-secret` header (or `Authorization: Bearer <secret>`)

## Current routes in scope

| Route | Method(s) | Policy | Notes |
|---|---:|---|---|
| `/api/jobs/artwork-needed` | POST | cron | Background job trigger |
| `/api/custom-orders` | POST | public | Public form submission |
| `/api/quotes/request` | POST | public | Public form submission |
| `/api/quotes/custom-order` | POST | public | Public form submission |
| `/api/addresses` | GET/POST | auth | Customer addresses |
| `/api/addresses/default` | GET/POST | auth | Default address |
| `/api/addresses/[id]` | GET/PATCH/DELETE | auth | Must belong to user |

## Env contracts

- `CRON_SECRET` (required for cron policy)
- `ADMIN_EMAILS` (comma/space separated; optional, but recommended for bootstrap)
- `ALLOW_ALL_ADMINS` (escape hatch; should only be used temporarily and never in prod)
