# Akses Staging Read-Only

> Status: terpasang dan diuji pada 12 November 2026.
> Dokumen ini **tidak** memuat private key atau password database.

## 1. Host staging

| Item | Nilai |
|---|---|
| Provider | Biznet Gio (VM produksi/staging aktif) |
| IP publik | **139.190.106.152** |
| Port SSH | **22** |
| User SSH | **ubuntu** |
| Hostname | `lazispaninggaran` |
| DNS staging | `staging.lazisnu.site`, `staging-api.lazisnu.site` → `139.190.106.152` |

Host dapat dijangkau langsung dari lingkungan kerja ini (TCP 22 berhasil); tidak perlu VPN atau bastion.
VM Oracle lama `168.110.198.70` hanya untuk rollback — jangan dipakai sebagai host staging.

## 2. Kunci SSH

| Item | Nilai |
|---|---|
| Private key lokal | `~/.ssh/lazisnu_vm` (Windows: `C:\Users\user\.ssh\lazisnu_vm`) |
| Public key | `~/.ssh/lazisnu_vm.pub` |
| Fingerprint public key | `SHA256:CIIuw/0SetbKAjvgG9Opp4D+sEfCrohR9fEpz5bUXRw` (ED25519) |
| Status di host | Terpasang di `~/.ssh/authorized_keys` (fingerprint cocok) |

Private key **tidak dikirim lewat chat, tidak di-commit, dan tidak disalin ke repo**.
Public key yang terpasang di host adalah yang fingerprint-nya di atas.

### Fingerprint host

| Algoritma | Fingerprint |
|---|---|
| ED25519 | `SHA256:162FnMR39MBDrp/HBg4visZXqTuN45RrNthhEz+SHTc` |
| RSA | `SHA256:JCtkKgpnj+ZOeg1wrFyp4c71t+8oPTWLuC8czKaUE7w` |

`known_hosts` lokal cocok dengan host key server, dan koneksi dengan
`StrictHostKeyChecking=yes` berhasil. **Verifikasi independen sudah dilakukan** melalui
console/VNC Biznet Gio pada 12 November 2026: fingerprint ED25519 dan RSA cocok dengan
nilai di atas. Jika host key berubah di kemudian hari, SSH akan menolak koneksi —
investigasi sebelum mengubah `known_hosts`.

## 3. Konfigurasi SSH

Blok berikut sudah ditambahkan ke `~/.ssh/config` (Windows:
`C:\Users\user\.ssh\config`):

