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

Mobile (dari Android emulator): http://10.0.2.2:3001
```

---

## Authentication

```
Semua route protected menggunakan JWT Bearer Token.
Header: Authorization: Bearer <access_token>

Access token  : expiry 15 menit
Refresh token : expiry 30 hari (disimpan di Redis, bisa di-blacklist saat logout)

Jika access token expired → client call POST /auth/refresh dengan refresh token
Jika refresh token expired atau di-blacklist → paksa login ulang
```

---

## Response Format — Selalu Konsisten

```typescript
// Sukses
{
  success: true,
  data: T,
  meta?: {          // hanya untuk response list/paginated
    page  : number,
    limit : number,
    total : number
  }
}

// Error
{
  success: false,
  error: {
    code   : string,   // contoh: "UNAUTHORIZED", "QR_ALREADY_SUBMITTED", "VALIDATION_ERROR"
    message: string    // pesan human-readable
  }
}
```

### Kode Error Standar

| Code | HTTP | Kasus |
|---|---|---|
| `UNAUTHORIZED` | 401 | Token tidak ada atau expired |
| `FORBIDDEN` | 403 | Role tidak punya akses ke resource ini |
| `NOT_FOUND` | 404 | Resource tidak ditemukan |
| `VALIDATION_ERROR` | 400 | Input tidak valid (dari Zod) |
| `QR_INVALID` | 400 | Token QR tidak valid atau signature tidak cocok |
| `QR_ALREADY_SUBMITTED` | 400 | Kaleng sudah disubmit periode ini |
| `QR_NOT_ASSIGNED` | 403 | Kaleng bukan task petugas ini |
| `RESUBMIT_REASON_REQUIRED` | 400 | Re-submit tanpa alasan |
| `INTERNAL_ERROR` | 500 | Error tidak terduga |

---

## Role-Based Access — Ringkasan

```
admin_kecamatan → semua endpoint, semua data
admin_ranting   → endpoint terbatas, filter by wilayah_id miliknya
petugas         → hanya endpoint task & koleksi miliknya
bendahara       → GET only untuk laporan dan data operasional
```

---

## Daftar Endpoint Lengkap

### Auth
```
POST   /auth/login              → login, return {accessToken, refreshToken}
POST   /auth/logout             → blacklist refreshToken di Redis
POST   /auth/refresh            → return accessToken baru
GET    /auth/me                 → profil user yang sedang login
```

### Wilayah
```
GET    /wilayah                 → list semua wilayah (filter: tipe, parent_id)
POST   /wilayah                 → tambah wilayah baru         [admin_kecamatan]
PUT    /wilayah/:id             → edit wilayah                [admin_kecamatan]
```

### Users
```
GET    /users                   → list users (filter: role, wilayah_id)
POST   /users                   → tambah user baru            [admin_kecamatan]
PUT    /users/:id               → edit user / nonaktifkan     [admin_kecamatan]
POST   /users/:id/reset-password → reset password user        [admin_kecamatan]
```

### Kaleng
```
GET    /kaleng                  → list kaleng (filter: wilayah_id, is_active, search)
POST   /kaleng                  → tambah kaleng baru          [admin_kecamatan, admin_ranting]
GET    /kaleng/:id              → detail satu kaleng
PUT    /kaleng/:id              → update data kaleng          [admin_ranting+]
POST   /kaleng/:id/generate-qr → generate/regenerate QR token satu kaleng  [admin_kecamatan]
POST   /kaleng/generate-qr/batch → generate QR massal, return PDF URL       [admin_kecamatan]
GET    /kaleng/scan/:qr_token   → validasi QR scan dari petugas              [petugas]
```

### Assignments
```
GET    /assignments             → list assignment (filter: periode, ranting, petugas)
POST   /assignments/generate   → auto-generate assignment bulanan            [system/admin_kecamatan]
PUT    /assignments/:id        → override/reassign ke petugas lain           [admin_ranting+]
GET    /assignments/my-tasks   → task milik petugas yang sedang login        [petugas]
```

### Koleksi
```
POST   /koleksi                → submit pengambilan (online atau sync offline) [petugas]
POST   /koleksi/batch-sync     → sync banyak record offline sekaligus          [petugas]
POST   /koleksi/:id/resubmit   → koreksi nominal dengan alasan wajib           [petugas]
GET    /koleksi                → list koleksi (filter: periode, ranting, petugas, is_latest)
GET    /koleksi/:id            → detail 1 koleksi beserta riwayat re-submit
GET    /koleksi/resubmit-list  → daftar semua yang pernah di-re-submit
```

### Laporan
```
GET    /laporan/summary        → total per periode, per ranting, per petugas
GET    /laporan/export/csv     → download CSV (filter: periode, ranting, petugas)
GET    /laporan/petugas/:id    → rekap pengumpulan 1 petugas
GET    /laporan/kaleng/:id     → riwayat pengumpulan 1 kaleng semua periode
```

---

## Aturan Filter Role di Query

```typescript
// Middleware role_filter harus diterapkan SEBELUM query DB:

if (user.role === 'admin_ranting') {
  // Semua query yang melibatkan kaleng/koleksi/users
  // WAJIB ditambahkan filter: WHERE wilayah_id = user.wilayah_id
}

if (user.role === 'petugas') {
  // GET /assignments/my-tasks → WHERE petugas_id = user.id
  // POST /koleksi → validasi kaleng ada di assignment aktif user ini
  // Tidak boleh melihat data petugas lain
}

if (user.role === 'bendahara') {
  // Hanya boleh GET — semua POST/PUT/DELETE → return 403 FORBIDDEN
}
```

---

*Lazisnu Infaq Collection System — rules/03-api-conventions.md*
