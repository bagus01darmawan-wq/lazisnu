Saya audit repo `bagus01darmawan-wq/lazisnu`. Saya tidak mengubah file kode.

🔍 **IDENTIFIKASI & AKAR MASALAH**

Isu utamanya adalah **kontrak fitur finansial/re-submit tidak sinkron antara Next.js dan Fastify**.

Patahan paling besar ada di:

- [resubmit/page.tsx](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/web/src/app/dashboard/resubmit/page.tsx:50): halaman re-submit mengambil data dari endpoint dashboard `/admin/district/dashboard` atau `/admin/branch/dashboard`, bukan endpoint koleksi finansial.
- [resubmit/page.tsx](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/web/src/app/dashboard/resubmit/page.tsx:62): `useEffect([])` berjalan sebelum Zustand `user` pasti terhidrasi. Jika `user` masih `null`, frontend default ke `/admin/branch/dashboard`, sehingga Admin Kecamatan/Bendahara bisa kena 403 atau data kosong.
- [collections.ts](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/backend/src/routes/admin/collections.ts:9): backend re-submit hanya mengizinkan `ADMIN_RANTING` dan `ADMIN_KECAMATAN`, padahal workflow/menu menempatkan re-submit untuk `BENDAHARA` dan `ADMIN_KECAMATAN`.
- [menu-config.ts](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/web/src/lib/menu-config.ts:56): menu menampilkan Re-submit untuk Bendahara, tapi backend menolak role itu.
- [reports/page.tsx](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/web/src/app/dashboard/reports/page.tsx:19): halaman laporan juga memakai endpoint dashboard admin, bukan `/bendahara/collections` atau `/bendahara/reports/summary`.
- [reports/page.tsx](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/web/src/app/dashboard/reports/page.tsx:88): tombol Export CSV hanya visual, belum memanggil endpoint export.
- [overview/page.tsx](C:/Users/ASUS/Documents/Codex/2026-05-04/github-plugin-github-openai-curated-workspace/apps/web/src/app/dashboard/overview/page.tsx:196): chart memakai `dataKey="nominal"`, sementara backend district dashboard mengirim `collection`, jadi chart Admin Kecamatan bisa kosong/salah.

Akar masalahnya: **frontend mencampur “dashboard summary endpoint” dengan “financial transaction endpoint”**, lalu backend role policy tidak mengikuti UI/menu dan dokumen API. Ini bukan sekadar bug tampilan, tapi mismatch kontrak domain.

💡 **SOLUSI KOMPREHENSIF**

Backend:

- Jadikan `/v1/bendahara/collections`, `/v1/bendahara/reports/summary`, dan `/v1/bendahara/export` sebagai sumber tunggal laporan finansial untuk `BENDAHARA`, `ADMIN_KECAMATAN`, dan `ADMIN_RANTING`.
- Terapkan DB-level scope:
  - `ADMIN_KECAMATAN`: filter `districtId`.
  - `ADMIN_RANTING`: filter `branchId`.
  - `BENDAHARA`: akses penuh read-only.
- Re-submit sebaiknya hanya `BENDAHARA` dan `ADMIN_KECAMATAN`, sesuai menu dan workflow.
- Jangan mengandalkan `is_latest` untuk query karena tabel `collections` immutable dan record lama tidak boleh di-update. Gunakan `submitSequence` tertinggi per `assignmentId`, atau buat DB view `latest_collections`.

Frontend:

- `resubmit/page.tsx` jangan fetch dashboard. Fetch `/bendahara/collections?include_history=false`.
- Tunggu `user` siap sebelum fetch, atau decode role dari JWT/cookie langsung.
- Gunakan endpoint re-submit yang konsisten, misalnya tetap `/admin/collections/:id/resubmit`, tapi role backend harus cocok.
- `reports/page.tsx` gunakan `/bendahara/reports/summary` dan `/bendahara/collections`.
- Export CSV harus memanggil `/bendahara/export?...` dan download blob.
- Fix chart overview: `dataKey` harus `collection` untuk Admin Kecamatan, `nominal` untuk Admin Ranting.

🛡️ **TINDAKAN PENCEGAHAN**

- Buat typed API client dari `@lazisnu/shared-types`, jangan pakai `any` untuk response dashboard/laporan.
- Tambahkan contract test: setiap menu role harus punya endpoint yang mengizinkan role yang sama.
- Pisahkan endpoint “dashboard” dan “financial ledger”; jangan pakai dashboard response untuk mutasi/koreksi transaksi.
- Buat helper reusable `getCollectionScope(currentUser)` di backend agar filter role tidak tersebar manual.
- Tambahkan test untuk `BENDAHARA` membuka `/dashboard/resubmit`, fetch koleksi, dan submit koreksi.

