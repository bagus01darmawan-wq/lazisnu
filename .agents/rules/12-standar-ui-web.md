---
trigger: manual
---

# 12 - Standar UI Web Dashboard

Dokumen ini adalah standar resmi untuk seluruh komponen UI interaktif pada aplikasi web dashboard Lazisnu. Referensi utama: halaman `cans/page.tsx` (implementasi paling matang). Setiap modul baru atau modifikasi **WAJIB** mengacu panduan ini.

---

## 1. Palet Warna & Token

| Token | Hex | Penggunaan |
|---|---|---|
| Deep Green | `#2C473E` | Teks di latar terang, border, background subtle |
| Warm Beige | `#F4F1EA` | Teks & ikon di atas latar gelap (`text-[#F4F1EA]`) |
| Emerald | `#1F8243` | Aksen hover, outline sekunder |
| Muted Sand | `#EAD19B` | **Tombol CTA Primer**, ikon header, aksen |
| Jelly Slug | `#DE6F4A` | Ikon Search aktif, state aktif FilterPills |
| Muted Teal | `#6B9E9F` | **Background Toolbar** (wajib seragam) |
| Soft Red | `#D97A76` | Informasi error ringan |

**Warna hardcoded non-palet yang diperbolehkan:**
- `green-600 / green-700` → tombol submit modal, ikon QR/WhatsApp
- `red-600 / red-700` → tombol hapus permanen
- `blue-600` → tombol reaktivasi
- `indigo-*` → badge status ASSIGNED
- `slate-*` → teks data tabel, border internal

---

## 2. Struktur Layout Halaman

Setiap halaman modul wajib menggunakan struktur berikut secara berurutan:

```
<div className="space-y-6">
  1. Header Section
  2. Toolbar Section
  3. Table Container + Pagination
  4. Modal(s)
</div>
```

---

## 3. Header Section

**Wrapper:**
```tsx
<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
```

### 3.1. Judul Halaman (kiri)

```tsx
<div className="flex items-center gap-3">
  <IconNama className="text-[#EAD19B]" size={28} />
  <div>
    <h1 className="text-2xl font-bold text-[#F4F1EA] tracking-tight">Judul Halaman</h1>
    <p className="text-[#F4F1EA]/60 text-sm font-medium">Deskripsi singkat halaman</p>
  </div>
</div>
```

- Ikon: `size={28}`, warna `text-[#EAD19B]`
- H1: `text-2xl font-bold text-[#F4F1EA] tracking-tight`
- Subtitle: `text-[#F4F1EA]/60 text-sm font-medium`

### 3.2. Action Buttons (kanan) — Pill Wrapper

Semua tombol aksi header dikelompokkan dalam **Pill Wrapper**:

```tsx
<div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm">
  {/* Tombol Sekunder */}
  <button
    className="px-4 py-2 rounded-xl text-[11px] font-bold text-[#EAD19B] hover:bg-[#EAD19B]/10 transition-all active:scale-95 flex items-center gap-2"
  >
    <IconSekunder size={14} strokeWidth={2.5} />
    Label Sekunder
  </button>

  {/* Tombol Primer */}
  <button
    className="px-4 py-2 rounded-xl text-[11px] font-bold bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 transition-all active:scale-95 flex items-center gap-2 ml-1"
  >
    <Plus size={14} strokeWidth={3} />
    Tambah Data Baru
  </button>
</div>
```

### 3.3. Bulk Action Wrapper (kondisional)

Tampil hanya saat `selectedIds.length > 0`, **ditempatkan sebelum** Primary Action Wrapper:

```tsx
{selectedIds.length > 0 && (
  <div className="flex bg-[#F4F1EA]/10 backdrop-blur-md p-1 rounded-2xl border border-[#F4F1EA]/20 shadow-sm">
    {/* Cetak Massal */}
    <button
      className="px-4 py-2 rounded-xl text-[11px] font-bold text-green-600 hover:bg-green-600/10 transition-all active:scale-95 flex items-center gap-2"
    >
      <Printer size={14} strokeWidth={2.5} />
      Cetak Terpilih ({selectedIds.length})
    </button>

    {/* Hapus Massal */}
    <button
      className={cn(
        "px-4 py-2 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex items-center gap-2",
        statusFilter === 'NON_ACTIVE'
          ? "bg-red-600 text-white shadow-lg shadow-red-600/20"
          : "text-red-600 hover:bg-red-600/10"
      )}
    >
      {statusFilter === 'NON_ACTIVE' ? <AlertTriangle size={14} /> : <Trash2 size={14} />}
      {statusFilter === 'NON_ACTIVE' ? 'Hapus Permanen' : 'Hapus Terpilih'}
    </button>
  </div>
)}
```

