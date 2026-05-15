# Lazisnu Agent Workflows

Folder ini berisi workflow untuk alur kerja panjang dan bertahap.

## Cara Kerja

- `AGENTS.md` aktif sebagai instruksi utama project.
- `.agents/rules/` berisi aturan teknis per area.
- `.agents/skills/` aktif saat konteks skill cocok.
- `.agents/workflows/` dipakai saat user atau agent membutuhkan checklist berurutan.

Workflow tidak perlu dipanggil setiap saat. Gunakan saat task besar, lintas modul, atau butuh proses terstruktur.

## Daftar Workflow

- `start-sprint.md` — mulai sesi development.
- `update-sprint.md` — update status sprint.
- `setup-environment.md` — setup environment baru.
- `debug-error.md` — debugging sistematis.
- `run-testing.md` — testing dan UAT readiness.
- `build-backend-auth.md` — auth backend.
- `build-mobile-login.md` — login mobile Android.
- `build-qr-scanner.md` — QR scan, submit, offline sync, re-submit.
- `build-web-dashboard.md` — web dashboard Next.js.
- `integrate-whatsapp.md` — WhatsApp queue.
- `integrate-security.md` — security dan monitoring.

## Mentor Mode

Saat menjalankan workflow, agent tetap wajib menjelaskan tujuan, file terdampak, langkah kecil, cara test, dan Learning Checkpoint.
