---
description: 
---

# Workflow: /integrate-security
# Trigger: Ketik /integrate-security di chat Antigravity
# Tujuan: Integrasi keamanan mobile — Play Integrity + CodePush + APM (FASE 7 — Sprint 3)
# Prasyarat: Aplikasi mobile sudah berjalan, Google Play Console sudah aktif

---

## Instruksi untuk Agent

Bantu user mengintegrasikan lapisan keamanan dan monitoring ke aplikasi mobile Lazisnu.
Baca dulu `.agents/rules/06-pedoman-mobile.md` sebelum mulai.

---

### BLOK A — Google Play Integrity API

#### A1. Setup di Google Play Console
Instruksikan user:
1. Buka Google Play Console → app Lazisnu → Setup → App Integrity
2. Aktifkan "Play Integrity API"
3. Catat `packageName` yang terdaftar

#### A2. Implementasi di Mobile

Tambahkan dependency:
```bash
npm install react-native-google-play-integrity
```

Buat `src/services/integrityService.ts`:
```typescript
import { GooglePlayIntegrity } from 'react-native-google-play-integrity'

export async function getIntegrityToken(): Promise<string> {
  // Nonce harus unik per request — generate dari kombinasi timestamp + random
  const nonce = generateNonce()
  const token = await GooglePlayIntegrity.requestIntegrityToken({
    cloudProjectNumber: process.env.CLOUD_PROJECT_NUMBER!,
    nonce,
  })
  return token
}
```

Panggil `getIntegrityToken()` saat login — kirim token ke backend untuk diverifikasi.

#### A3. Backend Verifikasi Integrity

Di `authService.login()`, sebelum return token JWT:
```typescript
// Verifikasi Play Integrity token ke Google API
const integrityResult = await verifyPlayIntegrityToken(integrityToken)

if (!integrityResult.deviceIntegrity.includes('MEETS_DEVICE_INTEGRITY')) {
  throw new AppError('DEVICE_NOT_TRUSTED', 'Device tidak memenuhi syarat keamanan', 403)
}
```

Jika device adalah emulator atau rooted → return error, blokir login.

---

### BLOK B — CodePush OTA Update

#### B1. Setup App Center

```bash
npm install -g code-push-cli
code-push login
code-push app add lazisnu-android android react-native
```

Catat deployment keys untuk Staging dan Production.

#### B2. Integrasi di App

Install:
```bash
npm install react-native-code-push
```

Wrap App component di `App.tsx`:
```typescript
import CodePush from 'react-native-code-push'

const codePushOptions = {
  checkFrequency: CodePush.CheckFrequency.ON_APP_RESUME,
  installMode   : CodePush.InstallMode.ON_NEXT_RESUME,
  // Silent update — petugas tidak terganggu saat sedang trip
}

export default CodePush(codePushOptions)(App)
```

Tambahkan di `.env`:
```
CODEPUSH_KEY_STAGING=xxx
CODEPUSH_KEY_PRODUCTION=xxx
```

#### B3. Test OTA Update
```bash
# Deploy bundle ke staging:
code-push release-react lazisnu-android android --deploymentName Staging

# Buka app → background → foreground → cek apakah update diterapkan
# Test rollback: deploy bundle yang crash → verifikasi rollback otomatis
```

---

### BLOK C — Firebase Crashlytics + Performance Monitoring

#### C1. Crashlytics Mobile (sudah setup di FASE 3, verifikasi ulang)
```typescript
// Test crash buatan (hapus setelah verifikasi):
import crashlytics from '@react-native-firebase/crashlytics'
crashlytics().crash()  // verifikasi muncul di Firebase Console
```

#### C2. Performance Monitoring
```bash
npm install @react-native-firebase/perf
```

Custom trace untuk flow utama:
```typescript
import perf from '@react-native-firebase/perf'

// Wrap alur scan → submit:
const trace = await perf().startTrace('qr_scan_to_submit')
// ... lakukan scan dan submit ...
await trace.stop()
// Cek di Firebase Console → Performance → Custom Traces
```

#### C3. Sentry Backend
```bash
cd apps/backend
npm install @sentry/node @sentry/profiling-node
```

Setup di `src/app.ts`:
```typescript
import * as Sentry from '@sentry/node'
Sentry.init({
  dsn        : process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
})
```

#### C4. Setup Alert
- Firebase: crash rate > 1% → email notifikasi ke tim
- Sentry: error rate > 5% per jam → notifikasi ke tim
- Sentry: new issue → notifikasi langsung

---

### LANGKAH VERIFIKASI AKHIR

```
✅ Play Integrity: login dari emulator → diblokir dengan pesan error yang jelas
✅ Play Integrity: login dari device asli → berhasil normal
✅ CodePush: deploy bundle baru → app update otomatis tanpa reinstall
✅ CodePush: deploy bundle yang crash → rollback otomatis dalam 1 menit
✅ Crashlytics: force crash → laporan muncul di Firebase Console dalam 5 menit
✅ Performance: trace scan-to-submit → data muncul di Firebase Console
✅ Sentry: throw error di backend → error muncul di Sentry dashboard
```

Update `.agents/rules/10-sprint-aktif.md` setelah semua test lulus.
