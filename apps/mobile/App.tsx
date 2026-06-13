import React, { useEffect } from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { syncService } from './src/services/offline/sync';
import { useAuthStore } from './src/stores/useAuthStore';
import { initEncryptedStorage } from './src/services/secureStorage';
import { setAuthTag } from './src/config/sentry';

// Module-level: simpan NetInfo unsubscribe agar bisa di-cleanup saat
// App unmount (mis. hot reload). Null = belum di-start.
let networkUnsubscribe: (() => void) | null = null;

const App = () => {
  useEffect(() => {
    // ── Boot sequence (strictly sequential) ────────────────────────────────
    // Urutan PENTING: encrypted storage harus siap SEBELUM ada yang baca
    // token dari MMKV. Kalau initializeAuth() jalan duluan, ia akan baca
    // data plain dari MMKV yang akan di-recrypt kemudian — inconsistent.
    (async () => {
      // 1. Init encrypted storage. Recrypt MMKV atomic, tapi Keychain call
      //    async (~100-300ms). Setelah ini, MMKV final state (encrypted).
      const status = await initEncryptedStorage();

      // 2. Observability: catat status encryption ke Sentry.
      //    Sentry tags aman dipanggil sebelum init (akan di-buffer).
      setAuthTag('encryption_status', status.fallback);
      if (status.reason) {
        setAuthTag('encryption_reason', status.reason);
      }

      // 3. Jika Keychain gagal total → paksa logout SEBELUM initializeAuth.
      //    Dengan begini, initializeAuth akan lihat token kosong → AuthStack.
      if (status.fallback === 'wiped') {
        useAuthStore.getState().forceLogout(
          'Tidak dapat membuka penyimpanan aman device. Silakan login kembali.',
        );
      }

      // 4. Sekarang aman baca token dari MMKV (sudah ter-recrypt).
      await useAuthStore.getState().initializeAuth();

      // 5. Banner untuk ephemeral_default — sesi tetap aktif tapi
      //    offline queue di-wipe. Diset di store agar UI bisa render.
      if (status.fallback === 'ephemeral_default') {
        useAuthStore.getState().setEncryptionWarning(
          'Mode tidak aman: data antrian offline dihapus. Hubungkan ke internet dan login ulang untuk memulihkan.',
        );
      }

      // 6. Network listener untuk auto-sync. Simpan unsub untuk cleanup.
      networkUnsubscribe = syncService.startNetworkListener();
    })();

    return () => {
      if (networkUnsubscribe) {
        networkUnsubscribe();
        networkUnsubscribe = null;
      }
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
