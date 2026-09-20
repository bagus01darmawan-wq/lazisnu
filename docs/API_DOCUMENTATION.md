# Dokumentasi API - Lazisnu Collector App

## 1. Informasi Umum

| Item | Detail |
|------|--------|
| **Base URL** | `https://api.lazisnu.id/v1` |
| **Content-Type** | `application/json` |
| **Authentication** | JWT Bearer Token |
| **Version** | 1.0.0 |

---

## 2. Autentikasi

### 2.1 Login

**Endpoint:** `POST /auth/login`

**Request:**
```json
{
  "phone": "081234567890",
  "password": "string"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "email": "admin@lazisnu.id",
      "full_name": "Nama Lengkap",
      "role": "ADMIN_RANTING",
      "branch_id": "uuid",
      "district_id": "uuid"
    }
  }
}
```

### 2.2 Request OTP

**Endpoint:** `POST /auth/request-otp`

**Request:**
```json
{
  "phone": "081234567890"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "OTP dikirim ke WhatsApp",
  "expires_in": 300
}
```

### 2.3 Verifikasi OTP

**Endpoint:** `POST /auth/verify-otp`

**Request:**
```json
{
  "phone": "081234567890",
  "otp": "123456"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "full_name": "Nama Petugas",
      "role": "PETUGAS"
    }
  }
}
```

### 2.4 Refresh Token

**Endpoint:** `POST /auth/refresh`

**Request:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

---

## 3. Mobile API (Petugas)

### 3.1 Dashboard

**Endpoint:** `GET /mobile/dashboard`

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "today_stats": {
      "collected": 15,
      "total_amount": 1250000,
      "remaining": 25
    },
    "week_stats": {
      "collected": 45,
      "total_amount": 3750000
    },
    "pending_tasks": [
      {
        "id": "uuid",
        "qr_code": "LZNU-KC01-00001",
        "owner_name": "Bapak Ahmad",
        "address": "Jl. Contoh No. 1",
        "latitude": -6.200000,
        "longitude": 106.820000,
        "assigned_at": "2026-04-01T00:00:00Z"
      }
    ],
    "recent_collections": [
      {
        "id": "uuid",
        "qr_code": "LZNU-KC01-00002",
        "owner_name": "Ibu Siti",
        "amount": 50000,
        "collected_at": "2026-04-09T10:30:00Z"
      }
    ]
  }
}
```

### 3.2 Lihat Tugas

**Endpoint:** `GET /mobile/tasks`

**Query Parameters:**
| Parameter | Type | Default | Deskripsi |
|-----------|------|---------|-----------|
| status | string | ALL | ACTIVE, COMPLETED, POSTPONED |
| page | integer | 1 | Halaman |
| limit | integer | 20 | Item per halaman |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "uuid",
        "qr_code": "LZNU-KC01-00001",
        "owner_name": "Bapak Ahmad",
        "owner_address": "Jl. Contoh No. 1",
        "owner_phone": "081234567890",
        "latitude": -6.200000,
        "longitude": 106.820000,
        "status": "ACTIVE",
        "assigned_at": "2026-04-01T00:00:00Z",
        "period": "2026-04"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 45,
      "total_pages": 3
    }
  }
}
```

### 3.3 Scan QR Code

**Endpoint:** `GET /mobile/scan/{qr_code}`

`qr_code` harus dikirim persis seperti tersimpan di database. Backend tidak
melakukan trim atau perubahan kapitalisasi. Endpoint dilindungi JWT dan hanya
mengembalikan detail ketika assignment aktif dimiliki petugas pada periode berjalan.

