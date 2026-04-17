---
trigger: model_decision
---

# Rule: Arsitektur Database
# Scope: Backend agent, semua task yang menyentuh database

---

## ⚠️ Aturan Paling Kritis

```
Tabel KOLEKSI bersifat IMMUTABLE.
DILARANG menulis query DELETE atau UPDATE pada tabel koleksi
untuk mengubah data nominal, metode, atau identitas transaksi.

Satu-satunya pengecualian yang diizinkan:
  UPDATE koleksi SET is_latest = false ...
  (hanya untuk flag versioning saat re-submit, bukan mengubah data transaksi)

Constraint ini diimplementasikan via PostgreSQL RULE di level database.
```

---

## Schema Lengkap

### Tabel: wilayah
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
nama        VARCHAR(100) NOT NULL
tipe        ENUM('kecamatan', 'ranting') NOT NULL
parent_id   UUID REFERENCES wilayah(id) ON DELETE SET NULL
            -- NULL jika tipe = 'kecamatan'
is_active   BOOLEAN NOT NULL DEFAULT true
created_at  TIMESTAMP NOT NULL DEFAULT NOW()
```

### Tabel: users
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
nama          VARCHAR(100) NOT NULL
nomor_hp      VARCHAR(20) UNIQUE NOT NULL
email         VARCHAR(100)
password_hash VARCHAR(255) NOT NULL          -- bcrypt, rounds=12
role          ENUM('admin_kecamatan','admin_ranting','petugas','bendahara') NOT NULL
wilayah_id    UUID NOT NULL REFERENCES wilayah(id)
is_active     BOOLEAN NOT NULL DEFAULT true
last_login_at TIMESTAMP
created_at    TIMESTAMP NOT NULL DEFAULT NOW()
updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
```

### Tabel: kaleng
```sql
id               UUID PRIMARY KEY DEFAULT gen_random_uuid()
kode_unik        VARCHAR(20) UNIQUE NOT NULL   -- format: LZN-KEC01-0001
qr_token         VARCHAR(255) UNIQUE           -- HMAC-SHA256 signed token
nama_pemilik     VARCHAR(100) NOT NULL
nomor_hp_pemilik VARCHAR(20) NOT NULL          -- nomor WA untuk notifikasi
alamat           TEXT NOT NULL
wilayah_id       UUID NOT NULL REFERENCES wilayah(id)
is_active        BOOLEAN NOT NULL DEFAULT true
qr_generated_at  TIMESTAMP
created_by       UUID NOT NULL REFERENCES users(id)
created_at       TIMESTAMP NOT NULL DEFAULT NOW()
updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
```

### Tabel: assignments
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
petugas_id     UUID NOT NULL REFERENCES users(id)
kaleng_id      UUID NOT NULL REFERENCES kaleng(id)
periode_bulan  INTEGER NOT NULL CHECK (periode_bulan BETWEEN 1 AND 12)
periode_tahun  INTEGER NOT NULL CHECK (periode_tahun >= 2024)
is_active      BOOLEAN NOT NULL DEFAULT true    -- false jika di-override/reassign
catatan        TEXT                             -- alasan reassign, wajib jika override
assigned_by    UUID NOT NULL REFERENCES users(id)
created_at     TIMESTAMP NOT NULL DEFAULT NOW()
updated_at     TIMESTAMP NOT NULL DEFAULT NOW()

-- Hanya boleh ada 1 assignment aktif per kaleng per periode
CONSTRAINT uq_active_assignment
  UNIQUE (kaleng_id, periode_bulan, periode_tahun)
  WHERE is_active = true
```

### Tabel: koleksi ⚠️ INSERT ONLY
```sql
id                 UUID PRIMARY KEY DEFAULT gen_random_uuid()
kaleng_id          UUID NOT NULL REFERENCES kaleng(id)
petugas_id         UUID NOT NULL REFERENCES users(id)
assignment_id      UUID NOT NULL REFERENCES assignments(id)
periode_bulan      INTEGER NOT NULL CHECK (periode_bulan BETWEEN 1 AND 12)
periode_tahun      INTEGER NOT NULL
nominal            BIGINT NOT NULL CHECK (nominal > 0)
                   -- BIGINT bukan DECIMAL — hindari floating point error
