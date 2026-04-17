---
description: 
---

# Workflow: /build-mobile-login
# Trigger: Ketik /build-mobile-login di chat Antigravity
# Tujuan: Setup React Native app dan buat layar login (FASE 3 — Sprint 1)
# Prasyarat: FASE 2 sudah selesai, backend auth API sudah berjalan

---

## Instruksi untuk Agent

Bantu user membangun fondasi aplikasi mobile React Native untuk project Lazisnu Infaq System.
Baca dulu `.agents/rules/06-pedoman-mobile.md` dan `.agents/rules/05-konvensi-kode.md` sebelum mulai.

**Platform target: Android only. Jangan tambahkan iOS-specific code apapun.**

---

### LANGKAH 1 — Inisialisasi React Native App

```bash
cd ~/lazisnu-infaq-system/apps
npx react-native init mobile --template react-native-template-typescript
cd mobile
```

Install semua dependencies:
```bash
npm install @react-navigation/native @react-navigation/stack
npm install react-native-screens react-native-safe-area-context
npm install react-native-mmkv
npm install axios
npm install react-native-camera-kit
npm install react-native-permissions
npm install react-native-code-push
npm install @react-native-firebase/app @react-native-firebase/crashlytics
npm install @react-native-community/netinfo
```

### LANGKAH 2 — Buat Struktur Folder Mobile

```
apps/mobile/src/
├── screens/
│   ├── auth/
│   │   ├── SplashScreen.tsx
│   │   └── LoginScreen.tsx
│   ├── dashboard/
│   │   └── DashboardScreen.tsx      ← skeleton kosong dulu
│   ├── scanner/
│   ├── collection/
│   └── resubmit/
├── navigation/
│   ├── AuthStack.tsx
│   ├── MainStack.tsx
│   └── RootNavigator.tsx
├── services/
│   ├── authService.ts
│   └── apiClient.ts
├── store/
│   ├── authStore.ts
│   └── offlineQueueStore.ts
├── hooks/
│   └── useNetworkStatus.ts
├── components/
│   ├── Button.tsx
│   ├── LoadingOverlay.tsx
│   └── OfflineBanner.tsx
└── utils/
    ├── formatRupiah.ts
    └── errorMessages.ts
```

### LANGKAH 3 — Setup HTTP Client

Buat `src/services/apiClient.ts`:
- Axios instance dengan `baseURL` dari env (`API_BASE_URL`)
- Request interceptor: attach JWT token dari MMKV ke header Authorization
- Response interceptor: handle 401 → auto-refresh token atau paksa logout

**ATURAN MMKV — gunakan key yang sudah ditetapkan:**
```typescript
const MMKV_KEYS = {
  ACCESS_TOKEN  : 'auth_token_access',
  REFRESH_TOKEN : 'auth_token_refresh',
  USER_PROFILE  : 'user_profile',
  OFFLINE_QUEUE : 'offline_queue',
}
```

### LANGKAH 4 — Buat Layar Splash

`src/screens/auth/SplashScreen.tsx`:
- Tampilkan logo Lazisnu
- Cek token di MMKV
- Jika token valid → navigate ke Dashboard
- Jika token expired atau tidak ada → navigate ke Login
- Jika token hampir expired → call refresh dulu

### LANGKAH 5 — Buat Layar Login

`src/screens/auth/LoginScreen.tsx`:
- Form: input ID Petugas + Password
- Validasi: kedua field tidak boleh kosong
- Call `authService.login(id, password)`
- Sukses: simpan token ke MMKV, navigate ke Dashboard
- Gagal: tampilkan pesan error yang jelas dalam Bahasa Indonesia

**Pesan error yang harus disiapkan:**
```typescript
const ERROR_MESSAGES = {
  UNAUTHORIZED    : 'ID atau password salah. Coba lagi.',
  NETWORK_ERROR   : 'Tidak ada koneksi internet.',
  SERVER_ERROR    : 'Server sedang bermasalah. Coba beberapa saat lagi.',
}
```

### LANGKAH 6 — Buat Dashboard Skeleton

`src/screens/dashboard/DashboardScreen.tsx` — skeleton kosong berisi:
- Header: nama petugas + wilayah + tanggal hari ini
- Progress bar placeholder
- List task placeholder
- Tombol Logout yang berfungsi (hapus token MMKV + call /auth/logout)

### LANGKAH 7 — Setup Firebase Crashlytics

- Tambahkan `google-services.json` ke `android/app/`
- Aktifkan Crashlytics di app
- Test dengan crash buatan: `crashlytics().crash()`
- Verifikasi laporan muncul di Firebase Console

### LANGKAH 8 — Test di Android

```bash
# Pastikan emulator atau device sudah terhubung:
adb devices

# Jalankan app:
npx react-native run-android
```

Test flow lengkap:
1. Buka app → tampil SplashScreen
2. Redirect ke Login (belum ada token)
3. Login dengan credentials dari seed data
4. Berhasil → tampil Dashboard skeleton
5. Tap Logout → kembali ke Login

Laporkan hasil test ke user, update `.agents/rules/10-sprint-aktif.md`.
