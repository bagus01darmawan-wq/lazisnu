---
trigger: manual
---

# Workflow Adherence Protocol

Rule ini dipakai untuk menjaga agent tetap selaras dengan sprint, workflow resmi, dan konteks project Lazisnu. Namun rule ini tidak harus membebani task kecil satu file.

## Kapan Wajib Dibaca

Agent WAJIB membaca rule ini sebelum mengerjakan task yang termasuk salah satu kategori berikut:

- task lintas app: backend + web, backend + mobile, atau web + mobile;
- perubahan database, schema, migration, koleksi, resubmit, audit finansial;
- perubahan API contract, shared types, auth, role, permission, atau validation boundary;
- perubahan mobile offline sync, QR scan, MMKV, atau batch sync;
- deployment, environment variables, CI/CD, staging, production, atau rollback;
- refactor besar, perubahan arsitektur, atau workflow sprint/fase;
- bug kritis yang memblokir build, login, submit collection, sync, atau laporan.

Untuk task kecil seperti typo, copywriting, styling kecil satu komponen, rename label, atau perubahan minor satu file, agent cukup mengikuti `AGENTS.md` dan rule area terkait.

## Mandatory Procedure untuk Task Besar

Sebelum menulis kode atau menjalankan modifikasi besar, agent harus:

1. **Check Sprint Status**: baca `.agents/rules/10-sprint-aktif.md`.
2. **Identify Relevant Workflow**: cari workflow yang relevan di `.agents/workflows/` berdasarkan sprint, modul, atau tema task.
3. **Internalize Instructions**: baca workflow yang relevan sebelum membuat perubahan.
4. **Strict Alignment**: jika ada perbedaan antara workflow lama dan implementasi aktual, prioritaskan implementasi aktual + rule terbaru, lalu beri tahu user sebelum melakukan migrasi korektif.
5. **Learning Mode**: jelaskan ke user kenapa workflow/rule itu relevan dan apa dampaknya terhadap file yang akan diubah.

## Cara Memilih Rule Tambahan

- Database/koleksi/resubmit: baca `02-arsitektur-database.md` dan `04-business-rules.md`.
- API/backend: baca `03-api-conventions.md`, `05-konvensi-kode.md`, dan `08-pedoman-backend.md`.
- Web dashboard/UI: baca `07-pedoman-web.md`, `11-design-critique.md`, dan `12-standar-ui-web.md`.
- Mobile Android/offline: baca `06-pedoman-mobile.md`.
- Config/deploy: baca `09-environment-variables.md`.

---
*Lazisnu System Protocol — rules/00-workflow-guarantee.md*