### Variasi Tombol Header

| Tipe | Kelas |
|---|---|
| Primer (Tambah) | `bg-[#EAD19B] text-[#2C473E] shadow-lg shadow-[#EAD19B]/20 hover:bg-[#EAD19B]/90 ml-1` |
| Sekunder (Impor) | `text-[#EAD19B] hover:bg-[#EAD19B]/10` |
| Bulk Cetak | `text-green-600 hover:bg-green-600/10` |
| Bulk Hapus (soft) | `text-red-600 hover:bg-red-600/10` |
| Bulk Hapus Permanen | `bg-red-600 text-white shadow-lg shadow-red-600/20` |

---

## 4. Toolbar Section

**Background wajib menggunakan `#6B9E9F` (Muted Teal)** agar seragam lintas halaman.

**Standar Dimensi (Presisi):**
- **Tinggi Kolom Pencarian**: `35px` (`h-[35px]`)
- **Lebar Kolom Pencarian**: `320px` (`w-80`)
- **Tinggi Filter (Pills)**: `36px` (`h-[36px]`)
- **Tinggi Dropdown Filter**: `36px` (`h-[36px]`)
- **Tinggi Tombol Reset**: `36px` (`h-[36px]`)

```tsx
<div className="flex flex-col lg:flex-row gap-4 items-center justify-between bg-[#6B9E9F] p-5 rounded-2xl border border-[#6B9E9F] shadow-sm">
  {/* Search Pill */}
  {/* Filter Pills + Dropdown */}
  {/* Tombol RESET */}
</div>
```

### 4.1. Search Pill

```tsx
<div className="relative w-full lg:w-80 group">
  <div className="flex h-[35px] items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-1 transition-all duration-500 group-focus-within:ring-2 group-focus-within:ring-[#F4F1EA]/20 group-focus-within:border-[#F4F1EA]/30 shadow-lg shadow-black/5">
    <div className="pl-2 pr-1 transition-transform group-focus-within:scale-110">
      <Search size={14} strokeWidth={3} className="text-[#DE6F4A]" />
    </div>
    <input
      type="text"
      placeholder="Cari data..."
      className="bg-transparent w-full px-4 py-1 text-sm font-bold text-white placeholder-white/30 focus:outline-none"
    />
    <div className="hidden md:block px-2 py-1 bg-white/5 rounded-lg border border-white/10 text-[9px] font-black text-white/20 mr-1 tracking-tighter">
      FIND
    </div>
  </div>
</div>
```

### 4.2. Filter Controls (kanan)

```tsx
<div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
  <FilterPills
    options={[...]}
    value={statusFilter}
    onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
    className="h-[36px] p-1"
  />

  {/* DropdownFilter hanya jika role ADMIN_KECAMATAN */}
  <DropdownFilter label="Pilih Ranting" className="h-[36px]" ... />

  {/* Tombol RESET */}
  <button
    className="h-[36px] bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl px-5 flex items-center gap-2 text-xs font-bold text-white hover:bg-white/20 transition-all duration-300 active:scale-95 shadow-lg shadow-black/5"
    onClick={handleReset}
  >
    <RotateCcw size={14} strokeWidth={3} className="text-[#F4F1EA]" />
    RESET
  </button>
</div>
```

---

## 5. Komponen FilterPills

```tsx
import { FilterPills } from '@/components/ui/FilterPills';

<FilterPills
  options={[{ label: 'AKTIF', value: 'ACTIVE' }, ...]}
  value={statusFilter}
  onChange={(val) => { setStatusFilter(val); setCurrentPage(1); }}
/>
```

**Spesifikasi internal (lihat `FilterPills.tsx`):**
- Wrapper: `flex bg-[#F4F1EA]/30 p-1 rounded-2xl border border-[#F4F1EA]/20 backdrop-blur-md`
- Tombol aktif: `bg-[#DE6F4A] text-[#F4F1EA] shadow-lg shadow-[#DE6F4A]/20`
- Tombol tidak aktif: `text-[#F4F1EA]/60 hover:text-[#F4F1EA] hover:bg-white/5`
- Font: `text-[11px] font-bold`, padding: `px-4 py-2`, radius: `rounded-xl`
- Transisi: `transition-all duration-500`

---

## 6. Komponen DropdownFilter