> C1-T2 (20 Sep 2026): lookup toleran lintas periode. Scan assignment periode
> bulan lalu **tetap lolos** selama `now <= tolerance_end` (tgl 9 bln berikut
> 23:59 WIB) dengan flag `tolerance: true` (badge "Toleransi" di HP).
> Patokan periode = `assignments.(periodYear, periodMonth)`, bukan waktu scan.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "assignment-uuid",
    "can_id": "can-uuid",
    "qr_code": "LZNU-KC01-00001",
    "owner_name": "Bapak Ahmad",
    "owner_phone": "081234567890",
    "owner_address": "Jl. Contoh No. 1",
    "latitude": -6.200000,
    "longitude": 106.820000,
    "last_collection": {
      "amount": 75000,
      "date": "2026-03-15"
    },
    "status": "ACTIVE",
    "period": "2026-09",
    "tolerance": false
  }
}
```

`period` = periode assignment (`YYYY-MM`); `tolerance: true` berarti jemputan
tercatat pada periode bulan lalu (masih dalam jendela toleransi s/d tgl 9).

**Response (403 - bukan assignment petugas):**
```json
{
  "success": false,
  "error": {
    "code": "QR_NOT_ASSIGNED",
    "message": "Kaleng ini bukan tugas Anda pada periode berjalan"
  }
}
```

**Response (409 - tugas periode lain, C1-T2):**
```json
{
  "success": false,
  "error": {
    "code": "QR_WRONG_PERIOD",
    "message": "Kaleng ini tugas Anda pada periode 2026-07 — di luar periode berjalan.",
    "details": { "period": "2026-07" }
  }
}
```

**Response (409 - periode sudah dikunci, C1-T2):**
```json
{
  "success": false,
  "error": {
    "code": "QR_PERIOD_CLOSED",
    "message": "Periode 2026-09 sudah dikunci, pakai tugas 2026-10.",
    "details": { "period": "2026-09", "next_period": "2026-10" }
  }
}
```

**Response (409 - sudah dijemput periode ini, C1-T2):**
```json
{
  "success": false,
  "error": {
    "code": "QR_ALREADY_SUBMITTED",
    "message": "Kaleng ini sudah dijemput pada periode 2026-09.",
    "details": { "period": "2026-09" }
  }
}
```

Kasus "benar-benar bukan tugas" (`QR_NOT_ASSIGNED`) tetap tanpa data pemilik
(`owner_*`) — jaminan privasi. Kode baru juga dipakai jalur submit/sync:
submit ke periode terkunci ditolak `QR_PERIOD_CLOSED` (non-retry, terlihat di
antrean gagal permanen); `collected_at` di luar jendela periode ditolak
`VALIDATION_ERROR`.

**Response (404):**
```json
{
  "success": false,
  "error": {
    "code": "CAN_NOT_FOUND",
    "message": "Kaleng tidak ditemukan"
  }
}
```

### 3.4 Submit Penjemputan

**Endpoint:** `POST /mobile/collections`

**Headers:** `Authorization: Bearer {token}`

**Request:**
```json
{
  "assignment_id": "uuid",
  "can_id": "uuid",
  "amount": 75000,
  "payment_method": "CASH",
  "transfer_receipt_url": null,
  "collected_at": "2026-04-09T10:30:00Z",
  "latitude": -6.200000,
  "longitude": 106.820000,
  "device_info": {
    "model": "Samsung Galaxy A54",
    "os_version": "Android 14",
    "app_version": "1.0.0"
  },
  "offline_id": "local-uuid-123"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "sync_status": "COMPLETED",
    "whatsapp_status": "SENT",
    "message": "Penjemputan berhasil disimpan"
  }
}
```

**Response (201 - Offline Response):**
```json
{
  "success": true,
  "data": {
    "offline_id": "local-uuid-123",
    "sync_status": "PENDING",
    "message": "Data disimpan offline, akan sync saat ada sinyal"
  }
}
```

### 3.5 Batch Submit (Offline Sync)

**Endpoint:** `POST /mobile/collections/batch`

**Request (Note: payment_method and transfer_receipt_url are rejected/excluded from batch sync):**
```json
{
  "collections": [
    {
      "offline_id": "local-uuid-001",
      "assignment_id": "uuid",
      "can_id": "uuid",
      "amount": 50000,
      "collected_at": "2026-04-09T10:30:00Z",
      "latitude": -6.200000,
      "longitude": 106.820000
    },
    {
      "offline_id": "local-uuid-002",
      "assignment_id": "uuid",
      "can_id": "uuid",
      "amount": 75000,
      "collected_at": "2026-04-09T10:45:00Z",
      "latitude": -6.201000,
      "longitude": 106.821000
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [
      {
        "offline_id": "local-uuid-001",
        "server_id": "uuid-001",
        "status": "COMPLETED"
      },
      {
        "offline_id": "local-uuid-002",
        "server_id": "uuid-002",
        "status": "COMPLETED"
      }
    ]
  }
}
```

### 3.6 Sync Status

**Endpoint:** `GET /mobile/sync/status`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "pending_count": 5,
    "last_sync_at": "2026-04-09T10:30:00Z",
    "oldest_pending": "2026-04-08T08:00:00Z"
  }
}
```

### 3.7 Get Profile

**Endpoint:** `GET /mobile/profile`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "employee_code": "PET001",
    "full_name": "Nama Petugas",
    "phone": "081234567890",
    "photo_url": "https://r2.lazisnu.id/photos/abc123.jpg",
    "branch": {
      "id": "uuid",
      "name": "Ranting Contoh"
    },
    "district": {
      "id": "uuid",
      "name": "Kecamatan Contoh"
    },
    "assigned_zone": "Zona Utara",
    "stats": {
      "total_collections": 450,
      "total_amount": 37500000
    }
  }
}
```

### 3.8 Setoran PPK — Lihat, Co-sign 2 HP, Berita Acara, PDF (C1-T4/T5)

Angka (total, bisyaroh 10% ceil ribuan, bersih) dihitung server dari
collections periode itu — tanpa ketik nominal. Baris DRAFT dihitung ulang
tiap dibuka; baris FINAL beku. Setelah FINAL, submit/resubmit/skip periode
itu ditolak (`QR_ALREADY_SUBMITTED`).

Upacara co-sign (C1-T5, §14.6): PPK menandatangani di HP-nya, bendahara di
HP-nya — `signer_id` selalu pemilik sesi login, tidak pernah dari body
(kunci `*_signer_id` di body otomatis 400). Alur: `sign` (DRAFT →
PPK_SIGNED) → `countersign` (→ FINAL bila tak ada ACTIVE tersisa, atau tetap
PPK_SIGNED + `needs_force: true`) → `force-finalize` (Admin Ranting, butuh
PPK_SIGNED + kedua TTD + alasan; menimpa gerbang ACTIVE saja).

**Endpoint:** `GET /mobile/submissions?year=&month=` (PETUGAS, miliknya)

**Endpoint:** `POST /mobile/submissions/{id}/sign` (PETUGAS pemilik)

**Request:**
```json
{ "signature_png": "<base64 PNG ≤ 50KB>", "consent": true, "expected_version": 1 }
```

**Endpoint:** `POST /mobile/submissions/{id}/countersign` (STAF_KEUANGAN
seranting) — body sama. Balasan `FINAL` atau `{ status: "PPK_SIGNED",
needs_force: true, active_left: N }`.

**Endpoint:** `POST /mobile/submissions/{id}/force-finalize`
(ADMIN_RANTING pemilik) — body `{ "force_reason": "...", "expected_version": 1 }`.

**Endpoint:** `GET /mobile/submissions/{id}/berita-acara` (pemilik,
keuangan/ranting seranting, kecamatan sedistrik) — teks readable dari
snapshot; sebelum FINAL berlabel `DRAFT — belum sah`.

**Endpoint:** `GET /mobile/submissions/{id}/pdf` (peran sama; FINAL saja) —
lazy-generate → `{ download_url (signed, pendek), expires_in_seconds,
pdf_hash, reused }`. Tanda ulang / versi basi → `409 CONFLICT`.

---

## 4. Web API (Admin & Bendahara)

### 4.1 Dashboard Admin Ranting

**Endpoint:** `GET /admin/branch/dashboard`

**Headers:** `Authorization: Bearer {token}` (role: ADMIN_RANTING)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_cans": 150,
      "active_cans": 145,
      "total_officers": 10,
      "active_officers": 8,
      "month_collection": 45000000,
      "month_count": 320
    },
    "recent_collections": [],
    "pending_tasks": 25,
    "by_officer": [
      {
        "officer_id": "uuid",
        "officer_name": "Petugas 1",
        "collected": 45,
        "amount": 3750000
      }
    ]
  }
}
```

