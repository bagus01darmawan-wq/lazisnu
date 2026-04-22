---
trigger: model_decision
---

# Rule: Database Architecture
# Scope: Backend agent, all tasks touching the database

---

## ⚠️ Most Critical Rule

```
COLLECTIONS table is IMMUTABLE.
FORBIDDEN to write DELETE or UPDATE queries on the collections table
to change nominal, method, or transaction identity.

The only allowed exception:
  UPDATE collections SET is_latest = false ...
  (only for versioning flag during re-submit, not changing transaction data)

This constraint is implemented via PostgreSQL RULE at the database level.
```

---

## Complete Schema

### Table: districts
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
code        VARCHAR(10) UNIQUE NOT NULL
name        VARCHAR(100) NOT NULL
region_code VARCHAR(5) NOT NULL
created_at  TIMESTAMP NOT NULL DEFAULT NOW()
updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: branches
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
district_id UUID NOT NULL REFERENCES districts(id)
code        VARCHAR(10) UNIQUE NOT NULL
name        VARCHAR(100) NOT NULL
created_at  TIMESTAMP NOT NULL DEFAULT NOW()
updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: users
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
email         VARCHAR(255) UNIQUE NOT NULL
password_hash VARCHAR(255) NOT NULL
full_name     VARCHAR(100) NOT NULL
phone         VARCHAR(20) UNIQUE NOT NULL
role          ENUM('ADMIN_KECAMATAN','ADMIN_RANTING','BENDAHARA','PETUGAS') NOT NULL
district_id   UUID REFERENCES districts(id)
branch_id     UUID REFERENCES branches(id)
is_active     BOOLEAN NOT NULL DEFAULT true
last_login    TIMESTAMP
created_at    TIMESTAMP NOT NULL DEFAULT NOW()
updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: officers
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id       UUID UNIQUE NOT NULL REFERENCES users(id)
employee_code VARCHAR(20) UNIQUE NOT NULL
full_name     VARCHAR(100) NOT NULL
phone         VARCHAR(20) UNIQUE NOT NULL
district_id   UUID NOT NULL REFERENCES districts(id)
branch_id     UUID NOT NULL REFERENCES branches(id)
is_active     BOOLEAN NOT NULL DEFAULT true
created_at    TIMESTAMP NOT NULL DEFAULT NOW()
updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: cans
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
qr_code        VARCHAR(50) UNIQUE NOT NULL
branch_id      UUID NOT NULL REFERENCES branches(id)
owner_name     VARCHAR(100) NOT NULL
owner_phone    VARCHAR(20) NOT NULL
owner_address  TEXT NOT NULL
last_collected_at TIMESTAMP
total_collected BIGINT DEFAULT 0
collection_count INTEGER DEFAULT 0
is_active      BOOLEAN NOT NULL DEFAULT true
created_at     TIMESTAMP NOT NULL DEFAULT NOW()
updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: assignments
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
can_id         UUID NOT NULL REFERENCES cans(id)
officer_id     UUID NOT NULL REFERENCES officers(id)
period_year    INTEGER NOT NULL
period_month   INTEGER NOT NULL
status         ENUM('ACTIVE', 'COMPLETED', 'POSTPONED', 'REASSIGNED') NOT NULL DEFAULT 'ACTIVE'
assigned_at    TIMESTAMP NOT NULL DEFAULT NOW()
created_at     TIMESTAMP NOT NULL DEFAULT NOW()
updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: collections ⚠️ INSERT ONLY
```sql
id                 UUID PRIMARY KEY DEFAULT gen_random_uuid()
assignment_id      UUID NOT NULL REFERENCES assignments(id)
can_id             UUID NOT NULL REFERENCES cans(id)
officer_id         UUID NOT NULL REFERENCES officers(id)
nominal            BIGINT NOT NULL CHECK (nominal > 0)
payment_method     ENUM('CASH','TRANSFER') NOT NULL DEFAULT 'CASH'
is_latest          BOOLEAN NOT NULL DEFAULT true
submit_sequence    INTEGER NOT NULL DEFAULT 1
alasan_resubmit    TEXT                             -- Mandatory if submit_sequence > 1
collected_at       TIMESTAMP NOT NULL
submitted_at       TIMESTAMP
synced_at          TIMESTAMP
sync_status        ENUM('PENDING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING'
offline_id         VARCHAR(100)                     -- Local UUID from mobile
created_at         TIMESTAMP NOT NULL DEFAULT NOW()
updated_at         TIMESTAMP NOT NULL DEFAULT NOW()
```

### Table: notifications (WA Logs)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
collection_id   UUID REFERENCES collections(id)
recipient_phone VARCHAR(20) NOT NULL
recipient_name  VARCHAR(100)
message_content TEXT NOT NULL
status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
sent_at         TIMESTAMP
wa_message_id   VARCHAR(100)
created_at      TIMESTAMP NOT NULL DEFAULT NOW()
```

---

*Lazisnu Infaq Collection System — rules/02-arsitektur-database.md*