Wajib menggantikan `<select>` HTML standar di **toolbar**. Di dalam modal diperbolehkan menggunakan `<select>` native (lihat seksi 9).

```tsx
import { DropdownFilter } from '@/components/ui/DropdownFilter';

<DropdownFilter
  label="Pilih Ranting"
  placeholder="Cari ranting..."
  options={[
    { label: 'SEMUA RANTING', value: '' },
    ...branches.map((b: any) => ({
      label: cleanBranchName(b.name).toUpperCase(),
      value: b.id
    }))
  ]}
  value={branchFilter}
  onChange={(val) => { setBranchFilter(val); setCurrentPage(1); }}
/>
```

**Spesifikasi trigger:**
`flex items-center gap-2 px-4 py-2 bg-[#F4F1EA]/10 border border-[#F4F1EA]/20 backdrop-blur-md rounded-2xl text-[11px] font-bold text-[#F4F1EA] hover:bg-[#F4F1EA]/20 min-w-[140px]`

Ikon filter: `<Filter size={14} className="text-[#EAD19B]" />`

**Item aktif:** `bg-[#DE6F4A] text-white` | **Item hover:** `hover:bg-[#DE6F4A]/10 hover:text-[#DE6F4A]`

---

## 7. Table Container

```tsx
<div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden w-full max-w-full">
  <div className="overflow-x-auto w-full scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
    <div className="min-w-[800px] w-full">
      <Table columns={columns} data={data} loading={loading} />
    </div>
  </div>
  {/* Pagination di bawah */}
</div>
```

### 7.1. Kolom Seleksi (Checkbox)

```tsx
{
  id: 'selection',
  header: () => {
    const selectable = data.filter(item => !item.assignments?.length);
    const isAll = selectable.length > 0 && selectedIds.length === selectable.length;
    return (
      <button onClick={toggleSelectAll} disabled={selectable.length === 0}
        className="p-1 hover:bg-slate-200 rounded transition-colors disabled:opacity-30">
        {isAll ? <CheckSquare size={18} className="text-green-600" /> : <Square size={18} className="text-slate-400" />}
      </button>
    );
  },
  cell: ({ row }) => {
    const isAssigned = row.original.assignments?.length > 0;
    return (
      <button onClick={() => toggleSelectId(row.original)} disabled={isAssigned}
        className={`p-1 rounded transition-colors ${isAssigned ? 'opacity-20 cursor-not-allowed' : 'hover:bg-slate-100'}`}>
        {selectedIds.includes(row.original.id)
          ? <CheckSquare size={18} className="text-green-600" />
          : <Square size={18} className="text-slate-300" />}
      </button>
    );
  }
}
```

### 7.2. Kolom Aksi (Actions)

```tsx
{
  id: 'actions',
  header: '',
  cell: ({ row }) => {
    const isNonActive = !row.original.is_active;
    return (
      <div className="flex items-center justify-end gap-2">
        {/* Edit / Reaktivasi */}
        {isNonActive ? (
          <Button variant="outline" size="sm"
            className="h-8 w-8 p-0 rounded-lg hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-all border-slate-200 group"
            onClick={() => handleReactivate(row.original.id)} title="Aktifkan Kembali">
            <RotateCcw size={14} className="text-slate-500 group-hover:text-blue-600" />
          </Button>
        ) : (
          <Button variant="outline" size="sm"
            className="h-8 w-8 p-0 rounded-lg hover:bg-green-50 hover:text-green-600 hover:border-green-200 transition-all border-slate-200 group"
            onClick={() => handleEdit(row.original)} title="Edit Data">
            <Edit size={14} className="text-slate-500 group-hover:text-green-600" />
          </Button>
        )}

        {/* Hapus */}
        <Button variant="outline" size="sm"
          className={`h-8 w-8 p-0 rounded-lg transition-all border-slate-200 group ${isNonActive ? 'hover:bg-red-600 hover:text-white hover:border-red-600' : 'hover:bg-red-50 hover:text-red-600 hover:border-red-200'}`}
          onClick={() => handleDelete(row.original.id, isNonActive)}>
          {isNonActive
            ? <AlertTriangle size={14} className="text-red-500 group-hover:text-white" />
            : <Trash2 size={14} className="text-slate-500 group-hover:text-red-600" />}
        </Button>
      </div>
    );
  }
}
```

**Ukuran tombol aksi tabel:** `h-8 w-8 p-0 rounded-lg` (icon-only, 32×32px, min touch target terpenuhi di desktop)

### 7.3. Variasi Cell Data