🚀 **KODE OPTIMAL SIAP DEPLOY**

Backend role re-submit:

```ts
// apps/backend/src/routes/admin/collections.ts
const canResubmit = {
  preHandler: [authorize('BENDAHARA', 'ADMIN_KECAMATAN')],
};

fastify.post('/collections/:id/resubmit', canResubmit, async (request, reply) => {
  // existing transaction logic tetap dipakai
});
```

Backend laporan multi-role:

```ts
// apps/backend/src/routes/bendahara.ts
fastify.addHook('preHandler', authenticate);
fastify.addHook('preHandler', authorize('BENDAHARA', 'ADMIN_KECAMATAN', 'ADMIN_RANTING'));

// Tambahkan scope sebelum query collections:
// ADMIN_RANTING -> branch_id user
// ADMIN_KECAMATAN -> district_id user
// BENDAHARA -> no extra scope
```

Frontend re-submit fetch:

```ts
useEffect(() => {
  if (!user) return;
  fetchCollections();
}, [user]);

const fetchCollections = async () => {
  setLoading(true);
  try {
    const response: any = await api.get('/bendahara/collections', {
      params: { page: 1, limit: 50 },
    });

    if (response.success) {
      setData(response.data.collections || []);
    }
  } finally {
    setLoading(false);
  }
};
```

Frontend chart overview:

```tsx
<Bar
  dataKey={user?.role === 'ADMIN_KECAMATAN' ? 'collection' : 'nominal'}
  fill="#16a34a"
  radius={[6, 6, 0, 0]}
/>
```

Frontend export CSV:

```ts
const exportCsv = async () => {
  const token = authHelper.getToken();
  const res = await fetch(`${API_URL}/v1/bendahara/export?start_date=${start}&end_date=${end}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `laporan-lazisnu-${start}-${end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};
```

Kesimpulan audit: fitur ini patah bukan karena satu bug kecil, tapi karena **role matrix, endpoint source-of-truth, dan bentuk data response belum satu bahasa**. Fix terbaik adalah merapikan kontrak finansial di backend dulu, lalu membuat halaman Reports/Re-submit hanya mengonsumsi kontrak itu.


Audit di atas hanya berdasarkan branch `main` repo `bagus01darmawan-wq/lazisnu`, plus file yang berhasil ter-checkout ke workspace. Saat ini repo punya branch:

- `main`
- `analysis-optimizations-6648530048589430131`
- `fitur-immutability-jules`
- `ssss`
- `wip-jules-2026-04-30T23-52-12-166Z`
- `wip-jules-2026-05-03T23-57-04-421Z`

Jadi laporan di atas valid untuk kondisi `main`, tapi belum membandingkan apakah bug yang sama sudah diperbaiki, berubah, atau malah berbeda di branch lain. Untuk audit menyeluruh lintas cabang, saya perlu melakukan branch-by-branch diff terhadap area ini: `apps/web`, `apps/backend/src/routes`, `apps/backend/src/database/schema.ts`, dan `packages/shared-types`.


Sudah saya lakukan branch-by-branch diff untuk area:

`apps/web`, `apps/backend/src/routes`, `apps/backend/src/database/schema.ts`, dan `packages/shared-types`.

Saya tidak mengubah file apa pun. Audit memakai ref `origin/<branch>` langsung, karena working tree lokal sempat gagal checkout akibat path Android terlalu panjang.

**Ringkasan Utama**
Bug utama **belum benar-benar diperbaiki di branch mana pun**. Yang berubah hanya sebagian sisi backend di beberapa branch. Patahan frontend tetap sama: Reports dan Re-submit masih memakai endpoint dashboard admin, bukan endpoint ledger/laporan finansial.

| Branch | Status Bug Reports/Re-submit | Catatan |
|---|---|---|
| `main` | Masih bug | Baseline audit awal. Frontend salah endpoint, role Bendahara tidak cocok, chart district salah dataKey. |
| `fitur-immutability-jules` | Sebagian backend membaik, frontend tetap bug | Native SQL latest collection lebih baik, tapi role dan frontend belum diperbaiki. |
| `wip-jules-2026-04-30T23-52-12-166Z` | Sebagian backend membaik, frontend tetap bug | Mirip `fitur-immutability-jules`, plus perubahan UI besar. |
| `wip-jules-2026-05-03T23-57-04-421Z` | Sebagian backend membaik, frontend tetap bug | Sama seperti WIP 30 April, plus toast/UI polish. Ada risiko baru di middleware JWT. |
| `analysis-optimizations-6648530048589430131` | Memburuk untuk immutability | Ada update ke `collections.isLatest`, melanggar aturan immutable. Juga banyak penghapusan fitur terbaru. |
| `ssss` | Tidak relevan untuk arsitektur sekarang | Branch lama, masih struktur `backend/`, `web/` Vite, bukan monorepo `apps/*`. |