### 4.2 CRUD Kaleng

**GET** `GET /admin/cans`
- Query: `page`, `limit`, `search`, `status`
- Response: list kaleng dengan pagination

**POST** `POST /admin/cans`
```json
{
  "owner_name": "Bapak Ahmad",
  "owner_phone": "081234567890",
  "owner_address": "Jl. Contoh No. 1",
  "owner_whatsapp": "081234567890",
  "latitude": -6.200000,
  "longitude": 106.820000,
  "location_notes": "Dekat Masjid"
}
```

**GET** `GET /admin/cans/{id}`
- Response: detail kaleng

**PUT** `PUT /admin/cans/{id}`
```json
{
  "owner_name": "Bapak Ahmad (Updated)",
  "owner_phone": "081234567891"
}
```

**DELETE** `DELETE /admin/cans/{id}`
- Response: 204 No Content

### 4.3 Generate QR Code

**Endpoint:** `POST /admin/cans/{id}/generate-qr`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "qr_code": "LZNU-KC01-00001",
    "qr_image_url": "https://r2.lazisnu.id/qr/lznu-kc01-00001.png",
    "print_url": "https://r2.lazisnu.id/qr/lznu-kc01-00001.pdf"
  }
}
```

**Batch Generate:** `POST /admin/cans/batch-generate-qr`
```json
{
  "can_ids": ["uuid1", "uuid2", "uuid3"]
}
```

### 4.4 CRUD Petugas

**GET** `GET /admin/officers`
- Query: `page`, `limit`, `branch_id`, `search`

**POST** `POST /admin/officers`
```json
{
  "full_name": "Nama Petugas",
  "phone": "081234567890",
  "assigned_zone": "Zona Utara",
  "photo_url": "https://..."
}
```

**GET** `GET /admin/officers/{id}`
- Response: detail petugas + statistik

**PUT** `PUT /admin/officers/{id}`

**DELETE** `DELETE /admin/officers/{id}`

### 4.5 Assignment

**GET** `GET /admin/assignments`
- Query: `year`, `month`, `officer_id`, `branch_id`

**POST** `POST /admin/assignments`
```json
{
  "can_id": "uuid",
  "officer_id": "uuid",
  "backup_officer_id": "uuid",
  "period_year": 2026,
  "period_month": 4
}
```

**PUT** `PUT /admin/assignments/{id}`
```json
{
  "officer_id": "uuid- baru",
  "status": "REASSIGNED",
  "notes": "Petugas asli berhalangan"
}
```

### 4.6 Laporan

**Endpoint:** `GET /reports/collections`

**Query Parameters:**
| Parameter | Type | Required | Deskripsi |
|-----------|------|----------|-----------|
| start_date | date | Yes | Tanggal mulai |
| end_date | date | Yes | Tanggal akhir |
| officer_id | uuid | No | Filter petugas |
| branch_id | uuid | No | Filter ranting |
| district_id | uuid | No | Filter kecamatan |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_amount": 125000000,
      "total_count": 850,
      "cash_amount": 100000000,
      "cash_count": 700,
      "transfer_amount": 25000000,
      "transfer_count": 150
    },
    "by_officer": [
      {
        "officer_id": "uuid",
        "officer_name": "Petugas 1",
        "count": 85,
        "amount": 12500000
      }
    ],
    "by_branch": [
      {
        "branch_id": "uuid",
        "branch_name": "Ranting 1",
        "count": 250,
        "amount": 37500000
      }
    ],
    "details": []
  }
}
```