metode_bayar       ENUM('cash','transfer') NOT NULL
submit_sequence    INTEGER NOT NULL DEFAULT 1   -- 1=pertama, 2=re-submit, dst
is_latest          BOOLEAN NOT NULL DEFAULT true
                   -- TRUE hanya pada record terbaru per kaleng per periode
alasan_resubmit    TEXT
                   -- WAJIB diisi jika submit_sequence > 1
wa_status          ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending'
wa_sent_at         TIMESTAMP
offline_created_at TIMESTAMP                    -- timestamp dibuat di device (offline)
synced_at          TIMESTAMP                    -- timestamp berhasil sync ke server
created_at         TIMESTAMP NOT NULL DEFAULT NOW()

-- Index untuk performa query laporan
CREATE INDEX idx_koleksi_periode ON koleksi(kaleng_id, periode_bulan, periode_tahun);
CREATE INDEX idx_koleksi_petugas ON koleksi(petugas_id, periode_bulan, periode_tahun);
CREATE INDEX idx_koleksi_latest  ON koleksi(is_latest) WHERE is_latest = true;

-- IMMUTABLE CONSTRAINT via PostgreSQL RULE
CREATE RULE no_delete_koleksi AS ON DELETE TO koleksi DO INSTEAD NOTHING;
CREATE RULE no_update_nominal_koleksi AS ON UPDATE TO koleksi
  WHERE OLD.nominal IS DISTINCT FROM NEW.nominal DO INSTEAD NOTHING;
```

### Tabel: wa_logs
```sql
id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
koleksi_id   UUID NOT NULL REFERENCES koleksi(id)
nomor_hp     VARCHAR(20) NOT NULL
pesan        TEXT NOT NULL
sequence     INTEGER NOT NULL               -- 1=submit pertama, 2=re-submit
status       ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending'
response_api JSONB                          -- raw response dari Meta Graph API
sent_at      TIMESTAMP

CREATE INDEX idx_wa_logs_koleksi ON wa_logs(koleksi_id);
CREATE INDEX idx_wa_logs_status  ON wa_logs(status) WHERE status = 'failed';
```

### Tabel: audit_logs
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL REFERENCES users(id)
action      VARCHAR(50) NOT NULL
            -- nilai: CREATE, UPDATE, GENERATE_QR, REASSIGN, RESET_PASSWORD, dll
entity      VARCHAR(50) NOT NULL
            -- nilai: kaleng, users, assignments, wilayah
entity_id   UUID
old_value   JSONB                           -- data sebelum perubahan
new_value   JSONB                           -- data sesudah perubahan
ip_address  VARCHAR(45)
created_at  TIMESTAMP NOT NULL DEFAULT NOW()

CREATE INDEX idx_audit_user   ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);
```

---

## Urutan Migrasi

```
migrations/
├── 001_create_wilayah.sql
├── 002_create_users.sql
├── 003_create_kaleng.sql
├── 004_create_assignments.sql
├── 005_create_koleksi.sql        ← termasuk RULE immutable
├── 006_create_wa_logs.sql
└── 007_create_audit_logs.sql
```

> Jalankan secara berurutan. Migrasi tidak boleh di-rollback setelah data production masuk.

---

## Query Umum yang Sering Dipakai

```sql
-- Ambil koleksi terbaru per kaleng per periode (default tampilan):
SELECT * FROM koleksi
WHERE is_latest = true
  AND periode_bulan = $1
  AND periode_tahun = $2;

-- Ambil semua riwayat re-submit untuk satu kaleng satu periode:
SELECT * FROM koleksi
WHERE kaleng_id = $1
  AND periode_bulan = $2
  AND periode_tahun = $3
ORDER BY submit_sequence ASC;

-- Cek apakah kaleng sudah disubmit periode ini:
SELECT id FROM koleksi
WHERE kaleng_id = $1
  AND periode_bulan = $2
  AND periode_tahun = $3
  AND is_latest = true
LIMIT 1;
```

---

*Lazisnu Infaq Collection System — rules/02-arsitektur-database.md*
