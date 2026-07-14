# Tahap 2 — Reusable Components

Semua komponen berada di `apps/mobile/src/components/ui/`. Komponen hanya menangani tampilan dan interaksi dasar; data tetap berasal dari screen/store.

## `AppButton.tsx`

Props minimum:

```ts
type AppButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

type AppButtonProps = {
  label: string;
  onPress: () => void;
  variant?: AppButtonVariant;
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
};
```

Aturan:

- Tinggi 56 px.
- Loading mengganti isi dengan `ActivityIndicator`.
- Disabled mencegah `onPress` dan memiliki tampilan jelas.
- Gunakan `Pressable` atau `TouchableOpacity`.

## `AppCard.tsx`

Variant:

```ts
type AppCardVariant = 'default' | 'elevated' | 'dark' | 'glass';
```

Terima `children`, `style`, dan accessibility props. Jangan memasukkan logika domain.

## `StatusBadge.tsx`

Status:

```ts
type StatusBadgeStatus =
  | 'success'
  | 'pending'
  | 'offline'
  | 'syncing'
  | 'error';
```

Label diberikan screen agar istilah UI tetap fleksibel.

## `AppTextInput.tsx`

Props:

- `label`
- `value`
- `onChangeText`
- `placeholder`
- `icon`
- `error`
- `helperText`
- seluruh props aman dari `TextInputProps`

Komponen harus menampilkan focus, error, dan disabled state.

Jangan membuat format rupiah di komponen generik. Buat wrapper khusus atau gunakan helper yang sudah teruji pada screen Collection.

## `SegmentedControl.tsx`

Gunakan generic string:

```ts
type SegmentOption<T extends string> = {
  label: string;
  value: T;
};
```

Digunakan oleh Login, Tasks, History, dan pilihan metode pembayaran.

## `AppHeader.tsx`

Variant:

- `auth`: logo dan judul terpusat.
- `main`: logo kecil, judul, action kanan.
- `stack`: tombol kembali, judul, action opsional.

Header tidak melakukan navigasi sendiri. Screen memberikan callback `onBack`.

## `SyncBanner.tsx`

State:

- `synced`
- `offline`
- `syncing`
- `failed`

Komponen hanya menerima status dan teks. Nilai `pendingCount` tetap berasal dari `useSyncStore`.

## `index.ts`

Barrel export:

```ts
export * from './AppButton';
export * from './AppCard';
export * from './AppHeader';
export * from './AppTextInput';
export * from './SegmentedControl';
export * from './StatusBadge';
export * from './SyncBanner';
```

## Aksesibilitas Minimum

- Tombol memiliki `accessibilityRole="button"`.
- Input mempunyai label yang dapat dibaca screen reader.
- Status tidak hanya dibedakan berdasarkan warna.
- Target sentuh minimal 48 px.
- Loading dan disabled state dapat dikenali.

## Verifikasi Tahap 2

Tambahkan unit test minimum untuk:

- Button tidak memanggil handler ketika disabled.
- Button menampilkan loading.
- Badge menampilkan label/status.
- Segmented control mengirim value yang benar.

Lalu jalankan:

```powershell
pnpm --filter lazisnu-collector-app typecheck
pnpm --filter lazisnu-collector-app lint
pnpm --filter lazisnu-collector-app test
```