**Temuan Lintas Cabang**

1. **Frontend Reports dan Re-submit masih salah sumber data di semua branch modern**

Di semua branch modern, file Reports/Re-submit masih memakai:

```ts
role === 'ADMIN_KECAMATAN'
  ? '/admin/district/dashboard'
  : '/admin/branch/dashboard'
```

Artinya bug awal tetap ada di:

- `main`
- `analysis-optimizations-*`
- `fitur-immutability-jules`
- kedua branch `wip-jules-*`

Belum ada branch yang mengarahkan fitur finansial ke `/bendahara/collections`, `/bendahara/reports/summary`, atau `/bendahara/export`.

2. **Role Re-submit masih tidak sinkron**

Di semua branch modern, backend route re-submit masih:

```ts
authorize('ADMIN_RANTING', 'ADMIN_KECAMATAN')
```

Sementara menu frontend menampilkan Re-submit untuk:

```ts
['ADMIN_KECAMATAN', 'BENDAHARA']
```

Jadi Bendahara melihat menu Re-submit, tetapi akan ditolak backend ketika koreksi data. Ini belum diperbaiki di branch mana pun.

3. **Branch `fitur-immutability-jules` dan WIP memperbaiki sebagian deduplikasi backend**

Branch ini lebih baik daripada `main` untuk query latest collection. Mereka mengganti dedup in-memory menjadi subquery SQL berbasis `max(submitSequence)` per `assignmentId + canId`.

Ini bagus dan layak diambil.

Tapi belum cukup, karena:

- akses `/bendahara/*` masih hanya `BENDAHARA`
- frontend masih tidak memakai endpoint bendahara
- belum ada `include_history`
- role Admin Kecamatan/Admin Ranting belum bisa pakai endpoint laporan finansial yang benar

4. **Branch `analysis-optimizations-*` berbahaya untuk immutability**

Branch ini mengubah re-submit menjadi:

```ts
await tx.update(schema.collections)
  .set({ isLatest: false })
```

Ini melanggar aturan utama di `AGENTS.md`: tabel `collections` immutable, dilarang `UPDATE` dan `DELETE`.

Branch ini juga menghapus `dukuhs.ts` dan banyak UI/assignment/cans terbaru. Saya tidak sarankan dijadikan base.

5. **Chart Overview Admin Kecamatan masih salah di semua branch modern**

Backend district dashboard mengirim `by_branch` dengan field:

```ts
collection: byBranch[b.id]?.nominal || 0
```

Tapi frontend chart masih memakai:

```tsx
<Bar dataKey="nominal" />
```

Akibatnya chart Admin Kecamatan bisa kosong, meskipun data backend ada.

6. **Branch WIP menambah risiko middleware baru**

Di WIP terbaru, middleware berubah dari `decodeJwt` ke `jwtVerify` dengan:

```ts
process.env.NEXT_PUBLIC_JWT_SECRET || process.env.JWT_SECRET
```

Ini berisiko karena `NEXT_PUBLIC_JWT_SECRET` berarti secret bisa terekspos ke client bundle bila dipakai di sisi client. Untuk middleware Edge, lebih aman pakai env server-only dan jangan prefix `NEXT_PUBLIC_`.

**Rekomendasi Merge Strategy**

Base terbaik tetap `main`.

Ambil secara selektif dari:

- `fitur-immutability-jules` atau `wip-jules-*`: native SQL latest collection condition di `bendahara.ts` dan latest check di `admin/collections.ts`.

Jangan ambil langsung dari:

- `analysis-optimizations-*`: ada pelanggaran immutability.
- `ssss`: branch lama, beda arsitektur.
- WIP secara utuh: terlalu banyak perubahan UI dan ada risiko middleware JWT.

**Kesimpulan Final**

Bug yang sama **belum fixed menyeluruh di cabang mana pun**.

Yang sudah berubah:

- Backend dedup/latest collection membaik di `fitur-immutability-jules` dan `wip-jules-*`.
- UI polish/toast muncul di WIP.

Yang belum berubah:

- Frontend Reports/Re-submit masih salah endpoint.
- Role Bendahara masih mismatch.
- Export CSV masih tombol visual.
- Chart district masih salah `dataKey`.
- Endpoint laporan belum menjadi shared financial contract untuk Admin/Bendahara.

Langkah paling aman: patch `main` dengan fix frontend/backend yang terarah, lalu cherry-pick hanya bagian dedup SQL dari `fitur-immutability-jules`.