```sshconfig
Host staging-ro
  HostName 139.190.106.152
  User ubuntu
  Port 22
  IdentityFile ~/.ssh/lazisnu_vm
  IdentitiesOnly yes
  StrictHostKeyChecking yes
  UserKnownHostsFile ~/.ssh/known_hosts
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

Uji:

```bash
ssh staging-ro "echo OK; hostname; id -un"
# OK
# lazispaninggaran
# ubuntu
```

Catatan: alias `staging-ro` adalah nama kenyamanan, **bukan** akun SSH read-only.
Alias ini masuk sebagai `ubuntu` dan masih punya sudo. Batas read-only ada di role
database di bawah.

## 4. Akses database read-only

Database staging adalah Supabase eksternal, dan host SSH bisa menjangkaunya.

| Item | Nilai |
|---|---|
| Project ref | `ngskcwwjwxsvjrswomkf` |
| Host pooler | `aws-1-ap-northeast-2.pooler.supabase.com` |
| Port | `5432` |
| Database | `postgres` |
| Role DB | `staging_ro` |
| Username pooler | `staging_ro.ngskcwwjwxsvjrswomkf` |
| SSL | `require` |

Password role disimpan hanya di `~/.pgpass` pada host SSH (mode `600`), tidak di
dokumen ini dan tidak di repo. Konfigurasi service ada di `~/.pg_service.conf`
(mode `600`) pada host:

```ini
[staging-ro]
host=aws-1-ap-northeast-2.pooler.supabase.com
port=5432
dbname=postgres
user=staging_ro.ngskcwwjwxsvjrswomkf
sslmode=require
```

### Cara memakai

```bash
ssh staging-ro
psql service=staging-ro
```

Contoh query:

```bash
psql service=staging-ro -c "select current_user, current_database();"
psql service=staging-ro -c "select count(*) from public.users;"
psql service=staging-ro -c "select count(*) from public.assignments;"
```

Hasil verifikasi 12 November 2026:

```text
current_user = staging_ro
current_database = postgres
users count = 21
write test = DITOLAK
ERROR: cannot execute CREATE TABLE in a read-only transaction
```

Hak akses role:
- `SELECT` pada semua tabel/sequence di schema `public`.
- `default_transaction_read_only = on`.
- Tidak ada `INSERT`, `UPDATE`, `DELETE`, atau DDL.
- `ALTER DEFAULT PRIVILEGES` menyiapkan `SELECT` untuk tabel baru.

Role tidak bisa dipakai untuk migrasi atau perubahan data. Untuk operasi tulis,
gunakan role admin melalui prosedur terpisah.

## 5. Verifikasi independen host key via console Biznet Gio

Tujuan: membuktikan fingerprint host key berasal dari VM, bukan dari jalur SSH yang
sedang diverifikasi. `ssh-keyscan` dari jaringan yang sama **bukan** bukti independen.

1. Login ke portal **Biznet Gio NEO** yang Anda pakai saat memesan VM (gunakan URL
   dari email onboarding/akun; jangan menebak portal pihak ketiga).
2. Buka menu **Compute / Instance**, pilih instance `lazispaninggaran`
   (`139.190.106.152`).
3. Buka **Console / VNC Console / Web Console** untuk instance tersebut. Ini kanal
   out-of-band, bukan SSH.
4. Login di console sebagai `ubuntu` (atau `root`). Jika password login dinonaktifkan
   karena image cloud hanya memakai SSH key, gunakan fitur **Reset/Set password**
   di portal atau minta support. Jangan menonaktifkan SSH key auth secara permanen.
5. Di console VM, jalankan:

   ```bash
   ls /etc/ssh/ssh_host_*_key.pub
   sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
   sudo ssh-keygen -lf /etc/ssh/ssh_host_rsa_key.pub
   ```

6. Bandingkan hasilnya dengan:

   | Algoritma | Fingerprint yang diharapkan |
   |---|---|
   | ED25519 | `SHA256:162FnMR39MBDrp/HBg4visZXqTuN45RrNthhEz+SHTc` |
   | RSA | `SHA256:JCtkKgpnj+ZOeg1wrFyp4c71t+8oPTWLuC8czKaUE7w` |

7. Jika cocok: catat tanggal, nama pemeriksa, dan metode console di bagian ini.
   Jika berbeda: **jangan** connect/ubah `known_hosts`; investigasi (VM reinstalled,
   host key berubah, atau MITM).

   ```text
   Verifikasi console: [x] cocok / [ ] tidak cocok
   Tanggal: 2026-11-12
   Oleh: bagus01darmawan-wq
   Metode: Biznet Gio NEO Console/VNC
   Catatan: ED25519 dan RSA cocok dengan fingerprint yang diharapkan.
   ```

8. Jika portal tidak menyediakan console/VNC: minta Biznet Gio support mengonfirmasi
   fingerprint host key atau menyediakan akses console. Tanpa itu, status host key
   tetap **TOFU** (trust-on-first-use), bukan verifikasi independen.

## 6. Catatan keamanan

- Jangan menyalin isi `~/.pgpass` atau private key ke chat, commit, screenshot, atau log.
- Jangan menambahkan password ke dokumen ini. Password hanya di `~/.pgpass` host.
- `StrictHostKeyChecking yes` sudah aktif di alias; jangan dimatikan.
- Jika host key berubah, SSH akan menolak koneksi — investigasi, jangan hapus known_hosts
  tanpa verifikasi.
- Alias SSH bukan pembatas read-only; pembatasnya adalah role database `staging_ro`.
- Akses langsung DB dari laptop tidak diperlukan; gunakan `ssh staging-ro` lalu `psql
  service=staging-ro`.