| Tipe | Pattern |
|---|---|
| Nama + Info Sekunder | `<div className="flex flex-col">` nama (`font-semibold text-slate-900`) + sub (`text-[10px] text-slate-400 uppercase tracking-wider`) |
| Lokasi/Alamat | `text-xs text-slate-600` + `<MapPin size={10} />` |
| Nomor WA/Telepon | `flex items-center gap-1.5 text-xs bg-slate-50 px-2 py-1 rounded-lg border border-slate-100` |
| QR Code | `w-8 h-8 bg-green-50 rounded-lg` hover-button |

---

## 8. Badge Status

Gunakan komponen `<Badge>` dari `@/components/ui/Badge`.

| Kondisi | Variant | Keterangan |
|---|---|---|
| Aktif | `success` | `bg-green-100 text-green-800` |
| Non-Aktif | `failed` | `bg-red-100 text-red-800` |
| Assigned/Dalam Tugas | `default` + override class | `bg-indigo-100 text-indigo-700` + `animate-pulse` dot |
| Pending | `pending` | `bg-yellow-100 text-yellow-800` |

**Badge ASSIGNED (khusus):**
```tsx
<Badge variant="default"
  className="bg-indigo-100 text-indigo-700 border-indigo-200 cursor-pointer hover:bg-indigo-200 transition-all flex items-center gap-1.5 group px-3"
  onClick={() => router.push('/dashboard/assignments')}>
  <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse" />
  ASSIGNED
</Badge>
```

---

## 9. Pagination Controls

Ditempatkan di dalam Table Container, di bawah `<Table>`:

```tsx
{!loading && totalItems > 0 && (
  <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col items-end gap-3">
    <p className="text-xs font-medium text-slate-500">
      Menampilkan <span className="font-bold text-slate-900">{data.length}</span> dari{' '}
      <span className="font-bold text-slate-900">{totalItems}</span> data
    </p>

    <div className="flex items-center gap-4">
      {/* Selector baris per halaman */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Baris:</span>
        <DropdownFilter
          options={[{ label:'10',value:'10'},{label:'20',value:'20'},{label:'50',value:'50'},{label:'100',value:'100'}]}
          value={pageSize.toString()}
          onChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}
          className="min-w-[70px]"
        />
      </div>

      <div className="flex items-center gap-3">
        {/* Indikator halaman */}
        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
          Halaman <span className="text-green-600">{currentPage}</span> dari {Math.ceil(totalItems / pageSize)}
        </span>

        {/* Navigasi */}
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200">
            Sebelumnya
          </Button>
          <Button variant="outline" size="sm"
            disabled={currentPage >= Math.ceil(totalItems / pageSize)}
            onClick={() => setCurrentPage(p => p + 1)}
            className="rounded-xl h-9 px-4 text-xs font-bold disabled:opacity-30 border-slate-200">
            Selanjutnya
          </Button>
        </div>
      </div>
    </div>
  </div>
)}
```

---

## 10. Modal (Form Tambah/Edit)

Gunakan komponen `<Modal>` dari `@/components/ui/Modal`.

```tsx
<Modal
  isOpen={isModalOpen}
  onClose={() => { setIsModalOpen(false); setEditingItem(null); }}
  title={editingItem ? "Edit Data" : "Tambah Data Baru"}
>
  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
    {/* Field-field form */}

    {/* Footer tombol */}
    <div className="flex gap-3 pt-4">
      <Button type="button" variant="secondary" className="flex-1 rounded-xl h-12 font-bold"
        onClick={() => setIsModalOpen(false)}>
        Batal
      </Button>
      <Button type="submit"
        className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-xl h-12 font-bold shadow-lg shadow-green-600/20">
        {editingItem ? 'Simpan Perubahan' : 'Simpan Data'}
      </Button>
    </div>
  </form>
</Modal>
```

### 10.1. Form Fields di Dalam Modal

**Label:**
```tsx
<label className="text-sm font-semibold text-gray-700">Nama Field</label>
```

**Input teks (via komponen `<Input>`):**
```tsx
<Input {...register('field')} placeholder="..." />
```

**Select native** (diperbolehkan di dalam modal):
```tsx
<select
  {...register('branch_id')}
  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm cursor-pointer"
>
  <option value="">-- Pilih --</option>
  {items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
</select>
```

**Input dengan ikon prefix:**
```tsx
<div className="relative group">
  <IconName className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-green-500 transition-colors" size={16} />
  <input
    {...register('field')}
    className="w-full h-11 pl-10 pr-3 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 font-medium focus:ring-2 focus:ring-green-500 outline-none shadow-sm transition-all"
  />
</div>
```

