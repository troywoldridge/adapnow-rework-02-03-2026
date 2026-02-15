
## v0.1.6 — Stage 2: Auth Policy Model + Route Enforcement + Test Suite (2026-02-15)

### What shipped
- Standardized route access control via Stage 2 policy model (public/auth/admin/cron)
- Migrated routes to policy guard surface with consistent ok/fail envelope behavior
- Canonicalized cron secret handling (CRON_SECRET with JOB_SECRET fallback)
- Added/expanded tests:
  - Auth policy unit tests (enforcePolicy / guardOrReturn)
  - Env tests
  - Pricing tests
  - Integration tests for key API routes
- Improved observability: auth denials include route/policy/requestId

### Operational notes
- Env: standardize on CRON_SECRET (JOB_SECRET remains temporary fallback)
- Admin allowlisting: ADMIN_EMAILS contract clarified/relied upon for admin access in tests and policy behavior

### Risk & mitigation
- Admin lockout risk mitigated via ALLOW_ALL_ADMINS escape hatch and phased rollout strategy

