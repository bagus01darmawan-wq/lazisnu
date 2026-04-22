---
trigger: model_decision
---

# Rule: API Conventions & Endpoints
# Scope: Backend agent, Mobile agent, Web agent

---

## Base URL

```
Development : http://localhost:3001
Staging     : https://api-staging.lazisnu.app
Production  : https://api.lazisnu.app

Mobile (from Android emulator): http://10.0.2.2:3001
```

---

## Authentication

```
All protected routes use JWT Bearer Token.
Header: Authorization: Bearer <access_token>

Access token  : expiry 15 minutes
Refresh token : expiry 30 days (stored in Redis, can be blacklisted on logout)

If access token expired → client calls POST /v1/auth/refresh with refresh token
If refresh token expired or blacklisted → force re-login
```

---

## Response Format — Always Consistent

```typescript
// Success
{
  success: true,
  data: T,
  meta?: {          // only for list/paginated responses
    page  : number,
    limit : number,
    total : number
  }
}

// Error
{
  success: false,
  error: {
    code   : string,   // e.g.: "UNAUTHORIZED", "QR_ALREADY_SUBMITTED", "VALIDATION_ERROR"
    message: string    // human-readable message
  }
}
```

### Standard Error Codes

| Code | HTTP | Case |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or expired token |
| `FORBIDDEN` | 403 | Role has no access to this resource |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input (from Zod) |
| `QR_INVALID` | 400 | Invalid QR token or signature mismatch |
| `QR_ALREADY_SUBMITTED` | 400 | Can already submitted this period |
| `QR_NOT_ASSIGNED` | 403 | Can is not assigned to this officer |
| `RESUBMIT_REASON_REQUIRED` | 400 | Re-submit without reason |
| `INTERNAL_ERROR` | 500 | Unexpected error |

---

## Role-Based Access — Summary

```
ADMIN_KECAMATAN → all endpoints, all data
ADMIN_RANTING   → limited endpoints, filter by branch_id
PETUGAS         → only their own task & collections endpoints
BENDAHARA       → GET only for reports and operational data
```

---

## Complete Endpoint List

### Auth
```
POST   /v1/auth/login              → login, return {access_token, refresh_token}
POST   /v1/auth/logout             → blacklist refresh_token in Redis
POST   /v1/auth/refresh            → return new access_token
GET    /v1/auth/me                 → current user profile
```

### Districts & Branches
```
GET    /v1/admin/districts         → list all districts
GET    /v1/admin/branches          → list branches (filter: district_id)
POST   /v1/admin/branches          → add new branch [ADMIN_KECAMATAN]
```

### Users & Officers
```
GET    /v1/admin/users             → list users (filter: role, branch_id)
POST   /v1/admin/users             → add new user [ADMIN_KECAMATAN]
GET    /v1/admin/officers          → list officers
POST   /v1/admin/officers          → add new officer [ADMIN_KECAMATAN]
```

### Cans
```
GET    /v1/admin/cans              → list cans (filter: branch_id, is_active, search)
POST   /v1/admin/cans              → add new can [ADMIN_KECAMATAN, ADMIN_RANTING]
GET    /v1/admin/cans/:id          → single can detail
PUT    /v1/admin/cans/:id          → update can data [ADMIN_RANTING+]
POST   /v1/admin/cans/:id/generate-qr → generate/regenerate QR for one can [ADMIN_KECAMATAN]
GET    /v1/mobile/scan/:qrCode     → validate QR scan from officer [PETUGAS]
```

### Assignments
```
GET    /v1/admin/assignments       → list assignments (filter: period, branch, officer)
POST   /v1/scheduler/generate-tasks → auto-generate monthly assignments [system/internal]
GET    /v1/mobile/tasks            → tasks for the logged-in officer [PETUGAS]
```

### Collections
```
POST   /v1/mobile/collections      → submit collection (online or sync offline) [PETUGAS]
POST   /v1/mobile/collections/batch → sync multiple offline records at once [PETUGAS]
POST   /v1/admin/collections/:id/resubmit → correct nominal with mandatory reason [BENDAHARA, ADMIN_KECAMATAN]
GET    /v1/bendahara/collections   → list collections (filter: period, branch, officer, is_latest)
GET    /v1/bendahara/collections/:id → detail of 1 collection with re-submit history
```

### Reports
```
GET    /v1/bendahara/reports/summary → total per period, district, branch, officer
GET    /v1/bendahara/export          → download CSV (filter: period, branch, officer)
```

---

## Role Filter Query Rules

```typescript
// Role filter middleware MUST be applied BEFORE DB query:

if (user.role === 'ADMIN_RANTING') {
  // All queries involving cans/collections/users
  // MUST add filter: WHERE branch_id = user.branch_id
}

if (user.role === 'PETUGAS') {
  // GET /v1/mobile/tasks → WHERE officer_id = user.id
  // POST /v1/mobile/collections → validate can exists in active assignment for this user
}

if (user.role === 'BENDAHARA') {
  // Only allowed GET — all POST/PUT/DELETE → return 403 FORBIDDEN
}
```

---

*Lazisnu Infaq Collection System — rules/03-api-conventions.md*