**Input grid (misal RT/RW side by side):**
```tsx
<div className="grid grid-cols-2 gap-4">
  {/* field RT */}
  {/* field RW */}
</div>
```

**Pesan error validasi:**
```tsx
{errors.field && <p className="text-xs font-medium text-red-500">{errors.field.message}</p>}
```

---

## 11. Toast Confirmation Pattern

**WAJIB** menggunakan `toast()` dengan render JSX untuk aksi destruktif (hapus, nonaktifkan). **DILARANG** menggunakan `window.confirm()`.

```tsx
const handleDelete = async (id: string, isPermanent?: boolean) => {
  const message = isPermanent ? 'Hapus PERMANEN item ini?' : 'Nonaktifkan item ini?';

  toast((t) => (
    <div className="flex flex-col gap-3 min-w-[250px]">
      <div className="flex items-center gap-2">
        {isPermanent
          ? <AlertTriangle size={18} className="text-red-600" />
          : <Trash2 size={18} className="text-slate-400" />}
        <p className="text-sm font-bold text-slate-800">{message}</p>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm"
          className="h-8 text-xs font-bold rounded-lg"
          onClick={() => toast.dismiss(t.id)}>
          Batal
        </Button>
        <Button size="sm"
          className={`h-8 text-xs font-bold rounded-lg text-white shadow-sm transition-all active:scale-95 ${isPermanent ? 'bg-red-600 hover:bg-red-700' : 'bg-slate-800 hover:bg-slate-900'}`}
          onClick={async () => {
            toast.dismiss(t.id);
            try {
              const res: any = await api.delete(`/endpoint/${id}`);
              if (res.success) {
                fetchData();
                toast.success(isPermanent ? 'Berhasil dihapus permanen' : 'Berhasil dinonaktifkan');
              }
            } catch (err: any) {
              toast.error(err.error?.message || err.message || 'Gagal memproses');
            }
          }}>
          {isPermanent ? 'Hapus Permanen' : 'Ya, Nonaktifkan'}
        </Button>
      </div>
    </div>
  ), { duration: 5000 });
};
```

**Durasi Toast:**
- Konfirmasi destruktif: `{ duration: 5000 }`
- Reaktivasi: `{ duration: 3000 }`
- `toast.success` / `toast.error`: default atau `{ duration: 3000 }`

---

## 12. Inkonsistensi yang Perlu Distandarisasi

Hasil audit membandingkan `cans/page.tsx` (referensi) vs halaman lain:

| Halaman | Inkonsistensi | Standar yang Benar |
|---|---|---|
| `users/page.tsx` | Toolbar background `bg-white` | Ganti ke `bg-[#6B9E9F]` + Search Pill glassmorphism |
| `users/page.tsx` | Tombol Tambah standalone (bukan Pill Wrapper) | Wrap dalam `Pill Wrapper` sesuai seksi 3.2 |
| `users/page.tsx` | Tombol RESET pakai `<Button variant="outline">` | Ganti ke `<button>` glassmorphism sesuai seksi 4.2 |
| `master/page.tsx` | Toolbar background `bg-white` | Ganti ke `bg-[#6B9E9F]` + Search Pill glassmorphism |
| `master/page.tsx` | Modal custom inline (bukan `<Modal>` komponen) | Pertimbangkan migrasi ke komponen `<Modal>` |
| `master/page.tsx` | Tombol Tambah standalone (bukan Pill Wrapper) | Wrap dalam `Pill Wrapper` sesuai seksi 3.2 |

---

## 13. Larangan (Anti-Patterns)

- **DILARANG** menggunakan `<select>` HTML standar di area Toolbar/Filter — wajib `<DropdownFilter>`.
- **DILARANG** menggunakan `window.confirm()` untuk aksi destruktif — wajib `toast()` JSX pattern.
- **DILARANG** tombol aksi dengan radius < `rounded-xl` (minimal `rounded-xl` atau `rounded-2xl`).
- **DILARANG** tombol aksi primer tanpa efek `active:scale-95`.
- **DILARANG** warna Toolbar selain `bg-[#6B9E9F]` tanpa persetujuan — menjaga konsistensi lintas halaman.
- **DILARANG** warna hardcoded di luar palet resmi tanpa alasan kuat.
- **DILARANG** membuat komponen modal baru secara inline jika `<Modal>` sudah tersedia.
- **DILARANG** menggunakan `toast.promise()` — selalu gunakan pola `try/catch` + `toast.success/error`.
