import React, {useEffect, useState} from 'react';
import AppNavigator from './src/navigation/AppNavigator';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {syncService} from './src/services/offline/sync';
import {useAuthStore} from './src/stores/useAuthStore';
import {useDashboardStore} from './src/stores/useDashboardStore';
import {useTasksStore} from './src/stores/useTasksStore';
import {useCollectionsStore} from './src/stores/useCollectionStore';
import {initEncryptedStorage} from './src/services/secureStorage';
import {offlineQueue} from './src/services/offline/queue';
import {setAuthTag} from './src/config/crashlytics';
import {ActivityIndicator, StatusBar, StyleSheet, View} from 'react-native';
import {Colors} from './src/theme';

let networkUnsubscribe: (() => void) | null = null;

const styles = StyleSheet.create({
  root: {flex: 1},
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface.page,
  },
});

const App = () => {
  const [isStorageReady, setIsStorageReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const status = await initEncryptedStorage();

        setAuthTag('encryption_status', status.fallback);
        if (status.reason) {
          setAuthTag('encryption_reason', status.reason);
        }

        if (status.fallback === 'wiped') {
          useAuthStore
            .getState()
            .forceLogout('Tidak dapat membuka penyimpanan aman device. Silakan login kembali.');
        }

        await useAuthStore.getState().initializeAuth();

        // Queue memakai suffix user.id, jadi auth harus siap sebelum migrasi/hydrate.
        offlineQueue.runMigration();
        useDashboardStore.getState().hydrateFromCache();
        useTasksStore.getState().hydrateFromCache();
        useCollectionsStore.getState().hydrateFromCache();

        if (status.fallback === 'ephemeral_default') {
          useAuthStore
            .getState()
            .setEncryptionWarning(
              'Mode tidak aman: data antrian offline dihapus. Hubungkan ke internet dan login ulang untuk memulihkan.',
            );
        }

        networkUnsubscribe = syncService.startNetworkListener();
      } catch {
        useAuthStore
          .getState()
          .forceLogout('Aplikasi gagal membuka penyimpanan lokal. Silakan login kembali.');
      } finally {
        if (isMounted) {
          setIsStorageReady(true);
        }
      }
    })();

    return () => {
      isMounted = false;
      if (networkUnsubscribe) {
        networkUnsubscribe();
        networkUnsubscribe = null;
      }
    };
  }, []);

  if (!isStorageReady) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <StatusBar backgroundColor={Colors.brand.heroStart} barStyle={'light-content'} />
        <View style={styles.splash}>
          <ActivityIndicator color={Colors.brand.emerald} />
        </View>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar backgroundColor={Colors.brand.heroStart} barStyle={'light-content'} />
      <SafeAreaProvider>
        <AppNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;