### 4.7 Export CSV

**Endpoint:** `GET /reports/collections/export`

**Query:** Same as above + `format=csv`

**Response:** File CSV download

### 4.8 Dashboard Admin Kecamatan

**Endpoint:** `GET /admin/district/dashboard`

**Headers:** `Authorization: Bearer {token}` (role: ADMIN_KECAMATAN)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total_branches": 5,
      "total_cans": 750,
      "total_officers": 50,
      "active_officers": 45,
      "month_collection": 225000000,
      "month_count": 1600
    },
    "by_branch": [
      {
        "branch_id": "uuid",
        "branch_name": "Ranting 1",
        "cans": 150,
        "officers": 10,
        "collection": 45000000,
        "count": 320
      }
    ],
    "top_officers": [],
    "pending_sync": 3
  }
}
```

### 4.9 Dashboard Bendahara

**Endpoint:** `GET /bendahara/dashboard`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "current_month": {
      "total": 45000000,
      "count": 320,
      "cash": 35000000,
      "transfer": 10000000
    },
    "by_district": [
      {
        "district_name": "Kecamatan 1",
        "total": 15000000,
        "count": 100
      }
    ],
    "by_officer": [],
    "by_payment_method": {
      "cash": 35000000,
      "transfer": 10000000
    },
    "recent_transactions": []
  }
}
```

