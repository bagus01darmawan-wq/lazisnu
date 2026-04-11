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

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
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
    "status": "PENDING"
  }
}
```

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

**Request:**
```json
{
  "collections": [
    {
      "offline_id": "local-uuid-001",
      "assignment_id": "uuid",
      "can_id": "uuid",
      "amount": 50000,
      "payment_method": "CASH",
      "collected_at": "2026-04-09T10:30:00Z",
      "latitude": -6.200000,
      "longitude": 106.820000
    },
    {
      "offline_id": "local-uuid-002",
      "assignment_id": "uuid",
      "can_id": "uuid",
      "amount": 75000,
      "payment_method": "TRANSFER",
      "transfer_receipt_url": "https://r2.lazisnu.id/receipts/abc123.jpg",
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