### 4.10 Detail Transaksi

**Endpoint:** `GET /bendahara/collections/{id}`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "can": {
      "qr_code": "LZNU-KC01-00001",
      "owner_name": "Bapak Ahmad",
      "owner_address": "Jl. Contoh"
    },
    "officer": {
      "name": "Petugas 1",
      "phone": "081234567890"
    },
    "amount": 75000,
    "payment_method": "CASH",
    "collected_at": "2026-04-09T10:30:00Z",
    "sync_status": "COMPLETED",
    "notification_status": "SENT"
  }
}
```

### 4.11 Draft Penugasan — Generate Approve (C1-T3)

Robot menyiapkan draft siap-jalan per ranting/program tepat tgl 10 & 20
(via Scheduler §5.3); Staf Bid. Pengumpulan melihat–mengedit–menyetujui,
diam 24 jam → eskalasi ke Staf Keuangan (Bendahara/Sekretaris). Semua route
di bawah otorisasi `STAF_PENGUMPULAN` + `STAF_KEUANGAN` (scope rantingnya /
program MWC distriknya). Setujui = tugas aktif dalam 1 transaksi; kedua kali
ditolak ("tombol mati sekali").

**Endpoint:** `GET /admin/period-drafts?year=&month=`

**Response (200):** daftar `{ id, period, branch_id, branch_name, branch_kind, status, prepared_at, item_count, event_kind, period_status }` — `event_kind`: `PENDING` (menunggu Staf) / `ESCALATED` (lewat 24 jam, giliran Keuangan) / `APPROVED`.

**Endpoint:** `GET /admin/period-drafts/{id}` — rincian + item `{ id, can_id, qr_code, owner_name, officer_id, officer_name }`.

**Endpoint:** `POST /admin/period-drafts/{id}/approve`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "draft_id": "uuid",
    "period": "2026-10",
    "item_count": 120,
    "created_assignments": 118,
    "approved_by_role": "STAF_PENGUMPULAN",
    "escalated": false
  }
}
```

**Endpoint:** `PATCH /admin/period-drafts/items/{itemId}` body `{ "officer_id": "uuid" }` (hanya Staf Pengumpulan, draft DRAFT, petugas satu ranting/program) • `DELETE /admin/period-drafts/items/{itemId}` (keluarkan kaleng dari draft).

### 4.12 Setoran Ranting — Co-sign, Berita Acara, PDF (C1-T4/T5)

Agregat PPK FINAL + ekspektasi share 30% × sisa + selisih. Kunci aktif hanya
bila semua PPK sudah FINAL (disebut namanya bila belum). Selisih
`|aktual − ekspektasi| > Rp 10.000` wajib alasan; `GABUNG_PERIODE` wajib
`linked_periods`. `as_nol: true` = kunci 0 pemasukan (totals 0 + alasan wajib)
→ status `FINAL_NOL`. Orkestrasi berlapis + `FINAL_NOL` massal MWC = T6.

Upacara co-sign (C1-T5): Admin Ranting sign di sesinya (+ angka; status tetap
DRAFT) → Bendahara MWC (STAF_KEUANGAN sedistrik) countersign di HP-nya →
`FINAL`/`FINAL_NOL`. `signer_id` selalu pemilik sesi.

**Endpoint:** `GET /admin/branch-submissions?year=&month=` • `GET /admin/branch-submissions/{id}` (+ `ppk_penyusun`)

**Endpoint:** `POST /admin/branch-submissions/{id}/sign` (ADMIN_RANTING pemilik)

**Request:**
```json
{
  "signature_png": "<base64 PNG ≤ 50KB>",
  "consent": true,
  "expected_version": 1,
  "share_mwc": 1675000,
  "variance_reason": "LEBIH_BAYAR",
  "linked_periods": ["2026-07", "2026-08"],
  "as_nol": false
}
```

**Endpoint:** `POST /mobile/branch-submissions/{id}/countersign`
(STAF_KEUANGAN sedistrik) — body `{ signature_png, consent,
expected_version }`.

**Endpoint:** `GET /admin/branch-submissions/{id}/berita-acara` (ranting
pemilik / kecamatan sedistrik / keuangan se-scope) •
`GET /admin/branch-submissions/{id}/pdf` (FINAL/FINAL_NOL saja) →
`{ download_url, expires_in_seconds, pdf_hash, reused }`.

**Endpoint publik:** `GET /v1/verify/ba?type=ppk|branch&id=&version=&hash=`
→ `{ valid: true|false }` saja (tanpa nominal/nama/pihak).

**Endpoint:** `DELETE /admin/signatures` (ADMIN_KECAMATAN) — hapus coretan
TTD (retensi UU 27/2022), body `{ key, reason }`.

---

## 5. Scheduler API (Internal)

### 5.1 Generate Monthly Tasks

**Endpoint:** `POST /scheduler/generate-tasks`

**Request:**
```json
{
  "year": 2026,
  "month": 5
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_assignments": 750,
    "assigned_to_officers": 50
  }
}
```

### 5.2 Calculate Summaries

**Endpoint:** `POST /scheduler/calculate-summaries`

**Request:**
```json
{
  "year": 2026,
  "month": 4
}
```

### 5.3 Prepare Draft Penugasan (C1-T3, robot)

**Endpoint:** `POST /scheduler/prepare-draft` (kunci `x-internal-api-key`)

Menyiapkan draft siap-jalan untuk `{year, month}` = **bulan berjalan**
(cron tgl 10 → bulan itu; cron tgl 20 → susulan bulan itu; bulan masa depan
ditolak). Robot tidak menulis `assignments` — hanya draft + baris
`period_calendar` yang identik `buildPeriodBoundaries(y, m)`. Idempoten
(aman cron ganda).

**Response (200):**
```json
{
  "success": true,
  "data": {
    "period": "2026-10",
    "calendar_row_written": true,
    "drafts": [
      { "branch_id": "uuid", "draft_id": "uuid", "status": "DRAFT", "added_items": 120, "total_items": 120, "direct_assignments": 0 }
    ]
  }
}
```

---

## 6. Error Handling

### Format Error Response

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Pesan error yang jelas",
    "details": {}
  }
}
```

### Kode Error Umum

| Kode | HTTP Status | Deskripsi |
|------|-------------|-----------|
| VALIDATION_ERROR | 400 | Input tidak valid |
| UNAUTHORIZED | 401 | Token tidak valid/expired |
| FORBIDDEN | 403 | Tidak punya akses |
| NOT_FOUND | 404 | Resource tidak ditemukan |
| CONFLICT | 409 | Data duplikat |
| INTERNAL_ERROR | 500 | Error server |

---

## 7. Rate Limiting

| Endpoint | Limit |
|----------|-------|
| `/auth/login` | 5 req/menit |
| `/auth/request-otp` | 3 req/menit |
| `/mobile/collections` | 100 req/menit |
| `/admin/*` | 60 req/menit |

---

## 8. Pagination

Semua list endpoint menggunakan pagination dengan format:

**Request:** `?page=1&limit=20`

**Response Meta:**
```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "total_pages": 8
  }
}
```

---

*Document Version: 1.0*
*Last Updated: April 2026*
*Author: MiniMax Agent*
